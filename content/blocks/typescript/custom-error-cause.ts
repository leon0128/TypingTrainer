class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
  }
}
function readPort(raw: string | undefined): number {
  try {
    if (raw === undefined) throw new Error("PORT is not set");
    return Number.parseInt(raw, 10);
  } catch (error) {
    throw new ConfigError("invalid server configuration", { cause: error });
  }
}
