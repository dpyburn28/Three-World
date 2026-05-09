SceneRegistry['multiFeather'] = () => ({
    name: 'Multi-Feather',
    _ctx: null,
    _feather: null,
    _cloneMeshes: [],
    _wireMesh: null,
    _wireGeo: null,
    _wireMat: null,
    _curve: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities    = new SceneEntities();
        this.objects     = this.entities.objects;
        this.postEffects = this.entities.effects;

        ctx.scene.background = new THREE.Color(0x1a1a2e);

        // ── Camera ───────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posX: 0, posY: 1.5, posZ: 8,
            lookX: 0.5, lookY: 0.5, lookZ: 0,
        }));
        camera.init(ctx, folder);

        // ── Wind ─────────────────────────────────────────────────────────
        const wind = this.entities.addSystem('wind', new WindSystem());
        wind.init(ctx, folder);

        // ── Primary Feather (full GUI + presets) ─────────────────────────
        this._feather = this.entities.addObject(new Feather({ windSystem: wind }));
        await this._feather.init(ctx, folder, 'objects/Feather');

        // ── Wire curve ───────────────────────────────────────────────────
        this._curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-5.0, 2.2,  0.0),
            new THREE.Vector3(-2.5, 1.7,  0.3),
            new THREE.Vector3( 0.0, 1.5,  0.0),
            new THREE.Vector3( 2.5, 1.7, -0.3),
            new THREE.Vector3( 5.0, 2.2,  0.0),
        ]);

        this._wireGeo = new THREE.TubeGeometry(this._curve, 64, 0.015, 8, false);
        this._wireMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
        this._wireMesh = new THREE.Mesh(this._wireGeo, this._wireMat);
        ctx.scene.add(this._wireMesh);

        // ── Place feathers along the wire ────────────────────────────────
        const N = 10;
        this._positionFeatherOnCurve(this._feather.mesh, 0, N);

        const geo = this._feather.mesh.geometry;
        const mat = this._feather.shader.mat;

        this._cloneMeshes = [];
        for (let i = 1; i < N; i++) {
            const clone = new THREE.Mesh(geo, mat);
            this._positionFeatherOnCurve(clone, i, N);
            ctx.scene.add(clone);
            this._cloneMeshes.push(clone);
        }

        // ── Patch _rebuild to propagate geometry to clones ───────────────
        const originalRebuild = this._feather._rebuild.bind(this._feather);
        const cloneMeshes = this._cloneMeshes;
        this._feather._rebuild = function() {
            originalRebuild();
            const newGeo = this.mesh.geometry;
            for (const c of cloneMeshes) {
                c.geometry = newGeo;
            }
        };
    },

    _positionFeatherOnCurve(mesh, index, total) {
        const t = index / (total - 1);
        const pos = this._curve.getPointAt(t);

        mesh.position.copy(pos);

        // Deterministic per-feather pseudo-random variation
        const seed = index * 137.508;
        const tiltX = Math.sin(seed) * 0.25;
        const tiltZ = Math.cos(seed * 1.3) * 0.15;
        const twist = Math.sin(seed * 0.7 + 1.0) * 0.6;

        mesh.rotation.set(
            Math.PI + tiltX,   // hang downward + fore-aft tilt
            twist,             // twist around shaft axis
            tiltZ              // lateral lean
        );
    },

    setupGui(folder, ctx) {},

    collectParams()    { return this.entities.collectParams(); },
    applyParams(data)  { this.entities.applyParams(data); },
    preFrame(ctx)      { this.entities.preFrame(ctx); },
    draw(ctx)          { this.entities.draw(ctx); },

    onActivate(ctx) {},

    onDeactivate(ctx) {
        // Remove clones (don't dispose shared geo/mat)
        for (const clone of this._cloneMeshes) {
            ctx.scene.remove(clone);
        }
        this._cloneMeshes = [];

        // Dispose wire
        if (this._wireMesh) {
            ctx.scene.remove(this._wireMesh);
            this._wireGeo.dispose();
            this._wireMat.dispose();
            this._wireMesh = null;
        }

        // Primary feather, wind, camera via entities
        this.entities.dispose(ctx);
        ctx.scene.background = null;
    },
});
