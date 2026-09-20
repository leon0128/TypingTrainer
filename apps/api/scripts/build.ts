import { readFileSync } from 'node:fs';

import { build } from 'esbuild';

/**
 * Bundles the API into dist/main.js, the migration runner into dist/migrate.js, and the hashing benchmark into dist/argon2-bench.js. Workspace packages export TypeScript sources, so they are
 * bundled; every other dependency stays external and is installed in the image.
 */
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
};

await build({
  entryPoints: {
    main: 'src/main.ts',
    migrate: 'src/migrate.ts',
    'argon2-bench': 'src/argon2-bench.ts',
  },
  outdir: 'dist',
  outExtension: { '.js': '.js' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: Object.keys(manifest.dependencies).filter(
    (name) => !name.startsWith('@typing-trainer/'),
  ),
  logLevel: 'info',
});
