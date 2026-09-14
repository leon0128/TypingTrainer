type Listener<T> = (payload: T) => void;
class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();
  on<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>,
  ): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as Listener<Events[K]>)(payload);
    }
  }
}
