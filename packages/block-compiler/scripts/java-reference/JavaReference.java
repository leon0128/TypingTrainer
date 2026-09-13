import com.sun.tools.javac.file.JavacFileManager;
import com.sun.tools.javac.parser.Scanner;
import com.sun.tools.javac.parser.ScannerFactory;
import com.sun.tools.javac.parser.Tokens.Token;
import com.sun.tools.javac.parser.Tokens.TokenKind;
import com.sun.tools.javac.util.Context;
import com.sun.tools.javac.util.Log;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import javax.tools.DiagnosticCollector;
import javax.tools.DiagnosticListener;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;

/**
 * Regenerates the golden data that pins block-compiler's Java scanner to javac's own tokenizer.
 *
 * <p>For every fixture it first checks that the member is google-java-format output: wrapping it
 * in a class, formatting, and unwrapping must reproduce the file byte for byte, and wrapping and
 * formatting the unwrapped result again must give the same unwrapped text (idempotency).
 *
 * <p>Run with {@code pnpm --filter @typing-trainer/block-compiler java:golden}; javac's tokenizer
 * is internal API reached with --add-exports (see package.json). CI does not need Java: it only
 * reads the committed golden file.
 */
public class JavaReference {
  record Span(int start, int end) {}

  record Lexed(List<Span> spans, int errors) {}

  /** Pairs checked in addition to every in-line separator found in the fixtures. */
  private static final String[][] EXTRA_PAIRS = {
    {"<", ">"}, {">", ">"}, {">>", ">"}, {">", "="}, {":", ":"}, {"String", "::"},
    {"::", "valueOf"}, {"-", ">"}, {"x", "->"}, {"->", "x"}, {"->", "-"}, {"try", "("},
    {"|", "|"}, {"IOException", "|"}, {"|", "SQLException"}, {"String", "..."}, {"...", "args"},
    {".", ".."}, {"?", "extends"}, {"extends", "T"}, {"?", "super"}, {"<", "?"},
    {"@", "Override"}, {"1", "L"}, {"1.0", "f"}, {"1", ".0"}, {"0x1", "p"}, {"0", "x"},
    {"1", "_000"}, {"non", "-"}, {"-", "sealed"}, {"a", "+"}, {"+", "+"}, {"&", "&"},
    {"'a'", "b"}, {"\"s\"", "x"}, {"=", "="}, {"instanceof", "String"},
    // From the search for a scanner-error case (none exists; see adapters/java.ts).
    {"1", "in"}, {"0x1", "g"}, {"1L", "L"}, {"1", "_"}, {"0b1", "2"},
  };

  private static final String WRAPPER_OPEN = "class Wrapper {";

  public static void main(String[] args) throws Exception {
    if (args.length != 2) fail("usage: JavaReference <fixtures-dir> <golden-json>");
    Path dir = Path.of(args[0]);
    Path out = Path.of(args[1]);

    List<Path> files;
    try (Stream<Path> listing = Files.list(dir)) {
      files = listing.filter(p -> p.toString().endsWith(".java")).sorted().toList();
    }
    if (files.isEmpty()) fail("no Java fixtures in " + dir);

    List<String> fixtureJson = new ArrayList<>();
    LinkedHashSet<List<String>> pairs = new LinkedHashSet<>();

    for (Path file : files) {
      String name = file.getFileName().toString();
      String source = Files.readString(file);

      String firstFormatted = format(wrap(source));
      String unwrapped = unwrap(firstFormatted, name);
      if (!unwrapped.equals(source)) fail(name + " is not google-java-format output");
      String rewrapped = unwrap(format(wrap(unwrapped)), name);
      if (!rewrapped.equals(unwrapped)) {
        fail(name + ": wrap -> format -> unwrap is not idempotent");
      }

      Lexed lexed = lex(source);
      if (lexed.errors() > 0) fail(name + ": javac reported " + lexed.errors() + " error(s)");

      List<String> tokens = new ArrayList<>();
      for (Span span : lexed.spans()) {
        tokens.add(
            "{\"text\": %s, \"start\": %d, \"end\": %d}"
                .formatted(json(source.substring(span.start(), span.end())), span.start(), span.end()));
      }
      for (int i = 1; i < lexed.spans().size(); i++) {
        Span prev = lexed.spans().get(i - 1);
        Span next = lexed.spans().get(i);
        String gap = source.substring(prev.end(), next.start());
        if (!gap.isEmpty() && gap.chars().allMatch(c -> c == ' ')) {
          pairs.add(
              List.of(
                  source.substring(prev.start(), prev.end()),
                  source.substring(next.start(), next.end())));
        }
      }
      fixtureJson.add(
          "    {\"name\": %s, \"sha256\": %s, \"tokens\": [%s]}"
              .formatted(json(name), json(sha256(source)), String.join(", ", tokens)));
    }
    for (String[] pair : EXTRA_PAIRS) pairs.add(List.of(pair[0], pair[1]));

    List<String> pairJson = new ArrayList<>();
    for (List<String> pair : pairs) {
      String joined = pair.get(0) + pair.get(1);
      Lexed lexed = lex(joined);
      String texts =
          lexed.spans().stream()
              .map(span -> json(joined.substring(span.start(), span.end())))
              .collect(Collectors.joining(", "));
      pairJson.add(
          "    {\"prev\": %s, \"next\": %s, \"tokens\": [%s], \"errors\": %d}"
              .formatted(json(pair.get(0)), json(pair.get(1)), texts, lexed.errors()));
    }

    String golden =
        "{\n"
            + "  \"generatedBy\": %s,\n".formatted(json("javac " + System.getProperty("java.version")))
            + "  \"googleJavaFormat\": %s,\n".formatted(json(formatterVersion()))
            + "  \"fixtures\": [\n" + String.join(",\n", fixtureJson) + "\n  ],\n"
            + "  \"pairs\": [\n" + String.join(",\n", pairJson) + "\n  ]\n"
            + "}\n";
    Files.writeString(out, golden);
    System.out.printf("wrote %s: %d fixtures, %d pairs%n", out, files.size(), pairs.size());
  }

