window.WindVisualizer = class WindVisualizer extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Wind Visualizer';
        this.options = {
            windSystem: null,
            fieldSize:  600.0,
            ...options,
        };

        this._params = {
            numParticles:  300,
            trailLength:   30,
            speedBase:     40.0,    // base travel speed world units/s
            speedResponse: 0.7,     // 0=ignore wind magnitude, 1=fully wind-driven
            speedNormRef:  30.0,    // wind magnitude considered "normal" — auto-set by EMA
            minHeight:     5.0,
            maxHeight:     200.0,
            numSides:      8,
            lineWidth:     1.5,
            opacity:       0.7,
            tailOpacity:   0.0,
            colorMode:     'speed', // 'speed' | 'height' | 'flat'
            slowColor:     { r: 50,  g: 100, b: 255 },
            fastColor:     { r: 255, g: 80,  b: 20  },
            color:         { r: 255, g: 255, b: 255 },
        };

        this._particles         = [];
        this._lastTime          = null;
        this._bindings          = [];
        this._numSides          = this._params.numSides;
        this._vertsPerSeg       = 0;
        this._maxObservedSpeed  = 1.0;   // rolling EMA for auto color scaling
        this._refSpeedSample    = 1.0;   // frame-level reference for speed normalization

        // Add to constructor:
        this._vfParams = {
            enabled:      true,
            gridRes:      20,
            heightLevels: 3,
            arrowScale:   1.0,
            normalizeLen: true,
            headSize:     0.25,
            lineWidth:    1.5,        // ← new
            colorMode:    'speed',
            slowColor:    { r: 50,  g: 100, b: 255 },
            fastColor:    { r: 255, g: 80,  b: 20  },
            color:        { r: 255, g: 255, b: 255 },
            opacity:      0.5,
        };
        this._vfMesh     = null;
        this._vfPositions = null;
        this._vfColors    = null;
        this._vfPosAttr   = null;
        this._vfColAttr   = null;
        this._maxVFSpeed  = 1.0; // EMA for auto color scaling
    }

    async load(ctx) {
        this._numSides = this._params.numSides;
        this._buildGeometry();
        this._spawnAll();

        this.mat = new THREE.ShaderMaterial({
            transparent:         true,
            depthWrite:          true,
            depthTest:           true,
            blending:            THREE.NormalBlending,
            side:                THREE.DoubleSide,
            polygonOffset:       true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits:  1,
            uniforms: {
                u_lineWidth:  { value: this._params.lineWidth },
                u_resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
            },
            vertexShader: `
                attribute vec3  aPointA;
                attribute vec3  aPointB;
                attribute float aIsB;
                attribute float aCornerAngle;
                attribute float aRadius;
                attribute vec3  aColor;
                attribute float aAlpha;

                uniform float u_lineWidth;
                uniform vec2  u_resolution;

                varying vec3  vColor;
                varying float vAlpha;

                void main() {
                    vec3 basePos = aIsB > 0.5 ? aPointB : aPointA;

                    vec3 segDir  = normalize(aPointB - aPointA + vec3(0.0001, 0.0, 0.0));
                    vec3 worldUp = abs(segDir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
                    vec3 basisX  = normalize(cross(segDir, worldUp));
                    vec3 basisY  = normalize(cross(basisX, segDir));

                    vec3 expand  = basisX * cos(aCornerAngle) + basisY * sin(aCornerAngle);

                    vec4 clipPos  = projectionMatrix * modelViewMatrix * vec4(basePos, 1.0);
                    float worldPx = clipPos.w * 2.0 / (projectionMatrix[1][1] * u_resolution.y);
                    float radius  = u_lineWidth * worldPx * 0.5;

                    vec3 finalPos = basePos + expand * aRadius * radius;
                    gl_Position   = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);

                    vColor = aColor;
                    vAlpha = aAlpha;
                }
            `,
            fragmentShader: `
                varying vec3  vColor;
                varying float vAlpha;
                void main() {
                    gl_FragColor = vec4(vColor, vAlpha);
                }
            `,
        });

        this.mesh = new THREE.Mesh(this.mesh_geo, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh_geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Infinity);
        this.mesh_geo.boundingBox    = new THREE.Box3(
            new THREE.Vector3(-Infinity, -Infinity, -Infinity),
            new THREE.Vector3( Infinity,  Infinity,  Infinity)
        );
        ctx.scene.add(this.mesh);

        this._buildVFGeometry();
        this._vfMesh.visible = this._vfParams.enabled;
        ctx.scene.add(this._vfMesh);
        this._ctx = ctx; // store for _rebuildVF
    }

    setupGui(folder, ctx) {
        const p = this._params;
        const pf = folder.addFolder({ title: 'Particles', expanded: true });
        this._bindings = [
            pf.addBinding(p, 'numParticles',  { label: 'Particles',       min: 10,  max: 1000, step: 10   }).on('change', () => this._rebuild()),
            pf.addBinding(p, 'trailLength',   { label: 'Trail Length',    min: 2,   max: 80,   step: 1    }).on('change', () => this._rebuild()),
            pf.addBinding(p, 'speedBase',     { label: 'Speed Base',      min: 0.5, max: 200,  step: 0.5  }),
            pf.addBinding(p, 'speedResponse', { label: 'Speed Response',  min: 0,   max: 1,    step: 0.01 }),
            pf.addBinding(p, 'minHeight',     { label: 'Min Height',      min: 0,   max: 50,   step: 0.5  }),
            pf.addBinding(p, 'maxHeight',     { label: 'Max Height',      min: 10,  max: 500,  step: 5    }),
            pf.addBinding(p, 'numSides',      { label: 'Cylinder Sides',  min: 3,   max: 16,   step: 1    }).on('change', () => { this._numSides = p.numSides; this._rebuild(); }),
            pf.addBinding(p, 'lineWidth',     { label: 'Line Width',      min: 0.5, max: 20,   step: 0.5  }).on('change', ({ value }) => { if (this.mat) this.mat.uniforms.u_lineWidth.value = value; }),
            pf.addBinding(p, 'opacity',       { label: 'Opacity',         min: 0,   max: 1,    step: 0.01 }),
            pf.addBinding(p, 'tailOpacity',   { label: 'Tail Opacity',    min: 0,   max: 1,    step: 0.01 }),
            pf.addBinding(p, 'colorMode', {
                label: 'Color Mode',
                options: { Speed: 'speed', Height: 'height', Flat: 'flat' },
            }),
            pf.addBinding(p, 'slowColor',  { label: 'Low Color'  }),
            pf.addBinding(p, 'fastColor',  { label: 'High Color' }),
            pf.addBinding(p, 'color',      { label: 'Flat Color' }),
        ];
        this.setupVFGui(folder);
    }

    collectParams() { 
        return { 
            ...this._params,
            vf: { ...this._vfParams }
        }; 
    }

    applyParams(data) {
        const { vf, ...rest } = data;
        const needsRebuild = data.numParticles !== this._params.numParticles ||
                             data.trailLength  !== this._params.trailLength  ||
                             data.numSides     !== this._params.numSides;
        Object.assign(this._params, data);
        this._numSides = this._params.numSides;
        if (this.mat) this.mat.uniforms.u_lineWidth.value = this._params.lineWidth;
        if (needsRebuild) this._rebuild();
        if (vf) {
            const needsVFRebuild = vf.gridRes !== this._vfParams.gridRes ||
                                vf.heightLevels !== this._vfParams.heightLevels;
            Object.assign(this._vfParams, vf);
            if (this._vfMesh) this._vfMesh.visible = this._vfParams.enabled;
            if (needsVFRebuild) this._rebuildVF(this._ctx);
        }
        for (const b of this._bindings) b.refresh();
    }

    preFrame(ctx) {
        const t  = ctx.clock.getElapsedTime();
        const dt = this._lastTime === null ? 0.016 : Math.min(t - this._lastTime, 0.05);
        this._lastTime = t;

        if (this.mat) this.mat.uniforms.u_resolution.value.set(innerWidth, innerHeight);

        const ns  = this._numSides;
        const vps = this._vertsPerSeg;
        const {
            trailLength, speedBase, speedResponse,
            minHeight, maxHeight, opacity, tailOpacity,
            colorMode, slowColor, fastColor, color,
        } = this._params;
        const segs = trailLength - 1;

        // ── Frame-level reference speed ────────────────────────────────────────
        // Sample wind at mid-height to get a representative magnitude this frame.
        // Used to normalize per-particle speed so speedResponse is calibrated
        // to current wind settings, not an arbitrary manual param.
        {
            const midY  = (minHeight + maxHeight) * 0.5;
            const sv    = this._field(0, midY, 0, t);
            const smag  = Math.sqrt(sv.x*sv.x + sv.y*sv.y + sv.z*sv.z) + 0.001;
            // Slow EMA — adapts over ~200 frames
            this._refSpeedSample = this._refSpeedSample * 0.995 + smag * 0.005;
        }

        for (let pi = 0; pi < this._particles.length; pi++) {
            const p = this._particles[pi];

            // ── Step particle ────────────────────────────────────────────────
            const v   = this._field(p.x, p.y, p.z, t);
            const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z) + 0.0001;
            p.speed   = len;

            // Update rolling max for auto color scaling
            this._maxObservedSpeed = this._maxObservedSpeed * 0.998 + len * 0.002;

            // Speed: blend fixed base with wind-magnitude-modulated speed
            const windFactor  = Math.min(len / Math.max(this._refSpeedSample, 0.001), 3.0);
            const actualSpeed = speedBase * (1.0 - speedResponse + speedResponse * windFactor);

            p.x += (v.x / len) * actualSpeed * dt;
            p.y += (v.y / len) * actualSpeed * dt;
            p.z += (v.z / len) * actualSpeed * dt;

            // ── Bounds check → smooth fade out ───────────────────────────────
            const oob = Math.abs(p.x) > this.options.fieldSize * 0.6 ||
                        Math.abs(p.z) > this.options.fieldSize * 0.6 ||
                        p.y < minHeight || p.y > maxHeight;

            if (oob && !p.dying) p.dying = true;

            if (p.dying) {
                p.fadeOut = Math.max(0, (p.fadeOut ?? 1.0) - dt * 3.0);
                if (p.fadeOut <= 0) this._resetParticle(p);
            }

            // ── History ───────────────────────────────────────────────────────
            p.history.unshift({ x: p.x, y: p.y, z: p.z });

            // Adaptive trail: fast wind → shorter history (covers more distance per step)
            const speedRatio     = Math.min(p.speed / Math.max(this._maxObservedSpeed, 0.001), 1.0);
            const effectiveTrail = Math.round(trailLength * (1.0 - speedRatio * 0.6));
            if (p.history.length > trailLength) p.history.length = trailLength;

            // ── Color ─────────────────────────────────────────────────────────
            let r, g, b;
            if (colorMode === 'speed') {
                // Auto-scaled: always uses full ramp over observed speed range
                const spd = Math.min(p.speed / Math.max(this._maxObservedSpeed, 0.001), 1.0);
                r = (slowColor.r + (fastColor.r - slowColor.r) * spd) / 255;
                g = (slowColor.g + (fastColor.g - slowColor.g) * spd) / 255;
                b = (slowColor.b + (fastColor.b - slowColor.b) * spd) / 255;
            } else if (colorMode === 'height') {
                // Shows boundary layer profile directly — low/high color maps to weak/strong wind
                const ws  = this.options.windSystem;
                const blV = ws ? ws.boundaryLayerAt(p.y) : Math.min(p.y / maxHeight, 1);
                const blC = Math.max(0, Math.min(1, blV));
                r = (slowColor.r + (fastColor.r - slowColor.r) * blC) / 255;
                g = (slowColor.g + (fastColor.g - slowColor.g) * blC) / 255;
                b = (slowColor.b + (fastColor.b - slowColor.b) * blC) / 255;
            } else {
                r = color.r / 255;
                g = color.g / 255;
                b = color.b / 255;
            }

            const fadeOut = p.dying ? (p.fadeOut ?? 1.0) : 1.0;

            // ── Precompute cumulative distances for distance-based fade ────────
            let totalDist = 0;
            const dists   = [0];
            const hlen    = p.history.length;
            for (let s = 0; s < hlen - 1; s++) {
                const hA = p.history[s], hB = p.history[s + 1];
                const d  = Math.sqrt(
                    (hA.x-hB.x)**2 + (hA.y-hB.y)**2 + (hA.z-hB.z)**2
                );
                totalDist += d;
                dists.push(totalDist);
            }

            // ── Write geometry ────────────────────────────────────────────────
            for (let s = 0; s < segs; s++) {
                const segBase = (pi * segs + s) * vps;

                if (s >= hlen - 1) {
                    for (let k = 0; k < vps; k++) {
                        const i3 = (segBase + k) * 3;
                        this._attrA[i3]     = this._attrA[i3+1]     = this._attrA[i3+2]     = 0;
                        this._attrB[i3]     = this._attrB[i3+1]     = this._attrB[i3+2]     = 0;
                        this._attrColor[i3] = this._attrColor[i3+1] = this._attrColor[i3+2] = 0;
                        this._attrAlpha[segBase + k] = 0;
                    }
                    continue;
                }

                const hA = p.history[s];
                const hB = p.history[s + 1];

                // Distance-based fade — more accurate than index-based for variable speed
                const tA = totalDist > 0 ? dists[s]   / totalDist : s / segs;
                const tB = totalDist > 0 ? dists[s+1] / totalDist : (s + 1) / segs;

                // Soft adaptive trail fade — no pop when effectiveTrail changes
                const softFadeA = Math.max(0, Math.min(1, (effectiveTrail - s)       / 3.0));
                const softFadeB = Math.max(0, Math.min(1, (effectiveTrail - (s + 1)) / 3.0));

                const alphaA = opacity * (1.0 - tA * (1.0 - tailOpacity)) * fadeOut * softFadeA;
                const alphaB = opacity * (1.0 - tB * (1.0 - tailOpacity)) * fadeOut * softFadeB;

                for (let k = 0; k < vps; k++) {
                    const i3 = (segBase + k) * 3;
                    this._attrA[i3]     = hA.x; this._attrA[i3+1]     = hA.y; this._attrA[i3+2]     = hA.z;
                    this._attrB[i3]     = hB.x; this._attrB[i3+1]     = hB.y; this._attrB[i3+2]     = hB.z;
                    this._attrColor[i3] = r;     this._attrColor[i3+1] = g;     this._attrColor[i3+2] = b;
                }

                for (let n = 0; n < ns; n++) {
                    const qb = segBase + n * 4;
                    this._attrAlpha[qb]     = alphaA;
                    this._attrAlpha[qb + 1] = alphaA;
                    this._attrAlpha[qb + 2] = alphaB;
                    this._attrAlpha[qb + 3] = alphaB;
                }

                const capABase = segBase + ns * 4;
                for (let k = 0; k < ns + 1; k++) this._attrAlpha[capABase + k] = alphaA;

                const capBBase = capABase + ns + 1;
                for (let k = 0; k < ns + 1; k++) this._attrAlpha[capBBase + k] = alphaB;
            }
        }

        this._updateVF(t);

        this._bufA.needsUpdate     = true;
        this._bufB.needsUpdate     = true;
        this._bufColor.needsUpdate = true;
        this._bufAlpha.needsUpdate = true;
    }

    draw(ctx) {}

    dispose(ctx) {
        this.mesh.geometry.dispose();
        this.mat.dispose();
        ctx.scene.remove(this.mesh);
        for (const b of this._bindings) b.dispose();
        if (this._vfMesh) {
            this._vfMesh.geometry.dispose();
            this._vfMat?.dispose();
            ctx.scene.remove(this._vfMesh);
        }
    }

    // ── Geometry ──────────────────────────────────────────────────────────────

    _buildGeometry() {
        const { numParticles, trailLength } = this._params;
        const ns            = this._numSides;
        const segs          = trailLength - 1;
        const totalSegs     = numParticles * segs;
        const vertsPerSeg   = ns * 4 + (ns + 1) * 2;
        const indicesPerSeg = ns * 6 + ns * 6;
        const totalVerts    = totalSegs * vertsPerSeg;
        const IndexArray    = totalVerts > 65535 ? Uint32Array : Uint16Array;

        this._vertsPerSeg = vertsPerSeg;

        this._attrA     = new Float32Array(totalVerts * 3);
        this._attrB     = new Float32Array(totalVerts * 3);
        this._attrColor = new Float32Array(totalVerts * 3);
        this._attrAlpha = new Float32Array(totalVerts);

        const isBArr       = new Float32Array(totalVerts);
        const cornerAngles = new Float32Array(totalVerts);
        const radiusArr    = new Float32Array(totalVerts);
        const indices      = new IndexArray(totalSegs * indicesPerSeg);

        let vi = 0, ii = 0;

        for (let s = 0; s < totalSegs; s++) {

            // Sides
            for (let n = 0; n < ns; n++) {
                const a0 = (n / ns) * Math.PI * 2.0;
                const a1 = ((n + 1) / ns) * Math.PI * 2.0;
                const v0 = vi;
                isBArr[vi] = 0; cornerAngles[vi] = a0; radiusArr[vi] = 1; vi++;
                isBArr[vi] = 0; cornerAngles[vi] = a1; radiusArr[vi] = 1; vi++;
                isBArr[vi] = 1; cornerAngles[vi] = a0; radiusArr[vi] = 1; vi++;
                isBArr[vi] = 1; cornerAngles[vi] = a1; radiusArr[vi] = 1; vi++;
                indices[ii++] = v0;     indices[ii++] = v0+1; indices[ii++] = v0+2;
                indices[ii++] = v0+1;   indices[ii++] = v0+3; indices[ii++] = v0+2;
            }

            // Cap A
            const capA = vi;
            isBArr[vi] = 0; cornerAngles[vi] = 0; radiusArr[vi] = 0; vi++;
            for (let n = 0; n < ns; n++) {
                isBArr[vi] = 0; cornerAngles[vi] = (n/ns)*Math.PI*2; radiusArr[vi] = 1; vi++;
            }
            for (let n = 0; n < ns; n++) {
                indices[ii++] = capA;
                indices[ii++] = capA + 1 + n;
                indices[ii++] = capA + 1 + (n+1) % ns;
            }

            // Cap B
            const capB = vi;
            isBArr[vi] = 1; cornerAngles[vi] = 0; radiusArr[vi] = 0; vi++;
            for (let n = 0; n < ns; n++) {
                isBArr[vi] = 1; cornerAngles[vi] = (n/ns)*Math.PI*2; radiusArr[vi] = 1; vi++;
            }
            for (let n = 0; n < ns; n++) {
                indices[ii++] = capB;
                indices[ii++] = capB + 1 + n;
                indices[ii++] = capB + 1 + (n+1) % ns;
            }
        }

        const geo = new THREE.BufferGeometry();
        this._bufA     = new THREE.BufferAttribute(this._attrA,     3);
        this._bufB     = new THREE.BufferAttribute(this._attrB,     3);
        this._bufColor = new THREE.BufferAttribute(this._attrColor, 3);
        this._bufAlpha = new THREE.BufferAttribute(this._attrAlpha, 1);
        this._bufA.setUsage(THREE.DynamicDrawUsage);
        this._bufB.setUsage(THREE.DynamicDrawUsage);
        this._bufColor.setUsage(THREE.DynamicDrawUsage);
        this._bufAlpha.setUsage(THREE.DynamicDrawUsage);

        geo.setAttribute('position',     new THREE.BufferAttribute(new Float32Array(totalVerts * 3), 3));
        geo.setAttribute('aPointA',      this._bufA);
        geo.setAttribute('aPointB',      this._bufB);
        geo.setAttribute('aIsB',         new THREE.BufferAttribute(isBArr,       1));
        geo.setAttribute('aCornerAngle', new THREE.BufferAttribute(cornerAngles, 1));
        geo.setAttribute('aRadius',      new THREE.BufferAttribute(radiusArr,    1));
        geo.setAttribute('aColor',       this._bufColor);
        geo.setAttribute('aAlpha',       this._bufAlpha);
        geo.setIndex(new THREE.BufferAttribute(indices, 1));

        this.mesh_geo = geo;
    }

    _spawnAll() {
        const seeds = this._poissonSeed();
        this._particles = seeds.map(seed => ({
            ...seed,
            speed:   0,
            dying:   false,
            fadeOut: 1.0,
            history: [{ x: seed.x, y: seed.y, z: seed.z }],
            age:     Math.random() * this._params.trailLength,
        }));
    }

    _poissonSeed() {
        const pts     = [];
        const minDist = this.options.fieldSize / Math.sqrt(this._params.numParticles) * 0.8;
        const maxTries = this._params.numParticles * 30;
        let   tries   = 0;

        while (pts.length < this._params.numParticles && tries < maxTries) {
            tries++;
            const x = (Math.random() - 0.5) * this.options.fieldSize;
            const y = this._randomHeight();
            const z = (Math.random() - 0.5) * this.options.fieldSize;
            let ok = true;
            for (const p of pts) {
                const dx = p.x - x, dz = p.z - z;
                const dy = (p.y - y) * 0.1; // weight Y less than XZ
                if (dx*dx + dz*dz + dy*dy < minDist * minDist) { ok = false; break; }
            }
            if (ok) pts.push({ x, y, z });
        }

        // Fallback fill if Poisson exhausts attempts
        while (pts.length < this._params.numParticles) {
            pts.push({
                x: (Math.random() - 0.5) * this.options.fieldSize,
                y: this._randomHeight(),
                z: (Math.random() - 0.5) * this.options.fieldSize,
            });
        }
        return pts;
    }

    _randomHeight() {
        const { minHeight, maxHeight } = this._params;
        // Exponential distribution — denser near ground where wind changes are most interesting
        const decay = 2.5;
        const u     = Math.random();
        return minHeight + (maxHeight - minHeight) * (1 - Math.exp(-decay * u)) / (1 - Math.exp(-decay));
    }

    _resetParticle(p) {
        p.x       = (Math.random() - 0.5) * this.options.fieldSize;
        p.y       = this._randomHeight();
        p.z       = (Math.random() - 0.5) * this.options.fieldSize;
        p.history = [{ x: p.x, y: p.y, z: p.z }];
        p.speed   = 0;
        p.dying   = false;
        p.fadeOut = 1.0;
    }

    _rebuild() {
        if (!this.mesh) return;
        this._buildGeometry();
        this.mesh_geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Infinity);
        this.mesh_geo.boundingBox    = new THREE.Box3(
            new THREE.Vector3(-Infinity, -Infinity, -Infinity),
            new THREE.Vector3( Infinity,  Infinity,  Infinity)
        );
        this.mesh.geometry.dispose();
        this.mesh.geometry = this.mesh_geo;
        this._spawnAll();
    }

    _field(x, y, z, t) {
        if (this.options.windSystem) return this.options.windSystem.evaluate(x, y, z, t);
        return { x: 0, y: 0, z: 0 };
    }

    // ── Vector Field ──────────────────────────────────────────────────────────────

    _buildVFGeometry() {
        const { gridRes, heightLevels } = this._vfParams;
        const totalArrows    = gridRes * gridRes * heightLevels;
        const SEGS_PER_ARROW = 3;   // shaft + head-left + head-right
        const VERTS_PER_SEG  = 4;   // billboard quad
        const totalVerts     = totalArrows * SEGS_PER_ARROW * VERTS_PER_SEG;
        const IndexArray     = totalVerts > 65535 ? Uint32Array : Uint16Array;

        this._vfAttrA     = new Float32Array(totalVerts * 3);
        this._vfAttrB     = new Float32Array(totalVerts * 3);
        this._vfAttrColor = new Float32Array(totalVerts * 3);
        this._vfAttrAlpha = new Float32Array(totalVerts);

        // Static per-vertex attributes
        const sides   = new Float32Array(totalVerts);
        const isBArr  = new Float32Array(totalVerts);
        const indices = new IndexArray(totalArrows * SEGS_PER_ARROW * 6);

        let vi = 0, ii = 0;
        const totalSegs = totalArrows * SEGS_PER_ARROW;

        for (let s = 0; s < totalSegs; s++) {
            const v0 = vi;
            sides[vi] = -1; isBArr[vi] = 0; vi++;
            sides[vi] = +1; isBArr[vi] = 0; vi++;
            sides[vi] = -1; isBArr[vi] = 1; vi++;
            sides[vi] = +1; isBArr[vi] = 1; vi++;

            indices[ii++] = v0;     indices[ii++] = v0+1; indices[ii++] = v0+2;
            indices[ii++] = v0+1;   indices[ii++] = v0+3; indices[ii++] = v0+2;
        }

        const geo = new THREE.BufferGeometry();
        this._vfBufA     = new THREE.BufferAttribute(this._vfAttrA,     3);
        this._vfBufB     = new THREE.BufferAttribute(this._vfAttrB,     3);
        this._vfBufColor = new THREE.BufferAttribute(this._vfAttrColor, 3);
        this._vfBufAlpha = new THREE.BufferAttribute(this._vfAttrAlpha, 1);
        this._vfBufA.setUsage(THREE.DynamicDrawUsage);
        this._vfBufB.setUsage(THREE.DynamicDrawUsage);
        this._vfBufColor.setUsage(THREE.DynamicDrawUsage);
        this._vfBufAlpha.setUsage(THREE.DynamicDrawUsage);

        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(totalVerts * 3), 3));
        geo.setAttribute('aPointA',  this._vfBufA);
        geo.setAttribute('aPointB',  this._vfBufB);
        geo.setAttribute('aSide',    new THREE.BufferAttribute(sides,  1));
        geo.setAttribute('aIsB',     new THREE.BufferAttribute(isBArr, 1));
        geo.setAttribute('aColor',   this._vfBufColor);
        geo.setAttribute('aAlpha',   this._vfBufAlpha);
        geo.setIndex(new THREE.BufferAttribute(indices, 1));

        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), Infinity);
        geo.boundingBox    = new THREE.Box3(
            new THREE.Vector3(-Infinity,-Infinity,-Infinity),
            new THREE.Vector3( Infinity, Infinity, Infinity)
        );

        this._vfMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite:  false,
            depthTest:   true,
            side:        THREE.DoubleSide,
            uniforms: {
                u_lineWidth:  { value: this._vfParams.lineWidth },
                u_resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
            },
            vertexShader: `
                attribute vec3  aPointA;
                attribute vec3  aPointB;
                attribute float aSide;
                attribute float aIsB;
                attribute vec3  aColor;
                attribute float aAlpha;

                uniform float u_lineWidth;
                uniform vec2  u_resolution;

                varying vec3  vColor;
                varying float vAlpha;

                void main() {
                    vec3 basePos = aIsB > 0.5 ? aPointB : aPointA;

                    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(basePos,  1.0);
                    vec4 clipA   = projectionMatrix * modelViewMatrix * vec4(aPointA, 1.0);
                    vec4 clipB   = projectionMatrix * modelViewMatrix * vec4(aPointB, 1.0);

                    vec2 ndcA = clipA.xy / clipA.w;
                    vec2 ndcB = clipB.xy / clipB.w;
                    vec2 dir  = normalize(ndcB - ndcA + vec2(0.0001, 0.0));
                    vec2 perp = vec2(-dir.y, dir.x);
                    perp.x   *= u_resolution.y / u_resolution.x;

                    float halfW    = u_lineWidth / u_resolution.y;
                    gl_Position    = clipPos;
                    gl_Position.xy += perp * aSide * halfW * clipPos.w;

                    vColor = aColor;
                    vAlpha = aAlpha;
                }
            `,
            fragmentShader: `
                varying vec3  vColor;
                varying float vAlpha;
                void main() {
                    gl_FragColor = vec4(vColor, vAlpha);
                }
            `,
        });

        this._vfMesh = new THREE.Mesh(geo, this._vfMat);
        this._vfMesh.frustumCulled = false;
        this._vfMesh.visible       = this._vfParams.enabled;
    }

    _updateVF(t) {
        if (!this._vfMesh?.visible) return;

        const {
            gridRes, heightLevels, arrowScale, normalizeLen, headSize,
            colorMode, slowColor, fastColor, color, opacity, lineWidth,
        } = this._vfParams;

        const fieldSize              = this.options.fieldSize;
        const { minHeight, maxHeight } = this._params;

        const cellSize = fieldSize / Math.max(gridRes - 1, 1);
        const baseLen  = cellSize * 0.45 * arrowScale;

        if (this._vfMat) {
            this._vfMat.uniforms.u_lineWidth.value  = lineWidth;
            this._vfMat.uniforms.u_resolution.value.set(innerWidth, innerHeight);
        }

        let arrowIdx = 0;

        for (let hi = 0; hi < heightLevels; hi++) {
            // Linear spacing — even distribution between min and max height
            const y = heightLevels > 1
                ? minHeight + (maxHeight - minHeight) * (hi / (heightLevels - 1))
                : (minHeight + maxHeight) * 0.5;

            for (let gx = 0; gx < gridRes; gx++) {
                for (let gz = 0; gz < gridRes; gz++) {
                    const ox = ((gx / Math.max(gridRes - 1, 1)) - 0.5) * fieldSize;
                    const oz = ((gz / Math.max(gridRes - 1, 1)) - 0.5) * fieldSize;

                    // Full 3D wind vector at this sample point
                    const v   = this._field(ox, y, oz, t);
                    const mag = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z) + 0.0001;

                    this._maxVFSpeed = this._maxVFSpeed * 0.999 + mag * 0.001;

                    // Normalized direction in full 3D
                    const nx = v.x / mag;
                    const ny = v.y / mag;
                    const nz = v.z / mag;

                    const len = normalizeLen
                        ? baseLen
                        : baseLen * Math.min(mag / Math.max(this._maxVFSpeed, 0.001), 2.0);

                    // Shaft: tail → head in full 3D
                    const tx = ox,          ty = y,          tz = oz;
                    const hx = ox + nx*len, hy = y + ny*len, hz = oz + nz*len;

                    // Arrowhead in full 3D — perpendicular to arrow direction
                    // Build a perpendicular vector using cross product
                    const refX = Math.abs(ny) < 0.9 ? 0 : 1;
                    const refY = Math.abs(ny) < 0.9 ? 1 : 0;
                    const refZ = 0;

                    // perp = cross(dir, ref)
                    let p1x = ny*refZ - nz*refY;
                    let p1y = nz*refX - nx*refZ;
                    let p1z = nx*refY - ny*refX;
                    const p1len = Math.sqrt(p1x*p1x + p1y*p1y + p1z*p1z) + 0.0001;
                    p1x /= p1len; p1y /= p1len; p1z /= p1len;

                    const hLen = len * headSize;
                    // Head base point — back along arrow from tip
                    const hbx = hx - nx*hLen;
                    const hby = hy - ny*hLen;
                    const hbz = hz - nz*hLen;

                    // Two wing tips: head-base ± perp * half-head-width
                    const hw   = hLen * 0.5;
                    const h1x  = hbx + p1x*hw, h1y = hby + p1y*hw, h1z = hbz + p1z*hw;
                    const h2x  = hbx - p1x*hw, h2y = hby - p1y*hw, h2z = hbz - p1z*hw;

                    // Color
                    let r, g, b;
                    if (colorMode === 'speed') {
                        const spd = Math.min(mag / Math.max(this._maxVFSpeed, 0.001), 1.0);
                        r = (slowColor.r + (fastColor.r - slowColor.r) * spd) / 255;
                        g = (slowColor.g + (fastColor.g - slowColor.g) * spd) / 255;
                        b = (slowColor.b + (fastColor.b - slowColor.b) * spd) / 255;
                    } else if (colorMode === 'height') {
                        const ws  = this.options.windSystem;
                        const blV = ws ? Math.max(0, Math.min(1, ws.boundaryLayerAt(y))) : hi / Math.max(heightLevels - 1, 1);
                        r = (slowColor.r + (fastColor.r - slowColor.r) * blV) / 255;
                        g = (slowColor.g + (fastColor.g - slowColor.g) * blV) / 255;
                        b = (slowColor.b + (fastColor.b - slowColor.b) * blV) / 255;
                    } else {
                        r = color.r / 255; g = color.g / 255; b = color.b / 255;
                    }

                    // Write 3 segments: [shaft, head-left, head-right]
                    // Each segment: 4 verts — aPointA and aPointB written for all 4
                    const segs = [
                        { ax: tx, ay: ty, az: tz, bx: hx,  by: hy,  bz: hz  },  // shaft
                        { ax: hx, ay: hy, az: hz, bx: h1x, by: h1y, bz: h1z },  // head left
                        { ax: hx, ay: hy, az: hz, bx: h2x, by: h2y, bz: h2z },  // head right
                    ];

                    for (let si = 0; si < 3; si++) {
                        const seg    = segs[si];
                        const vBase  = (arrowIdx * 3 + si) * 4;
                        const isDim  = si === 0; // dim the shaft slightly vs head

                        for (let k = 0; k < 4; k++) {
                            const i3 = (vBase + k) * 3;
                            this._vfAttrA[i3]     = seg.ax;
                            this._vfAttrA[i3 + 1] = seg.ay;
                            this._vfAttrA[i3 + 2] = seg.az;
                            this._vfAttrB[i3]     = seg.bx;
                            this._vfAttrB[i3 + 1] = seg.by;
                            this._vfAttrB[i3 + 2] = seg.bz;
                            const dim = isDim ? 0.6 : 1.0;
                            this._vfAttrColor[i3]     = r * dim;
                            this._vfAttrColor[i3 + 1] = g * dim;
                            this._vfAttrColor[i3 + 2] = b * dim;
                            this._vfAttrAlpha[vBase + k] = opacity;
                        }
                    }

                    arrowIdx++;
                }
            }
        }

        this._vfBufA.needsUpdate     = true;
        this._vfBufB.needsUpdate     = true;
        this._vfBufColor.needsUpdate = true;
        this._vfBufAlpha.needsUpdate = true;
    }

    _rebuildVF(ctx) {
        if (this._vfMesh) {
            this._vfMesh.geometry.dispose();
            this._vfMat.dispose();
            ctx?.scene?.remove(this._vfMesh);
        }
        this._buildVFGeometry();
        ctx?.scene?.add(this._vfMesh);
    }

    setupVFGui(folder) {
        const p = this._vfParams;
        const vff = folder.addFolder({ title: 'Vector Field', expanded: false });

        vff.addBinding(p, 'enabled', { label: 'Enabled' })
            .on('change', ({ value }) => { if (this._vfMesh) this._vfMesh.visible = value; });

        vff.addBinding(p, 'gridRes',      { label: 'Grid Res',      min: 3,   max: 40,  step: 1    }).on('change', () => this._rebuildVF(this._ctx));
        vff.addBinding(p, 'heightLevels', { label: 'Height Levels', min: 1,   max: 8,   step: 1    }).on('change', () => this._rebuildVF(this._ctx));
        vff.addBinding(p, 'arrowScale',   { label: 'Arrow Scale',   min: 0.1, max: 3.0, step: 0.05 });
        vff.addBinding(p, 'normalizeLen', { label: 'Normalize Len'  });
        vff.addBinding(p, 'headSize',     { label: 'Head Size',     min: 0.0, max: 0.8, step: 0.01 });
        vff.addBinding(p, 'lineWidth',    { label: 'Line Width',    min: 0.5, max: 10,  step: 0.5  })
            .on('change', ({ value }) => { if (this._vfMat) this._vfMat.uniforms.u_lineWidth.value = value; });
        vff.addBinding(p, 'opacity',      { label: 'Opacity',       min: 0,   max: 1,   step: 0.01 });
        vff.addBinding(p, 'colorMode', {
            label: 'Color Mode',
            options: { Speed: 'speed', Height: 'height', Flat: 'flat' },
        });
        vff.addBinding(p, 'slowColor', { label: 'Low Color'  });
        vff.addBinding(p, 'fastColor', { label: 'High Color' });
        vff.addBinding(p, 'color',     { label: 'Flat Color' });
    }
}