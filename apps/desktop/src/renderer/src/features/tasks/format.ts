/** "12 problems" (singular for one). */
export function quantityText(quantity: number | null, unit: string): string {
  if (quantity === null) return '';
  const u = quantity === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit;
  return `${Number(quantity.toFixed(2))}${u ? ` ${u}` : ''}`;
}

/** "problems" → "problem", for rates like "8m per problem". */
export function singularUnit(unit: string): string {
  return unit.endsWith('s') ? unit.slice(0, -1) : unit;
}
