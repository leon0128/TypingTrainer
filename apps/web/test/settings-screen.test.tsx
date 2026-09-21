// @vitest-environment jsdom
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PLAY_APPEARANCE,
  type Appearance,
  type Language,
} from '@typing-trainer/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLanguageStore } from '../src/features/tracks/language-store';
import { useAppearance } from '../src/features/appearance/appearance-store';
import { PALETTES } from '../src/features/appearance/palettes';
import { soundPlayer } from '../src/features/sound/sound';
import { SettingsScreen } from '../src/features/appearance/SettingsScreen';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const echo = (requests: { body: unknown }[]) => (_url: string, init: { body?: string }) => {
  const { play, ...patch } = JSON.parse(init.body ?? '{}') as Partial<Appearance> & {
    play?: { track: 'code' | 'natural-en' } & Record<string, unknown>;
  };
  requests.push({ body: play === undefined ? patch : { ...patch, play } });
  const looks = { code: DEFAULT_PLAY_APPEARANCE.code, 'natural-en': DEFAULT_PLAY_APPEARANCE.code };
  if (play !== undefined) {
    const { track, ...change } = play;
    looks[track] = { ...looks[track], ...change };
  }
  return Promise.resolve(
    json({
      timezone: 'UTC',
      locale: 'en',
      soundPack: 'off',
      soundVolume: 30,
      ...DEFAULT_APPEARANCE,
      ...patch,
      play: looks,
    }),
  );
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/" element={<p>choose a language</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAppearance.setState({
    appearance: DEFAULT_APPEARANCE,
    play: DEFAULT_PLAY_APPEARANCE,
    sound: { soundPack: 'off', soundVolume: 30 },
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-preset');
});

describe('the appearance settings screen', () => {
  it('offers every font, size, theme, and colour set, marking the current ones', () => {
    renderScreen();
    const pressed = (group: string) =>
      within(screen.getByRole('group', { name: group }))
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.textContent.trim());

    expect(within(screen.getByRole('group', { name: 'Font' })).getAllByRole('button')).toHaveLength(
      5,
    );
    expect(within(screen.getByRole('group', { name: 'Size' })).getAllByRole('button')).toHaveLength(
      5,
    );
    expect(
      within(screen.getByRole('group', { name: 'Theme' })).getAllByRole('button'),
    ).toHaveLength(4);
    expect(
      within(screen.getByRole('group', { name: 'Colors' })).getAllByRole('button'),
    ).toHaveLength(3);
    expect(pressed('Font')).toEqual(['JetBrains Mono']);
    expect(pressed('Size')).toEqual(['18 px']);
    expect(pressed('Theme')).toEqual(['System']);
    expect(pressed('Colors')).toEqual(['Standard']);
  });

  it('previews the states a colour set has to keep apart', () => {
    renderScreen();
    const preview = within(screen.getByRole('region', { name: 'Preview' }));
    const code = preview.getByLabelText('Code to type');
    expect(code.querySelector('.cell-typed')).not.toBeNull();
    expect(code.querySelector('.cell-cursor')).not.toBeNull();
    expect(code.querySelector('.cell-pending')).not.toBeNull();
    expect(code.querySelector('.cell-auto-pending')).not.toBeNull();
    expect(preview.getByText('miss')).toBeTruthy();
  });

  it('applies a choice at once and sends only that choice', async () => {
    const requests: { body: unknown }[] = [];
    vi.stubGlobal('fetch', echo(requests));
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: '24 px' }));
    expect(document.documentElement.style.getPropertyValue('--code-size')).toBe('24px');
    await userEvent.click(screen.getByRole('button', { name: 'Monochrome' }));
    await userEvent.click(screen.getByRole('button', { name: 'High contrast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fira Code' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pixel' }));

    expect(requests.map((request) => request.body)).toEqual([
      { play: { track: 'code', fontSize: 24 } },
      { play: { track: 'code', colorPreset: 'monochrome' } },
      { theme: 'high-contrast' },
      { play: { track: 'code', font: 'fira-code' } },
      { skin: 'pixel' },
    ]);
    expect(document.documentElement.getAttribute('data-skin')).toBe('pixel');
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
    expect(document.documentElement.getAttribute('data-preset')).toBe('monochrome');
    expect(screen.getByRole('button', { name: '24 px' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '18 px' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('says so, and keeps the old choice, when saving fails', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 500, error: 'Internal Server Error', message: 'try again' }, 500),
      ),
    );
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: '14 px' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The server had a problem. Try again in a moment.',
    );
    expect(screen.getByRole('button', { name: '18 px' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the key sound settings', () => {
  const requests: { body: unknown }[] = [];

  beforeEach(() => {
    requests.length = 0;
    vi.stubGlobal('fetch', echo(requests));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    soundPlayer.configure({ pack: 'off', volume: 0 });
  });

  it('offers the packs and a volume, off and low until chosen', () => {
    renderScreen();
    const packs = within(screen.getByRole('group', { name: 'Sound pack' }));
    expect(packs.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Off',
      'Mechanical',
      'Soft',
      'Beep',
    ]);
    expect(packs.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('slider')).toHaveProperty('value', '30');
  });

  it('keeps the volume and the previews off until a pack is chosen, and says why', () => {
    renderScreen();
    expect(screen.getByRole('slider')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Hear a hit' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Hear a miss' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Choose a sound pack to hear it.')).toBeTruthy();
  });

  it('applies a pack at once, saves it, and plays a first sample from the click', async () => {
    const configure = vi.spyOn(soundPlayer, 'configure');
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined);
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: 'Soft' }));
    expect(configure).toHaveBeenCalledWith({ pack: 'soft', volume: 30 });
    expect(play).toHaveBeenCalledWith('hit');
    expect(requests.map((request) => request.body)).toEqual([{ soundPack: 'soft' }]);
    expect(screen.getByRole('button', { name: 'Soft' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('slider')).toHaveProperty('disabled', false);
    expect(screen.queryByText('Choose a sound pack to hear it.')).toBeNull();
  });

  it('applies a new volume to the player and saves it', async () => {
    const configure = vi.spyOn(soundPlayer, 'configure');
    vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined);
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Beep' }));

    fireEvent.change(screen.getByRole('slider'), { target: { value: '75' } });
    expect(configure).toHaveBeenLastCalledWith({ pack: 'beep', volume: 75 });
    await vi.waitFor(() => {
      expect(requests.map((request) => request.body)).toContainEqual({ soundVolume: 75 });
    });
    expect(screen.getByText('75')).toBeTruthy();
  });

  it('lets the player hear a hit and a miss', async () => {
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined);
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Mechanical' }));
    play.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Hear a hit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hear a miss' }));
    expect(play.mock.calls).toEqual([['hit'], ['miss']]);
  });
});

