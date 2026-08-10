"use client";

import type { PhaseKind } from "./types";

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/**
 * Browsers only allow audio after a user gesture. Call this from a click so
 * the later, timer-driven chime is allowed to play.
 */
export function primeAudio(): void {
  void getContext()?.resume();
}

/** A short two-note chime; rising when work starts, falling when it ends. */
export function playChime(nextPhase: PhaseKind): void {
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume();

  const notes = nextPhase === "focus" ? [523.25, 783.99] : [783.99, 523.25];
  notes.forEach((frequency, index) => {
    const start = ctx.currentTime + index * 0.18;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.45);
  });
}
