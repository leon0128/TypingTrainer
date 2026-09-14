static <T> T retry(Callable<T> task, int attempts) throws Exception {
  Exception last = null;
  for (int attempt = 0; attempt < attempts; attempt++) {
    try {
      return task.call();
    } catch (IOException e) {
      last = e;
      try {
        Thread.sleep(100L << attempt);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        throw interrupted;
      }
    }
  }
  throw new Exception("gave up after " + attempts + " attempts", last);
}
