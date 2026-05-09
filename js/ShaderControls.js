window.ShaderControls = class ShaderControls {

    // folder   — Tweakpane folder to add bindings into
    // controls — the parsed controls.json object (shader.controls)
    // uniforms — the live uniforms object from the material / pass
    constructor(folder, controls, uniforms, dirPath) {
        this.params   = {};
        this.uniforms = uniforms;
        this.bindings = [];
        this.dirPath  = dirPath || null;

        if (!controls) return;

        for (const [key, def] of Object.entries(controls)) {
            if (!(key in uniforms)) {
                console.warn(`[ShaderControls] uniform "${key}" not found — skipping`);
                continue;
            }

            // Seed params from controls.json value, fallback to live uniform
            this.params[key] = def.value ?? uniforms[key].value;

            // Also write the initial value back to the uniform so they're in sync
            this._applyToUniform(key, this.params[key], def);

            // Build Tweakpane options, stripping our internal keys
            const opts = this._buildOptions(def);

            const binding = folder.addBinding(this.params, key, opts);

            binding.on('change', ({ value }) => {
                this._applyToUniform(key, value, def);
            });

            this.bindings.push(binding);
        }

        this._controls = controls

        if (this.dirPath) {
            this._presets = new PresetHandler(folder, this.dirPath, {
                collect: () => this.collectParams(),
                apply:   (data) => this.applyParams(data),
            });
        }
    }

    collectParams() {
        const snapshot = {};
        for (const [key, value] of Object.entries(this.params)) {
            snapshot[key] = (typeof value === 'object' && value !== null)
                ? { ...value }
                : value;
        }
        return snapshot;
    }

    applyParams(data) {
        for (const [key, value] of Object.entries(data)) {
            if (!(key in this.params)) continue;
            this.params[key] = value;
            this._applyToUniform(key, value, this._controls[key]);
        }
        for (const b of this.bindings) b.refresh();
    }

    _applyToUniform(key, value, def) {
        const u = this.uniforms[key];
        if (!u) return;

        switch (def.type) {
            case 'vec2':
                u.value.set(value.x, value.y);
                break;
            case 'vec3':
                u.value.set(value.x, value.y, value.z);
                break;
            case 'vec4':
                u.value.set(value.x, value.y, value.z, value.w);
                break;
            case 'color':
                // Tweakpane color bindings return {r,g,b} in 0-255 by default
                u.value.setRGB(value.r / 255, value.g / 255, value.b / 255);
                break;
            case 'vec4color':
                u.value.set(value.r / 255, value.g / 255, value.b / 255, 1.0);
                break;
            default:
                u.value = value;  // float, int, bool
        }
    }

    _buildOptions(def) {
        const INTERNAL = new Set(['label', 'value', 'type']);
        const opts = {};
        for (const [k, v] of Object.entries(def)) {
            if (!INTERNAL.has(k)) opts[k] = v;
        }
        if (def.label) opts.label = def.label;
        if (def.type === 'color') opts.color = { type: 'float' }; // optional: use 0-1 range
        return opts;
    }

    dispose() {
        for (const b of this.bindings) b.dispose();
        this.bindings = [];
    }
}