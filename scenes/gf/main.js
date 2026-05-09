SceneRegistry['gf'] = () => ({
    name: 'Grass Field',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities    = new SceneEntities();
        this.objects     = this.entities.objects;
        this.postEffects = this.entities.effects;

        // ── Camera ──────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posY: 120, posZ: 300,
        }));
        camera._ranges.posY = { min: 0, max: 400, step: 1 };
        camera._ranges.posZ = { min: 50, max: 800, step: 1 };
        camera.init(ctx, folder);

        ctx.scene.fog = new THREE.Fog(0x87ceeb, 400, 900);

        // ── Wind System ────────────────────────────────────────────────────
        const wind = this.entities.addSystem('wind', new WindSystem());
        wind.init(ctx, folder);

        // ── Scene Objects ──────────────────────────────────────────────────
        const sky = this.entities.addObject(new SkyDome());
        await sky.init(ctx, folder);

        const grass = this.entities.addObject(new GrassField({
            bladeCols: 100, bladeRows: 100, windSystem: wind,
        }));
        await grass.init(ctx, folder);

        const windVis = this.entities.addObject(new WindVisualizer({
            windSystem: wind, fieldSize: 600,
        }));
        await windVis.init(ctx, folder);

        // ── Post Processing ────────────────────────────────────────────────
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
        ctx.scene.fog = null;
    },
});
