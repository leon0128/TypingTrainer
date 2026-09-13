export function summarize(rows: Array<Array<number>>): string {
  const totals: Map<string, number> = new Map();
  for (const [index, row] of rows.entries()) {
    totals.set(`row ${index}`, row.reduce((sum, value) => sum + value, 0));
  }
  if (totals.size === 0) {
    return "no rows";
  } else {
    return [...totals].map(([key, total]) => `${key}: ${total}`).join(", ");
  }
}
