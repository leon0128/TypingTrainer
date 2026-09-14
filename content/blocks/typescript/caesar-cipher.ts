function caesar(text: string, shift: number): string {
  const offset = ((shift % 26) + 26) % 26;
  return text.replace(/[a-z]/gi, (letter) => {
    const base = letter <= "Z" ? 65 : 97;
    const code = letter.charCodeAt(0) - base;
    return String.fromCharCode(((code + offset) % 26) + base);
  });
}
