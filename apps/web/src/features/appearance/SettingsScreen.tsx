import {
  COLOR_PRESETS,
  FONTS,
  FONT_SIZES,
  SOUND_PACKS,
  THEMES,
  type ColorPreset,
  type SoundPack,
  type Theme,
  type TypingProgram,
} from '@typing-trainer/contracts';
import { createEngineState, handleKey } from '@typing-trainer/typing-engine';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';

import { CodeView } from '../play/CodeView';
import { soundPlayer } from '../sound/sound';
import { buildLayout } from '../play/layout';
import { useAppearance } from './appearance-store';
import { FONT_LABELS, fontStack, loadFont } from './fonts';
import { PALETTES } from './palettes';

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'high-contrast': 'High contrast',
};

const SOUND_LABELS: Record<SoundPack, string> = {
  off: 'Off',
  mechanical: 'Mechanical',
  soft: 'Soft',
  beep: 'Beep',
};

const PRESET_LABELS: Record<ColorPreset, string> = {
  standard: 'Standard',
  'okabe-ito': 'Okabe–Ito',
  monochrome: 'Monochrome',
};

/**
 * A block for the preview: typed text, the cursor, text still to type, and auto-inserted text that
 * has and has not been filled — every state a colour set has to keep apart (§8.1).
 */
const SAMPLE: TypingProgram = {
  blockId: 'settings-sample',
  atoms: [
    { kind: 'literal', text: 'if' },
    { kind: 'separator', canonical: ' ', required: false },
    { kind: 'literal', text: '(' },
    { kind: 'literal', text: 'ready' },
    { kind: 'auto', text: ')', filledBy: 2 },
    { kind: 'separator', canonical: ' ', required: false },
    { kind: 'literal', text: '{' },
    { kind: 'separator', canonical: '\n', required: true },
    { kind: 'auto', text: '  ', filledBy: 7 },
    { kind: 'literal', text: 'go(' },
    { kind: 'auto', text: ')', filledBy: 9 },
    { kind: 'separator', canonical: '\n', required: true },
    { kind: 'auto', text: '}', filledBy: 6 },
  ],
  canonicalKeystrokes: 15,
};

/** The sample as it looks part-way through: the first block of it typed, then the cursor. */
function sampleEngine() {
  let state = createEngineState(SAMPLE);
  for (const key of ['i', 'f', '(', 'r', 'e', 'a', 'd', 'y', ' ', '{']) {
    state = handleKey(state, key).state;
  }
  return state;
}

const UNSELECTED = 'rounded border border-slate-400 px-3 py-1 disabled:opacity-50';

function choiceClass(active: boolean): string {
  return active
    ? 'rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900'
    : 'rounded border border-slate-400 px-3 py-1';
}

/** Appearance settings (F-12, §8.2): font, size, theme, and colour set, with a live preview. */
export function SettingsScreen() {
  const appearance = useAppearance((state) => state.appearance);
  const sound = useAppearance((state) => state.sound);
  const error = useAppearance((state) => state.error);
  const change = useAppearance((state) => state.change);

  // Each font is shown in itself, so all five are needed here; elsewhere only the chosen one is.
  useEffect(() => {
    for (const font of FONTS) void loadFont(font);
  }, []);

  const layout = useMemo(() => buildLayout(SAMPLE), []);
  const engine = useMemo(() => sampleEngine(), []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Appearance</h1>
        <Link className="underline" to="/">
          Choose a language
        </Link>
      </header>

      {error !== null && (
        <p
          className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}

      <section aria-label="Preview" className="flex flex-col gap-2">
        <div className="code-panel">
          <CodeView layout={layout} engine={engine} missSeq={0} lastMiss={null} />
        </div>
        <p className="flex flex-wrap gap-3 text-sm">
          <span style={{ color: 'var(--typed)' }}>typed</span>
          <span style={{ color: 'var(--pending)' }}>to type</span>
          <span
            style={{
              background: 'var(--error)',
              color: 'var(--error-fg)',
              outline: '2px solid var(--fg)',
              outlineOffset: -2,
              padding: '0 6px',
            }}
          >
            miss
          </span>
        </p>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Font</legend>
        <div className="flex flex-wrap gap-2">
          {FONTS.map((font) => (
            <button
              key={font}
              type="button"
              aria-pressed={font === appearance.font}
              className={choiceClass(font === appearance.font)}
              style={{ fontFamily: fontStack(font) }}
              onClick={() => void change({ font })}
            >
              {FONT_LABELS[font]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Size</legend>
        <div className="flex flex-wrap gap-2">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={size === appearance.fontSize}
              className={choiceClass(size === appearance.fontSize)}
              onClick={() => void change({ fontSize: size })}
            >
              {size} px
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Theme</legend>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              aria-pressed={theme === appearance.theme}
              className={choiceClass(theme === appearance.theme)}
              onClick={() => void change({ theme })}
            >
              {THEME_LABELS[theme]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Colors</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => {
            const swatch = PALETTES[preset].light;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={preset === appearance.colorPreset}
                className={`${choiceClass(preset === appearance.colorPreset)} flex items-center gap-2`}
                onClick={() => void change({ colorPreset: preset })}
              >
                <span aria-hidden className="flex">
                  {[swatch.typed, swatch.pending, swatch.cursorBg, swatch.error].map((color) => (
                    <span
                      key={color}
                      className="h-4 w-4 border border-slate-400"
                      style={{ background: color }}
                    />
                  ))}
                </span>
                {PRESET_LABELS[preset]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">Key sounds</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sound pack">
          {SOUND_PACKS.map((pack) => (
            <button
              key={pack}
              type="button"
              aria-pressed={pack === sound.soundPack}
              className={choiceClass(pack === sound.soundPack)}
              onClick={() => {
                void change({ soundPack: pack });
                // The click is the gesture the browser wants before it lets a page make sound, and
                // a first sample of the pack just chosen.
                soundPlayer.play('hit');
              }}
            >
              {SOUND_LABELS[pack]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3">
          Volume
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={sound.soundVolume}
            aria-valuetext={`${String(sound.soundVolume)} percent`}
            disabled={sound.soundPack === 'off'}
            onChange={(event) => {
              void change({ soundVolume: Number(event.target.value) });
            }}
          />
          <span className="w-10 tabular-nums">{sound.soundVolume}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={UNSELECTED}
            disabled={sound.soundPack === 'off'}
            onClick={() => {
              soundPlayer.play('hit');
            }}
          >
            Hear a hit
          </button>
          <button
            type="button"
            className={UNSELECTED}
            disabled={sound.soundPack === 'off'}
            onClick={() => {
              soundPlayer.play('miss');
            }}
          >
            Hear a miss
          </button>
          {sound.soundPack === 'off' && (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Choose a sound pack to hear it.
            </span>
          )}
        </div>
      </fieldset>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Changes apply at once and are saved to your account. Typed, pending, cursor, and miss states
        also differ by lightness, outline, underline, or weight, so none depends on color alone.
      </p>
    </main>
  );
}
