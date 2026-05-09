// ─── Single-Shader SceneObject (Minimal) ──────────────────────────────────────
// ShaderHandle auto-builds uniforms from uniforms.glsl types + controls.json.
// No manual uniform declarations needed.

window.MyObject = class MyObject extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'My Object';
        this.options = { ...options };
    }

    async load(ctx) {
        this.shader = new ShaderHandle('shaders/myShader');
        await this.shader.load();

        const geo  = new THREE.BoxGeometry();
        this.mesh  = new THREE.Mesh(geo, this.shader.mat);
        ctx.scene.add(this.mesh);
    }

    setupGui(folder, ctx) { this.shader.setupGui(folder); }
    collectParams()       { return { shader: this.shader.collectParams() }; }
    applyParams(data)     { if (data.shader) this.shader.applyParams(data.shader); }

    dispose(ctx) {
        this.shader.dispose();
        this.mesh.geometry.dispose();
        ctx.scene.remove(this.mesh);
    }
}


// ─── Single-Shader with Overrides ─────────────────────────────────────────────
// Pass uniform overrides for textures or specific THREE.js types.
// Pass material options (side, depthWrite, etc.) alongside.

/*
window.MyTerrain = class MyTerrain extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'My Terrain';
        this.options = { terrainSize: 1200, sun: null, ...options };
    }

    async load(ctx) {
        this._heightTex = this._buildHeightmap();

        this.terrain = new ShaderHandle('shaders/myTerrain');
        await this.terrain.load({
            // Uniform overrides — textures, specific types
            uniforms: {
                u_heightmap:   this._heightTex,
                u_terrainSize: this.options.terrainSize,
                u_sunDir:      new THREE.Vector3(0.6, 0.8, 0.3).normalize(),
                u_sunColor:    new THREE.Color(1.0, 0.96, 0.86),
            },
            // Material options
            side: THREE.FrontSide,
        });

        const geo = new THREE.PlaneGeometry(
            this.options.terrainSize, this.options.terrainSize, 255, 255
        );
        geo.rotateX(-Math.PI / 2);
        this.mesh = new THREE.Mesh(geo, this.terrain.mat);
        ctx.scene.add(this.mesh);
    }

    setupGui(folder, ctx) { this.terrain.setupGui(folder); }
    collectParams()       { return { shader: this.terrain.collectParams() }; }
    applyParams(data)     { if (data.shader) this.terrain.applyParams(data.shader); }

    preFrame(ctx) {
        this.options.sun?.applyToUniforms(this.terrain.mat.uniforms);
    }

    dispose(ctx) {
        this.terrain.dispose();
        this._heightTex?.dispose();
        this.mesh.geometry.dispose();
        ctx.scene.remove(this.mesh);
    }

    _buildHeightmap() { ... }
}
*/


// ─── Multi-Shader SceneObject ─────────────────────────────────────────────────
// A single scene object composing two ShaderHandles, each with its own
// GUI folder, preset group, and disposal.

/*
window.LandAndWater = class LandAndWater extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Land & Water';
        this.options = { ...options };
    }

    async load(ctx) {
        this.land  = new ShaderHandle('shaders/dune');
        this.water = new ShaderHandle('shaders/water_caustics');
        await Promise.all([
            this.land.load(),
            this.water.load({ transparent: true, depthWrite: false }),
        ]);

        const landGeo  = new THREE.PlaneGeometry(2000, 2000, 255, 255);
        const waterGeo = new THREE.PlaneGeometry(2000, 2000, 100, 100);
        landGeo.rotateX(-Math.PI / 2);
        waterGeo.rotateX(-Math.PI / 2);

        this.landMesh  = new THREE.Mesh(landGeo,  this.land.mat);
        this.waterMesh = new THREE.Mesh(waterGeo, this.water.mat);
        this.waterMesh.position.y = 10;

        ctx.scene.add(this.landMesh);
        ctx.scene.add(this.waterMesh);
    }

    setupGui(folder, ctx) {
        this.land.setupGui(folder.addFolder({ title: 'Land', expanded: true }));
        this.water.setupGui(folder.addFolder({ title: 'Water', expanded: false }));
    }

    collectParams() {
        return {
            land:  this.land.collectParams(),
            water: this.water.collectParams(),
        };
    }

    applyParams(data) {
        if (data.land)  this.land.applyParams(data.land);
        if (data.water) this.water.applyParams(data.water);
    }

    dispose(ctx) {
        this.land.dispose();
        this.water.dispose();
        this.landMesh.geometry.dispose();
        this.waterMesh.geometry.dispose();
        ctx.scene.remove(this.landMesh);
        ctx.scene.remove(this.waterMesh);
    }
}
*/
