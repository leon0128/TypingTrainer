import { SoundPlayer, type AudioContextLike } from './player';

/**
 * The one player of key sounds, shared by the play screen and the settings screen so a change of
 * pack or volume reaches a run that is about to start. The browser's `AudioContext` is made lazily
 * and only when a sound is wanted (§8.3); `interactive` asks for the lowest latency it offers.
 */
export const soundPlayer = new SoundPlayer(
  () => new AudioContext({ latencyHint: 'interactive' }) as unknown as AudioContextLike,
);
