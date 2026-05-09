// ── FM Synthesis Presets ────────────────────────────────────────────────────

const FM_PRESETS = {

    // Acoustic piano: bright hammer strike that decays to a warm fundamental.
    // High initial modIndex for harmonic-rich attack, fast mod decay to mellow out.
    piano: {
        modRatio:     1.0,
        modIndex:     10.0,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.001,
        modDecay:     1.2,
        modSustain:   0.05,
        modRelease:   0.3,
        attack:       0.003,
        decay:        1.5,
        sustain:      0.15,
        release:      0.5,
        filterCutoff: 8000,
        filterQ:      0.5,
    },

    // Electric piano (Rhodes): warm bell-tone attack that slowly fades.
    // Moderate modIndex for warmth, slow mod decay for lingering bell character.
    epiano: {
        modRatio:     1.0,
        modIndex:     4.0,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.001,
        modDecay:     1.5,
        modSustain:   0.1,
        modRelease:   0.4,
        attack:       0.005,
        decay:        1.2,
        sustain:      0.25,
        release:      0.5,
        filterCutoff: 5000,
        filterQ:      0.8,
    },

    // Plucked guitar: bright transient that immediately goes dull.
    // Ratio 2:1 for natural string overtones, very fast mod decay for pluck.
    guitar: {
        modRatio:     2.0,
        modIndex:     8.0,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.001,
        modDecay:     0.08,
        modSustain:   0.02,
        modRelease:   0.05,
        attack:       0.002,
        decay:        0.5,
        sustain:      0.05,
        release:      0.15,
        filterCutoff: 5000,
        filterQ:      1.0,
    },

    // Synth bass: punchy low-end thump with tight decay.
    // Ratio 1:1 keeps energy in low harmonics, high modIndex for punch on attack.
    bass: {
        modRatio:     1.0,
        modIndex:     6.0,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.001,
        modDecay:     0.15,
        modSustain:   0.1,
        modRelease:   0.1,
        attack:       0.005,
        decay:        0.25,
        sustain:      0.6,
        release:      0.15,
        filterCutoff: 1500,
        filterQ:      1.5,
    },

    // Drawbar organ: immediate, steady harmonic content with no decay.
    // Ratio 2:1 simulates the 4' drawbar (octave up). modSustain must be 1.0.
    organ: {
        modRatio:     2.0,
        modIndex:     2.5,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.001,
        modDecay:     0.001,
        modSustain:   1.0,
        modRelease:   0.01,
        attack:       0.008,
        decay:        0.01,
        sustain:      0.9,
        release:      0.06,
        filterCutoff: 10000,
        filterQ:      0.5,
    },

    // Metallic bell: non-integer ratio creates inharmonic partials.
    // Very long decay on both envelopes — bell rings out over several seconds.
    bell: {
        modRatio:     3.5,
        modIndex:     8.0,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.001,
        modDecay:     5.0,
        modSustain:   0.02,
        modRelease:   3.0,
        attack:       0.001,
        decay:        5.0,
        sustain:      0.0,
        release:      3.0,
        filterCutoff: 12000,
        filterQ:      0.3,
    },

    // Brass: slow harmonic build-up creates the characteristic "blat" swell.
    // Slow mod attack is the hallmark — timbre brightens as the note develops.
    brass: {
        modRatio:     1.0,
        modIndex:     5.0,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.4,
        modDecay:     0.2,
        modSustain:   0.8,
        modRelease:   0.15,
        attack:       0.12,
        decay:        0.1,
        sustain:      0.85,
        release:      0.12,
        filterCutoff: 6000,
        filterQ:      0.8,
    },

    // String pad: subtle octave shimmer from slow bowing.
    // Low modIndex for smooth harmonics, slow everything for wash/pad character.
    strings: {
        modRatio:     2.0,
        modIndex:     1.5,
        carrierWave:  'sine',
        modWave:      'sine',
        modAttack:    0.8,
        modDecay:     0.4,
        modSustain:   0.7,
        modRelease:   1.0,
        attack:       0.6,
        decay:        0.3,
        sustain:      0.85,
        release:      1.0,
        filterCutoff: 5000,
        filterQ:      0.5,
    },
};

// Expose for external access
window.FM_PRESETS = FM_PRESETS;


// ── AudioDriver ────────────────────────────────────────────────────────────

