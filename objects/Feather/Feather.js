window.Feather = class Feather extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Feather';
        this._bindings = [];
        this.options = { windSystem: null, ...options };

        this._params = {
            // Shape
            length:        2.0,
            maxWidth:      0.4,
            widestPoint:   0.35,
            tipRoundness:  0.3,
            calamusLength: 0.05,
            asymmetry:     0.15,

            // Curvature
            curve:  0.2,
            droop:  0.04,
            twist:  0.0,

            // Shaft
            shaftRise:      0.04,
            shaftWidth:     0.15,
            shaftSharpness: 1.0,

            // Barbs
            barbAngle: 0.3,

            // Resolution (not exposed in GUI)
            segU: 60,
            segV: 32,
        };

        // Merge constructor overrides
        if (options.params) Object.assign(this._params, options.params);
    }

    async load(ctx) {
        this._ctx = ctx;
        const geo = this._buildGeometry();

        // Load custom shader via ShaderHandle
        this.shader = new ShaderHandle('shaders/feather');
        await this.shader.load({
            side:        THREE.DoubleSide,
            transparent: true,
            depthWrite:  true,
        });

        this.mesh = new THREE.Mesh(geo, this.shader.mat);
        this._syncShaderParams();
        ctx.scene.add(this.mesh);
    }

    // ── Geometry ──────────────────────────────────────────────────────────

    _buildGeometry() {
        const p = this._params;
        const segU = p.segU;
        const segV = p.segV;

        const vertCount = (segU + 1) * (segV + 1);
        const positions = new Float32Array(vertCount * 3);
        const aU        = new Float32Array(vertCount);
        const aV        = new Float32Array(vertCount);
        const aW        = new Float32Array(vertCount);
        const indices   = [];

        const twistRad = p.twist * Math.PI / 180;

        let idx = 0;
        for (let i = 0; i <= segU; i++) {
            const u = i / segU; // 0 = base, 1 = tip

            const w = this._widthAt(u);

            for (let j = 0; j <= segV; j++) {
                const v = (j / segV) * 2 - 1; // -1 to +1

                // Asymmetry: shift the vane so one side is wider
                const vane = v * w;
                const asymShift = p.asymmetry * w * (1 - Math.abs(v));
                let x = vane + asymShift;

                // Barb angle: skew barbs toward the tip (scaled by width so tip still closes)
                x += p.barbAngle * u * v * w;

                // Shaft curvature: arc along X
                x += p.curve * u * u;

                // Shaft ridge (Z axis)
                const absV = Math.abs(v);
                const ridgeT = Math.max(0, 1 - absV / Math.max(0.001, p.shaftWidth));
                // Semicircular cross-section for realistic rounded tube
                const profile = Math.sqrt(Math.max(0, ridgeT * (2.0 - ridgeT)));
                // shaftSharpness adjusts the profile: 1 = semicircle, <1 = more peaked, >1 = flatter top
                const shaped = Math.pow(profile, p.shaftSharpness);
                // Taper: shaft thins toward the tip
                const taper = 1.0 - u * 0.6;
                const ridge = p.shaftRise * shaped * taper;
                const droopZ = -p.droop * v * v;
                let z = ridge + droopZ;

                // Twist: rotate (x, z) around Y axis proportional to u
                const angle = twistRad * u;
                if (angle !== 0) {
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    const rx = x * cos - z * sin;
                    const rz = x * sin + z * cos;
                    x = rx;
                    z = rz;
                }

                const y = u * p.length;

                positions[idx * 3]     = x;
                positions[idx * 3 + 1] = y;
                positions[idx * 3 + 2] = z;

                aU[idx] = u;
                aV[idx] = v;
                aW[idx] = w;

                idx++;
            }
        }

        // Index buffer: two triangles per quad
        for (let i = 0; i < segU; i++) {
            for (let j = 0; j < segV; j++) {
                const a = i * (segV + 1) + j;
                const b = a + 1;
                const c = (i + 1) * (segV + 1) + j;
                const d = c + 1;
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
        geo.setAttribute('aV', new THREE.BufferAttribute(aV, 1));
        geo.setAttribute('aW', new THREE.BufferAttribute(aW, 1));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }

    /**
     * Width profile along the shaft.
     * u: 0 = base (calamus), 1 = tip
     * Returns half-width at that u position.
     */
    _widthAt(u) {
        const { maxWidth, calamusLength, widestPoint, tipRoundness } = this._params;

        if (u < calamusLength) {
            // Calamus: thin bare quill, linear ramp
            const t = calamusLength > 0 ? u / calamusLength : 1;
            return maxWidth * 0.02 * t;
        }

        if (u < widestPoint) {
            // Expanding vane from calamus to widest point
            const t = (u - calamusLength) / Math.max(0.001, widestPoint - calamusLength);
            return maxWidth * (0.02 + 0.98 * _smoothstep(t));
        }

        // Tapering from widest point to tip
        const t = (u - widestPoint) / Math.max(0.001, 1.0 - widestPoint);
        // tipRoundness blends between sharp taper (power curve) and blunt (linear)
        const sharp = Math.pow(1.0 - _smoothstep(t), 1.0 + (1.0 - tipRoundness) * 3.0);
        const blunt = 1.0 - _smoothstep(t);
        const blend = tipRoundness;
        return maxWidth * (sharp * (1 - blend) + blunt * blend);
    }

    _rebuild() {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.geometry = this._buildGeometry();
        this._syncShaderParams();
    }

    _syncShaderParams() {
        if (!this.shader?.mat) return;
        const u = this.shader.mat.uniforms;
        if (u.u_shaftWidth) u.u_shaftWidth.value = this._params.shaftWidth;
    }

    // ── GUI ───────────────────────────────────────────────────────────────

    setupGui(folder, ctx) {
        const p = this._params;
        const rebuild = () => this._rebuild();

        // ── Shape ──
        const shape = folder.addFolder({ title: 'Shape', expanded: true });
        this._bindings.push(
            shape.addBinding(p, 'length',        { label: 'Length',     min: 0.5,  max: 5.0, step: 0.01 }).on('change', rebuild),
            shape.addBinding(p, 'maxWidth',      { label: 'Max Width', min: 0.1,  max: 1.5, step: 0.01 }).on('change', rebuild),
            shape.addBinding(p, 'widestPoint',   { label: 'Widest Point', min: 0.1,  max: 0.8, step: 0.01 }).on('change', rebuild),
            shape.addBinding(p, 'tipRoundness',  { label: 'Tip Roundness', min: 0.0,  max: 1.0, step: 0.01 }).on('change', rebuild),
            shape.addBinding(p, 'calamusLength', { label: 'Calamus',   min: 0.0,  max: 0.2, step: 0.005 }).on('change', rebuild),
            shape.addBinding(p, 'asymmetry',     { label: 'Asymmetry', min: -1.0, max: 1.0, step: 0.01 }).on('change', rebuild),
        );

        // ── Curvature ──
        const curv = folder.addFolder({ title: 'Curvature', expanded: true });
        this._bindings.push(
            curv.addBinding(p, 'curve', { label: 'Curve', min: -1.0, max: 1.0, step: 0.01 }).on('change', rebuild),
            curv.addBinding(p, 'droop', { label: 'Droop', min: 0.0,  max: 0.2, step: 0.005 }).on('change', rebuild),
            curv.addBinding(p, 'twist', { label: 'Twist (°)', min: -90, max: 90, step: 1 }).on('change', rebuild),
        );

        // ── Shaft ──
        const shaft = folder.addFolder({ title: 'Shaft', expanded: false });
        this._bindings.push(
            shaft.addBinding(p, 'shaftRise',      { label: 'Rise',      min: 0.0,  max: 0.08, step: 0.002 }).on('change', rebuild),
            shaft.addBinding(p, 'shaftWidth',     { label: 'Width',     min: 0.05, max: 0.5, step: 0.005 }).on('change', rebuild),
            shaft.addBinding(p, 'shaftSharpness', { label: 'Sharpness', min: 1.0,  max: 8.0, step: 0.1 }).on('change', rebuild),
        );

        // ── Barbs ──
        const barbs = folder.addFolder({ title: 'Barbs', expanded: false });
        this._bindings.push(
            barbs.addBinding(p, 'barbAngle', { label: 'Barb Angle', min: -1.0, max: 1.0, step: 0.01 }).on('change', rebuild),
        );

        // ── Shader controls (auto-wired from controls.json) ──
        const shaderFolder = folder.addFolder({ title: 'Shader', expanded: false });
        this.shader.setupGui(shaderFolder);
    }

    // ── Presets ────────────────────────────────────────────────────────────

    collectParams() {
        const p = this._params;
        return {
            length: p.length, maxWidth: p.maxWidth, widestPoint: p.widestPoint,
            tipRoundness: p.tipRoundness, calamusLength: p.calamusLength, asymmetry: p.asymmetry,
            curve: p.curve, droop: p.droop, twist: p.twist,
            shaftRise: p.shaftRise, shaftWidth: p.shaftWidth, shaftSharpness: p.shaftSharpness,
            barbAngle: p.barbAngle,
            shader: this.shader.collectParams(),
        };
    }

    applyParams(data) {
        if (!data) return;

        // Merge geometry keys
        const geoKeys = [
            'length', 'maxWidth', 'widestPoint', 'tipRoundness', 'calamusLength',
            'asymmetry', 'curve', 'droop', 'twist',
            'shaftRise', 'shaftWidth', 'shaftSharpness', 'barbAngle',
        ];
        let needsRebuild = false;
        for (const k of geoKeys) {
            if (data[k] !== undefined) {
                this._params[k] = data[k];
                needsRebuild = true;
            }
        }

        if (needsRebuild) this._rebuild();

        // Apply shader params
        if (data.shader) this.shader.applyParams(data.shader);

        for (const b of this._bindings) {
            try { b.refresh(); } catch (_) {}
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    preFrame(ctx) {
        this.options.windSystem?.applyToUniforms(this.shader.mat.uniforms);
    }
    draw(ctx) {}

    dispose(ctx) {
        for (const b of this._bindings) b.dispose();
        this._bindings = [];
        this.shader?.dispose();
        this.mesh?.geometry.dispose();
        if (this.mesh) ctx.scene.remove(this.mesh);
        this.mesh = null;
    }
}

function _smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
}
