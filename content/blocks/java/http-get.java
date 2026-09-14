static String fetchBody(HttpClient client, String url) throws Exception {
  HttpRequest request =
      HttpRequest.newBuilder(URI.create(url))
          .timeout(Duration.ofSeconds(10))
          .header("Accept", "application/json")
          .GET()
          .build();
  var response = client.send(request, HttpResponse.BodyHandlers.ofString());
  if (response.statusCode() >= 400) {
    throw new IOException("HTTP " + response.statusCode() + " from " + url);
  }
  return response.body();
}
