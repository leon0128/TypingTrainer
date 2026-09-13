export async function load(id: string) {
  return typeof id === "string" && id in cache;
}
