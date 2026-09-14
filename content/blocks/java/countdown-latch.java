static void startTogether(List<Runnable> tasks) throws InterruptedException {
  CountDownLatch start = new CountDownLatch(1);
  CountDownLatch done = new CountDownLatch(tasks.size());
  for (Runnable task : tasks) {
    Thread.ofPlatform()
        .start(
            () -> {
              try {
                start.await();
                task.run();
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              } finally {
                done.countDown();
              }
            });
  }
  start.countDown();
  done.await();
}
