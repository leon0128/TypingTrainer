static List<Integer> fetchLengths(List<String> urls) throws Exception {
  try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<Integer>> futures = new ArrayList<>();
    for (String url : urls) {
      futures.add(executor.submit(() -> url.length()));
    }
    List<Integer> lengths = new ArrayList<>();
    for (Future<Integer> future : futures) {
      lengths.add(future.get());
    }
    return lengths;
  }
}
