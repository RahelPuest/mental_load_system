#!/usr/bin/env bash
# Nächtliche Sicherung nach dem Grundsatz aus docs/29: Ein Backup zählt erst als Backup,
# wenn der Restore getestet wurde. Deshalb spielt dieses Skript die jüngste Sicherung
# einmal pro Woche in eine Wegwerf-Datenbank zurück und prüft sie.
#
# Läuft als Sidecar-Container (postgres:16-bookworm) im Produktions-Compose.
# Ziel ist /backups – der NFS-Mount der Synology.
#
# Redis wird bewusst nicht gesichert: rekonstruierbar aus der Datenbank (docs/29 §2).
set -euo pipefail

BACKUP_ROOT=/backups
DAILY="$BACKUP_ROOT/daily"
MONTHLY="$BACKUP_ROOT/monthly"
STATE="$BACKUP_ROOT/state"
LOGFILE="$BACKUP_ROOT/state/backup.log"

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE fehlt}"
: "${BACKUP_AT:=02:30}"
: "${KEEP_DAILY_DAYS:=35}"
: "${KEEP_MONTHLY_COUNT:=12}"
: "${VERIFY_WEEKDAY:=7}"
: "${HEALTHCHECK_URL:=}"

log() {
  # Bewusst nach stderr: dump_and_encrypt gibt den Dateinamen über stdout zurück.
  # Eine Protokollzeile auf stdout würde in der Kommandosubstitution mitgelesen.
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line" >&2
  mkdir -p "$STATE"
  echo "$line" >>"$LOGFILE" 2>/dev/null || true
}

# Ping ohne curl: das Postgres-Image bringt keinen HTTP-Client mit, openssl aber schon.
ping_health() {
  [ -n "$HEALTHCHECK_URL" ] || return 0
  local url="$1" host path
  host=$(echo "$url" | sed -E 's#^https?://##; s#/.*$##')
  path=$(echo "$url" | sed -E 's#^https?://[^/]*##'); [ -n "$path" ] || path=/
  printf 'GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: thealotta-backup\r\nConnection: close\r\n\r\n' "$path" "$host" \
    | timeout 20 openssl s_client -quiet -verify_quiet -connect "$host:443" -servername "$host" >/dev/null 2>&1 \
    || log "WARN: Healthcheck-Ping fehlgeschlagen"
}

seconds_until_next_run() {
  local now target
  now=$(date +%s)
  target=$(date -d "today $BACKUP_AT" +%s)
  [ "$target" -le "$now" ] && target=$(date -d "tomorrow $BACKUP_AT" +%s)
  echo $((target - now))
}

dump_and_encrypt() {
  local stamp file tmp
  stamp=$(date +%Y%m%d-%H%M)
  file="$DAILY/thealotta-$stamp.dump.enc"
  tmp="$file.partial"
  mkdir -p "$DAILY"

  # -Fc komprimiert bereits; danach AES-256 mit PBKDF2. Der Schlüssel steht im
  # Passwortmanager, nicht neben der Sicherung.
  if pg_dump -Fc --no-owner --no-privileges \
       | openssl enc -aes-256-cbc -md sha512 -pbkdf2 -iter 300000 -salt -pass env:BACKUP_PASSPHRASE \
       >"$tmp"; then
    # Erst nach vollständigem Schreiben umbenennen: eine halbe Datei darf nie wie ein
    # gültiges Backup aussehen.
    mv "$tmp" "$file"
    log "Sicherung geschrieben: $(basename "$file") ($(du -h "$file" | cut -f1))"
    echo "$file"
  else
    rm -f "$tmp"
    log "FEHLER: pg_dump fehlgeschlagen"
    return 1
  fi
}

keep_monthly() {
  local src="$1"
  # Am Monatsersten eine Kopie zur Langzeitaufbewahrung. Auf der Synology gehört dieser
  # Ordner in eine Freigabe mit Snapshot-Schutz – gegen versehentliches wie böswilliges Löschen.
  [ "$(date +%d)" = "01" ] || return 0
  mkdir -p "$MONTHLY"
  cp "$src" "$MONTHLY/thealotta-$(date +%Y-%m).dump.enc"
  log "Monatskopie angelegt: thealotta-$(date +%Y-%m).dump.enc"
}

