import { useNavigate } from 'react-router-dom'
import { Button, Heading, Icon, Page, Panel, Section, type IconName,
  ICON,
} from '../design/index.js'

/**
 * Hilfe – die Begriffe des Produkts in der Sprache der Nutzer.
 *
 * Thealotta trennt vier Dinge, die anderswo in einer Liste zusammenfallen: Verantwortung,
 * Wissen, Beobachtung und Arbeit. Wer das nicht weiß, sucht Aufgaben und findet Bereiche.
 * Diese Seite erklärt es einmal – ohne Modellbegriffe, mit Beispielen aus dem Alltag
 * (Auftrag §61: Hilfe gehört zu einer vollständigen Oberfläche).
 */
interface Concept {
  icon: IconName
  title: string
  short: string
  body: string
  example: string
  to?: string
}

const IDEA = `Der Kern ist eine Unterscheidung, die im Alltag ständig verschwimmt:
Etwas zu erledigen ist nicht dasselbe wie daran zu denken. Wer den Müll runterbringt,
trägt die Arbeit. Wer weiß, dass Dienstag Abholung ist, trägt die Last.
Thealotta hält beides auseinander – und übernimmt den zweiten Teil.`

const CONCEPTS: Concept[] = [
  {
    icon: 'domains',
    title: 'Bereich',
    short: 'Ein Thema, für das jemand mitdenkt.',
    body: 'Ein Bereich ist kein Ordner für Aufgaben, sondern ein Zuständigkeitsraum. Er bündelt, was ihr über ein Thema wisst, was beobachtet werden soll und was gerade läuft. Bereiche können ineinander liegen.',
    example: '„Kind A / Kleidung / Schuhe" – darin: die Schuhgröße, die Regel „alle sechs Wochen prüfen", der laufende Vorgang „Neue Schuhe".',
    to: '/bereiche',
  },
  {
    icon: 'shield',
    title: 'Verantwortung',
    short: 'Wer mitdenkt – nicht, wer ausführt.',
    body: 'Für jeden Bereich gibt es idealerweise genau eine Person, die mitdenkt. Sie bleibt es auch, wenn jemand anderes eine einzelne Aufgabe übernimmt. Diese Trennung ist der Kern: Ohne sie wandert die Last still zu der Person, die zuletzt etwas gemacht hat.',
    example: 'Ben kauft die Schuhe. Anna bleibt die, die weiß, wann sie wieder zu klein sind.',
    to: '/familie',
  },
  {
    icon: 'book',
    title: 'Wissen',
    short: 'Was ihr wisst – inklusive „wir wissen es nicht".',
    body: 'Angaben, Notizen, offene Fragen und Entscheidungen. Zu jeder Angabe merkt sich Thealotta, wann sie zuletzt bestätigt wurde. „Unbekannt" ist ein gültiger Zustand und kein Versäumnis – man kann ihn hinterlegen und daran erinnert werden.',
    example: 'Schuhgröße 29, bestätigt vor sieben Wochen. Offene Frage: „Passen die Winterstiefel noch?"',
    to: '/wissen',
  },
  {
    icon: 'eye',
    title: 'Regel',
    short: 'Was von selbst passiert, damit ihr nicht daran denken müsst.',
    body: 'Eine Regel in klarer Sprache. Sie kann etwas beobachten – „alle sechs Wochen prüfen" – und sich melden, wenn es fällig ist. Oder sie legt selbst eine Aufgabe an: „donnerstags Müll rausbringen", „einen Tag nachdem die Wäsche in der Maschine war". Ein Hinweis ist noch keine Aufgabe; ihr entscheidet, ob daraus etwas wird.',
    example: '„Schuhgröße wurde seit sieben Wochen nicht geprüft." → Kümmern wir uns drum · In einer Woche · Jetzt nicht',
    to: '/regeln',
  },
  {
    icon: 'route',
    title: 'Vorgang',
    short: 'Etwas Mehrschrittiges mit nächstem Schritt.',
    body: 'Wo eine einzelne Aufgabe nicht reicht. Ein Vorgang hat ein Ziel und eine Reihenfolge; Thealotta zeigt immer nur den nächsten Schritt, nicht die ganze Kette.',
    example: '„Neue Schuhe besorgen": Füße messen → Art bestimmen → Modelle auswählen → kaufen.',
    to: '/vorgaenge',
  },
  {
    icon: 'sparkle',
    title: 'Ablauf',
    short: 'Eine Schrittfolge, die ihr wiederverwendet.',
    body: 'Was zweimal im Jahr vorkommt, muss man nicht zweimal durchdenken. Aus einem Ablauf entsteht mit einem Klick ein neuer Vorgang – mit allen Schritten.',
    example: '„Neue Schuhe" als Ablauf: beim nächsten Mal fertig, statt neu zusammengesucht.',
    to: '/ablaeufe',
  },
  {
    icon: 'inbox',
    title: 'Erfassen und Eingang',
    short: 'Erst aus dem Kopf, später einsortieren.',
    body: 'Erfassen verlangt nichts außer dem Gedanken – kein Bereich, kein Datum, keine Art. Alles landet im Eingang, mit einem Vorschlag, was daraus werden könnte. Einsortieren ist ein Klick, und es eilt nicht.',
    example: '„Regenjacke Kind B prüfen" um 22 Uhr notiert. Am Wochenende wird eine Aufgabe daraus.',
    to: '/eingang',
  },
  {
    icon: 'battery',
    title: 'Kapazität',
    short: 'Wie viel heute geht – eine Selbstauskunft.',
    body: 'Bei wenig Kapazität zeigt Thealotta weniger und Leichteres. Nichts verschwindet dabei, und niemand sieht eine Bewertung. Es ist keine Leistungsmessung, sondern eine Einstellung dafür, was euch angezeigt wird.',
    example: 'Bei „sehr wenig" steht genau eine Sache unter „Jetzt" statt drei.',
    to: '/familie',
  },
]

