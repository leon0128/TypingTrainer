static long[] shortestDistances(List<List<int[]>> graph, int source) {
  long[] dist = new long[graph.size()];
  Arrays.fill(dist, Long.MAX_VALUE);
  dist[source] = 0;
  var queue = new PriorityQueue<long[]>(Comparator.comparingLong(e -> e[1]));
  queue.add(new long[] {source, 0});
  while (!queue.isEmpty()) {
    long[] top = queue.poll();
    int node = (int) top[0];
    if (top[1] > dist[node]) {
      continue;
    }
    for (int[] edge : graph.get(node)) {
      long candidate = dist[node] + edge[1];
      if (candidate < dist[edge[0]]) {
        dist[edge[0]] = candidate;
        queue.add(new long[] {edge[0], candidate});
      }
    }
  }
  return dist;
}
