SceneRegistry['eye'] = () => ({
    name: 'Eye',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities    = new SceneEntities();
        this.objects     = this.entities.objects;
        this.postEffects = this.entities.effects;

        // --- Scene setup ---
        ctx.scene.background = new THREE.Color(0x000000);

        // ── Camera ──────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posZ: 5,
        }));
        camera._ranges.posY = { min: -500, max: 500, step: 1 };
        camera._ranges.posZ = { min: 1, max: 1000, step: 1 };
        camera.init(ctx, folder);

        // ── Objects ─────────────────────────────────────────────────────────
        const eye = this.entities.addObject(new Eye());
        await eye.init(ctx, folder);

        const water = this.entities.addObject(new Water());
        await water.init(ctx, folder);

        // ── Post Processing ─────────────────────────────────────────────────
        this._ppFolder = folder.addFolder({ title: 'Post Processing', expanded: false });

        const dither = this.entities.addEffect(new DitherEffect({ enabled: true }));
        await dither.init(ctx, this._ppFolder);

        const datamosh = this.entities.addEffect(new DatamoshEffect({ enabled: true }));
        await datamosh.init(ctx, this._ppFolder);
    },

    setupGui(folder, ctx) {},

    collectParams()    { return this.entities.collectParams(); },
    applyParams(data)  { this.entities.applyParams(data); },
    preFrame(ctx)      { this.entities.preFrame(ctx); },
    draw(ctx)          { this.entities.draw(ctx); },

    onActivate(ctx) {},

    onDeactivate(ctx) {
        this.entities.dispose(ctx);
        ctx.scene.background = null;
        ctx.scene.fog        = null;
    },
});