const PROMISES = [
  { icon: 'shield' as IconName, text: 'Nichts geht still verloren. Ein verpasster Zeitpunkt löscht nichts – die Sache bleibt sichtbar.' },
  { icon: 'eye' as IconName, text: 'Jeder Eintrag sagt, warum er da ist. Wenn Thealotta etwas vorschlägt, steht der Grund daneben.' },
  { icon: 'family' as IconName, text: 'Ausführen ist nicht Verantworten. Zehn erledigte Aufgaben verschieben keine Zuständigkeit.' },
  { icon: 'lock' as IconName, text: 'Was nicht freigegeben ist, bleibt verborgen – und man sieht, dass es etwas gibt, nicht was.' },
]

/** Anker aus dem Begriff – stabil, lesbar in der Adresszeile, ohne Extraverwaltung. */
const anchor = (title: string) =>
  'begriff-' +
  title
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function HelpPage() {
  const navigate = useNavigate()

  return (
    <Page title="Wie Thealotta denkt" lede="Acht Begriffe, die den Unterschied machen – in zwei Minuten.">
      <Panel sunken>
        <p className="t-body">{IDEA}</p>
      </Panel>

      {/*
        Acht gleich große Kästen nebeneinander geben dem Auge keine Lesereihenfolge – man
        beginnt irgendwo. Als Glossar in einer Spalte gibt es genau einen Weg hindurch,
        und der Begriff selbst ist der Ankerpunkt. Kein Wort wurde dabei entfernt.
      */}
      {/*
        Auf dem Handy ist diese Seite gut 4200 px hoch. Ohne Sprungpunkte heißt „schlag den
        Begriff nach" dort: scrollen und suchen. Die Leiste kostet acht Ziele, nimmt dafür
        aber die Navigationslast auf einer reinen Nachschlageseite fast ganz weg – und sie
        zeigt zugleich, welche acht Begriffe es überhaupt gibt (§18).
      */}
      <Section title="Die Begriffe">
        <nav className="jumpbar" aria-label="Zu einem Begriff springen">
          {CONCEPTS.map((c) => (
            <a key={c.title} href={`#${anchor(c.title)}`} className="chip">
              {c.title}
            </a>
          ))}
        </nav>
        <Panel>
          <dl className="glossary">
            {CONCEPTS.map((c) => (
              <div key={c.title} className="glossary-entry" id={anchor(c.title)}>
                <dt>
                  <Icon name={c.icon} size={ICON.md} />
                  <Heading className="t-sub">{c.title}</Heading>
                  <span className="t-body-sm c-secondary glossary-short">{c.short}</span>
                </dt>
                <dd>
                  <p className="t-body-sm c-secondary">{c.body}</p>
                  <p className="t-caption c-muted concept-example">{c.example}</p>
                  {c.to && (
                    <Button variant="ghost" size="sm" icon={c.icon} onClick={() => navigate(c.to!)}>
                      Ansehen
                    </Button>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </Section>

      <Section title="Worauf ihr euch verlassen könnt" hint="Vier Zusagen, die Thealotta technisch einhält.">
        <Panel>
          {PROMISES.map((p, index) => (
            <p key={p.text} className="promise t-body-sm" style={index > 0 ? { marginTop: 'var(--s-3)' } : undefined}>
              <Icon name={p.icon} size={ICON.md} />
              <span>{p.text}</span>
            </p>
          ))}
        </Panel>
      </Section>

      <Section title="Was Thealotta nicht ist">
        <Panel sunken>
          <p className="t-body-sm c-secondary">
            Keine To-do-Liste mit Familienfreigabe. Keine Punkte, keine Serien, keine Auswertung, wer
            wie viel geschafft hat. Kein Kontrollwerkzeug: Die Verteilungsansicht ist standardmäßig
            aus und zeigt Bänder statt Zahlen, weil sie ein Gespräch anstoßen soll und keinen Streit.
          </p>
        </Panel>
      </Section>
    </Page>
  )
}
