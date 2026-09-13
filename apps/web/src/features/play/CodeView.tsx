import { useMemo } from 'react';

import type { Layout } from './layout';
import { Line } from './Line';
import { lineViews } from './line-view';
import type { PlaySnapshot } from './play-store';

export function CodeView({ layout, snapshot }: { layout: Layout; snapshot: PlaySnapshot }) {
  const { engine, lastMiss, missSeq } = snapshot;
  const views = useMemo(() => lineViews(layout, engine), [layout, engine]);

  // Flash only while the caret is still where the latest miss left it.
  const flashSeq =
    lastMiss?.atomIndex === engine.atomIndex && lastMiss.charIndex === engine.charIndex
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
