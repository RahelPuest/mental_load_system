/**
 * Lokale Entwicklung: `.env` wird geladen, wenn vorhanden. In Produktion kommen die Werte
 * ausschließlich aus dem Secret-Store – deshalb wird dort nichts aus Dateien gelesen.
 */
export function loadDotEnvForDevelopment(): void {
  if (process.env['NODE_ENV'] === 'production') return
  try {
    process.loadEnvFile?.()
  } catch {
    /* keine .env vorhanden – das ist in Ordnung */
  }
}
