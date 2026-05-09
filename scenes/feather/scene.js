SceneRegistry['feather'] = () => ({
    name: 'Feather',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities = new SceneEntities();

        // --- Scene setup ---
        ctx.scene.background = new THREE.Color(0x1a1a2e);

        // ── Camera ─────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posY: 1, posZ: 3,
            lookY: 1,
        }));
        camera.init(ctx, folder);

        // --- Wind --────────────────────────────────────────────────────────
        const wind = this.entities.addSystem('wind', new WindSystem());
        wind.init(ctx, folder);

        // ── Feather ────────────────────────────────────────────────────────
        const feather = this.entities.addObject(new Feather({windSystem: wind}));
        await feather.init(ctx, folder, 'objects/Feather');
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
    },
});
