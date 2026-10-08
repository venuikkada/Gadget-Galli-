/**
 * Same normalisation as the SQL function gg_norm(): lower-case, split letters from digits
 * ("rtx4060" -> "rtx 4060", "128gb" -> "128 gb") and turn punctuation into spaces.
 */
export function normalizeQuery(q: string | null | undefined): string {
  return (q ?? '')
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Splits a label into parts for bold-highlighting the typed query in suggestions. */
export function highlightParts(label: string, query: string): { text: string; match: boolean }[] {
  const tokens = normalizeQuery(query).split(' ').filter((t) => t.length > 0);
  if (!tokens.length) return [{ text: label, match: false }];
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const out: { text: string; match: boolean }[] = [];
  let last = 0;
  label.replace(re, (m, _g, offset: number) => {
    if (offset > last) out.push({ text: label.slice(last, offset), match: false });
    out.push({ text: m, match: true });
    last = offset + m.length;
    return m;
  });
  if (last < label.length) out.push({ text: label.slice(last), match: false });
  return out;
}
