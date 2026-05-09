window.DesertSky = class DesertSky extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Desert Sky';
        this.options = {
            radius:     9000,
            windSystem: null,
            autoNight:  true,
            sun:        null,
            ...options,
        };
    }

    async load(ctx) {
        this.sky = new ShaderHandle('shaders/sky_desert');
        await this.sky.load({
            uniforms: {
                // Sun system calls .setRGB() — needs THREE.Color, not the default THREE.Vector3
                u_sunColor: new THREE.Color(1.0, 0.95, 0.75),
            },
            side:       THREE.BackSide,
            depthWrite: false,
        });

        const geo  = new THREE.SphereGeometry(this.options.radius, 32, 16);
        this.mesh  = new THREE.Mesh(geo, this.sky.mat);
        this.mesh.renderOrder = -1;
        ctx.scene.add(this.mesh);

        if (this.options.sun) {
            this.options.sun.applyToUniforms(this.sky.mat.uniforms);
        }
    }

    setupGui(folder, ctx) {
        this.sky.setupGui(folder);
        folder.addBinding(this.options, 'autoNight', { label: 'Auto Night' });
    }

    preFrame(ctx) {
        this.options.sun?.applyToUniforms(this.sky.mat.uniforms);

        if (this.options.autoNight) {
            const sunY  = this.sky.mat.uniforms.u_sunDir.value.y;
            const night = 1.0 - smoothstep(-0.1, 0.5, sunY);
            this.sky.mat.uniforms.u_nightBlend.value = night;
        }
    }

    collectParams() {
        return { shader: this.sky.collectParams() };
    }

    applyParams(data) {
        if (data.shader) this.sky.applyParams(data.shader);
    }

    dispose(ctx) {
        this.sky.dispose();
        this.mesh.geometry.dispose();
        ctx.scene.remove(this.mesh);
    }
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
