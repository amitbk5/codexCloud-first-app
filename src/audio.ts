// Original, synthesized sound effects. No downloaded samples or autoplay.
export class AudioEngine {
  enabled = false;
  private context?: AudioContext;
  private master?: GainNode;

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) void this.unlock().catch(() => { this.enabled = false; });
    return this.enabled;
  }

  tone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3, endFrequency = frequency) {
    if (!this.enabled || !this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(15, endFrequency), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain); gain.connect(this.master);
    oscillator.start(now); oscillator.stop(now + duration + 0.01);
  }

  noise(duration: number, volume: number, filter = 1200) {
    if (!this.enabled || !this.context || !this.master) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 2;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const lowpass = this.context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = filter;
    const gain = this.context.createGain(); gain.gain.value = volume;
    source.connect(lowpass); lowpass.connect(gain); gain.connect(this.master); source.start();
  }

  play(effect: 'slash' | 'hit' | 'dodge' | 'magic' | 'hurt' | 'wave' | 'victory') {
    switch (effect) {
      case 'slash': this.noise(0.15, 0.6, 2400); this.tone(260, 0.12, 'triangle', 0.12, 70); break;
      case 'hit': this.noise(0.11, 0.8, 1100); this.tone(145, 0.16, 'triangle', 0.6, 40); break;
      case 'dodge': this.noise(0.22, 0.3, 1600); break;
      case 'magic': this.noise(0.65, 0.6, 1800); this.tone(90, 0.6, 'sawtooth', 0.2, 600); this.tone(330, 0.8, 'sine', 0.4, 880); break;
      case 'hurt': this.tone(180, 0.22, 'sawtooth', 0.25, 45); this.noise(0.2, 0.5, 700); break;
      case 'wave': this.tone(220, 0.7, 'sine', 0.3); this.tone(330, 0.8, 'sine', 0.2); break;
      case 'victory': [261.63, 329.63, 392, 523.25].forEach((note, i) => setTimeout(() => this.tone(note, 0.9, 'sine', 0.3), i * 130)); break;
    }
  }
}
