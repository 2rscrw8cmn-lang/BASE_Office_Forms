/** Join class names, dropping falsy entries. Keeps component JSX readable. */
export function cx(
  ...parts: (string | false | null | undefined)[]
): string | undefined {
  const joined = parts.filter(Boolean).join(" ");
  return joined.length > 0 ? joined : undefined;
}

let idCounter = 0;

/**
 * Deterministic-per-render fallback id for label/description wiring when the
 * caller does not supply one. Prefer React.useId in components; this exists for
 * non-hook contexts.
 */
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${String(idCounter)}`;
}
