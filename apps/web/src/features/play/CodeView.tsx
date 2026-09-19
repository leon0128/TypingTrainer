import type { EngineState } from '@typing-trainer/typing-engine';
import { useMemo } from 'react';

import type { Layout } from './layout';
import { Line } from './Line';
import { lineViews, type LineView } from './line-view';

export interface CodeViewProps {
  readonly layout: Layout;
  /** The block being typed, or null to preview an untouched block (the next one, §8.1). */
  readonly engine: EngineState | null;
  readonly missSeq: number;
  readonly lastMiss: { readonly atomIndex: number; readonly charIndex: number } | null;
}

/** Nothing typed, no caret: every cell renders in its resting state. */
const UNTOUCHED: LineView = { typedUntil: 0, cursorHere: false, filledAutoKey: '' };

export function CodeView({ layout, engine, missSeq, lastMiss }: CodeViewProps) {
  const views = useMemo(
    () => (engine === null ? layout.lines.map(() => UNTOUCHED) : lineViews(layout, engine)),
    [layout, engine],
  );

  // Flash only while the caret is still where the latest miss left it.
  const flashSeq =
    engine !== null &&
    lastMiss?.atomIndex === engine.atomIndex &&
    lastMiss.charIndex === engine.charIndex
      ? missSeq
      : 0;

  return (
    <pre className="code" aria-label="Code to type">
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
