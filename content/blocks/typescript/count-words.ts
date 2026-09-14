function countWords(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().split(/\s+/)) {
    if (word === "") {
      continue;
    }
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}
