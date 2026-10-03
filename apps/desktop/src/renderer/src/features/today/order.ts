/** Moves `id` to `index` in `ids`. */
export function moveId(ids: readonly string[], id: string, index: number): string[] {
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
  return next;
}