window.AudioDriver = class AudioDriver {

    constructor() {
        this._ctx      = null;   // AudioContext (lazy)
        this._master   = null;   // master GainNode
        this._analyser = null;   // AnalyserNode for visualization
        this._freqData = null;   // reusable Uint8Array for frequency data
        this._timeData = null;   // reusable Uint8Array for time-domain data

        // Map<noteNumber, voice>
        this._voices = new Map();

        // Sustain pedal
        this._sustainOn      = false;
        this._sustainedNotes = new Set();

        // Synth parameters (exposed for GUI integration)
        this.params = {
            mode:         'osc',       // 'osc' | 'fm'

            // OSC mode
            waveform:     'sawtooth',

            // FM mode
            fmPreset:     'piano',
            carrierWave:  'sine',
            modWave:      'sine',
            modRatio:     1.0,
            modIndex:     5.0,
            modAttack:    0.001,
            modDecay:     0.8,
            modSustain:   0.15,
            modRelease:   0.3,

            // Shared
            attack:       0.01,
            decay:        0.15,
            sustain:      0.6,
            release:      0.3,
            filterCutoff: 5000,
            filterQ:      1.0,
            masterGain:   0.5,
        };

        // MidiController binding
        this._midiController = null;
        this._boundNoteOn  = (note, vel) => this.noteOn(note, vel);
        this._boundNoteOff = (note)      => this.noteOff(note);
        this._boundCC      = (cc, val)   => this.handleCC(cc, val);
    }

    // ── AudioContext (lazy init for autoplay policy) ───────────────────────

    _ensureContext() {
        if (this._ctx) return;
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();

        this._master = this._ctx.createGain();
        this._master.gain.value = this.params.masterGain;

        this._analyser = this._ctx.createAnalyser();
        this._analyser.fftSize = 2048;
        this._analyser.smoothingTimeConstant = 0.8;

        this._freqData      = new Uint8Array(this._analyser.frequencyBinCount);
        this._timeData      = new Uint8Array(this._analyser.fftSize);
        this._floatFreqData = new Float32Array(this._analyser.frequencyBinCount);

        this._master.connect(this._analyser);
        this._analyser.connect(this._ctx.destination);
    }

    // ── Public Accessors (for AudioRecorder) ──────────────────────────────

    getContext() {
        this._ensureContext();
        return this._ctx;
    }

    getMasterNode() {
        this._ensureContext();
        return this._master;
    }

    // ── Audio Analysis (for visualizers) ────────────────────────────────

    getFrequencyData() {
        if (!this._analyser) return null;
        this._analyser.getByteFrequencyData(this._freqData);
        return this._freqData;
    }

    getTimeDomainData() {
        if (!this._analyser) return null;
        this._analyser.getByteTimeDomainData(this._timeData);
        return this._timeData;
    }

    getFloatFrequencyData() {
        if (!this._analyser) return null;
        this._analyser.getFloatFrequencyData(this._floatFreqData);
        return this._floatFreqData;
    }

    // ── MIDI → Frequency ──────────────────────────────────────────────────

    _midiToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    // ── Note On (dispatcher) ──────────────────────────────────────────────

    noteOn(note, velocity) {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const p   = this.params;

        // Retrigger: kill existing voice on same note
        if (this._voices.has(note)) this._killVoice(note);
        this._sustainedNotes.delete(note);

        const velScale = velocity / 127;
        const freq     = this._midiToFreq(note);

        if (p.mode === 'fm') {
            this._noteOnFM(note, freq, velScale, ctx, now, p);
        } else {
            this._noteOnOsc(note, freq, velScale, ctx, now, p);
        }
    }

    // ── OSC Voice ─────────────────────────────────────────────────────────

    _noteOnOsc(note, freq, velScale, ctx, now, p) {
        const osc = ctx.createOscillator();
        osc.type = p.waveform;
        osc.frequency.value = freq;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = p.filterCutoff;
        filter.Q.value = p.filterQ;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this._master);

        const peakGain = velScale;
        const susGain  = p.sustain * velScale;

        gain.gain.linearRampToValueAtTime(peakGain, now + p.attack);
        gain.gain.linearRampToValueAtTime(susGain,  now + p.attack + p.decay);

        osc.start(now);

        this._voices.set(note, {
            osc, filter, gain,
            releaseTimeout: null, velScale,
            mode: 'osc',
        });
    }

    // ── FM Voice ──────────────────────────────────────────────────────────

    _noteOnFM(note, freq, velScale, ctx, now, p) {
        // Modulator
        const modulator = ctx.createOscillator();
        modulator.type = p.modWave;
        modulator.frequency.value = freq * p.modRatio;

        const modGain = ctx.createGain();
        const modDepthPeak = freq * p.modIndex;

        // Mod envelope: 0 → peak → sustain
        modGain.gain.setValueAtTime(0, now);
        modGain.gain.linearRampToValueAtTime(modDepthPeak, now + p.modAttack);
        modGain.gain.linearRampToValueAtTime(
            modDepthPeak * p.modSustain,
            now + p.modAttack + p.modDecay
        );

        modulator.connect(modGain);

        // Carrier
        const carrier = ctx.createOscillator();
        carrier.type = p.carrierWave;
        carrier.frequency.value = freq;

        // FM connection: modulator → carrier frequency
        modGain.connect(carrier.frequency);

        // Filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = p.filterCutoff;
        filter.Q.value = p.filterQ;

        // Carrier gain (ADSR)
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);

        const peakGain = velScale;
        const susGain  = p.sustain * velScale;

        gain.gain.linearRampToValueAtTime(peakGain, now + p.attack);
        gain.gain.linearRampToValueAtTime(susGain,  now + p.attack + p.decay);

        // Routing: carrier → filter → gain → master
        carrier.connect(filter);
        filter.connect(gain);
        gain.connect(this._master);

        // Start both oscillators
        modulator.start(now);
        carrier.start(now);

        this._voices.set(note, {
            carrier, modulator, modGain, filter, gain,
            releaseTimeout: null, velScale,
            mode: 'fm',
        });
    }

    // ── Note Off ──────────────────────────────────────────────────────────

    noteOff(note) {
        if (this._sustainOn) {
            this._sustainedNotes.add(note);
            return;
        }
        this._releaseVoice(note);
    }

    _releaseVoice(note) {
        const voice = this._voices.get(note);
        if (!voice) return;

        const ctx = this._ctx;
        const now = ctx.currentTime;
        const p   = this.params;

        // Snapshot current values BEFORE cancelling — cancelScheduledValues
        // snaps the value back to the last completed event (e.g. peak of attack)
        // rather than the current interpolated position in the decay ramp.
        const currentGain = voice.gain.gain.value;

        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(currentGain, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + p.release);

        // Modulator gain release (FM only)
        if (voice.mode === 'fm') {
            const currentModGain = voice.modGain.gain.value;
            voice.modGain.gain.cancelScheduledValues(now);
            voice.modGain.gain.setValueAtTime(currentModGain, now);
            voice.modGain.gain.linearRampToValueAtTime(0, now + p.modRelease);
        }

        // Kill after the longer release completes
        const killDelay = voice.mode === 'fm'
            ? Math.max(p.release, p.modRelease)
            : p.release;

        voice.releaseTimeout = setTimeout(() => {
            this._killVoice(note);
        }, (killDelay + 0.05) * 1000);
    }

    _killVoice(note) {
        const voice = this._voices.get(note);
        if (!voice) return;

        if (voice.releaseTimeout) clearTimeout(voice.releaseTimeout);

        try {
            if (voice.mode === 'fm') {
                voice.carrier.stop();
                voice.carrier.disconnect();
                voice.modulator.stop();
                voice.modulator.disconnect();
                voice.modGain.disconnect();
            } else {
                voice.osc.stop();
                voice.osc.disconnect();
            }
            voice.filter.disconnect();
            voice.gain.disconnect();
        } catch (_) {}

        this._voices.delete(note);
    }

    // ── FM Preset Application ─────────────────────────────────────────────

    applyPreset(name) {
        const preset = FM_PRESETS[name];
        if (!preset) {
            console.warn(`[AudioDriver] Unknown FM preset: "${name}"`);
            return;
        }

        this.params.fmPreset     = name;
        this.params.modRatio     = preset.modRatio;
        this.params.modIndex     = preset.modIndex;
        this.params.carrierWave  = preset.carrierWave;
        this.params.modWave      = preset.modWave;
        this.params.modAttack    = preset.modAttack;
        this.params.modDecay     = preset.modDecay;
        this.params.modSustain   = preset.modSustain;
        this.params.modRelease   = preset.modRelease;
        this.params.attack       = preset.attack;
        this.params.decay        = preset.decay;
        this.params.sustain      = preset.sustain;
        this.params.release      = preset.release;
        this.params.filterCutoff = preset.filterCutoff;
        this.params.filterQ      = preset.filterQ;
    }

    // ── CC Handling ───────────────────────────────────────────────────────

    handleCC(cc, value) {
        switch (cc) {
            case 1: // Mod Wheel → filter cutoff modulation
                this._applyFilterMod(value / 127);
                break;

            case 7: // Volume → master gain
                this.params.masterGain = value / 127;
                if (this._master) {
                    this._master.gain.setTargetAtTime(
                        this.params.masterGain,
                        this._ctx.currentTime,
                        0.02
                    );
                }
                break;

            case 64: // Sustain pedal
                if (value > 63) {
                    this._sustainOn = true;
                } else {
                    this._sustainOn = false;
                    for (const note of this._sustainedNotes) {
                        this._releaseVoice(note);
                    }
                    this._sustainedNotes.clear();
                }
                break;
        }
    }

    _applyFilterMod(normValue) {
        const baseCutoff    = this.params.filterCutoff;
        const modCutoff     = baseCutoff * (0.25 + normValue * 3.75);
        const clampedCutoff = Math.min(modCutoff, 20000);

        for (const voice of this._voices.values()) {
            voice.filter.frequency.setTargetAtTime(
                clampedCutoff,
                this._ctx.currentTime,
                0.02
            );
        }
    }

    // ── MIDI Controller Linking ───────────────────────────────────────────

    setInput(midiController) {
        if (this._midiController) {
            this._midiController.off('noteOn',  this._boundNoteOn);
            this._midiController.off('noteOff', this._boundNoteOff);
            this._midiController.off('cc',      this._boundCC);
        }

        this._midiController = midiController;

        if (midiController) {
            midiController.on('noteOn',  this._boundNoteOn);
            midiController.on('noteOff', this._boundNoteOff);
            midiController.on('cc',      this._boundCC);
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────

    dispose() {
        this.setInput(null);

        for (const note of this._voices.keys()) {
            this._killVoice(note);
        }
        this._voices.clear();
        this._sustainedNotes.clear();

        if (this._ctx && this._ctx.state !== 'closed') {
            this._ctx.close();
        }
        this._ctx    = null;
        this._master = null;
    }
}
