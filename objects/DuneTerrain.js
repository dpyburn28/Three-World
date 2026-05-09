window.DuneTerrain = class DuneTerrain extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Dune Terrain';
        this.options = {
            terrainSize: 1200.0,
            hmRes:       512,
            meshRes:     256,
            windSystem:  null,
            sun:         null,
            ...options,
        };

        this._params = {
            // ── Dune shape ─────────────────────────────────────────────────
            duneHeight:      80.0,
            duneSpacing:     180.0,
            stossLength:     0.68,
            interduneFrac:   0.25,
            crestSharpness:  2.5,
            // ── Dune variation ─────────────────────────────────────────────
            crestWander:     0.35,
            crestWanderScale:0.004,
            envelopeScale:   0.002,
            envelopeContrast:0.7,
            // ── Compound dunes ─────────────────────────────────────────────
            compoundAmp:     0.18,
            compoundRatio:   0.28,
            // ── Surface ────────────────────────────────────────────────────
            rippleFreq:      0.08,
            rippleStrength:  0.08,
            // ── Lighting ───────────────────────────────────────────────────
            ambientStrength:  0.3,
            specularPow:      32.0,
            specularStrength: 0.4,
        };

        this._heightData   = null;
        this._heightTex    = null;
        this._bindings     = [];
    }

    async load(ctx) {
        this._heightData = this._generateHeightmap();
        this._heightTex  = this._buildTexture();

        this.dune = new ShaderHandle('shaders/dune');
        await this.dune.load({
            uniforms: {
                u_heightmap:   this._heightTex,
                u_terrainSize: this.options.terrainSize,
                u_hmRes:       this.options.hmRes,
                u_duneHeight:  this._params.duneHeight,
                u_stossLength: this._params.stossLength,
                // Sun system calls .setRGB() — needs THREE.Color
                u_sunColor:    new THREE.Color(1.0, 0.96, 0.86),
            },
            side: THREE.FrontSide,
        });

        const geo = new THREE.PlaneGeometry(
            this.options.terrainSize, this.options.terrainSize,
            this.options.meshRes - 1, this.options.meshRes - 1
        );
        geo.rotateX(-Math.PI / 2);

        this.mesh = new THREE.Mesh(geo, this.dune.mat);
        this.mesh.position.y = 0;
        ctx.scene.add(this.mesh);

        if (this.options.sun) {
            this.options.sun.applyToUniforms(this.dune.mat.uniforms);
        }
    }

    setupGui(folder, ctx) {
        this.dune.setupGui(folder);

        const sizeF = folder.addFolder({ title: 'Terrain Size', expanded: false });
        this._sizeParams = {
            terrainSize: this.options.terrainSize,
            meshRes:     this.options.meshRes,
            hmRes:       this.options.hmRes,
        };

        sizeF.addBinding(this._sizeParams, 'terrainSize', {
            label: 'Field Size', min: 400, max: 3000, step: 50,
        }).on('change', ({ value }) => this.resize(value, this._sizeParams.meshRes, this._sizeParams.hmRes));

        sizeF.addBinding(this._sizeParams, 'meshRes', {
            label: 'Mesh Resolution', min: 64, max: 512, step: 32,
            options: { '64': 64, '128': 128, '256': 256, '512': 512 }
        }).on('change', ({ value }) => this.resize(this._sizeParams.terrainSize, value, this._sizeParams.hmRes));

        sizeF.addBinding(this._sizeParams, 'hmRes', {
            label: 'Heightmap Res', min: 128, max: 1024, step: 128,
            options: { '128': 128, '256': 256, '512': 512, '1024': 1024 }
        }).on('change', ({ value }) => this.resize(this._sizeParams.terrainSize, this._sizeParams.meshRes, value));

        const tf = folder.addFolder({ title: 'Dune Shape', expanded: true });
        const p  = this._params;

        const rebuild = () => {
            this._heightData = this._generateHeightmap();
            this._heightTex.image.data.set(this._heightData);
            this._heightTex.needsUpdate = true;
            this.dune.mat.uniforms.u_duneHeight.value  = p.duneHeight;
            this.dune.mat.uniforms.u_stossLength.value = p.stossLength;
        };

        this._bindings = [
            tf.addBinding(p, 'duneHeight',       { label: 'Dune Height',       min: 10,    max: 250,   step: 1      }).on('change', rebuild),
            tf.addBinding(p, 'duneSpacing',      { label: 'Dune Spacing',      min: 50,    max: 500,   step: 5      }).on('change', rebuild),
            tf.addBinding(p, 'stossLength',      { label: 'Stoss Length',      min: 0.4,   max: 0.85,  step: 0.01   }).on('change', rebuild),
            tf.addBinding(p, 'interduneFrac',    { label: 'Interdune Flat',    min: 0.0,   max: 0.5,   step: 0.01   }).on('change', rebuild),
            tf.addBinding(p, 'crestSharpness',   { label: 'Crest Sharpness',   min: 0.5,   max: 6.0,   step: 0.1    }).on('change', rebuild),
            tf.addBinding(p, 'crestWander',      { label: 'Crest Wander',      min: 0.0,   max: 1.0,   step: 0.01   }).on('change', rebuild),
            tf.addBinding(p, 'crestWanderScale', { label: 'Wander Scale',      min: 0.001, max: 0.015, step: 0.0005 }).on('change', rebuild),
            tf.addBinding(p, 'envelopeScale',    { label: 'Height Var. Scale', min: 0.001, max: 0.01,  step: 0.0001 }).on('change', rebuild),
            tf.addBinding(p, 'envelopeContrast', { label: 'Height Var.',       min: 0.0,   max: 1.0,   step: 0.01   }).on('change', rebuild),
            tf.addBinding(p, 'compoundAmp',      { label: 'Compound Amp',      min: 0.0,   max: 0.4,   step: 0.01   }).on('change', rebuild),
            tf.addBinding(p, 'compoundRatio',    { label: 'Compound Ratio',    min: 0.1,   max: 0.5,   step: 0.01   }).on('change', rebuild),
        ];
    }

    preFrame(ctx) {
        this.options.sun?.applyToUniforms(this.dune.mat.uniforms);

        this.options.windSystem?.applyToUniforms(this.dune.mat.uniforms);
        if (this.options.windSystem) {
            const ws  = this.options.windSystem._params;
            const rad = ws.direction * Math.PI / 180;
            const u = this.dune.mat.uniforms;
            if ('u_windDir'   in u) u.u_windDir.value.set(Math.cos(rad), Math.sin(rad));
            if ('u_windSpeed' in u) u.u_windSpeed.value = ws.speed;
            if ('u_windStrength' in u) u.u_windStrength.value = ws.strength;
        }
    }

    collectParams() {
        return {
            shader:  this.dune.collectParams(),
            terrain: { ...this._params },
            size:    { ...this._sizeParams },
        };
    }

    applyParams(data) {
        if (data.shader) this.dune.applyParams(data.shader);
        if (data.terrain) {
            Object.assign(this._params, data.terrain);
            this._heightData = this._generateHeightmap();
            this._heightTex.image.data.set(this._heightData);
            this._heightTex.needsUpdate = true;
            this.dune.mat.uniforms.u_duneHeight.value = this._params.duneHeight;
            for (const b of this._bindings) b.refresh();
        }
        if (data.size) {
            Object.assign(this._sizeParams, data.size);
            this.resize(data.size.terrainSize, data.size.meshRes, data.size.hmRes);
        }
    }

    dispose(ctx) {
        this.dune.dispose();
        this._heightTex?.dispose();
        this.mesh.geometry.dispose();
        ctx.scene.remove(this.mesh);
        for (const b of this._bindings) b.dispose();
    }

    getHeightAt(wx, wz) {
        const res  = this.options.hmRes;
        const size = this.options.terrainSize;
        const u    = (wx / size + 0.5) * (res - 1);
        const v    = (wz / size + 0.5) * (res - 1);
        const ix   = Math.floor(u), iz = Math.floor(v);
        const fx   = u - ix, fz = v - iz;
        const ix1  = Math.min(ix + 1, res - 1);
        const iz1  = Math.min(iz + 1, res - 1);
        const iix  = Math.max(0, Math.min(ix, res - 1));
        const iiz  = Math.max(0, Math.min(iz, res - 1));
        const dh   = this._params.duneHeight;
        const h00  = this._heightData[iiz  * res + iix ] * dh;
        const h10  = this._heightData[iiz  * res + ix1 ] * dh;
        const h01  = this._heightData[iz1  * res + iix ] * dh;
        const h11  = this._heightData[iz1  * res + ix1 ] * dh;
        return (h00*(1-fx) + h10*fx)*(1-fz) + (h01*(1-fx) + h11*fx)*fz;
    }

    resize(terrainSize, meshRes, hmRes) {
        this.options.terrainSize = terrainSize;
        this.options.meshRes     = meshRes;
        this.options.hmRes       = hmRes;

        this._heightData = this._generateHeightmap();

        this._heightTex?.dispose();
        this._heightTex = this._buildTexture();
        this.dune.mat.uniforms.u_heightmap.value   = this._heightTex;
        this.dune.mat.uniforms.u_terrainSize.value = terrainSize;
        this.dune.mat.uniforms.u_hmRes.value       = hmRes;

        this.mesh.geometry.dispose();
        const geo = new THREE.PlaneGeometry(
            terrainSize, terrainSize,
            meshRes - 1, meshRes - 1
        );
        geo.rotateX(-Math.PI / 2);
        this.mesh.geometry = geo;

        this._onResizeCallbacks?.forEach(cb => cb(terrainSize));
    }

    onResize(cb) {
        this._onResizeCallbacks = this._onResizeCallbacks || [];
        this._onResizeCallbacks.push(cb);
    }

    // ── Heightmap generation ──────────────────────────────────────────────────

    _generateHeightmap() {
        const res  = this.options.hmRes;
        const size = this.options.terrainSize;
        const p    = this._params;

        const ws      = this.options.windSystem;
        const windRad = ws ? ws._params.direction * Math.PI / 180 : Math.PI / 4;
        const wdx = Math.cos(windRad), wdz = Math.sin(windRad);
        const wdx_perp = -wdz, wdz_perp = wdx;

        const data = new Float32Array(res * res);

        const freq        = 1.0 / p.duneSpacing;
        const compFreq    = freq / p.compoundRatio;

        for (let iz = 0; iz < res; iz++) {
            for (let ix = 0; ix < res; ix++) {
                const wx = (ix / (res - 1) - 0.5) * size;
                const wz = (iz / (res - 1) - 0.5) * size;

                const along = wx * wdx     + wz * wdz;
                const cross  = wx * wdx_perp + wz * wdz_perp;

                const wander = this._fbm2(
                    cross * p.crestWanderScale,
                    along * p.crestWanderScale * 0.3
                ) * p.crestWander * p.duneSpacing;

                const rawPhase = ((along + wander) * freq) % 1.0;
                const phase    = rawPhase < 0 ? rawPhase + 1.0 : rawPhase;

                const h_main = this._duneProfile(phase, p.stossLength, p.crestSharpness);

                const rawPhase2 = ((along + wander * 0.5) * compFreq) % 1.0;
                const phase2    = rawPhase2 < 0 ? rawPhase2 + 1.0 : rawPhase2;
                const h_comp    = this._duneProfile(phase2, p.stossLength, p.crestSharpness * 0.8);

                const onStoss   = phase < p.stossLength ? 1.0 : Math.max(0, 1.0 - (phase - p.stossLength) / (1.0 - p.stossLength) * 3.0);
                const h_combined = h_main + h_comp * p.compoundAmp * onStoss;

                const env = this._fbm2(
                    cross  * p.envelopeScale,
                    along  * p.envelopeScale * 0.4
                );
                const envMapped = Math.max(0, (env - (0.5 - p.envelopeContrast * 0.5)) / p.envelopeContrast);

                let h = h_combined * envMapped;
                h = Math.max(0, h - p.interduneFrac) / Math.max(1.0 - p.interduneFrac, 0.0001);

                data[iz * res + ix] = Math.min(1, Math.max(0, h));
            }
        }

        return data;
    }

    _duneProfile(phase, stossLen, sharpness) {
        if (phase < stossLen) {
            const t = phase / stossLen;
            return t * t * (3.0 - 2.0 * t);
        } else {
            const t = (phase - stossLen) / (1.0 - stossLen);
            return Math.pow(Math.max(0, 1.0 - t), sharpness);
        }
    }

    _fbm2(x, z) {
        let v = 0, a = 0.5;
        let px = x, pz = z;
        const s = 0.13, c = 0.991;
        for (let i = 0; i < 5; i++) {
            v += a * this._noise2(px, pz);
            const nx = (px * c - pz * s + 5.2) * 2.1;
            const nz = (px * s + pz * c + 1.3) * 2.1;
            px = nx; pz = nz;
            a *= 0.5;
        }
        return v;
    }

    _buildTexture() {
        const res = this.options.hmRes;
        const tex = new THREE.DataTexture(
            this._heightData, res, res,
            THREE.RedFormat, THREE.FloatType
        );
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }

    _noise2(x, z) {
        const ix = Math.floor(x), iz = Math.floor(z);
        const fx = x - ix, fz = z - iz;
        const ux = fx*fx*(3-2*fx), uz = fz*fz*(3-2*fz);
        const h = (ax, az) => {
            const n = Math.sin(ax*127.1 + az*311.7) * 43758.5453;
            return n - Math.floor(n);
        };
        return (
            h(ix,  iz  ) * (1-ux) * (1-uz) +
            h(ix+1,iz  ) *    ux  * (1-uz) +
            h(ix,  iz+1) * (1-ux) *    uz  +
            h(ix+1,iz+1) *    ux  *    uz
        );
    }
}
