window.SkyDome = class SkyDome extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Sky';
        this.options = { radius: 12000, ...options };
    }

    async load(ctx) {
        this.sky = new ShaderHandle('shaders/sky');
        await this.sky.load({ side: THREE.BackSide, depthWrite: false });

        const geo  = new THREE.SphereGeometry(this.options.radius, 32, 16);
        this.mesh  = new THREE.Mesh(geo, this.sky.mat);
        this.mesh.renderOrder = -1;
        ctx.scene.add(this.mesh);
    }

    setupGui(folder, ctx) { this.sky.setupGui(folder); }
    collectParams()       { return { shader: this.sky.collectParams() }; }
    applyParams(data)     { if (data.shader) this.sky.applyParams(data.shader); }

    dispose(ctx) {
        this.sky.dispose();
        this.mesh.geometry.dispose();
        ctx.scene.remove(this.mesh);
    }
}
