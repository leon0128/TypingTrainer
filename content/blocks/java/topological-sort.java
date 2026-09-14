static List<String> buildOrder(Map<String, List<String>> dependents) {
  Map<String, Integer> indegree = new HashMap<>();
  dependents.forEach(
      (task, next) -> {
        indegree.putIfAbsent(task, 0);
        next.forEach(n -> indegree.merge(n, 1, Integer::sum));
      });
  Deque<String> ready = new ArrayDeque<>();
  indegree.forEach(
      (task, degree) -> {
        if (degree == 0) ready.add(task);
      });
  List<String> order = new ArrayList<>();
  while (!ready.isEmpty()) {
    String task = ready.poll();
    order.add(task);
    for (String n : dependents.getOrDefault(task, List.of())) {
      if (indegree.merge(n, -1, Integer::sum) == 0) {
        ready.add(n);
      }
    }
  }
  if (order.size() != indegree.size()) {
    throw new IllegalStateException("dependency cycle detected");
  }
  return order;
}
