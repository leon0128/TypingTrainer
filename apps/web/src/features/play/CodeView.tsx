import type { EngineState } from '@typing-trainer/typing-engine';
import { useLayoutEffect, useMemo, useRef } from 'react';

import { useTranslation } from '../../i18n';

import { followCaret } from './follow-caret';
import type { Layout } from './layout';
import { Line } from './Line';
import { lineViews, type LineView } from './line-view';

export interface CodeViewProps {
  readonly layout: Layout;
  /** The block being typed, or null to preview an untouched block (the next one, §8.1). */
  readonly engine: EngineState | null;
  readonly missSeq: number;
  readonly lastMiss: { readonly atomIndex: number; readonly charIndex: number } | null;
  /** Long lines wrap instead of scrolling: English prose (§13.6). */
  readonly wrap?: boolean;
}

/** Nothing typed, no caret: every cell renders in its resting state. */
const UNTOUCHED: LineView = { typedUntil: 0, cursorHere: false, filledAutoKey: '' };

export function CodeView({ layout, engine, missSeq, lastMiss, wrap = false }: CodeViewProps) {
  const { t } = useTranslation();
  const preRef = useRef<HTMLPreElement>(null);
  const views = useMemo(
    () => (engine === null ? layout.lines.map(() => UNTOUCHED) : lineViews(layout, engine)),
    [layout, engine],
  );

  // Before paint, so the caret is never shown outside the panel even for one frame (§8.1).
  useLayoutEffect(() => {
    if (engine !== null && preRef.current !== null) followCaret(preRef.current);
  }, [engine]);

  // Flash only while the caret is still where the latest miss left it.
  const flashSeq =
    engine !== null &&
    lastMiss?.atomIndex === engine.atomIndex &&
    lastMiss.charIndex === engine.charIndex
      ? missSeq
      : 0;

  return (
    <pre
      ref={preRef}
      className={wrap ? 'code code-wrap' : 'code'}
      aria-label={t('play.codeToType')}
    >
      {layout.lines.map((line, index) => {
        const view = views[index];
        if (!view) return null;
        return (
          <Line
            key={index}
            line={line}
            typedUntil={view.typedUntil}
            cursorHere={view.cursorHere}
            filledAutoKey={view.filledAutoKey}
            flashSeq={view.cursorHere ? flashSeq : 0}
          />
        );
      })}
    </pre>
  );
}
