/**
 * The rows of a statement with RETURNING.
 *
 * TypeORM's `query()` hands back the rows for SELECT and INSERT, but `[rows, affectedCount]` for
 * UPDATE and DELETE. Reading `result[0]` as a row therefore yields the whole row array for those
 * statements, and `result.length` counts 2 rather than the rows; this normalizes both shapes.
 */
export function returnedRows<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return (result ?? []) as T[];
}
