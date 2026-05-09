window.WindVisualizer = class WindVisualizer extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Wind Visualizer';
        this.options = {
            windSystem: null,
            ...options,
        };
    }

    async load(ctx) {
        const shader = await loadShaderFromDirectory('shaders/wind_vis');
        this.shader = shader;

        this.mat = new THREE.ShaderMaterial({
            vertexShader:   shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            uniforms: {
                u_time:          { value: 0 },
                u_resolution:    { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_fieldSize:     { value: this.options.fieldSize ?? 600.0 },

                u_windDir:       { value: new THREE.Vector2(1, 0) },
                u_windSpeed:     { value: 1.8  },
                u_windStrength:  { value: 12.0 },
                u_windWaveFreq:  { value: 0.019 },
                u_gustStrength:  { value: 18.0 },
                u_gustSpeed:     { value: 3.0  },
                u_gustFrequency: { value: 0.4  },
                u_turbulence:    { value: 3.0  },

                u_lineColor:    { value: new THREE.Color(1, 1, 1) },
                u_lineOpacity:  { value: 0.15 },
                u_lineLength:   { value: 0.08 },
                u_lineSteps:    { value: 16   },
                u_lineScale:    { value: 8.0  },
                u_lineFade:     { value: 2.0  },
                u_gustOpacity:  { value: 0.3  },
            },
            transparent: true,
            blending:    THREE.AdditiveBlending,
            depthWrite:  false,
            side:        THREE.DoubleSide,
        });

        const fieldSize = this.options.fieldSize ?? 600.0;
        const geo = new THREE.PlaneGeometry(fieldSize, fieldSize, 1, 1);
        this.mesh = new THREE.Mesh(geo, this.mat);

        // Lay flat on the ground plane, slightly above y=0 to avoid z-fighting with grass roots
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = 1.0;

        ctx.scene.add(this.mesh);
    }

    preFrame(ctx) {
        this.options.windSystem?.applyToUniforms(this.mat.uniforms);
        this.mat.uniforms.u_time.value = ctx.clock.getElapsedTime();
    }

    // draw(ctx) {
    //     // Static world-space plane — nothing to update per frame

    // }

    setupGui(folder, ctx) {
        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.mat.uniforms
        );
    }

    collectParams() {
        return { shader: this._shaderControls?.collectParams() ?? {} };
    }

    applyParams(data) {
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader);
        }
    }

    draw(ctx) {
        // Screen-filling plane — same math as WaterCaustics
        const distance = 1;
        const fov      = ctx.camera.fov * Math.PI / 180;
        const aspect   = innerWidth / innerHeight;
        const visH     = 2 * distance * Math.tan(fov / 2);
        const visW     = visH * aspect;

        this.mesh.scale.set(visW, visH, 1);
        this.mesh.position.copy(ctx.camera.position);
        this.mesh.position.z -= distance;
        this.mesh.rotation.copy(ctx.camera.rotation);
    }

    dispose(ctx) {
        this._shaderControls?.dispose();
        this.mesh.geometry.dispose();
        this.mat.dispose();
        ctx.scene.remove(this.mesh);
    }
}