function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(`invalid JSON: ${error.message}`);
      return undefined;
    }
    throw error;
  }
}
