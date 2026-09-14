function zip<A, B>(first: readonly A[], second: readonly B[]): [A, B][] {
  const length = Math.min(first.length, second.length);
  const pairs: [A, B][] = [];
  for (let index = 0; index < length; index++) {
    pairs.push([first[index], second[index]]);
  }
  return pairs;
}