describe('the play look of each track (§13.10)', () => {
  const pool = (slug: Language['slug'], track: Language['track'], kind: Language['kind']) => ({
    slug,
    displayName: slug,
    track,
    kind,
  });
  const tab = (name: string) =>
    within(screen.getByRole('group', { name: 'Play screen for' })).getByRole('button', { name });
  const ENGLISH = [pool('go', 'code', null), pool('en-word', 'natural-en', 'word')];
  const WITH_JAPANESE = [...ENGLISH, pool('ja-word', 'natural-ja', 'word')];
  const pressedIn = (group: string) =>
    within(screen.getByRole('group', { name: group }))
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent.trim());

  afterEach(() => {
    useLanguageStore.setState({ languages: null, error: null });
  });

  it('shows no track to choose while only the code track is offered', () => {
    useLanguageStore.setState({ languages: [pool('go', 'code', null)], error: null });
    renderScreen();
    expect(screen.queryByRole('group', { name: 'Play screen for' })).toBeNull();
  });

  it('offers the tracks the account may use, and never the Japanese one otherwise', async () => {
    useLanguageStore.setState({ languages: ENGLISH, error: null });
    renderScreen();
    const tabs = within(screen.getByRole('group', { name: 'Play screen for' }));
    expect(tabs.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Code',
      'English',
    ]);
    await userEvent.click(tab('English'));
    // The English track has the Latin fonts; nothing Japanese appears anywhere on the screen.
    expect(within(screen.getByRole('group', { name: 'Font' })).getAllByRole('button')).toHaveLength(
      5,
    );
    // The language chooser names Japanese in Japanese by design; the play settings never do.
    for (const region of [
      screen.getByRole('region', { name: 'Preview' }),
      screen.getByRole('group', { name: 'Font' }),
      screen.getByRole('group', { name: 'Play screen for' }),
    ]) {
      expect(region.textContent).not.toMatch(/[぀-ヿ一-鿿]|M PLUS|BIZ/);
    }
  });

  it("changes the chosen track's look only, and shows each track's own", async () => {
    const requests: { body: unknown }[] = [];
    vi.stubGlobal('fetch', echo(requests));
    useLanguageStore.setState({ languages: ENGLISH, error: null });
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: '24 px' }));
    await userEvent.click(tab('English'));
    expect(pressedIn('Size')).toEqual(['18 px']);
    await userEvent.click(screen.getByRole('button', { name: 'Fira Code' }));
    expect(pressedIn('Font')).toEqual(['Fira Code']);
    await userEvent.click(tab('Code'));
    expect(pressedIn('Size')).toEqual(['24 px']);
    expect(pressedIn('Font')).toEqual(['JetBrains Mono']);
    expect(requests.map((request) => request.body)).toEqual([
      { play: { track: 'code', fontSize: 24 } },
      { play: { track: 'natural-en', font: 'fira-code' } },
    ]);
  });

  it('offers the Japanese fonts for the Japanese track, and previews Japanese', async () => {
    const requests: { body: unknown }[] = [];
    vi.stubGlobal('fetch', echo(requests));
    useLanguageStore.setState({ languages: WITH_JAPANESE, error: null });
    renderScreen();
    await userEvent.click(tab('Japanese'));
    expect(
      within(screen.getByRole('group', { name: 'Font' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['M PLUS 1 Code', 'BIZ UDGothic']);
    expect(pressedIn('Font')).toEqual(['M PLUS 1 Code']);
    const preview = within(screen.getByRole('region', { name: 'Preview' }));
    expect(preview.getByText('今日')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'BIZ UDGothic' }));
    expect(requests.map((request) => request.body)).toEqual([
      { play: { track: 'natural-ja', font: 'biz-ud-gothic' } },
    ]);
  });

  it("dresses the preview in the chosen track's own colours and font", async () => {
    useLanguageStore.setState({ languages: ENGLISH, error: null });
    vi.stubGlobal('fetch', echo([]));
    const { container } = renderScreen();
    await userEvent.click(tab('English'));
    await userEvent.click(screen.getByRole('button', { name: 'Monochrome' }));
    const dressed = container.querySelector<HTMLElement>('[data-preset]');
    expect(dressed?.getAttribute('data-preset')).toBe('monochrome');
    expect(dressed?.style.getPropertyValue('--typed')).toBe(PALETTES.monochrome.light.typed);
    // The page around it keeps the code track's set.
    expect(document.documentElement.getAttribute('data-preset')).toBe('standard');
  });
});
