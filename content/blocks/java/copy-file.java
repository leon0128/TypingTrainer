static long copy(Path source, Path target) throws IOException {
  try (InputStream in = Files.newInputStream(source);
      OutputStream out = Files.newOutputStream(target)) {
    byte[] buffer = new byte[8192];
    long total = 0;
    int read;
    while ((read = in.read(buffer)) != -1) {
      out.write(buffer, 0, read);
      total += read;
    }
    return total;
  }
}
