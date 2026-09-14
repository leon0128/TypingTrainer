type Result<T> = { ok: true; value: T } | { ok: false; error: string };
function parsePort(input: string): Result<number> {
  const port = Number.parseInt(input, 10);
  if (Number.isNaN(port) || String(port) !== input.trim()) {
    return { ok: false, error: `not a number: ${input}` };
  }
  if (port < 1 || port > 65535) {
    return { ok: false, error: `out of range: ${port}` };
  }
  return { ok: true, value: port };
}
