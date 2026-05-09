window.WindSystem = class WindSystem extends SystemHandle {
    constructor(options = {}) {
        super('Wind');

        Object.assign(this._params, {
            // ── Base ──────────────────────────────────────────────────────────
            direction:        45.0,
            speed:            1.8,
            strength:         12.0,
            waveFreq:         0.019,
            waveHarmonics:    true,

            // ── Boundary layer ────────────────────────────────────────────────
            boundaryLayer:    true,
            roughnessLength:  0.05,   // z0 — short grass ~0.03–0.1
            referenceHeight:  200.0,

            // ── Gusts ─────────────────────────────────────────────────────────
            gustStrength:     18.0,
            gustSpeed:        3.0,
            gustScale:        0.003,
            gustSharpness:    2.0,
            gustTemporality:  0.3,    // how strongly gusts pulse over time (0=off)

            // ── Wind shear ────────────────────────────────────────────────────
            shear:            true,
            shearAngle:       25.0,
            shearHeight:      150.0,

            // ── Turbulence ────────────────────────────────────────────────────
            turbulence:       3.0,
            turbOctaves:      5,
            turbLacunarity:   2.1,
            turbGain:         0.55,
            turbBaseFreq:     0.005,
            turbTimeScale:    1.0,
            // Turbulence intensity scales with wind speed — 0=constant, 1=fully coupled
            turbWindCoupling: 0.7,

            // ── Vertical ─────────────────────────────────────────────────────
            verticalStrength: 0.15,
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    evaluate(x, y, z, t) {
        const p = this._params;

        const { dx, dz } = this._directionAtHeight(y);
        const cx = -dz, cz = dx;

        // ── Boundary layer ────────────────────────────────────────────────────
        const bl = p.boundaryLayer ? this._boundaryLayer(y) : 1.0;

        // ── Traveling sway wave ───────────────────────────────────────────────
        const spatialPhase = (x * dx + z * dz) * p.waveFreq;
        const phase        = t * p.speed + spatialPhase;
        let sway = Math.sin(phase);
        if (p.waveHarmonics) sway += 0.35 * Math.sin(phase * 2.7 + 0.5);

        // ── Localized gust patches with temporal intermittency ────────────────
        const advX = x - dx * t * p.gustSpeed;
        const advZ = z - dz * t * p.gustSpeed;

        const gustSpatial   = Math.max(0, this._fbm2(advX * p.gustScale, advZ * p.gustScale));
        // Temporal envelope — slow sinusoidal pulse per spatial region
        const gustTemporal  = p.gustTemporality > 0
            ? 0.5 + 0.5 * Math.sin(t * 0.3 + this._fbm2(advX * 0.0005, advZ * 0.0005) * 6.28)
            : 1.0;
        const gust = Math.pow(gustSpatial, p.gustSharpness)
                   * (1.0 - p.gustTemporality + p.gustTemporality * gustTemporal);

        // ── Turbulence with anisotropy and wind-speed coupling ────────────────
        const turb = this._turbulenceSpectrum(x, z, y, t);

        // Scale turbulence by current mean wind magnitude (stronger wind = more turbulence)
        const meanWind   = Math.abs(sway * p.strength + gust * p.gustStrength) * bl;
        const turbScale  = p.turbulence * (
            (1.0 - p.turbWindCoupling) + p.turbWindCoupling * Math.min(meanWind / Math.max(p.strength, 0.001), 2.0)
        );

        const baseWind = sway * p.strength + gust * p.gustStrength;

        // Along-wind turbulence (u) has ~2× variance of cross-wind (v) — Davenport spectrum
        const tu = turb.u * turbScale * bl;
        const tv = turb.v * turbScale * bl * 0.5;   // cross-wind is half intensity

        const wx = dx * baseWind * bl + tu + cx * tv;
        // Vertical: centered around zero — up and down equally likely
        const wy = (turb.u - 0.5 + turb.v - 0.5) * 2.0 * p.verticalStrength * turbScale * bl;
        const wz = dz * baseWind * bl + tv + cz * tu;

        return { x: wx, y: wy, z: wz };
    }

    // Expose boundary layer value directly — used by visualizer for height color mode
    boundaryLayerAt(y) {
        return this._params.boundaryLayer ? this._boundaryLayer(y) : 1.0;
    }

    applyToUniforms(uniforms) {
        const p   = this._params;
        const rad = p.direction * Math.PI / 180;
        const set = (key, val) => { if (key in uniforms) uniforms[key].value = val; };

        set('u_windDir',           new THREE.Vector2(Math.cos(rad), Math.sin(rad)));
        set('u_windSpeed',         p.speed);
        set('u_windStrength',      p.strength);
        set('u_windWaveFreq',      p.waveFreq);
        set('u_windWaveHarmonics', p.waveHarmonics ? 1 : 0);
        set('u_gustStrength',      p.gustStrength);
        set('u_gustSpeed',         p.gustSpeed);
        set('u_gustScale',         p.gustScale);
        set('u_gustSharpness',     p.gustSharpness);
        set('u_turbulence',        p.turbulence);
        set('u_turbBaseFreq',      p.turbBaseFreq);
        set('u_turbOctaves',       p.turbOctaves);
        set('u_turbLacunarity',    p.turbLacunarity);
        set('u_turbGain',          p.turbGain);
        set('u_turbTimeScale',     p.turbTimeScale);
        set('u_boundaryLayer',     p.boundaryLayer ? 1 : 0);
        set('u_roughnessLength',   p.roughnessLength);
        set('u_referenceHeight',   p.referenceHeight);
        set('u_shear',             p.shear ? 1 : 0);
        set('u_shearAngle',        p.shearAngle * Math.PI / 180);
        set('u_shearHeight',       p.shearHeight);
    }

    // ── Private — physics ─────────────────────────────────────────────────────

    _boundaryLayer(y) {
        const p  = this._params;
        const z0 = Math.max(p.roughnessLength, 0.001);
        const h  = Math.max(y, z0 * 2.0);   // sublayer floor — log undefined below 2*z0
        const hr = Math.max(p.referenceHeight, z0 * 2);
        return Math.max(0, Math.log(h / z0) / Math.log(hr / z0));
    }

    _directionAtHeight(y) {
        const p = this._params;
        if (!p.shear) {
            return {
                dx: Math.cos(p.direction * Math.PI / 180),
                dz: Math.sin(p.direction * Math.PI / 180),
            };
        }
        const shearFrac = Math.min(1, y / Math.max(p.shearHeight, 1));
        const angle     = (p.direction + p.shearAngle * shearFrac) * Math.PI / 180;
        return { dx: Math.cos(angle), dz: Math.sin(angle) };
    }

    _turbulenceSpectrum(x, z, y, t) {
        const p = this._params;
        let u = 0, v = 0, norm = 0;
        let freq = p.turbBaseFreq, amp = 1.0;
        for (let i = 0; i < p.turbOctaves; i++) {
            const ts = freq * p.turbTimeScale;
            u    += this._noise2(x * freq,        z * freq,        t * ts      ) * amp;
            v    += this._noise2(x * freq + 47.3, z * freq + 19.1, t * ts + 5.2) * amp;
            norm += amp;
            freq *= p.turbLacunarity;
            amp  *= p.turbGain;
        }
        return { u: u / norm, v: v / norm };
    }

    // FBM with slight rotation between octaves — breaks perfectly aligned gust bands
    _fbm2(x, z) {
        let v = 0, a = 0.5;
        let px = x, pz = z;
        for (let i = 0; i < 5; i++) {
            v += a * this._noise2(px, pz, 0);
            // ~7.5° rotation per octave
            const s = 0.13, c = 0.991;
            const nx = (px * c - pz * s + 5.2) * 2.1;
            const nz = (px * s + pz * c + 1.3) * 2.1;
            px = nx; pz = nz;
            a *= 0.5;
        }
        return v * 2.0 - 0.5;
    }

    _noise2(x, z, t = 0) {
        const ix = Math.floor(x), iz = Math.floor(z), it = Math.floor(t);
        const fx = x-ix, fz = z-iz, ft = t-it;
        const ux = fx*fx*(3-2*fx), uz = fz*fz*(3-2*fz), ut = ft*ft*(3-2*ft);
        const h = (ax, az, at) => {
            const n = Math.sin(ax*127.1 + az*311.7 + at*74.3) * 43758.5453;
            return n - Math.floor(n);
        };
        return (
            h(ix,  iz,  it  ) * (1-ux)*(1-uz)*(1-ut) +
            h(ix+1,iz,  it  ) *    ux *(1-uz)*(1-ut) +
            h(ix,  iz+1,it  ) * (1-ux)*   uz *(1-ut) +
            h(ix+1,iz+1,it  ) *    ux *   uz *(1-ut) +
            h(ix,  iz,  it+1) * (1-ux)*(1-uz)*   ut  +
            h(ix+1,iz,  it+1) *    ux *(1-uz)*   ut  +
            h(ix,  iz+1,it+1) * (1-ux)*   uz *   ut  +
            h(ix+1,iz+1,it+1) *    ux *   uz *   ut
        );
    }

    // ── Private — GUI ─────────────────────────────────────────────────────────

    setupGui(folder, ctx) {
        const f = folder;

        const base = f.addFolder({ title: 'Base', expanded: true });
        this._bind(base, 'direction',     { label: 'Direction',  min: 0,     max: 360,  step: 1     });
        this._bind(base, 'speed',         { label: 'Speed',      min: 0,     max: 10,   step: 0.01  });
        this._bind(base, 'strength',      { label: 'Strength',   min: 0,     max: 40,   step: 0.1   });
        this._bind(base, 'waveFreq',      { label: 'Wave Freq',  min: 0,     max: 0.1,  step: 0.001 });
        this._bind(base, 'waveHarmonics', { label: 'Harmonics'  });

        const bl = f.addFolder({ title: 'Boundary Layer', expanded: false });
        this._bind(bl, 'boundaryLayer',   { label: 'Enabled'                                            });
        this._bind(bl, 'roughnessLength', { label: 'Roughness (z₀)', min: 0.001, max: 1.0,  step: 0.001 });
        this._bind(bl, 'referenceHeight', { label: 'Ref Height',     min: 10,    max: 500,  step: 1     });

        const gusts = f.addFolder({ title: 'Gusts', expanded: false });
        this._bind(gusts, 'gustStrength',   { label: 'Strength',     min: 0,     max: 60,   step: 0.1    });
        this._bind(gusts, 'gustSpeed',      { label: 'Speed',        min: 0,     max: 10,   step: 0.01   });
        this._bind(gusts, 'gustScale',      { label: 'Scale',        min: 0.001, max: 0.02, step: 0.0001 });
        this._bind(gusts, 'gustSharpness',  { label: 'Sharpness',    min: 0.5,   max: 6.0,  step: 0.1    });
        this._bind(gusts, 'gustTemporality',{ label: 'Temporality',  min: 0,     max: 1.0,  step: 0.01   });

        const shear = f.addFolder({ title: 'Wind Shear', expanded: false });
        this._bind(shear, 'shear',       { label: 'Enabled'                                   });
        this._bind(shear, 'shearAngle',  { label: 'Angle (°)', min: -90, max: 90,  step: 0.5  });
        this._bind(shear, 'shearHeight', { label: 'Height',    min: 10,  max: 500, step: 1    });

        const turb = f.addFolder({ title: 'Turbulence', expanded: false });
        this._bind(turb, 'turbulence',      { label: 'Strength',      min: 0,     max: 20,   step: 0.1   });
        this._bind(turb, 'turbWindCoupling',{ label: 'Wind Coupling',  min: 0,     max: 1,    step: 0.01  });
        this._bind(turb, 'turbOctaves',     { label: 'Octaves',       min: 1,     max: 8,    step: 1     });
        this._bind(turb, 'turbBaseFreq',    { label: 'Base Freq',     min: 0.001, max: 0.05, step: 0.001 });
        this._bind(turb, 'turbLacunarity',  { label: 'Lacunarity',    min: 1.5,   max: 4.0,  step: 0.05  });
        this._bind(turb, 'turbGain',        { label: 'Gain',          min: 0.3,   max: 0.8,  step: 0.01  });
        this._bind(turb, 'turbTimeScale',   { label: 'Time Scale',    min: 0,     max: 5,    step: 0.01  });

        const vert = f.addFolder({ title: 'Vertical', expanded: false });
        this._bind(vert, 'verticalStrength', { label: 'Strength', min: 0, max: 1, step: 0.01 });
    }
}
