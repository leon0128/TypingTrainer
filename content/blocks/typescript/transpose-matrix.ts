function transpose(matrix: number[][]): number[][] {
  if (matrix.length === 0) {
    return [];
  }
  const rows = matrix.length;
  const columns = matrix[0].length;
  const result: number[][] = [];
  for (let c = 0; c < columns; c++) {
    const column: number[] = [];
    for (let r = 0; r < rows; r++) {
      column.push(matrix[r][c]);
    }
    result.push(column);
  }
  return result;
}
