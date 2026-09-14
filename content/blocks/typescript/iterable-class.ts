class LinkedList<T> implements Iterable<T> {
  private head: { value: T; next: LinkedList<T>["head"] } | null = null;
  prepend(value: T): this {
    this.head = { value, next: this.head };
    return this;
  }
  *[Symbol.iterator](): Iterator<T> {
    for (let node = this.head; node !== null; node = node.next) {
      yield node.value;
    }
  }
}
