function mergeSorted(first: number[], second: number[]): number[] {
  const merged: number[] = [];
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    if (first[i] <= second[j]) {
      merged.push(first[i++]);
    } else {
      merged.push(second[j++]);
    }
  }
  return merged.concat(first.slice(i), second.slice(j));
}
