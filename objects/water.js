window.Water = class WaterCaustics extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Water Caustics';
        this.options = {
            size: 20000, // large enough to fill any background view
            ...options,
        };
    }

    async load(ctx) {
        const shader = await loadShaderFromDirectory('shaders/water_caustics');
        this.shader = shader;

        this.mat = new THREE.ShaderMaterial({
            vertexShader:   shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            uniforms: {
                // globals — auto-updated by SceneManager
                u_time:       { value: 0 },
                u_resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_frame:      { value: 0 },
                u_mouse:      { value: new THREE.Vector2() },

                // camera
                u_cameraDir:   { value: new THREE.Vector3(0.0, -1.0, -1.0) },
                u_focalLength: { value: 1.5 },

                // world
                u_worldOffset: { value: new THREE.Vector3(0, 0, 0) },
                u_worldScale:  { value: 3.0 },

                // caustics
                u_warpStrength:  { value: 0.07 },
                u_warpIterations:{ value: 2 },
                u_contrastScale: { value: 3.0 },
                u_contrastBias:  { value: 1.5 },
                u_color:         { value: new THREE.Color(1, 1, 1) },
                u_timeSpeed:     { value: 1.0 },
            },
            depthWrite: false,
            side: THREE.FrontSide,
        });

        // Plane geometry with enough subdivisions for smooth UV interpolation
        const geo   = new THREE.PlaneGeometry(1, 1, 100, 100);
        this.mesh   = new THREE.Mesh(geo, this.mat);
        this.mesh.renderOrder = -2; // behind sky dome

        ctx.scene.add(this.mesh);
        this._ctx = ctx;
    }


    draw(ctx) {
        // Recompute every frame so it survives resize
        const distance = 500;
        const fov      = ctx.camera.fov * Math.PI / 180;
        const aspect   = innerWidth / innerHeight;

        // Distance from camera to its "natural" near plane in p5
        const camZ        = (innerHeight / 2) / Math.tan(fov / 2);
        const scaleFactor = (camZ + distance) / camZ;

        // Visible world size at the plane's distance
        const visH = 2 * distance * Math.tan(fov / 2);
        const visW = visH * aspect;

        this.mesh.scale.set(visW * scaleFactor, visH * scaleFactor, 1);

        // Push back along camera's forward direction
        // Camera looks down -Z by default; position plane in front of camera
        this.mesh.position.copy(ctx.camera.position);
        this.mesh.position.z -= distance;

        // Keep plane facing the camera (billboard)
        this.mesh.rotation.copy(ctx.camera.rotation);
    }

    setupGui(folder, ctx) {
        // Auto-wired controls from controls.json
        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.mat.uniforms
        );

        // Manual vec3 controls — not in controls.json since they need xyz pickers
        this._vec3Params = {
            cameraDir:   { x: 0.0,  y: -1.0, z: -1.0 },
            worldOffset: { x: 0.0,  y:  0.0, z:  0.0 },
        };

        const vecFolder = folder.addFolder({ title: 'Vectors', expanded: false });

        vecFolder.addBinding(this._vec3Params, 'cameraDir', {
            label: 'Camera Dir',
            x: { min: -1, max: 1, step: 0.01 },
            y: { min: -1, max: 1, step: 0.01 },
            z: { min: -1, max: 1, step: 0.01 },
        }).on('change', ({ value }) => {
            this.mat.uniforms.u_cameraDir.value.set(value.x, value.y, value.z);
        });

        vecFolder.addBinding(this._vec3Params, 'worldOffset', {
            label: 'World Offset',
            x: { min: -10, max: 10, step: 0.1 },
            y: { min: -10, max: 10, step: 0.1 },
            z: { min: -10, max: 10, step: 0.1 },
        }).on('change', ({ value }) => {
            this.mat.uniforms.u_worldOffset.value.set(value.x, value.y, value.z);
        });
    }

    collectParams() {
        return {
            shader: this._shaderControls?.collectParams() ?? {},
            vec3:   {
                cameraDir:   { ...this._vec3Params.cameraDir },
                worldOffset: { ...this._vec3Params.worldOffset },
            },
        };
    }

    applyParams(data) {
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader);
        }
        if (data.vec3) {
            if (data.vec3.cameraDir) {
                Object.assign(this._vec3Params.cameraDir, data.vec3.cameraDir);
                const d = data.vec3.cameraDir;
                this.mat.uniforms.u_cameraDir.value.set(d.x, d.y, d.z);
            }
            if (data.vec3.worldOffset) {
                Object.assign(this._vec3Params.worldOffset, data.vec3.worldOffset);
                const o = data.vec3.worldOffset;
                this.mat.uniforms.u_worldOffset.value.set(o.x, o.y, o.z);
            }
        }
    }

    dispose(ctx) {
        this._shaderControls?.dispose();
        this.mesh.geometry.dispose();
        this.mat.dispose();
        ctx.scene.remove(this.mesh);
    }
}