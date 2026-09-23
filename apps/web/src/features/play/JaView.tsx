import type { TypingProgram } from '@typing-trainer/contracts';
import type { EngineState } from '@typing-trainer/typing-engine';
import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';

import { useTranslation } from '../../i18n';

import { followCaret } from './follow-caret';
import { jaLines, type GroupView, type UnitState } from './ja-view';

export interface JaViewProps {
  readonly program: TypingProgram;
  /** The block being typed, or null to preview an untouched block. */
  readonly engine: EngineState | null;
  readonly missSeq: number;
  readonly lastMiss: { readonly atomIndex: number; readonly charIndex: number } | null;
}

/** The state of a group's text: typed once every unit is, the caret's while one of them has it. */
function groupState(group: GroupView): UnitState {
  if (group.units.some((unit) => unit.state === 'cursor')) return 'cursor';
  return group.units.every((unit) => unit.state === 'typed') ? 'typed' : 'pending';
}

/**
 * A Japanese block as two lines, the text above and the romaji below it (§13.6). The caret is the
 * unit being typed; its romaji is redrawn along the route the keys typed so far have settled on.
 */
export function JaView({ program, engine, missSeq, lastMiss }: JaViewProps) {
  const { t } = useTranslation();
  const preRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => jaLines(program, engine), [program, engine]);

  useLayoutEffect(() => {
    if (engine !== null && preRef.current !== null) followCaret(preRef.current);
  }, [engine]);

  const flashing =
    engine !== null &&
    lastMiss?.atomIndex === engine.atomIndex &&
    lastMiss.charIndex === engine.charIndex
      ? missSeq
      : 0;

  return (
    <div ref={preRef} className="code ja-block" aria-label={t('play.codeToType')}>
      {lines.map((line, index) => (
        <div key={index} className="ja-line">
          {/* The text is laid out on its own row, evenly spaced whatever the romaji below is; the
              romaji row follows its own widths, so the two need not line up (§13.6). */}
          <div className="ja-texts">
            {line.groups.map((group) => (
              <span key={group.units[0]?.atomIndex} className={`ja-text ja-${groupState(group)}`}>
                {group.display}
              </span>
            ))}
            {line.eol !== null && (
              <span className={`cell cell-${line.eol.state}`}>
                {line.eol.state === 'cursor' ? '↵' : ''}
              </span>
            )}
          </div>
          <div className="ja-romaji">
            {line.groups.flatMap((group) =>
              group.units.map((unit) =>
                unit.state === 'cursor' ? (
                  // Highlight one romaji key at a time, not the whole unit (e.g. "k" of "ka", then "a").
                  <Fragment key={unit.atomIndex}>
                    {unit.typed !== '' && <span className="cell-typed">{unit.typed}</span>}
                    <span className={`cell cell-cursor${flashing > 0 ? ' miss-flash' : ''}`}>
                      {unit.rest.slice(0, 1)}
                    </span>
                    {unit.rest.length > 1 && (
                      <span className="cell-pending">{unit.rest.slice(1)}</span>
                    )}
                  </Fragment>
                ) : (
                  <span key={unit.atomIndex} className={`cell cell-${unit.state}`}>
                    {unit.typed !== '' && <span className="cell-typed">{unit.typed}</span>}
                    {unit.rest}
                  </span>
                ),
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
