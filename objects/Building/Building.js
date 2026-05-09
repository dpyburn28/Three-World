window.Building = class Building extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Building';
        this.options = { posX: 0, posZ: 0, ...options };

        this._params = {
            // Overall dimensions
            width:                30,
            height:               80,
            depth:                20,
            // Floors
            numFloors:            10,
            groundFloorScale:     1.5,
            // Windows — front/back
            windowsPerFloorFront: 6,
            // Windows — sides
            windowsPerFloorSide:  4,
            // Window geometry
            windowWidth:          3.0,
            windowHeight:         4.0,
            windowDepth:          0.5,
            windowSillHeight:     1.5,
            // Ledges
            ledgeDepth:           0.4,
            ledgeHeight:          0.3,
            // Cornice
            corniceDepth:         1.0,
            corniceHeight:        0.8,
            // Doors (ground floor)
            doorWidth:            2.5,
            doorHeight:           3.5,
            doorDepth:            0.3,
            doorsPerFront:        1,
            doorsPerSide:         0,
            // Staircase
            staircaseSteps:       0,
            staircaseStepHeight:  0.3,
            staircaseDepth:       3.0,
            // Stoop (side walls flanking the staircase)
            stoopWidth:           0.4,
            stoopHeight:          0.8,
            // Pillars
            pillarWidth:          0.8,
            pillarDepth:          0.3,
        };

        this._bindings = [];

        // Corner properties (set programmatically by City for corner buildings)
        this._corners = {
            frontRight: 'none',   // 'none' | 'flat' | 'round'
            frontLeft:  'none',
            backRight:  'none',
            backLeft:   'none',
        };
        this._cornerSize     = 5;
        this._cornerSegments = 6;
        this._cornerDoor     = false;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    async load(ctx) {
        this.shader = new ShaderHandle('shaders/building');
        await this.shader.load({
            uniforms: {
                u_sunDir:   new THREE.Vector3(0.6, 0.8, 0.3).normalize(),
                u_sunColor: new THREE.Color(1.0, 0.97, 0.92),
            },
            side: THREE.FrontSide,
        });

        this.geo  = this._buildGeometry();
        this.mesh = new THREE.Mesh(this.geo, this.shader.mat);
        this.mesh.position.set(this.options.posX, 0, this.options.posZ);
        ctx.scene.add(this.mesh);
    }

    setupGui(folder, ctx) {
        // Shader controls (colors, lighting) — auto-wired via controls.json
        this.shader.setupGui(folder);

        // Geometry controls — manual bindings with rebuild callback
        const gf = folder.addFolder({ title: 'Geometry', expanded: true });
        const p  = this._params;
        const rebuild = () => this._rebuild();

        this._bindings = [
            // Dimensions
            gf.addBinding(p, 'width',  { label: 'Width',  min: 5, max: 100, step: 0.5 }).on('change', rebuild),
            gf.addBinding(p, 'height', { label: 'Height', min: 10, max: 300, step: 1   }).on('change', rebuild),
            gf.addBinding(p, 'depth',  { label: 'Depth',  min: 5, max: 100, step: 0.5  }).on('change', rebuild),
            // Floors
            gf.addBinding(p, 'numFloors',        { label: 'Floors',           min: 1,   max: 40,  step: 1   }).on('change', rebuild),
            gf.addBinding(p, 'groundFloorScale',  { label: 'Ground Floor Scale', min: 1.0, max: 3.0, step: 0.1 }).on('change', rebuild),
            // Windows
            gf.addBinding(p, 'windowsPerFloorFront', { label: 'Windows (Front)', min: 0,    max: 20, step: 1   }).on('change', rebuild),
            gf.addBinding(p, 'windowsPerFloorSide',  { label: 'Windows (Side)',  min: 0,    max: 20, step: 1   }).on('change', rebuild),
            gf.addBinding(p, 'windowWidth',       { label: 'Window Width',    min: 0.5, max: 10, step: 0.1  }).on('change', rebuild),
            gf.addBinding(p, 'windowHeight',      { label: 'Window Height',   min: 0.5, max: 10, step: 0.1  }).on('change', rebuild),
            gf.addBinding(p, 'windowDepth',       { label: 'Window Depth',    min: 0.05, max: 3, step: 0.05 }).on('change', rebuild),
            gf.addBinding(p, 'windowSillHeight',  { label: 'Sill Height',     min: 0.2, max: 5,  step: 0.1  }).on('change', rebuild),
            // Ledges
            gf.addBinding(p, 'ledgeDepth',  { label: 'Ledge Depth',  min: 0, max: 3, step: 0.05 }).on('change', rebuild),
            gf.addBinding(p, 'ledgeHeight', { label: 'Ledge Height', min: 0, max: 2, step: 0.05 }).on('change', rebuild),
            // Cornice
            gf.addBinding(p, 'corniceDepth',  { label: 'Cornice Depth',  min: 0, max: 5, step: 0.1 }).on('change', rebuild),
            gf.addBinding(p, 'corniceHeight', { label: 'Cornice Height', min: 0, max: 3, step: 0.1 }).on('change', rebuild),
            // Doors
            gf.addBinding(p, 'doorWidth',      { label: 'Door Width',    min: 1,    max: 8,  step: 0.1  }).on('change', rebuild),
            gf.addBinding(p, 'doorHeight',     { label: 'Door Height',   min: 1.5,  max: 10, step: 0.1  }).on('change', rebuild),
            gf.addBinding(p, 'doorDepth',      { label: 'Door Depth',    min: 0.05, max: 3,  step: 0.05 }).on('change', rebuild),
            gf.addBinding(p, 'doorsPerFront',  { label: 'Doors (Front)', min: 0,    max: 10, step: 1    }).on('change', rebuild),
            gf.addBinding(p, 'doorsPerSide',   { label: 'Doors (Side)',  min: 0,    max: 10, step: 1    }).on('change', rebuild),
            // Staircase
            gf.addBinding(p, 'staircaseSteps',      { label: 'Stair Steps',   min: 0,   max: 15,  step: 1    }).on('change', rebuild),
            gf.addBinding(p, 'staircaseStepHeight',  { label: 'Step Height',   min: 0.1, max: 1.0, step: 0.05 }).on('change', rebuild),
            gf.addBinding(p, 'staircaseDepth',       { label: 'Stair Depth',   min: 0.5, max: 10,  step: 0.1  }).on('change', rebuild),
            // Stoop
            gf.addBinding(p, 'stoopWidth',  { label: 'Stoop Width',  min: 0, max: 3, step: 0.05 }).on('change', rebuild),
            gf.addBinding(p, 'stoopHeight', { label: 'Stoop Height', min: 0, max: 3, step: 0.05 }).on('change', rebuild),
            // Pillars
            gf.addBinding(p, 'pillarWidth', { label: 'Pillar Width', min: 0, max: 5, step: 0.1 }).on('change', rebuild),
            gf.addBinding(p, 'pillarDepth', { label: 'Pillar Depth', min: 0, max: 3, step: 0.1 }).on('change', rebuild),
        ];
    }

    collectParams() {
        return {
            shader:   this.shader.collectParams(),
            geometry: { ...this._params },
        };
    }

    applyParams(data) {
        if (data.shader) this.shader.applyParams(data.shader);
        if (data.geometry) {
            Object.assign(this._params, data.geometry);
            this._rebuild();
            for (const b of this._bindings) b.refresh();
        }
    }

    preFrame(ctx) {}

    dispose(ctx) {
        this.shader.dispose();
        this.geo?.dispose();
        ctx.scene.remove(this.mesh);
        for (const b of this._bindings) b.dispose();
    }

    _rebuild() {
        this.geo.dispose();
        this.geo = this._buildGeometry();
        this.mesh.geometry = this.geo;
    }

    // ── Geometry Generation ────────────────────────────────────────────────────

    _buildGeometry() {
        const arrays = { verts: [], norms: [], uvs: [], types: [], idxs: [], vi: 0 };
        const p = this._params;
        const corners = this._corners;
        const cs = this._cornerSize;

        const floors = this._calcFloorHeights();

        const hw = p.width / 2;
        const hd = p.depth / 2;

        // Wall-corner mapping: which corner is at the start/end of each wall
        const wallCornerMap = [
            { startCorner: 'frontLeft',  endCorner: 'frontRight' }, // Front
            { startCorner: 'backRight',  endCorner: 'backLeft'   }, // Back
            { startCorner: 'frontRight', endCorner: 'backRight'  }, // Right
            { startCorner: 'backLeft',   endCorner: 'frontLeft'  }, // Left
        ];

        const baseWalls = [
            { // Front (+Z)
                origin: [-hw, 0, hd], tangent: [1, 0, 0], perpAxis: [0, 0, 1],
                wallWidth: p.width, numWindows: p.windowsPerFloorFront, numDoors: p.doorsPerFront,
            },
            { // Back (-Z)
                origin: [hw, 0, -hd], tangent: [-1, 0, 0], perpAxis: [0, 0, -1],
                wallWidth: p.width, numWindows: p.windowsPerFloorFront, numDoors: p.doorsPerFront,
            },
            { // Right (+X)
                origin: [hw, 0, hd], tangent: [0, 0, -1], perpAxis: [1, 0, 0],
                wallWidth: p.depth, numWindows: p.windowsPerFloorSide, numDoors: p.doorsPerSide,
            },
            { // Left (-X)
                origin: [-hw, 0, -hd], tangent: [0, 0, 1], perpAxis: [-1, 0, 0],
                wallWidth: p.depth, numWindows: p.windowsPerFloorSide, numDoors: p.doorsPerSide,
            },
        ];

        for (let wi = 0; wi < baseWalls.length; wi++) {
            const wall = { ...baseWalls[wi] };
            const cm = wallCornerMap[wi];

            const startCut = corners[cm.startCorner] !== 'none' ? cs : 0;
            const endCut   = corners[cm.endCorner]   !== 'none' ? cs : 0;

            if (startCut > 0 || endCut > 0) {
                wall.origin = [
                    wall.origin[0] + wall.tangent[0] * startCut,
                    wall.origin[1],
                    wall.origin[2] + wall.tangent[2] * startCut,
                ];
                const baseWidth = wall.wallWidth;
                wall.wallWidth -= (startCut + endCut);

                if (wall.numWindows > 0) {
                    wall.numWindows = Math.max(1, Math.round(wall.numWindows * wall.wallWidth / baseWidth));
                }
                if (wall.numDoors > 0) {
                    wall.numDoors = Math.min(wall.numDoors, Math.max(1, Math.floor(wall.wallWidth / 12)));
                }
            }

            this._buildWallFace(arrays, wall, floors);
        }

        this._buildCornerFaces(arrays, floors);
        this._buildLedges(arrays, floors);
        this._buildCornice(arrays);
        this._buildRoof(arrays);
        this._buildPillars(arrays);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',    new THREE.BufferAttribute(new Float32Array(arrays.verts), 3));
        geo.setAttribute('normal',      new THREE.BufferAttribute(new Float32Array(arrays.norms), 3));
        geo.setAttribute('uv',          new THREE.BufferAttribute(new Float32Array(arrays.uvs),   2));
        geo.setAttribute('surfaceType', new THREE.BufferAttribute(new Float32Array(arrays.types), 1));
        geo.setIndex(arrays.idxs);

        return geo;
    }

    _calcFloorHeights() {
        const p = this._params;
        const numFloors = Math.max(1, Math.round(p.numFloors));
        // Ground floor height is scaled relative to regular floors
        const regularH = p.height / (numFloors - 1 + p.groundFloorScale);
        const groundH  = regularH * p.groundFloorScale;

        const floors = [];
        let y = 0;
        for (let i = 0; i < numFloors; i++) {
            const h = (i === 0) ? groundH : regularH;
            floors.push({ yBot: y, yTop: y + h, isGround: i === 0 });
            y += h;
        }
        return floors;
    }

    // ── Wall Face ──────────────────────────────────────────────────────────────

    _buildWallFace(arrays, wall, floors) {
        const p = this._params;
        const { origin, tangent, perpAxis, wallWidth, numWindows, numDoors } = wall;
        const normal = perpAxis;  // outward-facing normal

        for (const floor of floors) {
            const floorH = floor.yTop - floor.yBot;

            if (numWindows <= 0) {
                // Solid wall for this floor
                const p0 = this._wallPoint(origin, tangent, perpAxis, 0, floor.yBot, 0);
                const p1 = this._wallPoint(origin, tangent, perpAxis, wallWidth, floor.yBot, 0);
                const p2 = this._wallPoint(origin, tangent, perpAxis, wallWidth, floor.yTop, 0);
                const p3 = this._wallPoint(origin, tangent, perpAxis, 0, floor.yTop, 0);
                this._addQuad(arrays, p0, p1, p2, p3, normal, 0);
                continue;
            }

            const cellWidth = wallWidth / numWindows;

            // Clamp window dimensions
            const minMargin = 0.2;
            const effWinW = Math.min(p.windowWidth, cellWidth - minMargin * 2);
            const effWinH = Math.min(p.windowHeight, floorH - p.windowSillHeight - minMargin);

            if (effWinW <= 0 || effWinH <= 0) {
                // Window can't fit — emit solid wall
                const p0 = this._wallPoint(origin, tangent, perpAxis, 0, floor.yBot, 0);
                const p1 = this._wallPoint(origin, tangent, perpAxis, wallWidth, floor.yBot, 0);
                const p2 = this._wallPoint(origin, tangent, perpAxis, wallWidth, floor.yTop, 0);
                const p3 = this._wallPoint(origin, tangent, perpAxis, 0, floor.yTop, 0);
                this._addQuad(arrays, p0, p1, p2, p3, normal, 0);
                continue;
            }

            // Determine which cells are doors on the ground floor
            const doorCells = new Set();
            if (floor.isGround && numDoors > 0) {
                const nDoors = Math.min(numDoors, numWindows);
                for (let d = 0; d < nDoors; d++) {
                    doorCells.add(Math.floor((d + 0.5) * numWindows / nDoors));
                }
            }

            for (let j = 0; j < numWindows; j++) {
                const cellLeft  = j * cellWidth;
                const cellRight = cellLeft + cellWidth;
                const isDoor = doorCells.has(j);

                if (isDoor) {
                    // --- Door cell (ground floor only) ---
                    const numSteps   = Math.max(0, Math.round(p.staircaseSteps));
                    const stairH     = numSteps * p.staircaseStepHeight;
                    const effDoorW   = Math.min(p.doorWidth, cellWidth - minMargin * 2);
                    const effDoorH   = Math.min(p.doorHeight, floorH - stairH - minMargin);
                    if (effDoorW <= 0 || effDoorH <= 0) {
                        // Door can't fit — solid wall
                        this._addQuad(arrays,
                            this._wallPoint(origin, tangent, perpAxis, cellLeft,  floor.yBot, 0),
                            this._wallPoint(origin, tangent, perpAxis, cellRight, floor.yBot, 0),
                            this._wallPoint(origin, tangent, perpAxis, cellRight, floor.yTop, 0),
                            this._wallPoint(origin, tangent, perpAxis, cellLeft,  floor.yTop, 0),
                            normal, 0
                        );
                        continue;
                    }

                    const doorLeft  = cellLeft + (cellWidth - effDoorW) / 2;
                    const doorRight = doorLeft + effDoorW;
                    const doorBot   = floor.yBot + stairH;
                    const doorTop   = doorBot + effDoorH;
                    const dd        = p.doorDepth;

                    // Wall panels around door

                    // Above door (full cell width)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, cellLeft,  doorTop,    0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, doorTop,    0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, floor.yTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellLeft,  floor.yTop, 0),
                        normal, 0
                    );

                    // Left of door (from doorBot to doorTop)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, cellLeft, doorBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, doorLeft, doorBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, doorLeft, doorTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellLeft, doorTop, 0),
                        normal, 0
                    );

                    // Right of door (from doorBot to doorTop)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, doorBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, doorTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorTop, 0),
                        normal, 0
                    );

                    // Below door (full cell width, from floor to doorBot)
                    // Only needed when staircase raises the door
                    if (stairH > 0) {
                        this._addQuad(arrays,
                            this._wallPoint(origin, tangent, perpAxis, cellLeft,  floor.yBot, 0),
                            this._wallPoint(origin, tangent, perpAxis, cellRight, floor.yBot, 0),
                            this._wallPoint(origin, tangent, perpAxis, cellRight, doorBot,    0),
                            this._wallPoint(origin, tangent, perpAxis, cellLeft,  doorBot,    0),
                            normal, 0
                        );
                    }

                    // Door recess

                    // Door back face (recessed) — surfaceType = 4 (door)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, doorLeft,  doorBot, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorBot, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorTop, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorLeft,  doorTop, -dd),
                        normal, 4
                    );

                    // Left recess side
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, doorLeft, doorBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, doorLeft, doorBot, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorLeft, doorTop, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorLeft, doorTop, 0),
                        tangent, 0
                    );

                    // Right recess side
                    const negTangentD = [-tangent[0], -tangent[1], -tangent[2]];
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorBot, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorTop, -dd),
                        negTangentD, 0
                    );

                    // Top recess (faces downward)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, doorLeft,  doorTop, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorTop, -dd),
                        this._wallPoint(origin, tangent, perpAxis, doorRight, doorTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, doorLeft,  doorTop, 0),
                        [0, -1, 0], 0
                    );

                    // Bottom recess / threshold (faces upward) — needed when door is raised
                    if (stairH > 0) {
                        this._addQuad(arrays,
                            this._wallPoint(origin, tangent, perpAxis, doorLeft,  doorBot, 0),
                            this._wallPoint(origin, tangent, perpAxis, doorRight, doorBot, 0),
                            this._wallPoint(origin, tangent, perpAxis, doorRight, doorBot, -dd),
                            this._wallPoint(origin, tangent, perpAxis, doorLeft,  doorBot, -dd),
                            [0, 1, 0], 0
                        );
                    }

                    // --- Staircase steps ---
                    if (numSteps > 0) {
                        const stepH = p.staircaseStepHeight;
                        const stepD = p.staircaseDepth / numSteps;

                        for (let si = 0; si < numSteps; si++) {
                            const stepBotY  = floor.yBot + si * stepH;
                            const stepTopY  = floor.yBot + (si + 1) * stepH;
                            // Step si: top step (si=N-1) is closest to wall, bottom step (si=0) is furthest
                            const stepFront = (numSteps - si) * stepD;
                            const stepBack  = (numSteps - si - 1) * stepD;

                            // Riser (front vertical face, facing outward in perpAxis)
                            this._addQuad(arrays,
                                this._wallPoint(origin, tangent, perpAxis, doorLeft,  stepBotY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepBotY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepTopY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorLeft,  stepTopY, stepFront),
                                normal, 0
                            );

                            // Tread (top horizontal face, facing up)
                            this._addQuad(arrays,
                                this._wallPoint(origin, tangent, perpAxis, doorLeft,  stepTopY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepTopY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepTopY, stepBack),
                                this._wallPoint(origin, tangent, perpAxis, doorLeft,  stepTopY, stepBack),
                                [0, 1, 0], 0
                            );

                            // Left side of step
                            const negTangentS = [-tangent[0], -tangent[1], -tangent[2]];
                            this._addQuad(arrays,
                                this._wallPoint(origin, tangent, perpAxis, doorLeft, stepBotY, stepBack),
                                this._wallPoint(origin, tangent, perpAxis, doorLeft, stepBotY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorLeft, stepTopY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorLeft, stepTopY, stepBack),
                                negTangentS, 0
                            );

                            // Right side of step
                            this._addQuad(arrays,
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepBotY, stepFront),
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepBotY, stepBack),
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepTopY, stepBack),
                                this._wallPoint(origin, tangent, perpAxis, doorRight, stepTopY, stepFront),
                                tangent, 0
                            );
                        }

                        // --- Stoop side walls ---
                        if (p.stoopWidth > 0 && p.stoopHeight > 0) {
                            const sw = p.stoopWidth;
                            const sh = p.stoopHeight;
                            const stoopLeft  = doorLeft - sw;
                            const stoopRight = doorRight + sw;
                            const negTangentSt = [-tangent[0], -tangent[1], -tangent[2]];

                            for (let si = 0; si < numSteps; si++) {
                                const stepFrontS = (numSteps - si) * stepD;
                                const stepBackS  = (numSteps - si - 1) * stepD;
                                const stoopTopY  = floor.yBot + (si + 1) * stepH + sh;
                                const prevTopY   = (si > 0) ? floor.yBot + si * stepH + sh : floor.yBot;

                                // ── Left stoop wall ──

                                // Outer face (faces -tangent)
                                this._addQuad(arrays,
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, floor.yBot, stepBackS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, floor.yBot, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, stoopTopY,  stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, stoopTopY,  stepBackS),
                                    negTangentSt, 0
                                );

                                // Top face
                                this._addQuad(arrays,
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, stoopTopY, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, doorLeft,  stoopTopY, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, doorLeft,  stoopTopY, stepBackS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, stoopTopY, stepBackS),
                                    [0, 1, 0], 0
                                );

                                // Front riser (stepped profile)
                                this._addQuad(arrays,
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, prevTopY,  stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, doorLeft,  prevTopY,  stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, doorLeft,  stoopTopY, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopLeft, stoopTopY, stepFrontS),
                                    normal, 0
                                );

                                // ── Right stoop wall ──

                                // Outer face (faces +tangent)
                                this._addQuad(arrays,
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, floor.yBot, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, floor.yBot, stepBackS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, stoopTopY,  stepBackS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, stoopTopY,  stepFrontS),
                                    tangent, 0
                                );

                                // Top face
                                this._addQuad(arrays,
                                    this._wallPoint(origin, tangent, perpAxis, doorRight,  stoopTopY, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, stoopTopY, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, stoopTopY, stepBackS),
                                    this._wallPoint(origin, tangent, perpAxis, doorRight,  stoopTopY, stepBackS),
                                    [0, 1, 0], 0
                                );

                                // Front riser (stepped profile)
                                this._addQuad(arrays,
                                    this._wallPoint(origin, tangent, perpAxis, doorRight,  prevTopY,  stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, prevTopY,  stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, stoopRight, stoopTopY, stepFrontS),
                                    this._wallPoint(origin, tangent, perpAxis, doorRight,  stoopTopY, stepFrontS),
                                    normal, 0
                                );
                            }
                        }
                    }

                } else {
                    // --- Window cell (normal behavior) ---
                    const winLeft   = cellLeft  + (cellWidth - effWinW) / 2;
                    const winRight  = winLeft + effWinW;
                    const winBot    = floor.yBot + p.windowSillHeight;
                    const winTop    = winBot + effWinH;

                    // 4 wall panels around the window

                    // Below window (full cell width)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, cellLeft,  floor.yBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, floor.yBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, winBot,     0),
                        this._wallPoint(origin, tangent, perpAxis, cellLeft,  winBot,     0),
                        normal, 0
                    );

                    // Above window (full cell width)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, cellLeft,  winTop,     0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, winTop,     0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, floor.yTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellLeft,  floor.yTop, 0),
                        normal, 0
                    );

                    // Left of window
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, cellLeft, winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellLeft, winTop, 0),
                        normal, 0
                    );

                    // Right of window
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, winRight,  winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, cellRight, winTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, winRight,  winTop, 0),
                        normal, 0
                    );

                    // Window recess
                    const wd = p.windowDepth;

                    // Window back face (recessed)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winBot, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winBot, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winTop, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winTop, -wd),
                        normal, 1  // surfaceType = window
                    );

                    // Left recess side
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, winLeft, winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, winLeft, winBot, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winLeft, winTop, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winLeft, winTop, 0),
                        tangent, 0
                    );

                    // Right recess side
                    const negTangent = [-tangent[0], -tangent[1], -tangent[2]];
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, winRight, winBot, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winTop, -wd),
                        negTangent, 0
                    );

                    // Top recess (faces downward)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winTop, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winTop, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winTop, 0),
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winTop, 0),
                        [0, -1, 0], 0
                    );

                    // Bottom recess / sill (faces upward)
                    this._addQuad(arrays,
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winBot, 0),
                        this._wallPoint(origin, tangent, perpAxis, winRight, winBot, -wd),
                        this._wallPoint(origin, tangent, perpAxis, winLeft,  winBot, -wd),
                        [0, 1, 0], 0
                    );
                }
            }
        }
    }

    /**
     * Compute a 3D point on/near a wall face.
     * @param {number[]} origin - wall origin [x,y,z]
     * @param {number[]} tangent - wall tangent direction
     * @param {number[]} perpAxis - wall outward normal direction
     * @param {number} along - distance along tangent from origin
     * @param {number} y - Y coordinate (height)
     * @param {number} perpOffset - offset along perpAxis (negative = recessed into wall)
     */
    _wallPoint(origin, tangent, perpAxis, along, y, perpOffset) {
        return [
            origin[0] + tangent[0] * along + perpAxis[0] * perpOffset,
            y,
            origin[2] + tangent[2] * along + perpAxis[2] * perpOffset,
        ];
    }

    // ── Corner Faces ────────────────────────────────────────────────────────

    _buildCornerFaces(arrays, floors) {
        const corners = this._corners;
        const cs = this._cornerSize;
        const hw = this._params.width / 2;
        const hd = this._params.depth / 2;
        const N = this._cornerSegments;

        // Corner arc definitions: center XZ, start/end angle for quarter-arc
        const cornerDefs = {
            frontRight: { cx: hw - cs,  cz: hd - cs,  startAngle: Math.PI / 2,  endAngle: 0 },
            frontLeft:  { cx: -hw + cs, cz: hd - cs,  startAngle: Math.PI,      endAngle: Math.PI / 2 },
            backRight:  { cx: hw - cs,  cz: -hd + cs, startAngle: 0,            endAngle: -Math.PI / 2 },
            backLeft:   { cx: -hw + cs, cz: -hd + cs, startAngle: -Math.PI / 2, endAngle: -Math.PI },
        };

        for (const [name, style] of Object.entries(corners)) {
            if (style === 'none') continue;
            const def = cornerDefs[name];
            if (style === 'flat') {
                this._buildFlatCorner(arrays, floors, def);
            } else if (style === 'round') {
                this._buildRoundCorner(arrays, floors, def, N);
            }
        }
    }

    _buildFlatCorner(arrays, floors, def) {
        const cs = this._cornerSize;

        // Start and end points on the arc boundary
        const x0 = def.cx + cs * Math.cos(def.startAngle);
        const z0 = def.cz + cs * Math.sin(def.startAngle);
        const x1 = def.cx + cs * Math.cos(def.endAngle);
        const z1 = def.cz + cs * Math.sin(def.endAngle);

        // Tangent from start to end
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const tangent = [dx / len, 0, dz / len];

        // Outward normal (pointing away from building center)
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const ndx = mx - def.cx, ndz = mz - def.cz;
        const nlen = Math.sqrt(ndx * ndx + ndz * ndz) || 1;
        const perpAxis = [ndx / nlen, 0, ndz / nlen];

        const wallWidth = len;
        const numWindows = Math.max(1, Math.round(wallWidth / 5));
        const numDoors = this._cornerDoor ? 1 : 0;

        this._buildWallFace(arrays, {
            origin: [x0, 0, z0], tangent, perpAxis, wallWidth, numWindows, numDoors,
        }, floors);
    }

    _buildRoundCorner(arrays, floors, def, N) {
        const cs = this._cornerSize;
        const angleStep = (def.endAngle - def.startAngle) / N;
        const centerSeg = Math.floor(N / 2);

        for (let i = 0; i < N; i++) {
            const a0 = def.startAngle + i * angleStep;
            const a1 = def.startAngle + (i + 1) * angleStep;

            const x0 = def.cx + cs * Math.cos(a0);
            const z0 = def.cz + cs * Math.sin(a0);
            const x1 = def.cx + cs * Math.cos(a1);
            const z1 = def.cz + cs * Math.sin(a1);

            const dx = x1 - x0, dz = z1 - z0;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            const tangent = [dx / len, 0, dz / len];

            // Radial outward normal at midpoint of segment
            const aMid = (a0 + a1) / 2;
            const perpAxis = [Math.cos(aMid), 0, Math.sin(aMid)];

            const wallWidth = len;
            const numDoors = (this._cornerDoor && i === centerSeg) ? 1 : 0;
            const numWindows = wallWidth >= 3.0 ? 1 : 0;

            this._buildWallFace(arrays, {
                origin: [x0, 0, z0], tangent, perpAxis, wallWidth, numWindows, numDoors,
            }, floors);
        }
    }

    // ── Footprint Polygon ────────────────────────────────────────────────────

    /**
     * Build the building footprint as a clockwise polygon in XZ.
     * Used by _buildRing, _buildRoof, and _buildPillars for corner-aware geometry.
     */
    _getFootprintPoints() {
        const p = this._params;
        const corners = this._corners;
        const cs = this._cornerSize;
        const hw = p.width / 2;
        const hd = p.depth / 2;
        const N = this._cornerSegments;

        const pts = [];

        // frontLeft corner or vertex
        if (corners.frontLeft !== 'none') {
            const cx = -hw + cs, cz = hd - cs;
            if (corners.frontLeft === 'round') {
                for (let i = 0; i <= N; i++) {
                    const a = Math.PI - i * (Math.PI / 2) / N;
                    pts.push({ x: cx + cs * Math.cos(a), z: cz + cs * Math.sin(a) });
                }
            } else {
                pts.push({ x: -hw, z: hd - cs });
                pts.push({ x: -hw + cs, z: hd });
            }
        } else {
            pts.push({ x: -hw, z: hd });
        }

        // frontRight corner or vertex
        if (corners.frontRight !== 'none') {
            const cx = hw - cs, cz = hd - cs;
            if (corners.frontRight === 'round') {
                for (let i = 0; i <= N; i++) {
                    const a = Math.PI / 2 - i * (Math.PI / 2) / N;
                    pts.push({ x: cx + cs * Math.cos(a), z: cz + cs * Math.sin(a) });
                }
            } else {
                pts.push({ x: hw - cs, z: hd });
                pts.push({ x: hw, z: hd - cs });
            }
        } else {
            pts.push({ x: hw, z: hd });
        }

        // backRight corner or vertex
        if (corners.backRight !== 'none') {
            const cx = hw - cs, cz = -hd + cs;
            if (corners.backRight === 'round') {
                for (let i = 0; i <= N; i++) {
                    const a = -i * (Math.PI / 2) / N;
                    pts.push({ x: cx + cs * Math.cos(a), z: cz + cs * Math.sin(a) });
                }
            } else {
                pts.push({ x: hw, z: -hd + cs });
                pts.push({ x: hw - cs, z: -hd });
            }
        } else {
            pts.push({ x: hw, z: -hd });
        }

        // backLeft corner or vertex
        if (corners.backLeft !== 'none') {
            const cx = -hw + cs, cz = -hd + cs;
            if (corners.backLeft === 'round') {
                for (let i = 0; i <= N; i++) {
                    const a = -Math.PI / 2 - i * (Math.PI / 2) / N;
                    pts.push({ x: cx + cs * Math.cos(a), z: cz + cs * Math.sin(a) });
                }
            } else {
                pts.push({ x: -hw + cs, z: -hd });
                pts.push({ x: -hw, z: -hd + cs });
            }
        } else {
            pts.push({ x: -hw, z: -hd });
        }

        return pts;
    }

    // ── Ledges ─────────────────────────────────────────────────────────────────

    _buildLedges(arrays, floors) {
        const p = this._params;
        if (p.ledgeDepth <= 0 || p.ledgeHeight <= 0) return;

        const hw = p.width / 2;
        const hd = p.depth / 2;

        // Ledges at each floor boundary (between floors)
        for (let i = 1; i < floors.length; i++) {
            const boundaryY = floors[i].yBot;
            this._buildRing(arrays, hw, hd, boundaryY, p.ledgeDepth, p.ledgeHeight, 2);
        }
    }

    // ── Cornice ────────────────────────────────────────────────────────────────

    _buildCornice(arrays) {
        const p = this._params;
        if (p.corniceDepth <= 0 || p.corniceHeight <= 0) return;

        const hw = p.width / 2;
        const hd = p.depth / 2;
        this._buildRing(arrays, hw, hd, p.height, p.corniceDepth, p.corniceHeight, 2);
    }

    /**
     * Build a horizontal ring (ledge or cornice) around the building.
     * Ring bottom sits at `baseY - ringH/2`, top at `baseY + ringH/2`.
     */
    _buildRing(arrays, hw, hd, baseY, ringDepth, ringH, surfType) {
        const yBot = baseY - ringH / 2;
        const yTop = baseY + ringH / 2;
        const hasCorners = Object.values(this._corners).some(c => c !== 'none');

        if (!hasCorners) {
            // Original rectangular ring
            const outerW = hw + ringDepth;
            const outerD = hd + ringDepth;

            this._addQuad(arrays,
                [-outerW, yBot, outerD], [outerW, yBot, outerD],
                [outerW,  yTop, outerD], [-outerW, yTop, outerD],
                [0, 0, 1], surfType
            );
            this._addQuad(arrays,
                [outerW,  yBot, -outerD], [-outerW, yBot, -outerD],
                [-outerW, yTop, -outerD], [outerW,  yTop, -outerD],
                [0, 0, -1], surfType
            );
            this._addQuad(arrays,
                [outerW, yBot, outerD],  [outerW, yBot, -outerD],
                [outerW, yTop, -outerD], [outerW, yTop, outerD],
                [1, 0, 0], surfType
            );
            this._addQuad(arrays,
                [-outerW, yBot, -outerD], [-outerW, yBot, outerD],
                [-outerW, yTop, outerD],  [-outerW, yTop, -outerD],
                [-1, 0, 0], surfType
            );
            this._addQuad(arrays,
                [-outerW, yTop, outerD],  [outerW,  yTop, outerD],
                [outerW,  yTop, -outerD], [-outerW, yTop, -outerD],
                [0, 1, 0], surfType
            );
            this._addQuad(arrays,
                [-outerW, yBot, -outerD], [outerW,  yBot, -outerD],
                [outerW,  yBot, outerD],  [-outerW, yBot, outerD],
                [0, -1, 0], surfType
            );
            return;
        }

        // Polygon-based ring following the building footprint
        const footprint = this._getFootprintPoints();
        const rd = ringDepth;
        const n = footprint.length;

        // Compute edge normals (outward for clockwise polygon: (-dz, dx))
        const edgeNormals = [];
        for (let i = 0; i < n; i++) {
            const p0 = footprint[i];
            const p1 = footprint[(i + 1) % n];
            const dx = p1.x - p0.x;
            const dz = p1.z - p0.z;
            const elen = Math.sqrt(dx * dx + dz * dz) || 1;
            edgeNormals.push({ x: -dz / elen, z: dx / elen });
        }

        // Compute outer vertices (mitered at junctions)
        const outerPts = [];
        for (let i = 0; i < n; i++) {
            const prevEdge = (i - 1 + n) % n;
            const nPrev = edgeNormals[prevEdge];
            const nCurr = edgeNormals[i];

            const bx = nPrev.x + nCurr.x;
            const bz = nPrev.z + nCurr.z;
            const blen = Math.sqrt(bx * bx + bz * bz) || 1;
            const bnx = bx / blen;
            const bnz = bz / blen;

            const dot = bnx * nCurr.x + bnz * nCurr.z;
            const scale = dot > 0.01 ? rd / dot : rd;

            outerPts.push({
                x: footprint[i].x + bnx * scale,
                z: footprint[i].z + bnz * scale,
            });
        }

        // Build ring sections
        for (let i = 0; i < n; i++) {
            const i1 = (i + 1) % n;
            const ip = footprint[i], ip1 = footprint[i1];
            const op = outerPts[i], op1 = outerPts[i1];
            const en = edgeNormals[i];

            // Skip degenerate edges
            const dx = ip1.x - ip.x, dz = ip1.z - ip.z;
            if (Math.sqrt(dx * dx + dz * dz) < 0.001) continue;

            // Outer vertical face
            this._addQuad(arrays,
                [op.x, yBot, op.z], [op1.x, yBot, op1.z],
                [op1.x, yTop, op1.z], [op.x, yTop, op.z],
                [en.x, 0, en.z], surfType
            );

            // Top strip
            this._addQuad(arrays,
                [ip.x, yTop, ip.z], [ip1.x, yTop, ip1.z],
                [op1.x, yTop, op1.z], [op.x, yTop, op.z],
                [0, 1, 0], surfType
            );

            // Bottom strip
            this._addQuad(arrays,
                [op.x, yBot, op.z], [op1.x, yBot, op1.z],
                [ip1.x, yBot, ip1.z], [ip.x, yBot, ip.z],
                [0, -1, 0], surfType
            );
        }
    }

    // ── Roof ───────────────────────────────────────────────────────────────────

    _buildRoof(arrays) {
        const p  = this._params;
        const hw = p.width / 2;
        const hd = p.depth / 2;
        const y  = p.height;
        const hasCorners = Object.values(this._corners).some(c => c !== 'none');

        if (!hasCorners) {
            this._addQuad(arrays,
                [-hw, y, hd], [hw, y, hd], [hw, y, -hd], [-hw, y, -hd],
                [0, 1, 0], 3
            );
            return;
        }

        // Triangle fan from center for polygon footprint
        const footprint = this._getFootprintPoints();
        const n = footprint.length;

        for (let i = 0; i < n; i++) {
            const i1 = (i + 1) % n;
            this._addTri(arrays,
                [0, y, 0],
                [footprint[i].x, y, footprint[i].z],
                [footprint[i1].x, y, footprint[i1].z],
                [0, 1, 0], 3
            );
        }
    }

    // ── Pillars ────────────────────────────────────────────────────────────────

    _buildPillars(arrays) {
        const p = this._params;
        if (p.pillarWidth <= 0 || p.pillarDepth <= 0) return;

        const hw = p.width / 2;
        const hd = p.depth / 2;
        const pw = p.pillarWidth;
        const pd = p.pillarDepth;
        const h  = p.height;

        // 4 corners: each pillar has 3 visible faces
        const corners = [
            { sx:  1, sz:  1, name: 'frontRight' },
            { sx: -1, sz:  1, name: 'frontLeft'  },
            { sx:  1, sz: -1, name: 'backRight'  },
            { sx: -1, sz: -1, name: 'backLeft'   },
        ];

        for (const c of corners) {
            // Skip pillars at active corners (replaced by corner face geometry)
            if (this._corners[c.name] !== 'none') continue;

            const cx = c.sx * hw;
            const cz = c.sz * hd;

            // Face facing outward along X
            const xOuter = cx + c.sx * pd;
            this._addQuad(arrays,
                [xOuter, 0, cz],
                [xOuter, 0, cz - c.sz * pw],
                [xOuter, h, cz - c.sz * pw],
                [xOuter, h, cz],
                [c.sx, 0, 0], 2
            );

            // Face facing outward along Z
            const zOuter = cz + c.sz * pd;
            this._addQuad(arrays,
                [cx - c.sx * pw, 0, zOuter],
                [cx,             0, zOuter],
                [cx,             h, zOuter],
                [cx - c.sx * pw, h, zOuter],
                [0, 0, c.sz], 2
            );

            // Corner return face (diagonal face connecting the two outer faces)
            this._addQuad(arrays,
                [cx,     0, zOuter],
                [xOuter, 0, cz],
                [xOuter, h, cz],
                [cx,     h, zOuter],
                [c.sx, 0, c.sz], 2  // approximate diagonal normal
            );
        }
    }

    // ── Quad Helper ────────────────────────────────────────────────────────────

    /**
     * Add a quad (2 triangles, 4 unique vertices) to the accumulator arrays.
     * Winding: p0 → p1 → p2 → p3 (CCW when viewed from the normal direction).
     *
     * @param {Object} a - accumulator { verts, norms, uvs, types, idxs, vi }
     * @param {number[]} p0 - bottom-left [x,y,z]
     * @param {number[]} p1 - bottom-right [x,y,z]
     * @param {number[]} p2 - top-right [x,y,z]
     * @param {number[]} p3 - top-left [x,y,z]
     * @param {number[]} normal - face normal [nx,ny,nz]
     * @param {number} surfType - 0=wall, 1=window, 2=trim, 3=roof, 4=door
     */
    _addQuad(a, p0, p1, p2, p3, normal, surfType) {
        const base = a.vi;

        // 4 vertices
        const pts = [p0, p1, p2, p3];
        for (const pt of pts) {
            a.verts.push(pt[0], pt[1], pt[2]);
            a.norms.push(normal[0], normal[1], normal[2]);
            a.types.push(surfType);
        }

        // UVs — project onto quad-local 2D
        // Edge vectors
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

        // 2 triangles: (0,1,2) and (0,2,3)
        a.idxs.push(base, base + 1, base + 2);
        a.idxs.push(base, base + 2, base + 3);

        a.vi += 4;
    }

    /**
     * Add a triangle (3 unique vertices) to the accumulator arrays.
     * Winding: p0 → p1 → p2 (CCW when viewed from the normal direction).
     */
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
