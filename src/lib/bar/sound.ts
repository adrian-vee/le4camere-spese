const STORAGE_KEY = "bar-sound-enabled";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setSoundEnabled(v: boolean): void {
  localStorage.setItem(STORAGE_KEY, v ? "true" : "false");
}

let audioCtx: AudioContext | null = null;

export function playBeep(): void {
  if (!isSoundEnabled()) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.08;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.stop(audioCtx.currentTime + 0.1);
  } catch {
    /* Web Audio not supported */
  }
}

export function haptic(): void {
  try {
    navigator?.vibrate?.(30);
  } catch {
    /* not supported */
  }
}
