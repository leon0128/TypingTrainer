static CompletableFuture<String> loadProfile(Executor executor, long userId) {
  CompletableFuture<String> name =
      CompletableFuture.supplyAsync(() -> "user-" + userId, executor);
  CompletableFuture<Integer> posts = CompletableFuture.supplyAsync(() -> 42, executor);
  return name.thenCombine(posts, (n, p) -> n + " wrote " + p + " posts")
      .orTimeout(2, TimeUnit.SECONDS)
      .exceptionally(error -> "unavailable: " + error.getMessage());
}
