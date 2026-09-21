import type { TypingProgram } from '@typing-trainer/contracts';
import type { EngineState } from '@typing-trainer/typing-engine';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';

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

const Group = memo(function Group({ group, flash }: { group: GroupView; flash: boolean }) {
  return (
    <span className="ja-group">
      <span className={`ja-text ja-${groupState(group)}`}>{group.display}</span>
      <span className="ja-romaji">
        {group.units.map((unit) => (
          <span
            key={unit.atomIndex}
            className={
              unit.state === 'cursor'
                ? `cell cell-cursor${flash ? ' miss-flash' : ''}`
                : `cell cell-${unit.state}`
            }
          >
            {unit.typed !== '' && <span className="cell-typed">{unit.typed}</span>}
            {unit.rest}
          </span>
        ))}
      </span>
    </span>
  );
});

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
          {line.groups.map((group) => (
            <Group
              key={group.units[0]?.atomIndex}
              group={group}
              flash={flashing > 0 && group.units.some((unit) => unit.state === 'cursor')}
            />
          ))}
          {line.eol !== null && (
            <span className={`cell cell-${line.eol.state}`}>
              {line.eol.state === 'cursor' ? '↵' : ''}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
