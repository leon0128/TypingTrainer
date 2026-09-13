import { z } from 'zod';

import { TypingProgramSchema, type TypingProgram } from './typing-program';

export const CONTENT_LANGUAGES = ['typescript', 'go', 'java', 'python'] as const;
export const ContentLanguageSchema = z.enum(CONTENT_LANGUAGES);
export type ContentLanguage = z.infer<typeof ContentLanguageSchema>;

/**
 * The compiled blocks of one language (§5.2), written to `content/dist/<language>.bundle.json` by
 * the content CLI and shipped with the API image (§9.3).
 */
export const ContentBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    language: ContentLanguageSchema,
    /** SHA-256 (hex) of `canonicalBlocksJson(blocks)`; stored as `play_sessions.content_revision`. */
    revision: z.string().regex(/^[0-9a-f]{64}$/),
    /** Sorted by blockId, which is `<language>/<name>`. */
    blocks: z.array(TypingProgramSchema).min(1),
  })
  .superRefine((bundle, ctx) => {
    const prefix = `${bundle.language}/`;
    bundle.blocks.forEach((block, index) => {
      if (!block.blockId.startsWith(prefix)) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'blockId'],
          message: `blockId must start with "${prefix}"`,
        });
      }
      const previous = bundle.blocks[index - 1];
      if (previous !== undefined && previous.blockId >= block.blockId) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'blockId'],
          message: 'blocks must be sorted by blockId without duplicates',
        });
      }
    });
  });

export type ContentBundle = z.infer<typeof ContentBundleSchema>;

/**
 * The exact text hashed into `revision`: JSON with a fixed key order per atom kind and no
 * whitespace, so the revision depends only on the compiled content.
 */
export function canonicalBlocksJson(blocks: readonly TypingProgram[]): string {
  return JSON.stringify(
    blocks.map((block) => ({
      blockId: block.blockId,
      canonicalKeystrokes: block.canonicalKeystrokes,
      atoms: block.atoms.map((atom) => {
        switch (atom.kind) {
          case 'literal':
            return { kind: atom.kind, text: atom.text };
          case 'auto':
            return { kind: atom.kind, text: atom.text, filledBy: atom.filledBy };
          case 'padding':
            return { kind: atom.kind, text: atom.text };
          case 'separator':
            return { kind: atom.kind, canonical: atom.canonical, required: atom.required };
        }
      }),
    })),
  );
}
