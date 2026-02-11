/** Normalize holder name: "FRIGERI MARIA CRISTINA" → "Frigeri Maria Cristina" */
export function normalizeHolder(raw: string): string {
  if (!raw) return 'Cliente Sconosciuto'
  return raw
    .trim()
    // Normalize separators: semicolons → commas, then clean up spacing around commas
    .replace(/\s*;\s*/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** Check if two normalized holder strings represent the same person(s), allowing for name truncation.
 *  e.g. "Condorelli Alessandra, Zanacca Gianluca, Zanacca Fra" matches
 *       "Condorelli Alessandra, Zanacca Gianluca, Zanacca Francesco" */
export function holdersMatch(a: string, b: string): boolean {
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b
  // Shorter must be at least 70% of the longer (prevents tiny strings matching everything)
  if (shorter.length < longer.length * 0.7) return false
  return longer.startsWith(shorter)
}
