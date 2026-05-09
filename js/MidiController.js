window.MidiController = class MidiController {

    constructor() {
        this._listeners = {
            noteOn:     new Set(),
            noteOff:    new Set(),
            cc:         new Set(),
            knob:       new Set(),
            connect:    new Set(),
            disconnect: new Set(),
        };

        // Device state
        this.connected    = false;
        this.deviceName   = '(none)';
        this.lastNote     = 0;
        this.lastNoteName = '--';
        this.velocity     = 0;
        this.channel      = 1;
        this.noteNorm     = 0.0;
        this.velocityNorm = 0.0;
        this.pitchClass   = 0;

        // CC state (pre-seeded common CCs)
        this.cc = { 1: 0, 7: 0, 11: 0, 64: 0 };

        // Knob auto-learn: first 16 unique CCs get mapped
        this.knobs       = new Array(16).fill(0);   // normalised 0-1
        this.knobsRaw    = new Array(16).fill(0);   // raw 0-127
        this._knobCcMap  = [];                       // [ccNum, …] index → knob slot
        this._ccToKnob   = {};                       // ccNum → knob index (reverse lookup)

        this._midiAccess   = null;
        this._currentInput = null;
    }

    // ── Event System ───────────────────────────────────────────────────────

    on(event, callback) {
        const set = this._listeners[event];
        if (!set) throw new Error(`MidiController: unknown event "${event}"`);
        set.add(callback);
        return this;
    }

    off(event, callback) {
        const set = this._listeners[event];
        if (set) set.delete(callback);
        return this;
    }

    _emit(event, ...args) {
        const set = this._listeners[event];
        if (!set) return;
        for (const cb of set) {
            try { cb(...args); }
            catch (err) { console.error(`[MidiController] listener error on "${event}":`, err); }
        }
    }

    // ── Connection ─────────────────────────────────────────────────────────

    async connect() {
        if (!navigator.requestMIDIAccess) {
            this.deviceName = 'Web MIDI not supported';
            console.warn('[MidiController] Web MIDI API not available.');
            return;
        }

        try {
            this._midiAccess = await navigator.requestMIDIAccess();
        } catch (e) {
            this.deviceName = 'Access denied';
            console.warn('[MidiController] MIDI access denied:', e);
            return;
        }

        this._connectFirstInput();

        this._midiAccess.onstatechange = (e) => {
            if (e.port.type !== 'input') return;

            if (e.port.state === 'connected') {
                if (!this._currentInput) this._connectFirstInput();
            } else if (e.port.state === 'disconnected') {
                if (this._currentInput?.id === e.port.id) {
                    this._currentInput.onmidimessage = null;
                    this._currentInput = null;
                    this.connected  = false;
                    this.deviceName = 'Disconnected';
                    this._emit('disconnect');
                    console.log('[MidiController] Device disconnected.');
                }
            }
        };
    }

    _connectFirstInput() {
        for (const input of this._midiAccess.inputs.values()) {
            if (input.state === 'connected') {
                this._currentInput = input;
                input.onmidimessage = (e) => this._onMidiMessage(e);
                this.connected  = true;
                this.deviceName = input.name || 'Unknown device';
                this._emit('connect', this.deviceName);
                console.log(`[MidiController] Connected to: ${input.name}`);
                return;
            }
        }
        this.connected  = false;
        this.deviceName = 'No devices found';
    }

    // ── Message Parsing ────────────────────────────────────────────────────

    _onMidiMessage(event) {
        const [status, data1, data2] = event.data;
        const command = status & 0xF0;
        const channel = (status & 0x0F) + 1;

        this.channel = channel;

        if (command === 0x90 && data2 > 0) {
            this.lastNote     = data1;
            this.lastNoteName = this._noteToName(data1);
            this.velocity     = data2;
            this.noteNorm     = data1 / 127;
            this.velocityNorm = data2 / 127;
            this.pitchClass   = data1 % 12;
            this._emit('noteOn', data1, data2, channel);
        }
        else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
            this.velocity     = 0;
            this.velocityNorm = 0;
            this._emit('noteOff', data1, channel);
        }
        else if (command === 0xB0) {
            this.cc[data1] = data2;
            this._emit('cc', data1, data2, channel);

            // Auto-learn knob mapping for any CC
            let idx = this._ccToKnob[data1];
            if (idx === undefined && this._knobCcMap.length < 16) {
                idx = this._knobCcMap.length;
                this._knobCcMap.push(data1);
                this._ccToKnob[data1] = idx;
            }
            if (idx !== undefined) {
                this.knobsRaw[idx] = data2;
                this.knobs[idx]    = data2 / 127;
                this._emit('knob', idx, data2, data2 / 127);
            }
        }
    }

    _noteToName(n) {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        return names[n % 12] + (Math.floor(n / 12) - 1);
    }

    // ── Cleanup ────────────────────────────────────────────────────────────

    dispose() {
        if (this._currentInput) {
            this._currentInput.onmidimessage = null;
            this._currentInput = null;
        }
        if (this._midiAccess) {
            this._midiAccess.onstatechange = null;
            this._midiAccess = null;
        }
        for (const set of Object.values(this._listeners)) set.clear();
        this.connected = false;
    }
}
