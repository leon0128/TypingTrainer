import type { StartSessionResponse } from '@typing-trainer/contracts';
import { ENTER_KEY, IDLE_LIMIT_MS, PLAY_DURATION_MS } from '@typing-trainer/typing-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRunSession } from '../src/features/play/run-session';
import { IF_PROGRAM } from './program-fixture';

const ISSUED: StartSessionResponse = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  language: 'python',
  mode: 'single',
  seed: '7',
  contentRevision: 'b'.repeat(64),
  blocks: [IF_PROGRAM],
  durationMs: PLAY_DURATION_MS,
  idleLimitMs: IDLE_LIMIT_MS,
};

const STORED = {
  id: '33333333-3333-4333-8333-333333333333',
  language: 'python',
  mode: 'single',
  startedAt: '2026-09-20T01:00:00.000Z',
  localDate: '2026-09-20',
  effectiveKeystrokes: 10,
  missCount: 0,
  rawKeystrokes: 8,
  kpm: 5,
  accuracy: 1,
  score: 5,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Types the one issued block to the end, which ends the run (§4.1). */
function playToTheEnd(): void {
  const run = useRunSession.getState().run;
  if (run === null) throw new Error('no run');
  const keys = ['i', 'f', '(', 'a', '{', ENTER_KEY, 'b', ENTER_KEY];
  keys.forEach((key, index) => {
    run.press(key, performance.now() + index * 100);
  });
  if (run.getSnapshot().phase !== 'ended') throw new Error('the run should have ended');
}

const begin = () => {
  useRunSession.getState().begin(ISSUED, performance.now());
};

beforeEach(() => {
  useRunSession.setState({ run: null, submission: { kind: 'unsent' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('submitting a finished run', () => {
  it('sends the log and keeps what the server stored', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { body?: string } = {}) => {
      calls.push({ url, body: init.body ?? '' });
      return Promise.resolve(json({ run: STORED }, 201));
    });

    begin();
    playToTheEnd();
    await useRunSession.getState().submit();

    expect(calls[0]?.url).toBe(`/api/play/sessions/${ISSUED.sessionId}/result`);
    const sent = JSON.parse(calls[0]?.body ?? '{}') as { log: { keys: string; deltas: number[] } };
    // Exactly the log the run store built: the client sends no numbers of its own (§9.8).
    expect(sent.log).toEqual(useRunSession.getState().run?.buildLog());
    expect(sent.log.deltas[0]).toBe(0);
    expect(useRunSession.getState().submission).toEqual({ kind: 'saved', run: STORED });
  });

  it('reports a run with nothing to score, which the server answers 204', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 204 })));
    begin();
    playToTheEnd();
    await useRunSession.getState().submit();
    expect(useRunSession.getState().submission).toEqual({ kind: 'empty' });
  });

  it('never sends a run that was discarded for being idle', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    begin();
    const run = useRunSession.getState().run;
    const started = performance.now();
    run?.press('i', started);
    run?.pause(started + 100);
    // Paused, so the run time stops while the wall clock runs on past the idle limit.
    run?.tick(started + IDLE_LIMIT_MS + 1000);
    expect(run?.getSnapshot().endedBy).toBe('idle');

    await useRunSession.getState().submit();
    expect(useRunSession.getState().submission).toEqual({ kind: 'discarded' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not send a run that is still being played', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    begin();
    useRunSession.getState().run?.press('i', performance.now());

    await useRunSession.getState().submit();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useRunSession.getState().submission).toEqual({ kind: 'unsent' });
  });

  it('sends a run once, however often it is asked to', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(json({ run: STORED }, 201)));
    vi.stubGlobal('fetch', fetchSpy);

    begin();
    playToTheEnd();
    await useRunSession.getState().submit();
    await useRunSession.getState().submit();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('offers to send again when the request never reached the server', async () => {
    let attempt = 0;
    vi.stubGlobal('fetch', () => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(json({ run: STORED }, 201));
    });

    begin();
    playToTheEnd();
    await useRunSession.getState().submit();
    expect(useRunSession.getState().submission).toMatchObject({ kind: 'failed', canRetry: true });

    await useRunSession.getState().submit();
    expect(useRunSession.getState().submission).toEqual({ kind: 'saved', run: STORED });
  });

  it('explains a retry that finds the run already submitted', async () => {
    let attempt = 0;
    vi.stubGlobal('fetch', () => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(
            json(
              { statusCode: 409, error: 'Conflict', message: 'this run was already submitted' },
              409,
            ),
          );
    });

    begin();
    playToTheEnd();
    await useRunSession.getState().submit();
    await useRunSession.getState().submit();

    expect(useRunSession.getState().submission).toEqual({
      kind: 'failed',
      message: 'The server already has this run, so it cannot be submitted again.',
      canRetry: false,
    });
  });

  it('shows why the server refused the result, and does not offer to send it again', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json(
          { statusCode: 422, error: 'Unprocessable Entity', message: 'result rejected: speed' },
          422,
        ),
      ),
    );

    begin();
    playToTheEnd();
    await useRunSession.getState().submit();

    expect(useRunSession.getState().submission).toEqual({
      kind: 'failed',
      message: 'result rejected: speed',
      canRetry: false,
    });
  });

  it('forgets the run and its result when the player leaves', () => {
    begin();
    useRunSession.getState().clear();
    expect(useRunSession.getState()).toMatchObject({ run: null, submission: { kind: 'unsent' } });
  });
});
