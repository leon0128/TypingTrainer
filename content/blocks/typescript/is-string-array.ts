function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
function joinTags(input: unknown): string {
  if (!isStringArray(input)) {
    return "";
  }
  return input.map((tag) => `#${tag}`).join(" ");
}