prune() {
  find "$DAILY" -name 'thealotta-*.dump.enc' -type f -mtime "+$KEEP_DAILY_DAYS" -print -delete \
    | while read -r f; do log "Alte Tagessicherung entfernt: $(basename "$f")"; done
  # Monatssicherungen nach Anzahl, nicht nach Alter: bei einem längeren Ausfall soll
  # nicht die ganze Historie wegfallen.
  local count
  count=$(find "$MONTHLY" -name 'thealotta-*.dump.enc' -type f 2>/dev/null | wc -l)
  if [ "$count" -gt "$KEEP_MONTHLY_COUNT" ]; then
    find "$MONTHLY" -name 'thealotta-*.dump.enc' -type f -printf '%T@ %p\n' \
      | sort -n | head -n $((count - KEEP_MONTHLY_COUNT)) | cut -d' ' -f2- \
      | while read -r f; do rm -f "$f"; log "Alte Monatssicherung entfernt: $(basename "$f")"; done
  fi
}

# Der eigentliche Beweis, dass die Sicherung etwas wert ist.
verify_restore() {
  local src scratch live_tables restored_tables live_migrations restored_migrations users
  src=$(find "$DAILY" -name 'thealotta-*.dump.enc' -type f -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)
  [ -n "$src" ] || { log "WARN: keine Sicherung zum Prüfen gefunden"; return 1; }
  scratch="thealotta_restore_check"

  log "Restore-Prüfung beginnt mit $(basename "$src")"
  dropdb --if-exists "$scratch"
  createdb "$scratch"

  if ! openssl enc -d -aes-256-cbc -md sha512 -pbkdf2 -iter 300000 -pass env:BACKUP_PASSPHRASE <"$src" \
       | pg_restore -d "$scratch" --no-owner --no-privileges --exit-on-error >/dev/null 2>&1; then
    log "FEHLER: Restore der Sicherung $(basename "$src") ist gescheitert"
    dropdb --if-exists "$scratch"
    return 1
  fi

  q() { psql -tAq -d "$1" -c "$2"; }
  live_tables=$(q "$PGDATABASE" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  restored_tables=$(q "$scratch" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  live_migrations=$(q "$PGDATABASE" "SELECT count(*) FROM schema_migrations")
  restored_migrations=$(q "$scratch" "SELECT count(*) FROM schema_migrations")
  users=$(q "$scratch" "SELECT count(*) FROM users")

  local ok=1
  [ "$restored_tables" = "$live_tables" ] || { log "FEHLER: $restored_tables Tabellen statt $live_tables"; ok=0; }
  [ "$restored_migrations" = "$live_migrations" ] || { log "FEHLER: Migrationsstand $restored_migrations statt $live_migrations"; ok=0; }
  [ "$users" -gt 0 ] 2>/dev/null || { log "FEHLER: keine Benutzer in der zurückgespielten Datenbank"; ok=0; }

  dropdb --if-exists "$scratch"

  if [ "$ok" = "1" ]; then
    mkdir -p "$STATE"
    date -u +%s >"$STATE/restore-verified-at"
    date -u '+%Y-%m-%dT%H:%M:%SZ' >"$STATE/restore-verified-at.txt"
    log "Restore-Prüfung bestanden: $restored_tables Tabellen, $restored_migrations Migrationen, $users Benutzer"
    return 0
  fi

  log "FEHLER: Restore-Prüfung NICHT bestanden – die Sicherung ist derzeit nichts wert"
  return 1
}

# Nur beim direkten Ausführen laufen lassen. Wird die Datei bloß eingebunden
# (ops/scripts/thealotta verify-restore), sollen ausschließlich die Funktionen bereitstehen.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  log "Sicherungsdienst gestartet. Fenster täglich $BACKUP_AT ($(date +%Z)), Restore-Prüfung an Wochentag $VERIFY_WEEKDAY."
  mkdir -p "$DAILY" "$MONTHLY" "$STATE"

  # Schreibprobe: ein nicht eingebundener NFS-Mount fällt sonst erst in der ersten Nacht auf.
  if ! touch "$STATE/.writable" 2>/dev/null; then
    log "FEHLER: $BACKUP_ROOT ist nicht beschreibbar – hängt der NFS-Mount der Synology?"
    exit 1
  fi
  rm -f "$STATE/.writable"

  while true; do
    wait_for=$(seconds_until_next_run)
    log "Nächste Sicherung in $((wait_for / 3600)) h $(((wait_for % 3600) / 60)) min"
    sleep "$wait_for"

    if file=$(dump_and_encrypt); then
      keep_monthly "$file"
      prune
      date -u '+%Y-%m-%dT%H:%M:%SZ' >"$STATE/last-backup-at.txt"
      if [ "$(date +%u)" = "$VERIFY_WEEKDAY" ]; then
        verify_restore || true
      fi
      ping_health "$HEALTHCHECK_URL"
    else
      log "Sicherung ausgefallen – kein Ping, damit die Überwachung anschlägt"
    fi
    sleep 90   # verhindert zwei Läufe innerhalb derselben Minute
  done
fi
