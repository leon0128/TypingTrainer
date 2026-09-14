import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { formatDiagnostic } from './diagnostics';
import { bundleDiagnostics, runPipeline, writeBundles } from './pipeline';
import {
  ToolchainUnavailableError,
  pythonStdlibDiagnostics,
  toolchainVersions,
} from './toolchains';

const USAGE = 'usage: content-cli <build|check> [--root <repository root>]';

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  const rootFlag = rest.indexOf('--root');
  const root = resolve(rootFlag === -1 ? process.cwd() : (rest[rootFlag + 1] ?? '.'));
  if (command !== 'build' && command !== 'check') {
    console.error(USAGE);
    return 2;
  }

  // build runs every toolchain and verifies the pinned Python standard library list; check runs
  // only the stages that need no toolchain, and compares the committed bundles.
  const toolchains = command === 'build';
  let result;
  let stdlib;
  try {
    result = await runPipeline({ root, toolchains });
    stdlib = toolchains ? pythonStdlibDiagnostics() : [];
  } catch (error) {
    if (!(error instanceof ToolchainUnavailableError)) throw error;
    console.error(error.message);
    return 2;
  }
  const diagnostics =
    command === 'check' && result.diagnostics.length === 0
      ? bundleDiagnostics(root, result)
      : [...result.diagnostics, ...stdlib];
  for (const diagnostic of diagnostics) console.error(formatDiagnostic(diagnostic));
  if (diagnostics.length > 0) {
    console.error(`content ${command} failed with ${String(diagnostics.length)} diagnostic(s)`);
    return 1;
  }

  if (command === 'build') {
    const written = writeBundles(root, result);
    writeFileSync(
      join(root, 'content/dist/toolchains.json'),
      `${JSON.stringify(toolchainVersions(), null, 2)}\n`,
    );
    console.log(`content build wrote ${written.length === 0 ? 'no bundles' : written.join(', ')}`);
  } else {
    console.log(`content check passed for ${String(result.bundles.size)} bundle(s)`);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