  static Lexed lex(String src) {
    Context context = new Context();
    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    context.put(DiagnosticListener.class, diagnostics);
    JavacFileManager.preRegister(context);
    JavaFileObject file =
        new SimpleJavaFileObject(URI.create("string:///Fixture.java"), JavaFileObject.Kind.SOURCE) {
          @Override
          public CharSequence getCharContent(boolean ignoreEncodingErrors) {
            return src;
          }
        };
    Log.instance(context).useSource(file);
    Scanner scanner = ScannerFactory.instance(context).newScanner(src, false);
    List<Span> spans = new ArrayList<>();
    for (scanner.nextToken(); scanner.token().kind != TokenKind.EOF; scanner.nextToken()) {
      Token token = scanner.token();
      spans.add(new Span(token.pos, token.endPos));
    }
    return new Lexed(spans, diagnostics.getDiagnostics().size());
  }

  static String wrap(String member) {
    StringBuilder out = new StringBuilder(WRAPPER_OPEN).append('\n');
    member.lines().forEach(line -> out.append(line.isEmpty() ? "" : "  " + line).append('\n'));
    return out.append("}\n").toString();
  }

  static String unwrap(String formatted, String name) {
    List<String> lines = formatted.lines().toList();
    if (lines.size() < 2
        || !lines.get(0).equals(WRAPPER_OPEN)
        || !lines.get(lines.size() - 1).equals("}")) {
      fail(name + ": formatter output is not a single wrapped member");
    }
    StringBuilder out = new StringBuilder();
    for (String line : lines.subList(1, lines.size() - 1)) {
      if (!line.isEmpty() && !line.startsWith("  ")) {
        fail(name + ": formatted member line is not indented by the wrapper: " + line);
      }
      out.append(line.isEmpty() ? "" : line.substring(2)).append('\n');
    }
    return out.toString();
  }

  static String format(String source) throws IOException, InterruptedException {
    return run(source, "google-java-format", "-");
  }

  static String formatterVersion() throws IOException, InterruptedException {
    return run("", "google-java-format", "--version").strip();
  }

  static String run(String input, String... command) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
    try (var stdin = process.getOutputStream()) {
      stdin.write(input.getBytes(StandardCharsets.UTF_8));
    }
    String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    if (process.waitFor() != 0) fail(String.join(" ", command) + " failed:\n" + output);
    return output;
  }

  static String sha256(String text) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
  }

  static String json(String value) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : value.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (c < 0x20) out.append("\\u%04x".formatted((int) c));
          else out.append(c);
        }
      }
    }
    return out.append('"').toString();
  }

  static void fail(String message) {
    System.err.println("java-reference: " + message);
    System.exit(1);
  }
}
