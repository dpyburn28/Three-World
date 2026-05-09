window.MidiSystem = class MidiSystem extends SystemHandle {
    constructor() {
        super('MIDI');

        Object.assign(this._params, {
            connected:    false,
            deviceName:   '(none)',

            lastNote:     0,
            lastNoteName: '--',
            velocity:     0,
            channel:      1,

            noteNorm:     0.0,
            velocityNorm: 0.0,
            pitchClass:   0,

            cc1:  0,
            cc7:  0,
            cc11: 0,
            cc64: 0,

            k0: 0, k1: 0, k2:  0, k3:  0,
            k4: 0, k5: 0, k6:  0, k7:  0,
            k8: 0, k9: 0, k10: 0, k11: 0,
            k12:0, k13:0, k14: 0, k15: 0,
        });

        // Standalone controller (exposed for AudioDriver linking)
        this.controller = new MidiController();

        // Backward-compatible scene callbacks
        this._onNoteOn  = null;
        this._onNoteOff = null;
        this._onCC      = null;
    }

    init(ctx, folder) {
        // Subscribe to controller events before connecting
        this.controller.on('noteOn', (note, vel, ch) => {
            this._params.lastNote     = note;
            this._params.lastNoteName = this.controller.lastNoteName;
            this._params.velocity     = vel;
            this._params.noteNorm     = note / 127;
            this._params.velocityNorm = vel / 127;
            this._params.pitchClass   = note % 12;
            this._params.channel      = ch;
            if (this._onNoteOn) this._onNoteOn(note, vel, ch);
        });

        this.controller.on('noteOff', (note, ch) => {
            this._params.velocity     = 0;
            this._params.velocityNorm = 0;
            if (this._onNoteOff) this._onNoteOff(note, ch);
        });

        this.controller.on('cc', (ccNum, value, ch) => {
            const ccKey = `cc${ccNum}`;
            if (ccKey in this._params) {
                this._params[ccKey] = value;
            }
            if (this._onCC) this._onCC(ccNum, value, ch);
        });

        this.controller.on('knob', (idx, raw, norm) => {
            this._params[`k${idx}`] = norm;
        });

        this.controller.on('connect', (name) => {
            this._params.connected  = true;
            this._params.deviceName = name;
        });

        this.controller.on('disconnect', () => {
            this._params.connected  = false;
            this._params.deviceName = 'Disconnected';
        });

        // Connect to MIDI hardware
        this.controller.connect();

        // Build Tweakpane GUI
        super.init(ctx, folder);
    }

    // ── GUI ────────────────────────────────────────────────────────────────

    setupGui(folder, ctx) {
        const f = folder;

        // Connection
        const conn = f.addFolder({ title: 'Connection', expanded: true });
        this._bind(conn, 'deviceName',  { readonly: true, label: 'Device' });
        this._bind(conn, 'connected',   { readonly: true, label: 'Connected' });

        // Live Data
        const live = f.addFolder({ title: 'Live Data', expanded: true });
        this._bind(live, 'lastNoteName', { readonly: true, label: 'Note' });
        this._bind(live, 'lastNote',     { readonly: true, label: 'MIDI #',   format: v => Math.round(v) });
        this._bind(live, 'velocity',     { readonly: true, label: 'Velocity', format: v => Math.round(v) });
        this._bind(live, 'channel',      { readonly: true, label: 'Channel',  format: v => Math.round(v) });
        this._bind(live, 'velocityNorm', {
            readonly: true,
            view: 'graph',
            min: 0, max: 1,
            label: 'Vel Graph',
        });

        // CC Values
        const cc = f.addFolder({ title: 'CC Values', expanded: false });
        this._bind(cc, 'cc1',  { readonly: true, label: 'Mod Wheel (CC1)',    format: v => Math.round(v) });
        this._bind(cc, 'cc7',  { readonly: true, label: 'Volume (CC7)',       format: v => Math.round(v) });
        this._bind(cc, 'cc11', { readonly: true, label: 'Expression (CC11)',  format: v => Math.round(v) });
        this._bind(cc, 'cc64', { readonly: true, label: 'Sustain (CC64)',     format: v => Math.round(v) });

        // Knobs (compact 4×4 grid)
        const knobs = f.addFolder({ title: 'Knobs', expanded: false });
        for (let i = 0; i < 16; i++) {
            this._bind(knobs, `k${i}`, {
                readonly: true,
                label:    `K${i + 1}`,
                format:   v => v.toFixed(2),
            });
        }
    }

    // ── Cleanup ────────────────────────────────────────────────────────────

    dispose() {
        this.controller.dispose();
        super.dispose();
    }
}
