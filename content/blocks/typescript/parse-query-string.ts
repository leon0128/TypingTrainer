function parseQuery(search: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const params = new URLSearchParams(search);
  for (const [key, value] of params) {
    (result[key] ??= []).push(value);
  }
  return result;
}
