function reverseWords(sentence: string): string {
  const words = sentence.trim().split(/\s+/);
  const reversed: string[] = [];
  for (let index = words.length - 1; index >= 0; index--) {
    reversed.push(words[index]);
  }
  return reversed.join(" ");
}
