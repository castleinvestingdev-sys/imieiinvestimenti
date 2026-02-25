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
 *       "Condorelli Alessandra, Zanacca Gianluca, Zanacca Francesco"
 *  but "Condorelli Maria" does NOT match "Condorelli Mariola" */
export function holdersMatch(a: string, b: string): boolean {
  if (a === b) return true
  const na = a.toUpperCase().trim()
  const nb = b.toUpperCase().trim()
  if (na === nb) return true
  if (na.length < 3 || nb.length < 3) return false
  const wordsA = na.split(/[\s,]+/).filter(Boolean)
  const wordsB = nb.split(/[\s,]+/).filter(Boolean)
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB
  const longer = wordsA.length > wordsB.length ? wordsA : wordsB
  if (shorter.length < 2) return false
  for (let i = 0; i < shorter.length; i++) {
    if (i >= longer.length) return false
    if (i === shorter.length - 1 && shorter[i].length >= 3) {
      // Last word: allow prefix match (min 3 chars) for truncation
      if (!longer[i].startsWith(shorter[i])) return false
    } else {
      if (shorter[i] !== longer[i]) return false
    }
  }
  return true
}
