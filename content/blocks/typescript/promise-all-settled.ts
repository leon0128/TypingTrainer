async function loadAll(
  urls: string[],
): Promise<{ ok: string[]; failed: string[] }> {
  const results = await Promise.allSettled(urls.map((url) => fetch(url)));
  const ok: string[] = [];
  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.ok) {
      ok.push(urls[index]);
    } else {
      failed.push(urls[index]);
    }
  });
  return { ok, failed };
}
