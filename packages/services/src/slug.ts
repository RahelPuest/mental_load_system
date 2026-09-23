/**
 * ltree-Labels dürfen nur [A-Za-z0-9_] enthalten. Deutsche Umlaute werden transliteriert,
 * damit „Wäsche" zu `waesche` wird und nicht zu `w_sche`.
 */
const MAP: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', é: 'e', è: 'e', á: 'a', à: 'a', ñ: 'n' }

export function slugify(input: string): string {
  const lowered = input.toLowerCase()
  let out = ''
  for (const ch of lowered) out += MAP[ch] ?? ch
  out = out
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return out || 'bereich'
}

/** Hängt bei Kollisionen ein Suffix an, statt den Anlegevorgang scheitern zu lassen. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const slug = slugify(base)
  if (!taken.has(slug)) return slug
  for (let i = 2; i < 500; i += 1) {
    const candidate = `${slug}_${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${slug}_${Date.now().toString(36)}`
}
