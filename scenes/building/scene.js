SceneRegistry['building'] = () => ({
    name: 'Building',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities    = new SceneEntities();
        this.objects     = this.entities.objects;
        this.postEffects = this.entities.effects;

        // Background
        ctx.scene.background = new THREE.Color(0x87CEEB);

        // ── Camera ──────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posX: 40, posY: 45, posZ: 60,
            lookX: 0, lookY: 35, lookZ: 0,
            fov: 50, near: 0.1, far: 5000,
        }));
        camera._ranges.posX  = { min: -200, max: 200, step: 1 };
        camera._ranges.posY  = { min: 0,    max: 300, step: 1 };
        camera._ranges.posZ  = { min: 10,   max: 300, step: 1 };
        camera._ranges.lookY = { min: 0,    max: 200, step: 1 };
        camera.init(ctx, folder);

        // ── Sun ─────────────────────────────────────────────────────────────
        this.sun = this.entities.addObject(new Sun({
            distance: 5000,
            meshVisible: false,
        }));
        await this.sun.init(ctx, folder);

        // ── Building ────────────────────────────────────────────────────────
        const buildingDir = await loadObject('Building');
        this.building = this.entities.addObject(new Building());
        await this.building.init(ctx, folder, buildingDir);

        // ── Post Processing ─────────────────────────────────────────────────
        this._ppFolder = folder.addFolder({ title: 'Post Processing', expanded: false });
        const dither = this.entities.addEffect(new DitherEffect({ enabled: false }));
        await dither.init(ctx, this._ppFolder);
    },

    setupGui(folder, ctx) {},

    collectParams()    { return this.entities.collectParams(); },
    applyParams(data)  { this.entities.applyParams(data); },
    draw(ctx)          { this.entities.draw(ctx); },

    preFrame(ctx) {
        // Sun updates first, then pushes direction/color into building shader
        if (this.sun) {
            this.sun.preFrame(ctx);
            if (this.building?.shader?.mat?.uniforms) {
                this.sun.applyToUniforms(this.building.shader.mat.uniforms);
            }
        }

        for (const obj of this.entities.objects) {
            if (obj === this.sun) continue;
            obj.preFrame(ctx);
        }
    },

    onDeactivate(ctx) {
        this.entities.dispose(ctx);
        this.sun      = null;
        this.building = null;
        ctx.scene.background = null;
    },
});
