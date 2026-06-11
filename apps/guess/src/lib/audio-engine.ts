"use client";

/**
 * Minimal Web Audio engine for heardle clips.
 *
 * Playing short clips through a shared AudioContext — rather than an `<audio>`
 * element — sidesteps a pile of iOS WebKit problems we kept hitting:
 *   - the first `<audio>` play after a user gesture is silent;
 *   - `HTMLMediaElement.volume` is read-only, so the volume slider does nothing;
 *   - media playback demands server byte-range support;
 *   - `currentTime` polling is too coarse for a smooth progress ring.
 *
 * An AudioContext unlocked inside the gesture outputs sound reliably, a
 * GainNode gives real volume control, and `AudioContext.currentTime` is
 * high-resolution. Clips are tiny and we fetch the bytes anyway, so decoding
 * them up front costs little.
 */

let ctx: AudioContext | null = null;

/** Lazily create the shared AudioContext. iOS caps the number of live contexts,
 * so every card shares one. Returns null when Web Audio is unavailable. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

let unlocked = false;

/**
 * iOS gives Web Audio the "ambient" audio session category by default, which
 * the hardware mute switch silences — unlike `<audio>` elements, which use
 * "playback" and keep sounding in silent mode. Opt into "playback" via the
 * WebKit Audio Session API (Safari 16.4+) so heardle clips are audible with the
 * ringer off, matching the old `<audio>`-based behaviour. No-op where the API
 * is absent (older iOS, non-WebKit browsers — which don't mute Web Audio
 * anyway).
 */
function preferPlaybackAudioSession(): void {
  if (typeof navigator === "undefined") return;
  const session = (
    navigator as Navigator & { audioSession?: { type: string } }
  ).audioSession;
  if (!session) return;
  try {
    session.type = "playback";
  } catch {
    // Some engines expose the object but reject unknown values; ignore.
  }
}

/**
 * Unlock audio output. Must be called synchronously inside a user gesture
 * (e.g. the play button's click handler, before any `await`). Resuming the
 * context and starting a one-sample silent buffer in the same gesture is the
 * combination WebKit needs to stop muting the first real clip. No-op after the
 * first successful call.
 */
export function unlockAudio(context: AudioContext): void {
  if (unlocked) return;
  unlocked = true;
  // Route through the "playback" session so the mute switch doesn't silence us.
  preferPlaybackAudioSession();
  void context.resume();
  try {
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  } catch {
    // Best-effort; resume() alone is usually enough.
  }
}

// Decoded clips keyed by URL. Clips are tiny and immutable, so holding the last
// several avoids re-fetching/decoding on replay or when stepping back through
// levels.
const DECODE_CACHE_MAX = 16;
const decoded = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer>>();

/**
 * Fetch and decode a clip URL into an AudioBuffer, memoised per URL. Safe to
 * call ahead of time (prewarm): decoding works while the context is suspended,
 * so the buffer is ready the instant the user presses play. Concurrent calls
 * for the same URL share one fetch.
 */
export function loadClip(url: string): Promise<AudioBuffer> {
  const hit = decoded.get(url);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(url);
  if (pending) return pending;

  const context = getAudioContext();
  if (!context) return Promise.reject(new Error("Web Audio unavailable"));

  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
      return r.arrayBuffer();
    })
    // Some WebKit builds only support the callback form of decodeAudioData, so
    // wrap it rather than relying on the returned promise.
    .then(
      (bytes) =>
        new Promise<AudioBuffer>((resolve, reject) => {
          context.decodeAudioData(bytes, resolve, reject);
        }),
    )
    .then((audio) => {
      decoded.set(url, audio);
      if (decoded.size > DECODE_CACHE_MAX) {
        const oldest = decoded.keys().next().value;
        if (oldest !== undefined) decoded.delete(oldest);
      }
      inflight.delete(url);
      return audio;
    })
    .catch((err) => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, p);
  return p;
}

/** Whether a clip is already decoded and will play with no fetch/decode wait.
 * Lets the UI skip the loading state for prewarmed clips (no spinner flicker). */
export function isClipReady(url: string): boolean {
  return decoded.has(url);
}
