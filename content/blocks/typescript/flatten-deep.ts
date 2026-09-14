type Nested = number | Nested[];
function flattenDeep(input: Nested[]): number[] {
  const output: number[] = [];
  for (const item of input) {
    if (Array.isArray(item)) {
      output.push(...flattenDeep(item));
    } else {
      output.push(item);
    }
  }
  return output;
}
