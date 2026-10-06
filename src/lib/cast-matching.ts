/** Match canonical names and only unambiguous short names, including non-Latin scripts. */
export function mentionsCharacter(text: string, name: string, allNames: string[]): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const withoutNote = (value: string) => normalize(value).replace(/\s*\([^)]*\)\s*$/u, "").trim();
  const names = [...new Set(allNames.map(normalize))];
  const full = normalize(name);
  const base = withoutNote(name);
  const first = base.split(" ")[0];
  const aliases = [full];
  if (names.filter((candidate) => withoutNote(candidate) === base).length === 1) aliases.push(base);
  if (names.filter((candidate) => withoutNote(candidate).split(" ")[0] === first).length === 1) aliases.push(first);
  const haystack = normalize(text);
  return [...new Set(aliases)].filter(Boolean).some((alias) => {
    // CJK sentences do not necessarily separate names from adjacent words with spaces.
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(alias)) return haystack.includes(alias);
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(haystack);
  });
}
