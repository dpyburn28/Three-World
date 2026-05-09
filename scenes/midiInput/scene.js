SceneRegistry['midiInput'] = () => ({
    name: 'MIDI Input',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities    = new SceneEntities();
        this.objects     = this.entities.objects;
        this.postEffects = this.entities.effects;

        // ── Background ─────────────────────────────────────────────────────
        ctx.scene.background = new THREE.Color(0x0a0a14);

        // ── Camera ─────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posY: 0, posZ: 12,
        }));
        camera.init(ctx, folder);

        // ── MIDI System ────────────────────────────────────────────────────
        const midi = this.entities.addSystem('midi', new MidiSystem());
        midi.init(ctx, folder);
        this.midi = midi;

        // ── Audio Driver (synth) ──────────────────────────────────────────
        this.synth = new AudioDriver();
        this.synth.setInput(midi.controller);
        this._buildSynthGui(folder);

        // ── Audio Visualizer ─────────────────────────────────────────────
        const visualizer = this.entities.addObject(new AudioVisualizer({
            audioDriver: this.synth,
        }));
        await visualizer.init(ctx, folder);

        // ── Lighting ───────────────────────────────────────────────────────
        this.ambientLight = new THREE.AmbientLight(0x333355, 0.5);
        ctx.scene.add(this.ambientLight);

        this.pointLight = new THREE.PointLight(0xffffff, 1.5, 30);
        this.pointLight.position.set(0, 5, 5);
        ctx.scene.add(this.pointLight);

        // ── Animation State ────────────────────────────────────────────────
        this._lastTime = ctx.clock.getElapsedTime();
    },

    setupGui(folder, ctx) {},

    _buildSynthGui(parentFolder) {
        const p = this.synth.params;
        const f = parentFolder.addFolder({ title: 'Synth', expanded: true });
        this._synthFolder = f;
        this._synthBindings = [];

        const bind = (folder, key, opts) => {
            const b = folder.addBinding(p, key, opts);
            this._synthBindings.push(b);
            return b;
        };

        // ── Mode ──────────────────────────────────────────────────────────
        bind(f, 'mode', {
            options: { Oscillator: 'osc', FM: 'fm' },
            label: 'Mode',
        }).on('change', ({ value }) => {
            oscFolder.hidden = value !== 'osc';
            fmFolder.hidden  = value !== 'fm';
        });

        bind(f, 'masterGain', { min: 0, max: 1, step: 0.01, label: 'Volume' });

        // ── OSC Folder ────────────────────────────────────────────────────
        const oscFolder = f.addFolder({ title: 'Oscillator', expanded: true });
        oscFolder.hidden = p.mode !== 'osc';

        bind(oscFolder, 'waveform', {
            options: { Sine: 'sine', Sawtooth: 'sawtooth', Square: 'square', Triangle: 'triangle' },
            label: 'Waveform',
        });

        // ── FM Folder ─────────────────────────────────────────────────────
        const fmFolder = f.addFolder({ title: 'FM Synth', expanded: true });
        fmFolder.hidden = p.mode !== 'fm';

        bind(fmFolder, 'fmPreset', {
            options: {
                Piano: 'piano', 'E.Piano': 'epiano', Guitar: 'guitar',
                Bass: 'bass', Organ: 'organ', Bell: 'bell',
                Brass: 'brass', Strings: 'strings',
            },
            label: 'Preset',
        }).on('change', ({ value }) => {
            this.synth.applyPreset(value);
            for (const b of this._synthBindings) b.refresh();
        });

        bind(fmFolder, 'modRatio',  { min: 0.5, max: 8, step: 0.01, label: 'Mod Ratio' });
        bind(fmFolder, 'modIndex',  { min: 0,   max: 20, step: 0.1, label: 'Mod Index' });

        const modEnv = fmFolder.addFolder({ title: 'Mod Envelope', expanded: false });
        bind(modEnv, 'modAttack',  { min: 0.001, max: 2,   step: 0.001, label: 'Attack' });
        bind(modEnv, 'modDecay',   { min: 0.01,  max: 5,   step: 0.01,  label: 'Decay' });
        bind(modEnv, 'modSustain', { min: 0,     max: 1,   step: 0.01,  label: 'Sustain' });
        bind(modEnv, 'modRelease', { min: 0.01,  max: 5,   step: 0.01,  label: 'Release' });

        bind(fmFolder, 'carrierWave', {
            options: { Sine: 'sine', Sawtooth: 'sawtooth', Square: 'square', Triangle: 'triangle' },
            label: 'Carrier Wave',
        });
        bind(fmFolder, 'modWave', {
            options: { Sine: 'sine', Sawtooth: 'sawtooth', Square: 'square', Triangle: 'triangle' },
            label: 'Mod Wave',
        });

        // ── Envelope (shared) ─────────────────────────────────────────────
        const envFolder = f.addFolder({ title: 'Envelope', expanded: false });
        bind(envFolder, 'attack',  { min: 0.001, max: 2,   step: 0.001, label: 'Attack' });
        bind(envFolder, 'decay',   { min: 0.01,  max: 5,   step: 0.01,  label: 'Decay' });
        bind(envFolder, 'sustain', { min: 0,     max: 1,   step: 0.01,  label: 'Sustain' });
        bind(envFolder, 'release', { min: 0.01,  max: 5,   step: 0.01,  label: 'Release' });

        // ── Filter (shared) ───────────────────────────────────────────────
        const filterFolder = f.addFolder({ title: 'Filter', expanded: false });
        bind(filterFolder, 'filterCutoff', { min: 100,  max: 15000, step: 10,   label: 'Cutoff' });
        bind(filterFolder, 'filterQ',      { min: 0.1,  max: 20,    step: 0.1,  label: 'Resonance' });
    },

    collectParams()    { return this.entities.collectParams(); },
    applyParams(data)  { this.entities.applyParams(data); },

    preFrame(ctx) {
        // ── Delta Time ─────────────────────────────────────────────────────
        const t  = ctx.clock.getElapsedTime();
        const dt = Math.min(t - this._lastTime, 0.1);
        this._lastTime = t;

        this.entities.preFrame(ctx);
    },

    draw(ctx) {
        this.entities.draw(ctx);
    },

    onActivate(ctx) {},

    onDeactivate(ctx) {
        this.synth.dispose();
        this._synthFolder?.dispose();
        this.entities.dispose(ctx);

        // Lights
        ctx.scene.remove(this.ambientLight);
        ctx.scene.remove(this.pointLight);

        ctx.scene.background = null;
    },
});
