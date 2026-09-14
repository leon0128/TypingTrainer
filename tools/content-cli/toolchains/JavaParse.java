import com.sun.source.util.JavacTask;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Parses Java files with javac without resolving symbols, which content fragments cannot satisfy.
 * Prints one line per syntax error: path, line, column, and message separated by tabs.
 *
 * <p>Run by the content CLI with {@code java JavaParse.java <file>...}.
 */
public class JavaParse {
  public static void main(String[] args) throws Exception {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    try (StandardJavaFileManager files =
        compiler.getStandardFileManager(null, Locale.ROOT, StandardCharsets.UTF_8)) {
      DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
      JavacTask task =
          (JavacTask)
              compiler.getTask(
                  null,
                  files,
                  diagnostics,
                  List.of("-proc:none"),
                  null,
                  files.getJavaFileObjects(args));
      task.parse();
      for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
        if (diagnostic.getKind() != Diagnostic.Kind.ERROR || diagnostic.getSource() == null) {
          continue;
        }
        System.out.printf(
            "%s\t%d\t%d\t%s%n",
            diagnostic.getSource().getName(),
            diagnostic.getLineNumber(),
            diagnostic.getColumnNumber(),
            diagnostic.getMessage(Locale.ROOT).replace('\n', ' '));
      }
    }
  }
}
