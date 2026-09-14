function isPalindrome(text: string): boolean {
  const letters = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  let left = 0;
  let right = letters.length - 1;
  while (left < right) {
    if (letters[left] !== letters[right]) {
      return false;
    }
    left++;
    right--;
  }
  return true;
}
