/**
 * {{name}} or {{ name }}. Names are identifiers: letters, digits, underscore, not
 * starting with a digit. Anything else (e.g. "{{ 1x }}", "{{name") is left as plain text.
 * The `g` flag makes replace/matchAll visit every placeholder.
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Unique variable names in order of first appearance. */
export function extractVariables(...texts: string[]): string[] {
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER)) names.add(match[1]);
  }
  return [...names];
}

/** Variables with no usable value in `data`. null/undefined count as missing; 0, false and '' do not. */
export function findMissingVariables(
  variables: string[],
  data: Record<string, unknown>,
): string[] {
  return variables.filter(
    (name) => data[name] === undefined || data[name] === null,
  );
}

/**
 * Single pass: a value that itself contains "{{x}}" is inserted as-is, never expanded again
 * (otherwise user-supplied data could pull in other variables).
 * Callers validate first; a missing variable here is a programming error, so it throws.
 */
export function renderTemplate(
  text: string,
  data: Record<string, unknown>,
): string {
  return text.replace(PLACEHOLDER, (_whole, name: string) => {
    const value = data[name];
    if (value === undefined || value === null)
      throw new Error(`Missing template variable '${name}'`);
    return String(value);
  });
}
