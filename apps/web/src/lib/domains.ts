/** Technische Pfadsegmente durch die echten Namen ersetzen (Audit-Befund H9). */
export function prettyPath(domain: { path: string }, all: { path: string; name: string }[]): string {
  const parts = domain.path.split('.')
  return parts
    .map((_, index) => all.find((d) => d.path === parts.slice(0, index + 1).join('.'))?.name ?? parts[index])
    .join(' / ')
}
