window.City = class City extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'City';
        this.options = options;

        this._params = {
            seed:             42,
            cornerStyle:      'round',   // 'none' | 'flat' | 'round'
            cornerSize:       5,
            cornerDoor:       true,
            cornerSegments:   6,
            spacing:          2,
            setback:          1,
            minWidth:         15,
            maxWidth:         35,
            minHeight:        30,
            maxHeight:        120,
            minDepth:         15,
            maxDepth:         25,
            minFloors:        3,
            maxFloors:        20,
            colorVariation:   0.15,
        };

        this._bindings = [];
        this._group = new THREE.Group();
        this._buildingMeshes = [];
        this._materials = [];
        this._roadMesh = null;
        this._roadGeo  = null;

        // Layout reference (set by scene)
        this._layout = null;

        // Shared sun uniform references — scene updates these, all materials read them
        this._sharedSunDir   = { value: new THREE.Vector3(0.6, 0.8, 0.3).normalize() };
        this._sharedSunColor = { value: new THREE.Color(1.0, 0.97, 0.92) };
        this.sunUniforms = {
            u_sunDir:   this._sharedSunDir,
            u_sunColor: this._sharedSunColor,
        };
        // Road material sun uniforms (aliased after load)
        this.roadSunUniforms = null;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    async load(ctx) {
        this._ctx = ctx;

        // Load the Building class dynamically
        await loadObject('Building');

        // Load the building shader (used as base for cloning materials)
        this._baseShader = new ShaderHandle('shaders/building');
        await this._baseShader.load({
            uniforms: {
                u_sunDir:   new THREE.Vector3(0.6, 0.8, 0.3).normalize(),
                u_sunColor: new THREE.Color(1.0, 0.97, 0.92),
            },
            side: THREE.FrontSide,
        });

        // Load the road shader
        this._roadShader = new ShaderHandle('shaders/road');
        await this._roadShader.load({
            uniforms: {
                u_sunDir:   new THREE.Vector3(0.6, 0.8, 0.3).normalize(),
                u_sunColor: new THREE.Color(1.0, 0.97, 0.92),
                u_roadWidth: 12,
                u_gridSpacingX: 0,
                u_gridSpacingZ: 0,
                u_gridOriginX:  0,
                u_gridOriginZ:  0,
            },
            side: THREE.FrontSide,
        });

        // Alias road sun uniforms so scene can update them
        this.roadSunUniforms = this._roadShader.mat.uniforms;

        ctx.scene.add(this._group);

        // Build initial city from layout
        if (this._layout) {
            this._buildCity(this._layout.computeLayout());
        }
    }

    setupGui(folder, ctx) {
        // Building style controls
        this._baseShader.setupGui(folder);

        // Road style controls
        const rf = folder.addFolder({ title: 'Road Style', expanded: false });
        this._roadShader.setupGui(rf);

        // City layout
        const rebuild = () => {
            if (this._layout) this._buildCity(this._layout.computeLayout());
        };

        const p = this._params;

        // Building size ranges
        const sf = folder.addFolder({ title: 'Building Size', expanded: false });
        this._bindings.push(
            sf.addBinding(p, 'minWidth',  { label: 'Min Width',  min: 5,  max: 60,   step: 1 }).on('change', rebuild),
            sf.addBinding(p, 'maxWidth',  { label: 'Max Width',  min: 5,  max: 60,   step: 1 }).on('change', rebuild),
            sf.addBinding(p, 'minHeight', { label: 'Min Height', min: 10, max: 200,  step: 1 }).on('change', rebuild),
            sf.addBinding(p, 'maxHeight', { label: 'Max Height', min: 10, max: 200,  step: 1 }).on('change', rebuild),
            sf.addBinding(p, 'minDepth',  { label: 'Min Depth',  min: 5,  max: 50,   step: 1 }).on('change', rebuild),
            sf.addBinding(p, 'maxDepth',  { label: 'Max Depth',  min: 5,  max: 50,   step: 1 }).on('change', rebuild),
            sf.addBinding(p, 'minFloors', { label: 'Min Floors', min: 1,  max: 30,   step: 1 }).on('change', rebuild),
            sf.addBinding(p, 'maxFloors', { label: 'Max Floors', min: 1,  max: 30,   step: 1 }).on('change', rebuild),
        );

        // Corner style
        const cf = folder.addFolder({ title: 'Corners', expanded: false });
        this._bindings.push(
            cf.addBlade({ view: 'list', label: 'Style', options: [
                { text: 'None',  value: 'none'  },
                { text: 'Flat',  value: 'flat'  },
                { text: 'Round', value: 'round' },
            ], value: p.cornerStyle }).on('change', (ev) => { p.cornerStyle = ev.value; rebuild(); }),
            cf.addBinding(p, 'cornerSize',     { label: 'Size',     min: 2,  max: 15, step: 0.5 }).on('change', rebuild),
            cf.addBinding(p, 'cornerSegments', { label: 'Segments', min: 3,  max: 12, step: 1   }).on('change', rebuild),
            cf.addBinding(p, 'cornerDoor',     { label: 'Corner Door' }).on('change', rebuild),
        );

        // Variation
        const vf = folder.addFolder({ title: 'Variation', expanded: false });
        this._bindings.push(
            vf.addBinding(p, 'spacing',        { label: 'Spacing',         min: 0,  max: 10,  step: 0.5  }).on('change', rebuild),
            vf.addBinding(p, 'setback',        { label: 'Setback',         min: 0,  max: 10,  step: 0.5  }).on('change', rebuild),
            vf.addBinding(p, 'seed',           { label: 'Seed',            min: 1,  max: 999, step: 1    }).on('change', rebuild),
            vf.addBinding(p, 'colorVariation', { label: 'Color Variation', min: 0,  max: 0.5, step: 0.01 }).on('change', rebuild),
        );
    }

    collectParams() {
        return {
            shader: this._baseShader.collectParams(),
            road:   this._roadShader.collectParams(),
            city:   { ...this._params },
        };
    }

    applyParams(data) {
        if (data.shader) this._baseShader.applyParams(data.shader);
        if (data.road)   this._roadShader.applyParams(data.road);
        if (data.city) {
            Object.assign(this._params, data.city);
            for (const b of this._bindings) b.refresh();
        }
        if (this._layout) this._buildCity(this._layout.computeLayout());
    }

    preFrame(ctx) {}

    dispose(ctx) {
        this._clearCity();
        this._baseShader.dispose();
        this._roadShader.dispose();
        ctx.scene.remove(this._group);
        for (const b of this._bindings) b.dispose();
    }

    // ── Seeded PRNG ───────────────────────────────────────────────────────────

    _seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    _randRange(rng, min, max) {
        return min + rng() * (max - min);
    }

    _randInt(rng, min, max) {
        return Math.floor(this._randRange(rng, min, max + 1));
    }

    // ── City Generation ───────────────────────────────────────────────────────

    _clearCity() {
        for (const mesh of this._buildingMeshes) {
            mesh.geometry?.dispose();
            this._group.remove(mesh);
        }
        for (const mat of this._materials) {
            mat.dispose();
        }
        this._buildingMeshes = [];
        this._materials = [];

        if (this._roadMesh) {
            this._group.remove(this._roadMesh);
            this._roadGeo?.dispose();
            this._roadMesh = null;
            this._roadGeo  = null;
        }
    }

    _buildCity(layout) {
        this._clearCity();

        const p   = this._params;
        const rng = this._seededRandom(p.seed);

        // Build road mesh
        this._buildRoadMesh(layout);

        // Set grid uniforms on road material
        const ru = this._roadShader.mat.uniforms;
        ru.u_gridSpacingX.value = layout.gridSpacingX;
        ru.u_gridSpacingZ.value = layout.gridSpacingZ;
        ru.u_gridOriginX.value  = layout.gridOriginX;
        ru.u_gridOriginZ.value  = layout.gridOriginZ;
        ru.u_roadWidth.value    = layout.params.roadWidth;

        // Place buildings in each block
        const baseMat = this._baseShader.mat;
        for (const block of layout.blocks) {
            this._placeBlockBuildings(block, layout.params, rng, baseMat);
        }
    }

    // ── Road Mesh ─────────────────────────────────────────────────────────────

    _buildRoadMesh(layout) {
        const arrays = { verts: [], norms: [], uvs: [], types: [], idxs: [], vi: 0 };
        const rp = layout.params;
        const halfRW = rp.roadWidth / 2;
        const cw = rp.curbWidth;
        const ch = rp.curbHeight;
        const sw = rp.sidewalkWidth;

        // Build each road segment (between intersections)
        for (const seg of layout.roads.vertical) {
            this._addRoadSegment(arrays, seg.x, seg.zStart, seg.zEnd, rp, true);
        }
        for (const seg of layout.roads.horizontal) {
            this._addRoadSegment(arrays, seg.z, seg.xStart, seg.xEnd, rp, false);
        }

        // Build intersections
        for (const inter of layout.intersections) {
            this._addIntersection(arrays, inter, rp);
        }

        // Create mesh
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',    new THREE.BufferAttribute(new Float32Array(arrays.verts), 3));
        geo.setAttribute('normal',      new THREE.BufferAttribute(new Float32Array(arrays.norms), 3));
        geo.setAttribute('uv',          new THREE.BufferAttribute(new Float32Array(arrays.uvs),   2));
        geo.setAttribute('surfaceType', new THREE.BufferAttribute(new Float32Array(arrays.types), 1));
        geo.setIndex(arrays.idxs);

        geo.computeBoundingSphere();

        this._roadGeo  = geo;
        this._roadMesh = new THREE.Mesh(geo, this._roadShader.mat);
        this._roadMesh.frustumCulled = false;
        this._group.add(this._roadMesh);
    }

    /**
     * Build a road segment cross-section between two points.
     * @param {boolean} isVertical - true = road runs along Z, false = along X
     */
    _addRoadSegment(arrays, center, alongStart, alongEnd, rp, isVertical) {
        const halfRW = rp.roadWidth / 2;
        const cw = rp.curbWidth;
        const ch = rp.curbHeight;
        const sw = rp.sidewalkWidth;
        const co = halfRW + cw;  // curb outer edge
        const oe = co + sw;      // sidewalk outer edge

        // Helper: create a point either along Z (vertical road) or along X (horizontal road)
        const pt = (cross, y, along) => {
            return isVertical ? [center + cross, y, along] : [along, y, center - cross];
        };

        // Normal helper: perpendicular direction depends on orientation
        const crossNorm = (sign) => {
            return isVertical ? [sign, 0, 0] : [0, 0, -sign];
        };

        // 1. Road surface (y=0, surfType=0)
        this._addQuad(arrays,
            pt(-halfRW, 0, alongStart),
            pt(-halfRW, 0, alongEnd),
            pt( halfRW, 0, alongEnd),
            pt( halfRW, 0, alongStart),
            [0, 1, 0], 0
        );

        // 2. Left curb inner face (surfType=1)
        this._addQuad(arrays,
            pt(-halfRW, 0,  alongEnd),
            pt(-halfRW, 0,  alongStart),
            pt(-halfRW, ch, alongStart),
            pt(-halfRW, ch, alongEnd),
            crossNorm(1), 1
        );

        // 3. Right curb inner face (surfType=1)
        this._addQuad(arrays,
            pt(halfRW, 0,  alongStart),
            pt(halfRW, 0,  alongEnd),
            pt(halfRW, ch, alongEnd),
            pt(halfRW, ch, alongStart),
            crossNorm(-1), 1
        );

        // 4. Left curb top (surfType=1)
        this._addQuad(arrays,
            pt(-co,     ch, alongStart),
            pt(-co,     ch, alongEnd),
            pt(-halfRW, ch, alongEnd),
            pt(-halfRW, ch, alongStart),
            [0, 1, 0], 1
        );

        // 5. Right curb top (surfType=1)
        this._addQuad(arrays,
            pt(halfRW, ch, alongStart),
            pt(halfRW, ch, alongEnd),
            pt(co,     ch, alongEnd),
            pt(co,     ch, alongStart),
            [0, 1, 0], 1
        );

        // 6. Left sidewalk (surfType=2)
        this._addQuad(arrays,
            pt(-oe, ch, alongStart),
            pt(-oe, ch, alongEnd),
            pt(-co, ch, alongEnd),
            pt(-co, ch, alongStart),
            [0, 1, 0], 2
        );

        // 7. Right sidewalk (surfType=2)
        this._addQuad(arrays,
            pt(co, ch, alongStart),
            pt(co, ch, alongEnd),
            pt(oe, ch, alongEnd),
            pt(oe, ch, alongStart),
            [0, 1, 0], 2
        );

        // 8. Left sidewalk outer edge (surfType=2)
        this._addQuad(arrays,
            pt(-oe, 0,  alongStart),
            pt(-oe, 0,  alongEnd),
            pt(-oe, ch, alongEnd),
            pt(-oe, ch, alongStart),
            crossNorm(-1), 2
        );

        // 9. Right sidewalk outer edge (surfType=2)
        this._addQuad(arrays,
            pt(oe, 0,  alongEnd),
            pt(oe, 0,  alongStart),
            pt(oe, ch, alongStart),
            pt(oe, ch, alongEnd),
            crossNorm(1), 2
        );

        // 10. Left curb outer face (surfType=1)
        this._addQuad(arrays,
            pt(-co, 0,  alongStart),
            pt(-co, 0,  alongEnd),
            pt(-co, ch, alongEnd),
            pt(-co, ch, alongStart),
            crossNorm(-1), 1
        );

        // 11. Right curb outer face (surfType=1)
        this._addQuad(arrays,
            pt(co, 0,  alongEnd),
            pt(co, 0,  alongStart),
            pt(co, ch, alongStart),
            pt(co, ch, alongEnd),
            crossNorm(1), 1
        );
    }

    /**
     * Build an intersection patch: asphalt square + corner curb/sidewalk zones.
     * Uses connectivity flags to determine corner type and edge caps.
     */
    _addIntersection(arrays, inter, rp) {
        const ix = inter.x;
        const iz = inter.z;
        const halfRW = rp.roadWidth / 2;
        const cr = Math.max(0, rp.cornerRadius);

        // Central asphalt square (surfType=0)
        this._addQuad(arrays,
            [ix - halfRW, 0, iz - halfRW],
            [ix - halfRW, 0, iz + halfRW],
            [ix + halfRW, 0, iz + halfRW],
            [ix + halfRW, 0, iz - halfRW],
            [0, 1, 0], 0
        );

        // 4 corner quadrants
        const corners = [
            { sx:  1, sz:  1 },  // NE
            { sx: -1, sz:  1 },  // NW
            { sx: -1, sz: -1 },  // SW
            { sx:  1, sz: -1 },  // SE
        ];

        for (const c of corners) {
            if (cr > 0.5) {
                this._addRoundedCorner(arrays, ix, iz, c.sx, c.sz, rp);
            } else {
                this._addSquareCorner(arrays, ix, iz, c.sx, c.sz, rp);
            }
        }

    }

    /**
     * Build a rounded curb corner at an intersection quadrant.
     *
     * Arc geometry: the curb inner edge follows a quarter-circle arc.
     * - Arc center at (ix + sx*(halfRW + cr), iz + sz*(halfRW + cr))
     * - Inner curb edge at radius cr (connects to road curb at halfRW)
     * - Curb top strip using outer radius cr - cw (if cr > cw)
     * - Sidewalk fills the remaining rectangular zone
     */
    _addRoundedCorner(arrays, ix, iz, sx, sz, rp) {
        const halfRW = rp.roadWidth / 2;
        const cw = rp.curbWidth;
        const ch = rp.curbHeight;
        const sw = rp.sidewalkWidth;
        const cr = rp.cornerRadius;
        const co = halfRW + cw;
        const oe = co + sw;
        const N = Math.max(4, Math.round(cr * 2));

        // Arc center
        const acx = ix + sx * (halfRW + cr);
        const acz = iz + sz * (halfRW + cr);

        // Determine arc start/end angles
        // start connects to Z-road curb (at x = ix + sx*halfRW)
        // end connects to X-road curb (at z = iz + sz*halfRW)
        const a0 = Math.atan2(0, -sx);  // angle where cos(a) = -sx: sx=1 → π, sx=-1 → 0
        const a1Raw = Math.atan2(-sz, 0);  // angle where sin(a) = -sz: sz=1 → -π/2, sz=-1 → π/2

        // Choose a1 so that |a1 - a0| = π/2 (quarter circle)
        let a1 = a1Raw;
        const diff = a1 - a0;
        if (Math.abs(diff) > Math.PI) {
            // Adjust by ±2π to get shortest arc
            a1 = diff > 0 ? a1 - 2 * Math.PI : a1 + 2 * Math.PI;
        }

        const sweep = a1 - a0;
        const ccw = sweep > 0;

        for (let i = 0; i < N; i++) {
            const t0 = a0 + sweep * i / N;
            const t1 = a0 + sweep * (i + 1) / N;
            const tmid = (t0 + t1) / 2;

            const cos0 = Math.cos(t0), sin0 = Math.sin(t0);
            const cos1 = Math.cos(t1), sin1 = Math.sin(t1);

            // Inner curb edge points (at radius cr)
            const p0x = acx + cr * cos0, p0z = acz + cr * sin0;
            const p1x = acx + cr * cos1, p1z = acz + cr * sin1;

            // Inner curb face normal: points from arc center to arc edge (toward road)
            const innerNorm = [Math.cos(tmid), 0, Math.sin(tmid)];

            // Curb inner vertical face — winding depends on sweep direction
            if (ccw) {
                this._addQuad(arrays,
                    [p1x, 0, p1z], [p0x, 0, p0z],
                    [p0x, ch, p0z], [p1x, ch, p1z],
                    innerNorm, 1
                );
            } else {
                this._addQuad(arrays,
                    [p0x, 0, p0z], [p1x, 0, p1z],
                    [p1x, ch, p1z], [p0x, ch, p0z],
                    innerNorm, 1
                );
            }

            // Curb top strip (from inner edge at cr to outer edge at cr - cw)
            if (cr > cw) {
                const outerR = cr - cw;
                const o0x = acx + outerR * cos0, o0z = acz + outerR * sin0;
                const o1x = acx + outerR * cos1, o1z = acz + outerR * sin1;

                this._addQuad(arrays,
                    [p0x, ch, p0z], [p1x, ch, p1z],
                    [o1x, ch, o1z], [o0x, ch, o0z],
                    [0, 1, 0], 1
                );

                // Curb outer vertical face
                const outerNorm = [-Math.cos(tmid), 0, -Math.sin(tmid)];
                if (ccw) {
                    this._addQuad(arrays,
                        [o0x, 0, o0z], [o1x, 0, o1z],
                        [o1x, ch, o1z], [o0x, ch, o0z],
                        outerNorm, 1
                    );
                } else {
                    this._addQuad(arrays,
                        [o1x, 0, o1z], [o0x, 0, o0z],
                        [o0x, ch, o0z], [o1x, ch, o1z],
                        outerNorm, 1
                    );
                }
            }

            // Asphalt fan triangle from intersection corner to curb inner arc
            const cornerX = ix + sx * halfRW;
            const cornerZ = iz + sz * halfRW;

            if (ccw) {
                this._addTri(arrays,
                    [cornerX, 0, cornerZ],
                    [p0x, 0, p0z], [p1x, 0, p1z],
                    [0, 1, 0], 0
                );
            } else {
                this._addTri(arrays,
                    [cornerX, 0, cornerZ],
                    [p1x, 0, p1z], [p0x, 0, p0z],
                    [0, 1, 0], 0
                );
            }
        }

        // Sidewalk: fill the corner quadrant at curb height
        // The sidewalk fills a rectangular area minus the curb arc interior.
        // Approximate with 3 quads forming an L-shape from curb edge (co) to sidewalk edge (oe).

        // When sx*sz < 0 (NW/SE quadrants), the coordinate scaling reverses
        // quad winding. Swap p1↔p3 to restore correct CCW front-face order.
        const flip = sx * sz < 0;
        const quad = (p0, p1, p2, p3, normal, surfType) => {
            if (flip) this._addQuad(arrays, p0, p3, p2, p1, normal, surfType);
            else      this._addQuad(arrays, p0, p1, p2, p3, normal, surfType);
        };

        // Sidewalk corner quad (the outer corner square)
        quad(
            [ix + sx * co, ch, iz + sz * co],
            [ix + sx * co, ch, iz + sz * oe],
            [ix + sx * oe, ch, iz + sz * oe],
            [ix + sx * oe, ch, iz + sz * co],
            [0, 1, 0], 2
        );

        // Sidewalk strip from curb edge along X-road side
        quad(
            [ix + sx * co, ch, iz + sz * halfRW],
            [ix + sx * co, ch, iz + sz * co],
            [ix + sx * oe, ch, iz + sz * co],
            [ix + sx * oe, ch, iz + sz * halfRW],
            [0, 1, 0], 2
        );

        // Sidewalk strip from curb edge along Z-road side
        quad(
            [ix + sx * halfRW, ch, iz + sz * co],
            [ix + sx * halfRW, ch, iz + sz * oe],
            [ix + sx * co,     ch, iz + sz * oe],
            [ix + sx * co,     ch, iz + sz * co],
            [0, 1, 0], 2
        );

        // Curb top quad filling area between straight curb edges and arc
        // This is the L-shaped curb top zone from (halfRW, halfRW) to (co, co)
        // minus the arc area — approximated as a full quad
        quad(
            [ix + sx * halfRW, ch, iz + sz * halfRW],
            [ix + sx * halfRW, ch, iz + sz * co],
            [ix + sx * co,     ch, iz + sz * co],
            [ix + sx * co,     ch, iz + sz * halfRW],
            [0, 1, 0], 1
        );
    }

    /**
     * Build a square (non-rounded) corner at an intersection.
     */
    _addSquareCorner(arrays, ix, iz, sx, sz, rp) {
        const halfRW = rp.roadWidth / 2;
        const cw = rp.curbWidth;
        const ch = rp.curbHeight;
        const co = halfRW + cw;
        const oe = co + rp.sidewalkWidth;

        // When sx*sz < 0 (NW/SE quadrants), coordinate scaling reverses
        // quad winding. Swap p1↔p3 to restore correct CCW front-face order.
        const flip = sx * sz < 0;
        const quad = (p0, p1, p2, p3, normal, surfType) => {
            if (flip) this._addQuad(arrays, p0, p3, p2, p1, normal, surfType);
            else      this._addQuad(arrays, p0, p1, p2, p3, normal, surfType);
        };

        // Curb inner face along X
        quad(
            [ix + sx * halfRW, 0, iz + sz * halfRW],
            [ix + sx * halfRW, 0, iz + sz * co],
            [ix + sx * halfRW, ch, iz + sz * co],
            [ix + sx * halfRW, ch, iz + sz * halfRW],
            [-sx, 0, 0], 1
        );

        // Curb inner face along Z
        quad(
            [ix + sx * co, 0, iz + sz * halfRW],
            [ix + sx * halfRW, 0, iz + sz * halfRW],
            [ix + sx * halfRW, ch, iz + sz * halfRW],
            [ix + sx * co, ch, iz + sz * halfRW],
            [0, 0, -sz], 1
        );

        // Curb top
        quad(
            [ix + sx * halfRW, ch, iz + sz * halfRW],
            [ix + sx * halfRW, ch, iz + sz * co],
            [ix + sx * co,     ch, iz + sz * co],
            [ix + sx * co,     ch, iz + sz * halfRW],
            [0, 1, 0], 1
        );

        // Sidewalk corner
        quad(
            [ix + sx * co, ch, iz + sz * co],
            [ix + sx * co, ch, iz + sz * oe],
            [ix + sx * oe, ch, iz + sz * oe],
            [ix + sx * oe, ch, iz + sz * co],
            [0, 1, 0], 2
        );

        // Sidewalk strip along X
        quad(
            [ix + sx * co, ch, iz + sz * halfRW],
            [ix + sx * co, ch, iz + sz * co],
            [ix + sx * oe, ch, iz + sz * co],
            [ix + sx * oe, ch, iz + sz * halfRW],
            [0, 1, 0], 2
        );

        // Sidewalk strip along Z
        quad(
            [ix + sx * halfRW, ch, iz + sz * co],
            [ix + sx * halfRW, ch, iz + sz * oe],
            [ix + sx * co,     ch, iz + sz * oe],
            [ix + sx * co,     ch, iz + sz * co],
            [0, 1, 0], 2
        );
    }

    /**
     * Build a curb + sidewalk cap for a dead-end side of a perimeter intersection.
     * Spans the road width (between corner quadrants) along the perpendicular axis.
     *
     * @param {boolean} isZAxis - true = cap extends along Z, false = along X
     * @param {number} sign - +1 or -1 direction
     */
    _addEdgeCap(arrays, ix, iz, isZAxis, sign, rp) {
        const halfRW = rp.roadWidth / 2;
        const cw = rp.curbWidth;
        const ch = rp.curbHeight;
        const sw = rp.sidewalkWidth;
        const co = halfRW + cw;
        const oe = co + sw;

        // Map (cross, y, out) to world coordinates.
        // cross: perpendicular to cap direction (spans road width)
        // out: along cap direction (extends outward from intersection)
        // Sign applied to maintain correct CCW winding for both directions.
        const pt = (cross, y, out) => {
            return isZAxis
                ? [ix + sign * cross, y, iz + sign * out]
                : [ix + sign * out,   y, iz - sign * cross];
        };

        // Normal along outward direction
        const outNorm = (dir) => {
            return isZAxis ? [0, 0, sign * dir] : [sign * dir, 0, 0];
        };

        // 1. Curb inner face (at out=halfRW, facing intersection center)
        this._addQuad(arrays,
            pt( halfRW, 0,  halfRW),
            pt(-halfRW, 0,  halfRW),
            pt(-halfRW, ch, halfRW),
            pt( halfRW, ch, halfRW),
            outNorm(-1), 1
        );

        // 2. Curb top (from halfRW to co)
        this._addQuad(arrays,
            pt(-halfRW, ch, halfRW),
            pt(-halfRW, ch, co),
            pt( halfRW, ch, co),
            pt( halfRW, ch, halfRW),
            [0, 1, 0], 1
        );

        // 3. Curb outer face (at out=co, facing outward)
        this._addQuad(arrays,
            pt(-halfRW, 0,  co),
            pt( halfRW, 0,  co),
            pt( halfRW, ch, co),
            pt(-halfRW, ch, co),
            outNorm(1), 1
        );

        // 4. Sidewalk top (from co to oe)
        this._addQuad(arrays,
            pt(-halfRW, ch, co),
            pt(-halfRW, ch, oe),
            pt( halfRW, ch, oe),
            pt( halfRW, ch, co),
            [0, 1, 0], 2
        );

        // 5. Sidewalk outer edge (at out=oe, facing outward)
        this._addQuad(arrays,
            pt(-halfRW, 0,  oe),
            pt( halfRW, 0,  oe),
            pt( halfRW, ch, oe),
            pt(-halfRW, ch, oe),
            outNorm(1), 2
        );
    }

    // ── Building Placement ────────────────────────────────────────────────────

    _placeBlockBuildings(block, roadParams, rng, baseMat) {
        const p = this._params;
        const halfBW = block.width / 2;
        const halfBD = block.depth / 2;

        // Edge definitions: 4 sides of the block
        // Building front faces +Z in local coords; rotation aligns it to face outward
        const edges = [
            { // North edge — building front faces +Z (toward road)
                getPos: (along, depth) => [block.cx + along, 0, block.cz + halfBD - p.setback - depth / 2],
                rot: 0,
                cornerStart: 'frontLeft',   // NW block corner
                cornerEnd:   'frontRight',  // NE block corner
                length: block.width,
            },
            { // South edge — building front faces -Z
                getPos: (along, depth) => [block.cx + along, 0, block.cz - halfBD + p.setback + depth / 2],
                rot: Math.PI,
                cornerStart: 'frontRight',  // SW block corner
                cornerEnd:   'frontLeft',   // SE block corner
                length: block.width,
            },
            { // East edge — building front faces +X
                getPos: (along, depth) => [block.cx + halfBW - p.setback - depth / 2, 0, block.cz + along],
                rot: -Math.PI / 2,
                cornerStart: 'frontLeft',   // NE block corner
                cornerEnd:   'frontRight',  // SE block corner
                length: block.depth,
            },
            { // West edge — building front faces -X
                getPos: (along, depth) => [block.cx - halfBW + p.setback + depth / 2, 0, block.cz + along],
                rot: Math.PI / 2,
                cornerStart: 'frontRight',  // NW block corner
                cornerEnd:   'frontLeft',   // SW block corner
                length: block.depth,
            },
        ];

        for (const edge of edges) {
            this._placeEdgeBuildings(edge, rng, baseMat, p);
        }
    }

    _placeEdgeBuildings(edge, rng, baseMat, p) {
        const cs = p.cornerStyle !== 'none' ? p.cornerSize : 0;
        const availableLength = edge.length - 2 * cs;
        if (availableLength <= 0) return;

        // Generate buildings to fill the edge
        const buildings = [];
        let totalWidth = 0;

        // First pass: generate building widths
        while (totalWidth < availableLength) {
            const remaining = availableLength - totalWidth;
            if (remaining < p.minWidth) break;

            const maxW = Math.min(p.maxWidth, remaining);
            const width = this._randRange(rng, p.minWidth, maxW);
            const height = this._randRange(rng, p.minHeight, p.maxHeight);
            const depth  = this._randRange(rng, p.minDepth, p.maxDepth);
            const floors = this._randInt(rng, p.minFloors, p.maxFloors);

            buildings.push({ width, height, depth, floors });
            totalWidth += width + p.spacing;
        }
        // Remove trailing spacing
        if (buildings.length > 0) totalWidth -= p.spacing;

        // Center the row of buildings along the edge
        const startOffset = cs + (availableLength - totalWidth) / 2;
        let along = -edge.length / 2 + startOffset;

        for (let bi = 0; bi < buildings.length; bi++) {
            const bData = buildings[bi];
            const isFirst = (bi === 0);
            const isLast  = (bi === buildings.length - 1);

            // Create Building instance as geometry factory
            const building = new Building();
            const windowsFront = Math.max(1, Math.round(bData.width / 5));
            const windowsSide  = Math.max(1, Math.round(bData.depth / 5));
            const doorsFront   = Math.max(1, Math.min(3, Math.floor(bData.width / 12)));

            building._params = {
                width:                bData.width,
                height:               bData.height,
                depth:                bData.depth,
                numFloors:            bData.floors,
                groundFloorScale:     1.5,
                windowsPerFloorFront: windowsFront,
                windowsPerFloorSide:  windowsSide,
                windowWidth:          3.0,
                windowHeight:         4.0,
                windowDepth:          0.5,
                windowSillHeight:     1.5,
                ledgeDepth:           0.4,
                ledgeHeight:          0.3,
                corniceDepth:         1.0,
                corniceHeight:        0.8,
                doorWidth:            2.5,
                doorHeight:           3.5,
                doorDepth:            0.3,
                doorsPerFront:        doorsFront,
                doorsPerSide:         0,
                staircaseSteps:       this._randInt(rng, 0, 4),
                staircaseStepHeight:  0.3,
                staircaseDepth:       3.0,
                stoopWidth:           0.4,
                stoopHeight:          0.8,
                pillarWidth:          0.8,
                pillarDepth:          0.3,
            };

            // Apply corner style to first/last buildings on edge
            if (isFirst && p.cornerStyle !== 'none') {
                building._corners[edge.cornerStart] = p.cornerStyle;
                building._cornerSize     = p.cornerSize;
                building._cornerSegments = p.cornerSegments;
                building._cornerDoor     = p.cornerDoor;
            }
            if (isLast && p.cornerStyle !== 'none') {
                building._corners[edge.cornerEnd] = p.cornerStyle;
                building._cornerSize     = p.cornerSize;
                building._cornerSegments = p.cornerSegments;
                building._cornerDoor     = p.cornerDoor;
            }

            const geo = building._buildGeometry();

            // Clone material with independent uniforms
            const mat = baseMat.clone();
            mat.uniforms = THREE.UniformsUtils.clone(baseMat.uniforms);

            // Wire shared sun uniforms (by reference)
            mat.uniforms.u_sunDir   = this._sharedSunDir;
            mat.uniforms.u_sunColor = this._sharedSunColor;

            // Randomize colors
            this._randomizeColors(mat.uniforms, rng, p.colorVariation);

            this._materials.push(mat);

            const mesh = new THREE.Mesh(geo, mat);

            // Position along the edge
            const centerAlong = along + bData.width / 2;
            const pos = edge.getPos(centerAlong, bData.depth);
            mesh.position.set(pos[0], pos[1], pos[2]);
            mesh.rotation.y = edge.rot;

            this._group.add(mesh);
            this._buildingMeshes.push(mesh);

            along += bData.width + p.spacing;
        }
    }

    _randomizeColors(uniforms, rng, variation) {
        const colorKeys = [
            'u_wallColor', 'u_windowColor', 'u_trimColor', 'u_roofColor',
            'u_mortarColor', 'u_doorColor', 'u_doorGrainColor',
            'u_glassReflectColor',
        ];

        for (const key of colorKeys) {
            if (!uniforms[key]?.value) continue;
            const c = uniforms[key].value;
            const shift = (rng() - 0.5) * 2 * variation;
            c.r = Math.max(0, Math.min(1, c.r + shift));
            c.g = Math.max(0, Math.min(1, c.g + shift));
            c.b = Math.max(0, Math.min(1, c.b + shift));
        }
    }

    // ── Quad / Tri Helpers ────────────────────────────────────────────────────

    _addQuad(a, p0, p1, p2, p3, normal, surfType) {
        const base = a.vi;

        const pts = [p0, p1, p2, p3];
        for (const pt of pts) {
            a.verts.push(pt[0], pt[1], pt[2]);
            a.norms.push(normal[0], normal[1], normal[2]);
            a.types.push(surfType);
        }

        const ex = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const ey = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
        const lenX = Math.sqrt(ex[0]*ex[0] + ex[1]*ex[1] + ex[2]*ex[2]) || 1;
        const lenY = Math.sqrt(ey[0]*ey[0] + ey[1]*ey[1] + ey[2]*ey[2]) || 1;

        for (const pt of pts) {
            const dx = pt[0] - p0[0];
            const dy = pt[1] - p0[1];
            const dz = pt[2] - p0[2];
            const u = (dx * ex[0] + dy * ex[1] + dz * ex[2]) / (lenX * lenX);
            const v = (dx * ey[0] + dy * ey[1] + dz * ey[2]) / (lenY * lenY);
            a.uvs.push(u, v);
        }

        a.idxs.push(base, base + 1, base + 2);
        a.idxs.push(base, base + 2, base + 3);

        a.vi += 4;
    }

    _addTri(a, p0, p1, p2, normal, surfType) {
        const base = a.vi;

        const pts = [p0, p1, p2];
        for (const pt of pts) {
            a.verts.push(pt[0], pt[1], pt[2]);
            a.norms.push(normal[0], normal[1], normal[2]);
            a.types.push(surfType);
        }

        const ex = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const ey = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const lenX = Math.sqrt(ex[0]*ex[0] + ex[1]*ex[1] + ex[2]*ex[2]) || 1;
        const lenY = Math.sqrt(ey[0]*ey[0] + ey[1]*ey[1] + ey[2]*ey[2]) || 1;

        for (const pt of pts) {
            const dx = pt[0] - p0[0];
            const dy = pt[1] - p0[1];
            const dz = pt[2] - p0[2];
            const u = (dx * ex[0] + dy * ex[1] + dz * ex[2]) / (lenX * lenX);
            const v = (dx * ey[0] + dy * ey[1] + dz * ey[2]) / (lenY * lenY);
            a.uvs.push(u, v);
        }

        a.idxs.push(base, base + 1, base + 2);

        a.vi += 3;
    }
}
