import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CompileError, compileBlock, type Token } from '@typing-trainer/block-compiler';
import {
  CONTENT_LANGUAGES,
  type ContentBundle,
  type ContentLanguage,
  type TypingProgram,
} from '@typing-trainer/contracts';

import { buildBundle, bundlePath, serializeBundle } from './bundle';
import { constraintDiagnostics } from './constraints';
import { dedupeDiagnostics, type DedupeEntry } from './dedupe';
import { SYNTAX_STAGES, type ContentDiagnostic } from './diagnostics';
import { LANGUAGES } from './languages';
import { toolchainDiagnostics, type ToolchainBlock } from './toolchains';
import { parseWrapped, treeSitterDiagnostics } from './tree-sitter';
import { prettierDiagnostics, typescriptSyntaxDiagnostics } from './typescript-checks';

const FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PipelineOptions {
  /** Repository root containing `content/`. */
  readonly root: string;
  /**
   * Also run each language's toolchain (§5.2 stages 2 and 3 for Go, Java, and Python). Throws
   * ToolchainUnavailableError when a tool is missing.
   */
  readonly toolchains?: boolean;
}

export interface BuiltBundle {
  readonly bundle: ContentBundle;
  readonly text: string;
}

export interface PipelineResult {
  readonly diagnostics: readonly ContentDiagnostic[];
  /** One entry per language with at least one block; only complete when there are no diagnostics. */
  readonly bundles: ReadonlyMap<ContentLanguage, BuiltBundle>;
}

/**
 * Runs the content pipeline (§5.2): discover, formatting and syntax (TypeScript always, other
 * languages with `toolchains`), tree-sitter, constraints, compile, and dedupe. Every block is
 * checked and every diagnostic collected before returning.
 */
export async function runPipeline({
  root,
  toolchains = false,
}: PipelineOptions): Promise<PipelineResult> {
  const diagnostics: ContentDiagnostic[] = [];
  const bundles = new Map<ContentLanguage, BuiltBundle>();

  for (const language of CONTENT_LANGUAGES) {
    const config = LANGUAGES[language];
    const dir = join(root, 'content', 'blocks', language);
    if (!existsSync(dir)) continue;

    const languageDiagnostics: ContentDiagnostic[] = [];
    const programs: TypingProgram[] = [];
    const dedupeEntries: DedupeEntry[] = [];

    const blocks: ToolchainBlock[] = [];
    for (const name of readdirSync(dir).sort()) {
      const file = `content/blocks/${language}/${name}`;
      const dot = name.lastIndexOf('.');
      const stem = dot === -1 ? name : name.slice(0, dot);
      const extension = dot === -1 ? '' : name.slice(dot + 1);
      if (extension !== config.extension || !FILE_NAME.test(stem)) {
        languageDiagnostics.push({
          file,
          line: 1,
          column: 1,
          stage: 'discover',
          code: 'file-name',
          message: `block files are named <kebab-case>.${config.extension}`,
        });
        continue;
      }
      blocks.push({ file, source: readFileSync(join(dir, name), 'utf8') });
    }

    const fromToolchain = toolchains ? toolchainDiagnostics(language, blocks) : [];
    for (const { file, source } of blocks) {
      const result = await checkBlock(
        language,
        source,
        file,
        fromToolchain.filter((diagnostic) => diagnostic.file === file),
      );
      languageDiagnostics.push(...result.diagnostics);
      if (result.program !== undefined) {
        programs.push(result.program);
        dedupeEntries.push({ file, prepared: result.prepared, tokens: result.tokens });
      }
    }

    languageDiagnostics.push(...dedupeDiagnostics(config, dedupeEntries));
    diagnostics.push(...languageDiagnostics);
    if (languageDiagnostics.length === 0 && programs.length > 0) {
      const bundle = buildBundle(language, programs);
      bundles.set(language, { bundle, text: serializeBundle(bundle) });
    }
  }

  return { diagnostics, bundles };
}

interface BlockResult {
  readonly diagnostics: ContentDiagnostic[];
  readonly program?: TypingProgram;
  readonly prepared: string;
  readonly tokens: readonly Token[];
}

async function checkBlock(
  language: ContentLanguage,
  source: string,
  file: string,
  fromToolchain: readonly ContentDiagnostic[],
): Promise<BlockResult> {
  const config = LANGUAGES[language];
  const diagnostics: ContentDiagnostic[] = [...fromToolchain];
  const blockId = `${language}/${file.slice(file.lastIndexOf('/') + 1, file.lastIndexOf('.'))}`;
  const prepared = config.prepare(source);

  if (language === 'typescript') {
    diagnostics.push(...(await prettierDiagnostics(source, file)));
    diagnostics.push(...typescriptSyntaxDiagnostics(source, file));
  }

  const wrapped = await parseWrapped(config, prepared);
  try {
    diagnostics.push(...treeSitterDiagnostics(wrapped, file));
    diagnostics.push(...constraintDiagnostics(config, prepared, wrapped, file));
  } finally {
    wrapped.tree.delete();
  }

  if (diagnostics.some((diagnostic) => SYNTAX_STAGES.has(diagnostic.stage))) {
    return { diagnostics, prepared, tokens: [] };
  }
  try {
    const program = compileBlock(prepared, config.adapter, blockId);
    return { diagnostics, program, prepared, tokens: config.adapter.tokenize(prepared) };
  } catch (error) {
    if (!(error instanceof CompileError)) throw error;
    for (const d of error.diagnostics) {
      diagnostics.push({
        file,
        line: d.start.line,
        column: d.start.column,
        stage: 'compile',
        code: d.code,
        message: d.message,
      });
    }
    return { diagnostics, prepared, tokens: [] };
  }
}

/** Writes the bundles and removes bundles of languages that no longer have blocks. */
export function writeBundles(root: string, result: PipelineResult): string[] {
  mkdirSync(join(root, 'content', 'dist'), { recursive: true });
  const written: string[] = [];
  for (const language of CONTENT_LANGUAGES) {
    const path = join(root, bundlePath(language));
    const built = result.bundles.get(language);
    if (built === undefined) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, built.text);
      written.push(bundlePath(language));
    }
  }
  return written;
}

/** Compares committed bundles with freshly built ones (§5.2 `content:check`). */
export function bundleDiagnostics(root: string, result: PipelineResult): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  for (const language of CONTENT_LANGUAGES) {
    const file = bundlePath(language);
    const path = join(root, file);
    const built = result.bundles.get(language);
    const committed = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    const report = (code: string, message: string): void => {
      diagnostics.push({ file, line: 1, column: 1, stage: 'bundle', code, message });
    };
    if (built === undefined && committed !== undefined) {
      report('unexpected', 'a bundle exists for a language without blocks; run pnpm content:build');
    } else if (built !== undefined && committed === undefined) {
      report('missing', 'the bundle has not been built; run pnpm content:build');
    } else if (built !== undefined && committed !== built.text) {
      report('stale', 'the bundle does not match the block sources; run pnpm content:build');
    }
  }
  return diagnostics;
}
