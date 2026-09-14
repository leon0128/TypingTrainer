class ValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "ValidationError";
  }
}
function requireEmail(value: string): string {
  if (!/^[^@\s]+@[^@\s]+$/.test(value)) {
    throw new ValidationError("email", "invalid address");
  }
  return value;
}
