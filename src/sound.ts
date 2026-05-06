export class SoundSystem {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  play(name: "move" | "rotate" | "land" | "line" | "clear" | "fail" | "feed"): void {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const tone = this.toneFor(name);

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.frequency, now);
    if (tone.endFrequency) osc.frequency.exponentialRampToValueAtTime(tone.endFrequency, now + tone.duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(tone.filter, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(tone.volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + tone.duration + 0.03);
  }

  private toneFor(name: string) {
    switch (name) {
      case "move":
        return { frequency: 260, endFrequency: 330, duration: 0.045, volume: 0.035, filter: 1200, type: "sine" as OscillatorType };
      case "rotate":
        return { frequency: 390, endFrequency: 520, duration: 0.055, volume: 0.04, filter: 1800, type: "triangle" as OscillatorType };
      case "land":
        return { frequency: 105, endFrequency: 70, duration: 0.11, volume: 0.075, filter: 520, type: "sine" as OscillatorType };
      case "line":
        return { frequency: 520, endFrequency: 980, duration: 0.16, volume: 0.075, filter: 2400, type: "triangle" as OscillatorType };
      case "clear":
        return { frequency: 680, endFrequency: 1280, duration: 0.22, volume: 0.085, filter: 3600, type: "sine" as OscillatorType };
      case "fail":
        return { frequency: 180, endFrequency: 115, duration: 0.18, volume: 0.055, filter: 900, type: "sine" as OscillatorType };
      default:
        return { frequency: 220, endFrequency: 280, duration: 0.08, volume: 0.035, filter: 1100, type: "sine" as OscillatorType };
    }
  }
}
