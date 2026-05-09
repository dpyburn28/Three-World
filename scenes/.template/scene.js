SceneRegistry['template'] = () => ({
    name: 'Template',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities    = new SceneEntities();
        this.objects     = this.entities.objects;
        this.postEffects = this.entities.effects;

        // --- Scene setup ---
        ctx.scene.background = new THREE.Color(0x000000);
        // ctx.scene.fog = new THREE.Fog(0x000000, 100, 1000);

        // ── Camera ──────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posZ: 5,
        }));
        // Customize ranges per scene:
        // camera._ranges.posY = { min: -500, max: 500, step: 1 };
        // camera._ranges.posZ = { min: 1, max: 1000, step: 1 };
        camera.init(ctx, folder);

        // ── Objects ─────────────────────────────────────────────────────────
        // const myObj = this.entities.addObject(new MyObject({ exampleOption: 1.0 }));
        // await myObj.init(ctx, folder);

        // ── Post Processing ─────────────────────────────────────────────────
        // this._ppFolder = folder.addFolder({ title: 'Post Processing', expanded: false });
        // const myFx = this.entities.addEffect(new MyEffect({ enabled: true }));
        // await myFx.init(ctx, this._ppFolder);
    },

    setupGui(folder, ctx) {
        // --- Scene-level params ---
        // this._sceneParams = { myValue: 0.5 };
        // this._sceneBindings = [
        //     folder.addBinding(this._sceneParams, 'myValue', { min: 0, max: 1 })
        //         .on('change', ({ value }) => { /* apply */ }),
        // ];
    },

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
