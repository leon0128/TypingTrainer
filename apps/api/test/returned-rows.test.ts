import { describe, expect, it } from 'vitest';

import { returnedRows } from '../src/database/returned-rows';

describe('returnedRows', () => {
  it('returns the rows of a SELECT or INSERT result', () => {
    expect(returnedRows([{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(returnedRows([])).toEqual([]);
  });

  it('unwraps the [rows, affected] shape of UPDATE and DELETE with RETURNING', () => {
    expect(returnedRows([[{ id: 'a' }], 1])).toEqual([{ id: 'a' }]);
    expect(returnedRows([[], 0])).toEqual([]);
  });

  it('does not mistake two returned rows for that shape', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(returnedRows(rows)).toEqual(rows);
    // Two rows whose second value is a number would be ambiguous, but rows are objects.
    expect(returnedRows([[{ id: 'a' }], { id: 'b' }])).toEqual([[{ id: 'a' }], { id: 'b' }]);
  });
});
