window.DesertSky = class DesertSky extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Desert Sky';
        this.options = {
            radius:     9000,
            windSystem: null,
            sun:        null,
            ...options,
        };
        this._params.autoNight = options.autoNight !== undefined ? options.autoNight : true;
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
        this.registerShader('shader', this.sky);

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
        const b = folder.addBinding(this._params, 'autoNight', { label: 'Auto Night' });
        this._bindings.push(b);
    }

    preFrame(ctx) {
        this.options.sun?.applyToUniforms(this.sky.mat.uniforms);

        if (this._params.autoNight) {
            const sunY  = this.sky.mat.uniforms.u_sunDir.value.y;
            const night = 1.0 - smoothstep(-0.1, 0.5, sunY);
            this.sky.mat.uniforms.u_nightBlend.value = night;
        }
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
