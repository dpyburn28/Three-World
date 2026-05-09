SceneRegistry['desert'] = () => ({
    name: 'Desert',
    _ctx: null,

    async load(ctx, folder) {
        this._ctx = ctx;
        this.entities    = new SceneEntities();
        this.objects     = this.entities.objects;
        this.postEffects = this.entities.effects;

        // ── Camera ──────────────────────────────────────────────────────────
        const camera = this.entities.addSystem('camera', new CameraSystem({
            posY: 150, posZ: 500,
            lookY: 50,
            fov: 75, near: 0.1, far: 10000,
        }));
        camera._ranges.posY = { min: 10, max: 600, step: 1 };
        camera._ranges.posZ = { min: 50, max: 1500, step: 1 };
        camera._ranges.fov  = { min: 30, max: 100, step: 1 };
        camera.init(ctx, folder);

        // Warm desert haze fog
        ctx.scene.fog = new THREE.FogExp2(0xc49a4a, 0.0006);

        // ── Wind System ─────────────────────────────────────────────────────
        const wind = this.entities.addSystem('wind', new WindSystem());
        Object.assign(wind._params, {
            direction:       60.0,
            speed:           2.2,
            strength:        16.0,
            gustStrength:    26.0,
            gustSpeed:       4.0,
            gustScale:       0.004,
            gustSharpness:   2.5,
            gustTemporality: 0.4,
            turbulence:      5.0,
            turbOctaves:     4,
            roughnessLength: 0.001,  // very smooth sand
            referenceHeight: 150.0,
            shearAngle:      20.0,
            shearHeight:     120.0,
            verticalStrength:0.08,
        });
        wind.init(ctx, folder);

        // ── Sun (canonical direction, disk, bloom, visible mesh) ────────────
        this.sun = this.entities.addObject(new Sun({}));
        await this.sun.init(ctx, folder);

        // ── Desert Sky ──────────────────────────────────────────────────────
        const sky = this.entities.addObject(new DesertSky({
            radius: 9000, windSystem: wind, sun: this.sun,
        }));
        await sky.init(ctx, folder);

        // ── Dune Terrain ────────────────────────────────────────────────────
        this.duneTerrain = this.entities.addObject(new DuneTerrain({
            terrainSize: 1200,
            hmRes:       512,
            meshRes:     256,
            windSystem:  wind,
            sun:         this.sun,
        }));
        await this.duneTerrain.init(ctx, folder);

        // ── Sand Particles ──────────────────────────────────────────────────
        const sand = this.entities.addObject(new SandParticles({
            windSystem:  wind,
            duneTerrain: this.duneTerrain,
            fieldSize:   1200,
        }));
        await sand.init(ctx, folder);

        // ← Wire resize: whenever terrain changes size, sand syncs automatically
        this.duneTerrain.onResize((newSize) => {
            sand.matchTerrain(this.duneTerrain);
        });

        // ── Wind Visualizer (off by default) ────────────────────────────────
        const windVis = this.entities.addObject(new WindVisualizer({
            windSystem: wind,
            fieldSize:  1200,
        }));
        Object.assign(windVis._params, {
            numParticles: 200,
            minHeight:    5,
            maxHeight:    150,
            opacity:      0.4,
            colorMode:    'speed',
        });
        windVis._vfParams.enabled = false;
        await windVis.init(ctx, folder);
        // Start disabled — user enables in GUI
        if (windVis.mesh) windVis.mesh.visible = false;
        windVis._params.opacity = 0;

        this.duneTerrain.onResize((newSize) => {
            windVis.options.fieldSize = newSize;
            windVis._rebuild();
        });

        // ── Post Processing ─────────────────────────────────────────────────
        this._ppFolder = folder.addFolder({ title: 'Post Processing', expanded: false });

        const dither = this.entities.addEffect(new DitherEffect({ enabled: true }));
        await dither.init(ctx, this._ppFolder);

        const datamosh = this.entities.addEffect(new DatamoshEffect({ enabled: true }));
        await datamosh.init(ctx, this._ppFolder);
    },

    setupGui(folder, ctx) {},

    collectParams() { return this.entities.collectParams(); },
    applyParams(data) { this.entities.applyParams(data); },
    draw(ctx) { this.entities.draw(ctx); },

    preFrame(ctx) {
        // Sun must update first — other objects pull sun uniforms in their own preFrame
        if (this.sun) {
            this.sun.preFrame(ctx);
            const sand = this.entities.find('Sand Particles');
            if (sand?.mat) this.sun.applyToUniforms(sand.mat.uniforms);
        }

        for (const obj of this.entities.objects) {
            if (obj === this.sun) continue;
            obj.preFrame(ctx);
        }

        // Sync fog color to horizon color from sky
        const skyUniforms = this.entities.find('Desert Sky')?.sky?.mat?.uniforms;
        if (skyUniforms && ctx.scene.fog) {
            const hc = skyUniforms.u_horizonColor?.value;
            if (hc) ctx.scene.fog.color.copy(hc);
        }

        const sand = this.entities.find('Sand Particles');
        if (skyUniforms && sand?.mat) {
            sand.mat.uniforms.u_fogColor.value.copy(
                skyUniforms.u_horizonColor.value
            );
        }
    },

    onDeactivate(ctx) {
        this.entities.dispose(ctx);
        this.sun         = null;
        this.duneTerrain = null;
        ctx.scene.fog    = null;
    },
});
