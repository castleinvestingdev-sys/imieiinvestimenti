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
