function topologicalSort(graph: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];
  const visit = (node: string): void => {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      throw new Error(`cycle detected at ${node}`);
    }
    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      visit(next);
    }
    visiting.delete(node);
    visited.add(node);
    order.unshift(node);
  };
  for (const node of graph.keys()) {
    visit(node);
  }
  return order;
}
