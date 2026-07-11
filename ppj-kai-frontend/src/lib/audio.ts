export type NotificationSound = 'siren' | 'beep' | 'chime' | 'off';

let audioCtx: AudioContext | null = null;
let loopIntervalId: ReturnType<typeof setInterval> | null = null;
let activeOscillators: OscillatorNode[] = [];

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

// Duration of each sound type in ms (used for loop interval)
const SOUND_DURATION: Record<string, number> = {
  siren: 2200,
  beep: 1300,
  chime: 1700,
};

/**
 * Start playing the notification sound in a continuous loop.
 * It will keep playing until stopLoopingNotification() is called.
 */
export function startLoopingNotification(type: NotificationSound) {
  if (type === 'off') return;

  // Stop any existing loop first
  stopLoopingNotification();

  // Play immediately
  playNotification(type);

  // Then repeat at interval
  const interval = SOUND_DURATION[type] || 2000;
  loopIntervalId = setInterval(() => {
    playNotification(type);
  }, interval);
}

/**
 * Stop the looping notification sound and clean up all audio.
 */
export function stopLoopingNotification() {
  // Clear the loop interval
  if (loopIntervalId !== null) {
    clearInterval(loopIntervalId);
    loopIntervalId = null;
  }

  // Stop all active oscillators
  for (const osc of activeOscillators) {
    try { osc.stop(); } catch { /* already stopped */ }
  }
  activeOscillators = [];

  // Cancel any ongoing TTS
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/** Returns true if a looping alarm is currently active */
export function isLoopingActive(): boolean {
  return loopIntervalId !== null;
}

/** Track an oscillator so it can be stopped later */
function trackOscillator(osc: OscillatorNode) {
  activeOscillators.push(osc);
  // Auto-remove when it ends naturally
  osc.onended = () => {
    activeOscillators = activeOscillators.filter(o => o !== osc);
  };
}

export function playNotification(type: NotificationSound) {
  if (type === 'off') return;
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  // Resume context if it was suspended (browser policy)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const t = ctx.currentTime;

  switch (type) {
    case 'siren':
      playSiren(ctx, t);
      break;
    case 'beep':
      playBeep(ctx, t);
      break;
    case 'chime':
      playChime(ctx, t);
      break;
  }
}

function playSiren(ctx: AudioContext, t: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'square';
  // Siren frequency sweep
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.linearRampToValueAtTime(1200, t + 0.5);
  osc.frequency.linearRampToValueAtTime(600, t + 1.0);
  osc.frequency.linearRampToValueAtTime(1200, t + 1.5);
  osc.frequency.linearRampToValueAtTime(600, t + 2.0);
  
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.2, t + 0.1);
  gain.gain.setValueAtTime(0.2, t + 1.9);
  gain.gain.linearRampToValueAtTime(0, t + 2.0);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  trackOscillator(osc);
  osc.start(t);
  osc.stop(t + 2.0);
}

function playBeep(ctx: AudioContext, t: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, t);
  
  gain.gain.setValueAtTime(0, t);
  // Beep 1
  gain.gain.linearRampToValueAtTime(0.5, t + 0.05);
  gain.gain.setValueAtTime(0.5, t + 0.2);
  gain.gain.linearRampToValueAtTime(0, t + 0.25);
  // Beep 2
  gain.gain.setValueAtTime(0, t + 0.4);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.45);
  gain.gain.setValueAtTime(0.5, t + 0.6);
  gain.gain.linearRampToValueAtTime(0, t + 0.65);
  // Beep 3
  gain.gain.setValueAtTime(0, t + 0.8);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.85);
  gain.gain.setValueAtTime(0.5, t + 1.0);
  gain.gain.linearRampToValueAtTime(0, t + 1.05);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  trackOscillator(osc);
  osc.start(t);
  osc.stop(t + 1.1);
}

function playChime(ctx: AudioContext, t: number) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();
  
  osc1.type = 'sine';
  osc2.type = 'sine';
  
  osc1.frequency.setValueAtTime(659.25, t); // E5
  osc2.frequency.setValueAtTime(523.25, t + 0.5); // C5
  
  gain1.gain.setValueAtTime(0, t);
  gain1.gain.linearRampToValueAtTime(0.5, t + 0.05);
  gain1.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
  
  gain2.gain.setValueAtTime(0, t + 0.5);
  gain2.gain.linearRampToValueAtTime(0.5, t + 0.55);
  gain2.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
  
  osc1.connect(gain1);
  osc2.connect(gain2);
  gain1.connect(ctx.destination);
  gain2.connect(ctx.destination);
  
  trackOscillator(osc1);
  trackOscillator(osc2);
  osc1.start(t);
  osc1.stop(t + 1.0);
  
  osc2.start(t + 0.5);
  osc2.stop(t + 1.5);
}

/**
 * Speak an emergency announcement using the browser's built-in SpeechSynthesis API.
 * Example output: "Perhatian! Ada Rel Retak dilaporkan oleh Budi Santoso. Keterangan: rel patah di KM 99"
 */
export function speakEmergencyAnnouncement(jenisTemuan: string, deskripsi: string, petugasNama: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  // Cancel any ongoing speech first
  window.speechSynthesis.cancel();

  const jenisMap: Record<string, string> = {
    emergency: 'Darurat',
    berat: 'Temuan Berat',
    sedang: 'Temuan Sedang',
    ringan: 'Temuan Ringan',
  };
  const jenisText = jenisMap[jenisTemuan] || jenisTemuan;

  // Build the announcement text
  const trimmedDesc = deskripsi?.trim();
  let text = `Perhatian! Ada laporan ${jenisText}, dilaporkan oleh ${petugasNama || 'Petugas'}.`;
  if (trimmedDesc) {
    text += ` Keterangan: ${trimmedDesc}`;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'id-ID';
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Try to pick an Indonesian voice if available
  const voices = window.speechSynthesis.getVoices();
  const idVoice = voices.find(v => v.lang.startsWith('id'));
  if (idVoice) {
    utterance.voice = idVoice;
  }

  window.speechSynthesis.speak(utterance);
}
