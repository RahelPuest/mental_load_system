/**
 * Der Name des Produkts – an genau einer Stelle (§31).
 *
 * Vor der Umbenennung stand der alte Name an über neunzig Stellen hartcodiert: in Fließtexten, im
 * Manifest, im Seitentitel, im Service Worker, in Fehlermeldungen. Ein zweites Rebranding
 * hieße, sie alle wiederzufinden.
 *
 * **Nicht überall ersetzbar.** In einem deutschen Fließtext steht der Name im Satz („Thealotta
 * meldet sich nur, wenn …"); ihn dort durch `${APP_NAME}` zu ersetzen, machte den Satz für
 * jeden Leser des Quelltextes unlesbar und brächte nichts, was ein `grep` nicht auch kann.
 * Diese Konstante gilt deshalb für **Metadaten und Kopfzeilen** – Stellen, an denen der Name
 * allein steht: Wortmarke, Seitentitel, Manifest, Absender, Dateinamen.
 *
 * Schreibweisen (§32):
 *
 * | Zweck | Form |
 * | --- | --- |
 * | Sichtbarer Name | `Thealotta` |
 * | Technischer Bezeichner, Paket, Slug, Dateiname | `thealotta` |
 * | Konstante, Umgebungsvariable | `THEALOTTA_…` |
 * | PascalCase im Code | `Thealotta` |
 */

/** Der sichtbare Produktname. Deutsche Eigennamen werden großgeschrieben. */
export const APP_NAME = 'Thealotta'

/** Kleingeschrieben: Paketnamen, Dateinamen, Slugs, technische Bezeichner. */
export const APP_SLUG = 'thealotta'

/** Ein Satz, der sagt, wofür es das Produkt gibt – Manifest, Meta-Description, Anmeldung. */
export const APP_DESCRIPTION = 'Verantwortung sichtbar, verlässlich und fair tragen.'
