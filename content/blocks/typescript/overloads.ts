function format(value: number): string;
function format(value: Date): string;
function format(value: string[]): string;
function format(value: number | Date | string[]): string {
  if (typeof value === "number") {
    return value.toLocaleString("en-US");
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.join(", ");
}
