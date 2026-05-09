window.SandParticles = class SandParticles extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Sand Particles';
        this.options = {
            windSystem:  null,
            duneTerrain: null,
            fieldSize:   1200.0,
            ...options,
        };

        this._params = {
            // ── Counts ──────────────────────────────────────────────────────
            numSaltation:     3000,  // ballistic hopping grains
            numCreep:         2000,  // surface-sliding grains
            numAvalanche:     500,   // slip-face cascade grains

            // ── Saltation physics ────────────────────────────────────────────
            launchAngle:      15.0,  // degrees from horizontal (real: 10-20°)
            launchSpeed:      35.0,  // base horizontal launch speed
            launchSpread:     0.2,   // angular spread (radians) around wind dir
            launchThreshold:  6.0,   // min wind speed to launch
            gravity:          180.0, // strong gravity = low flat hops
            airDrag:          1.5,   // drag toward wind while airborne
            restitution:      0.15,  // very low bounce — grains are inelastic
            maxHopHeight:     25.0,  // ceiling on hop height

            // ── Creep physics ────────────────────────────────────────────────
            creepSpeed:       0.06,  // fraction of wind speed
            creepThreshold:   3.0,   // min wind to creep

            // ── Avalanche physics ────────────────────────────────────────────
            angleOfRepose:    34.0,  // degrees — steeper = avalanche
            avalancheSpeed:   15.0,  // downslope speed

            // ── Appearance ───────────────────────────────────────────────────
            grainSize:        2.5,
            opacity:          0.7,
        };

        // Particle arrays — separate for each mode
        this._saltation  = [];
        this._creep      = [];
        this._avalanche  = [];

        // Spawn weight map — computed from terrain
        this._spawnMap   = null;
        this._spawnMapRes = 64;

        this._lastTime   = null;
        this._firstFrame = true;
        this._bindings   = [];
    }

    async load(ctx) {
        const shader = await loadShaderFromDirectory('shaders/sand');
        this.shader = shader;

        const total = this._params.numSaltation
                    + this._params.numCreep
                    + this._params.numAvalanche;

        this._buildGeometry(total);

        this.mat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite:  false,
            depthTest:   true,
            blending:    THREE.NormalBlending,
            uniforms: {
                u_time:        { value: 0 },
                u_resolution:  { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_grainSize:   { value: this._params.grainSize },
                u_grainSoftness:{ value: 0.25 },
                u_opacity:     { value: this._params.opacity },
                u_colorGround: { value: new THREE.Color(185/255, 138/255,  65/255) },
                u_colorAir:    { value: new THREE.Color(225/255, 195/255, 130/255) },
                u_fogColor:    { value: new THREE.Color(196/255, 154/255,  74/255) },
                u_fogDensity:  { value: 0.6 },
                u_sunDir:      { value: new THREE.Vector3(0.6, 0.8, 0.3).normalize() },
                u_sunColor:    { value: new THREE.Color(1.0, 0.96, 0.86) },
            },
            vertexShader:   shader.vertexShader,
            fragmentShader: shader.fragmentShader,
        });

        this.mesh = new THREE.Points(this.mesh_geo, this.mat);
        this.mesh.frustumCulled = false;
        ctx.scene.add(this.mesh);
    }

    setupGui(folder, ctx) {
        const p = this._params;
        this._bindings = [
            folder.addBinding(p, 'numSaltation',   { label: 'Saltation Count',  min: 100,  max: 8000, step: 100 }).on('change', () => this._rebuild()),
            folder.addBinding(p, 'numCreep',       { label: 'Creep Count',      min: 0,    max: 5000, step: 100 }).on('change', () => this._rebuild()),
            folder.addBinding(p, 'numAvalanche',   { label: 'Avalanche Count',  min: 0,    max: 2000, step: 50  }).on('change', () => this._rebuild()),
            folder.addBinding(p, 'launchAngle',    { label: 'Launch Angle (°)', min: 5,    max: 35,   step: 0.5 }),
            folder.addBinding(p, 'launchSpeed',    { label: 'Launch Speed',     min: 5,    max: 80,   step: 0.5 }),
            folder.addBinding(p, 'launchSpread',   { label: 'Launch Spread',    min: 0,    max: 0.8,  step: 0.01}),
            folder.addBinding(p, 'launchThreshold',{ label: 'Launch Threshold', min: 0,    max: 20,   step: 0.5 }),
            folder.addBinding(p, 'gravity',        { label: 'Gravity',          min: 50,   max: 400,  step: 5   }),
            folder.addBinding(p, 'airDrag',        { label: 'Air Drag',         min: 0,    max: 5,    step: 0.1 }),
            folder.addBinding(p, 'restitution',    { label: 'Restitution',      min: 0,    max: 0.5,  step: 0.01}),
            folder.addBinding(p, 'maxHopHeight',   { label: 'Max Hop Height',   min: 2,    max: 60,   step: 1   }),
            folder.addBinding(p, 'creepSpeed',     { label: 'Creep Speed',      min: 0,    max: 0.2,  step: 0.005}),
            folder.addBinding(p, 'creepThreshold', { label: 'Creep Threshold',  min: 0,    max: 15,   step: 0.5 }),
            folder.addBinding(p, 'angleOfRepose',  { label: 'Angle of Repose',  min: 20,   max: 45,   step: 0.5 }).on('change', () => this._rebuildSpawnMap()),
            folder.addBinding(p, 'avalancheSpeed', { label: 'Avalanche Speed',  min: 1,    max: 40,   step: 0.5 }),
        ];

        this._shaderControls = new ShaderControls(
            folder, this.shader.controls, this.mat.uniforms, this.shader.dirPath
        );
    }

    collectParams() { 
        return {
            physics:{ ...this._params },
            shader: this._shaderControls?.collectParams() ?? {}
        }
    }

    applyParams(data) {
        if (data.physics) {
            const needsRebuild = data.physics.numSaltation !== this._params.numSaltation ||
                                data.physics.numCreep     !== this._params.numCreep     ||
                                data.physics.numAvalanche !== this._params.numAvalanche;
            Object.assign(this._params, data.physics);
            if (needsRebuild) this._rebuild();
            else this._rebuildSpawnMap();
            for (const b of this._bindings) b.refresh();
        }
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader);
        }
    }

    preFrame(ctx) {
        const t  = ctx.clock.getElapsedTime();
        const dt = this._lastTime === null ? 0.016 : Math.min(t - this._lastTime, 0.05);
        this._lastTime = t;

        if (this.mat) this.mat.uniforms.u_time.value = t;

        const terrain = this.options.duneTerrain;
        const ws      = this.options.windSystem;

        // First frame: snap all particles to terrain, build spawn map
        if (this._firstFrame) {
            this._firstFrame = false;
            this._rebuildSpawnMap();
            this._spawnAll();
        }

        const p = this._params;

        // ── Update saltation ───────────────────────────────────────────────
        for (let i = 0; i < this._saltation.length; i++) {
            const g = this._saltation[i];
            this._stepSaltation(g, dt, t, terrain, ws);
        }

        // ── Update creep ───────────────────────────────────────────────────
        for (let i = 0; i < this._creep.length; i++) {
            const g = this._creep[i];
            this._stepCreep(g, dt, t, terrain, ws);
        }

        // ── Update avalanche ───────────────────────────────────────────────
        for (let i = 0; i < this._avalanche.length; i++) {
            const g = this._avalanche[i];
            this._stepAvalanche(g, dt, terrain, ws);
        }

        // ── Write geometry ─────────────────────────────────────────────────
        this._writeGeometry();
    }

    draw(ctx) {}

    dispose(ctx) {
        this._shaderControls?.dispose();
        this.mesh.geometry.dispose();
        this.mat.dispose();
        ctx.scene.remove(this.mesh);
        for (const b of this._bindings) b.dispose();
    }

    // New method — syncs fieldSize to terrain and respawns
    matchTerrain(terrain) {
        this.options.fieldSize  = terrain.options.terrainSize;
        this.options.duneTerrain = terrain;
        this._rebuildSpawnMap();
        this._rebuild();
    }

    // ── Particle step functions ───────────────────────────────────────────────

    _stepSaltation(g, dt, t, terrain, ws) {
        const p = this._params;

        if (g.airborne) {
            const wind = ws ? ws.evaluate(g.x, g.y, g.z, t) : { x: 0, y: 0, z: 0 };

            // Gravity
            g.vy -= p.gravity * dt;

            // Drag — exponential decay toward wind velocity (horizontal only)
            const drag = Math.exp(-p.airDrag * dt);
            g.vx = wind.x + (g.vx - wind.x) * drag;
            g.vz = wind.z + (g.vz - wind.z) * drag;

            g.x += g.vx * dt;
            g.y += g.vy * dt;
            g.z += g.vz * dt;

            const sy = terrain ? terrain.getHeightAt(g.x, g.z) : 0;

            // Landing
            if (g.y <= sy) {
                g.y  = sy;
                g.vy *= -p.restitution;
                g.vx *= 0.6;
                g.vz *= 0.6;
                if (Math.abs(g.vy) < 0.8) {
                    g.airborne = false;
                    g.vy = 0;
                    // Reptation: chance to immediately relaunch with
                    // reduced energy — simulates splash effect
                    const wind2 = ws ? ws.evaluate(g.x, g.y, g.z, t) : { x: 0, y: 0, z: 0 };
                    const ws2   = Math.sqrt(wind2.x*wind2.x + wind2.z*wind2.z);
                    if (ws2 > p.launchThreshold * 0.5 && Math.random() < 0.3) {
                        this._launchGrain(g, wind2, ws2, 0.5); // half-energy relaunch
                    }
                }
            }

            // Ceiling
            if (terrain && g.y > sy + p.maxHopHeight) {
                g.y = sy + p.maxHopHeight;
                g.vy = 0;
            }

        } else {
            // On surface — wait for strong enough wind to launch
            const sy   = terrain ? terrain.getHeightAt(g.x, g.z) : 0;
            g.y        = sy;
            const wind = ws ? ws.evaluate(g.x, sy, g.z, t) : { x: 0, y: 0, z: 0 };
            const windSpd = Math.sqrt(wind.x*wind.x + wind.z*wind.z);

            // Slow surface creep while waiting
            if (windSpd > p.launchThreshold * 0.5) {
                g.x += wind.x * 0.04 * dt;
                g.z += wind.z * 0.04 * dt;
            }

            // Launch probability — scales with wind excess above threshold
            const excess    = Math.max(0, windSpd - p.launchThreshold);
            const launchProb = Math.min(0.9, excess * 0.2 * dt);
            if (excess > 0 && Math.random() < launchProb) {
                this._launchGrain(g, wind, windSpd, 1.0);
            }
        }

        // Bounds respawn from upwind edge
        this._checkBounds(g);
    }

    _launchGrain(g, wind, windSpd, energyScale) {
        const p    = this._params;
        const rad  = Math.atan2(wind.z, wind.x);
        const spread = (Math.random() - 0.5) * p.launchSpread;
        const angle  = rad + spread;

        const launchRad  = p.launchAngle * Math.PI / 180;
        const horizSpeed = p.launchSpeed * (0.5 + Math.random() * 0.5) * energyScale;
        // Vertical: tan(launchAngle) × horizontal
        const vertSpeed  = horizSpeed * Math.tan(launchRad) * (0.7 + Math.random() * 0.6);

        g.vx       = Math.cos(angle) * horizSpeed;
        g.vz       = Math.sin(angle) * horizSpeed;
        g.vy       = vertSpeed;
        g.airborne = true;
    }

    _stepCreep(g, dt, t, terrain, ws) {
        const p    = this._params;
        const wind = ws ? ws.evaluate(g.x, g.y, g.z, t) : { x: 0, y: 0, z: 0 };
        const windSpd = Math.sqrt(wind.x*wind.x + wind.z*wind.z);

        if (windSpd > p.creepThreshold) {
            g.x += wind.x * p.creepSpeed * dt;
            g.z += wind.z * p.creepSpeed * dt;
        }

        const sy = terrain ? terrain.getHeightAt(g.x, g.z) : 0;
        g.y = sy + 0.3 + Math.random() * 0.5; // just above surface with micro-jitter

        this._checkBounds(g);
    }

    _stepAvalanche(g, dt, terrain, ws) {
        const p = this._params;

        // Get terrain gradient
        const delta = 1.0;
        const sy    = terrain ? terrain.getHeightAt(g.x, g.z) : 0;
        const syR   = terrain ? terrain.getHeightAt(g.x + delta, g.z)       : 0;
        const syL   = terrain ? terrain.getHeightAt(g.x - delta, g.z)       : 0;
        const syU   = terrain ? terrain.getHeightAt(g.x,         g.z + delta) : 0;
        const syD   = terrain ? terrain.getHeightAt(g.x,         g.z - delta) : 0;

        // Slope vector — steepest descent direction
        const slopeX = (syL - syR) / (2 * delta);
        const slopeZ = (syD - syU) / (2 * delta);
        const slopeMag = Math.sqrt(slopeX*slopeX + slopeZ*slopeZ);

        // Only avalanche if slope exceeds angle of repose
        const slopeAngleDeg = Math.atan(slopeMag) * 180 / Math.PI;
        if (slopeAngleDeg > p.angleOfRepose) {
            // Flow downhill
            g.x += (slopeX / Math.max(slopeMag, 0.001)) * p.avalancheSpeed * dt;
            g.z += (slopeZ / Math.max(slopeMag, 0.001)) * p.avalancheSpeed * dt;
        } else {
            // Reached flat — wait for wind to move upslope or respawn
            const wind = ws ? ws.evaluate(g.x, sy, g.z, 0) : { x: 0, y: 0, z: 0 };
            g.x += wind.x * 0.03 * dt;
            g.z += wind.z * 0.03 * dt;
        }

        g.y = sy + 0.2;
        this._checkBounds(g);
    }

    // ── Geometry write ────────────────────────────────────────────────────────

    _writeGeometry() {
        const all = [...this._saltation, ...this._creep, ...this._avalanche];
        const terrain = this.options.duneTerrain;
        const maxH    = this._params.maxHopHeight;

        for (let i = 0; i < all.length; i++) {
            const g  = all[i];
            const i3 = i * 3;

            this._positions[i3]     = g.x;
            this._positions[i3 + 1] = g.y;
            this._positions[i3 + 2] = g.z;

            const sy  = terrain ? terrain.getHeightAt(g.x, g.z) : 0;
            const hf  = Math.min(1, Math.max(0, (g.y - sy) / Math.max(maxH, 1)));

            this._heights[i]   = hf;
            this._speeds[i]    = Math.min(1, Math.sqrt(g.vx*g.vx + g.vy*g.vy + g.vz*g.vz) / this._params.launchSpeed);

            // Mode-based base color
            const isSalt = i < this._saltation.length;
            const isCreep = i >= this._saltation.length && i < this._saltation.length + this._creep.length;
            // Saltation: warm gold. Creep: slightly cooler. Avalanche: darker.
            if (isSalt) {
                this._colors[i3]     = 0.74; // 190/255
                this._colors[i3 + 1] = 0.56; // 142/255
                this._colors[i3 + 2] = 0.27; //  68/255
            } else if (isCreep) {
                this._colors[i3]     = 0.67;
                this._colors[i3 + 1] = 0.50;
                this._colors[i3 + 2] = 0.24;
            } else {
                this._colors[i3]     = 0.60;
                this._colors[i3 + 1] = 0.44;
                this._colors[i3 + 2] = 0.20;
            }

            // Alpha: full for saltation, slightly less for creep
            const uOpacity  = this.mat?.uniforms.u_opacity?.value ?? this._params.opacity;
            const baseAlpha = isSalt ? uOpacity : uOpacity * 0.7;
            this._alphas[i] = baseAlpha * (0.5 + 0.5 * (isSalt && g.airborne ? 1.0 : 0.3));
        }

        this._posAttr.needsUpdate    = true;
        this._heightAttr.needsUpdate = true;
        this._speedAttr.needsUpdate  = true;
        this._colorAttr.needsUpdate  = true;
        this._alphaAttr.needsUpdate  = true;
    }

    // ── Spawn ─────────────────────────────────────────────────────────────────

    _spawnAll() {
        const terrain = this.options.duneTerrain;
        const ws      = this.options.windSystem;
        const p       = this._params;

        this._saltation = [];
        for (let i = 0; i < p.numSaltation; i++) {
            const g = this._spawnAtWeightedPosition();
            g.vx = g.vy = g.vz = 0;
            g.airborne = Math.random() < 0.25;
            if (g.airborne) {
                g.vy = Math.random() * p.launchSpeed * 0.4;
                g.vx = (Math.random() - 0.5) * p.launchSpeed * 0.5;
                g.vz = (Math.random() - 0.5) * p.launchSpeed * 0.5;
                g.y += Math.random() * p.maxHopHeight * 0.5;
            }
            this._saltation.push(g);
        }

        this._creep = [];
        for (let i = 0; i < p.numCreep; i++) {
            const g = this._spawnAtWeightedPosition();
            g.vx = g.vy = g.vz = 0;
            g.airborne = false;
            this._creep.push(g);
        }

        this._avalanche = [];
        for (let i = 0; i < p.numAvalanche; i++) {
            // Avalanche particles spawn on steep terrain
            const g = this._spawnOnSlipFace();
            g.vx = g.vy = g.vz = 0;
            g.airborne = false;
            this._avalanche.push(g);
        }
    }

    // Spawn at position weighted by spawn map — crests get more particles
    _spawnAtWeightedPosition() {
        const terrain = this.options.duneTerrain;
        const half    = this.options.fieldSize * 0.5;

        if (!this._spawnMap) {
            const x = (Math.random() - 0.5) * this.options.fieldSize;
            const z = (Math.random() - 0.5) * this.options.fieldSize;
            const y = terrain ? terrain.getHeightAt(x, z) : 0;
            return { x, y, z, vx: 0, vy: 0, vz: 0, airborne: false };
        }

        // Rejection sampling against spawn map
        let x, z, y;
        for (let attempt = 0; attempt < 20; attempt++) {
            x = (Math.random() - 0.5) * this.options.fieldSize;
            z = (Math.random() - 0.5) * this.options.fieldSize;
            const weight = this._sampleSpawnMap(x, z);
            if (Math.random() < weight) break;
        }
        y = terrain ? terrain.getHeightAt(x, z) : 0;
        return { x, y, z, vx: 0, vy: 0, vz: 0, airborne: false };
    }

    _spawnOnSlipFace() {
        const terrain = this.options.duneTerrain;
        const half    = this.options.fieldSize * 0.5;

        // Try to find a steep point
        for (let attempt = 0; attempt < 30; attempt++) {
            const x = (Math.random() - 0.5) * this.options.fieldSize;
            const z = (Math.random() - 0.5) * this.options.fieldSize;
            if (!terrain) return { x, y: 0, z, vx: 0, vy: 0, vz: 0, airborne: false };

            const d  = 2.0;
            const sy = terrain.getHeightAt(x, z);
            const sR = terrain.getHeightAt(x+d, z);
            const sL = terrain.getHeightAt(x-d, z);
            const sU = terrain.getHeightAt(x, z+d);
            const sD = terrain.getHeightAt(x, z-d);
            const sx = (sL - sR) / (2*d);
            const sz = (sD - sU) / (2*d);
            const slope = Math.sqrt(sx*sx + sz*sz);
            const angleDeg = Math.atan(slope) * 180 / Math.PI;

            if (angleDeg > this._params.angleOfRepose * 0.7) {
                return { x, y: sy, z, vx: 0, vy: 0, vz: 0, airborne: false };
            }
        }

        // Fallback
        const x = (Math.random() - 0.5) * this.options.fieldSize;
        const z = (Math.random() - 0.5) * this.options.fieldSize;
        const y = terrain ? terrain.getHeightAt(x, z) : 0;
        return { x, y, z, vx: 0, vy: 0, vz: 0, airborne: false };
    }

    // ── Spawn map ─────────────────────────────────────────────────────────────

    _rebuildSpawnMap() {
        const terrain = this.options.duneTerrain;
        const ws      = this.options.windSystem;
        if (!terrain) return;

        const res  = this._spawnMapRes;
        const size = this.options.fieldSize;
        this._spawnMap = new Float32Array(res * res);

        let maxW = 0;
        for (let iz = 0; iz < res; iz++) {
            for (let ix = 0; ix < res; ix++) {
                const wx = (ix / (res-1) - 0.5) * size;
                const wz = (iz / (res-1) - 0.5) * size;
                const sy = terrain.getHeightAt(wx, wz);

                // Sample height at neighbors for slope
                const d  = size / res;
                const hR = terrain.getHeightAt(wx+d, wz);
                const hL = terrain.getHeightAt(wx-d, wz);
                const hU = terrain.getHeightAt(wx, wz+d);
                const hD = terrain.getHeightAt(wx, wz-d);
                const sx = (hR - hL) / (2*d);
                const sz = (hU - hD) / (2*d);
                const slope = Math.sqrt(sx*sx + sz*sz);

                // Wind speed at this surface point
                const windV = ws ? ws.evaluate(wx, sy, wz, 0) : { x: 8, y: 0, z: 0 };
                const windSpd = Math.sqrt(windV.x*windV.x + windV.z*windV.z);

                // Weight: wind speed × height (crests) + slope bonus (edges)
                const heightNorm = sy / Math.max(terrain._params?.duneHeight ?? 80, 1);
                let w = windSpd * (0.4 + 0.6 * heightNorm);
                w    += slope * 20; // slope adds extra spawn weight
                w     = Math.max(0, w);

                this._spawnMap[iz * res + ix] = w;
                if (w > maxW) maxW = w;
            }
        }

        // Normalize
        if (maxW > 0) {
            for (let i = 0; i < this._spawnMap.length; i++) {
                this._spawnMap[i] /= maxW;
                // Push toward crests — soften low-weight areas
                this._spawnMap[i] = Math.pow(this._spawnMap[i], 0.5);
            }
        }
    }

    _sampleSpawnMap(wx, wz) {
        if (!this._spawnMap) return 0.5;
        const res  = this._spawnMapRes;
        const size = this.options.fieldSize;
        const u    = (wx / size + 0.5) * (res - 1);
        const v    = (wz / size + 0.5) * (res - 1);
        const ix   = Math.max(0, Math.min(res-2, Math.floor(u)));
        const iz   = Math.max(0, Math.min(res-2, Math.floor(v)));
        const fx   = u - ix, fz = v - iz;
        return (
            this._spawnMap[iz*res+ix]     * (1-fx)*(1-fz) +
            this._spawnMap[iz*res+ix+1]   *    fx *(1-fz) +
            this._spawnMap[(iz+1)*res+ix] * (1-fx)*   fz  +
            this._spawnMap[(iz+1)*res+ix+1]*   fx *   fz
        );
    }

    // ── Bounds ────────────────────────────────────────────────────────────────

    _checkBounds(g) {
        const half = this.options.fieldSize * 0.5 * 0.98;
        if (Math.abs(g.x) > half || Math.abs(g.z) > half) {
            const terrain = this.options.duneTerrain;
            const ws      = this.options.windSystem;

            // Respawn at weighted position on upwind edge
            if (ws) {
                const rad  = ws._params.direction * Math.PI / 180;
                const wdx  = Math.cos(rad), wdz = Math.sin(rad);
                const perp = (Math.random() - 0.5) * this.options.fieldSize;
                const edge = half * 0.9;
                g.x = -wdx * edge + (-wdz) * perp;
                g.z = -wdz * edge + ( wdx) * perp;
                g.x = Math.max(-half, Math.min(half, g.x));
                g.z = Math.max(-half, Math.min(half, g.z));
            } else {
                g.x = (Math.random() - 0.5) * this.options.fieldSize;
                g.z = (Math.random() - 0.5) * this.options.fieldSize;
            }
            g.y        = terrain ? terrain.getHeightAt(g.x, g.z) : 0;
            g.vx = g.vy = g.vz = 0;
            g.airborne = false;
        }
    }

    // ── Geometry ──────────────────────────────────────────────────────────────

    _buildGeometry(total) {
        this._positions = new Float32Array(total * 3);
        this._heights   = new Float32Array(total);
        this._speeds    = new Float32Array(total);
        this._colors    = new Float32Array(total * 3);
        this._alphas    = new Float32Array(total);

        const geo = new THREE.BufferGeometry();
        this._posAttr    = new THREE.BufferAttribute(this._positions, 3);
        this._heightAttr = new THREE.BufferAttribute(this._heights,   1);
        this._speedAttr  = new THREE.BufferAttribute(this._speeds,    1);
        this._colorAttr  = new THREE.BufferAttribute(this._colors,    3);
        this._alphaAttr  = new THREE.BufferAttribute(this._alphas,    1);

        this._posAttr.setUsage(THREE.DynamicDrawUsage);
        this._heightAttr.setUsage(THREE.DynamicDrawUsage);
        this._speedAttr.setUsage(THREE.DynamicDrawUsage);
        this._colorAttr.setUsage(THREE.DynamicDrawUsage);
        this._alphaAttr.setUsage(THREE.DynamicDrawUsage);

        geo.setAttribute('position',    this._posAttr);
        geo.setAttribute('aHeightFrac', this._heightAttr);
        geo.setAttribute('aSpeed',      this._speedAttr);
        geo.setAttribute('aColor',      this._colorAttr);
        geo.setAttribute('aAlpha',      this._alphaAttr);

        this.mesh_geo = geo;
    }

    _rebuild() {
        if (!this.mesh) return;
        const total = this._params.numSaltation
                    + this._params.numCreep
                    + this._params.numAvalanche;
        this._buildGeometry(total);
        this.mesh.geometry.dispose();
        this.mesh.geometry = this.mesh_geo;
        this._firstFrame   = true;
    }
}