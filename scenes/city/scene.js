SceneRegistry['city'] = () => ({
    name: 'City',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities = new SceneEntities();

        // Background
        ctx.scene.background = new THREE.Color(0x87CEEB);

        // ── Camera ──────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posX: 0, posY: 80, posZ: 200,
            lookX: 0, lookY: 20, lookZ: 0,
            fov: 50, near: 0.1, far: 5000,
        }));
        camera._ranges.posX  = { min: -400, max: 400, step: 1 };
        camera._ranges.posY  = { min: 0,    max: 500, step: 1 };
        camera._ranges.posZ  = { min: 10,   max: 500, step: 1 };
        camera._ranges.lookY = { min: 0,    max: 200, step: 1 };
        camera.init(ctx, folder);

        // ── Sun ─────────────────────────────────────────────────────────────
        this.sun = this.entities.addObject(new Sun({
            distance: 5000,
            meshVisible: false,
        }));
        await this.sun.init(ctx, folder);

        // ── CityLayout System ─────────────────────────────────────────────
        await fetchScript('systems/CityLayout.js');
        this.layout = this.entities.addSystem('layout', new CityLayout());
        this.layout._onChange = () => {
            if (this.city?._layout) {
                this.city._buildCity(this.layout.computeLayout());
            }
        };
        this.layout.init(ctx, folder);

        // ── City (roads + buildings) ──────────────────────────────────────
        const cityDir = await loadObject('City');
        this.city = this.entities.addObject(new City());
        this.city._layout = this.layout;
        await this.city.init(ctx, folder, cityDir);

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
        // Sun updates first, then pushes direction/color into city shaders
        if (this.sun) {
            this.sun.preFrame(ctx);

            // Building materials (shared sun uniforms)
            if (this.city?.sunUniforms) {
                this.sun.applyToUniforms(this.city.sunUniforms);
            }

            // Road material sun uniforms
            if (this.city?.roadSunUniforms) {
                this.sun.applyToUniforms(this.city.roadSunUniforms);
            }
        }

        for (const obj of this.entities.objects) {
            if (obj === this.sun) continue;
            obj.preFrame(ctx);
        }
    },

    onDeactivate(ctx) {
        this.entities.dispose(ctx);
        this.sun    = null;
        this.layout = null;
        this.city   = null;
        ctx.scene.background = null;
    },
});
