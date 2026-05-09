window.Eye = class EyeObject extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Eye';
        this.options = {
            radius:   120,
            rings:    30,
            segments: 64,
            dome:     0.3,
            ...options,
        };
    }

    async load(ctx) {
        const shader = await loadShaderFromDirectory('shaders/eye');
        this.shader = shader;

        this.mat = new THREE.ShaderMaterial({
            vertexShader:   shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            uniforms: {
                // globals
                u_time:        { value: 0 },
                u_resolution:  { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_frame:       { value: 0 },
                u_mouse:       { value: new THREE.Vector2() },

                // geometry
                u_eyeRadius:   { value: this.options.radius },

                // colors
                u_scleraColor:    { value: new THREE.Vector4(1, 1, 1, 1) },
                u_pupilColor:     { value: new THREE.Vector4(0, 0, 0, 1) },
                u_irisColor:      { value: new THREE.Vector4(0, 0, 1, 1) },
                u_eyelidColor:    { value: new THREE.Vector4(0.86, 0.68, 0.68, 1) },
                u_irisInnerColor: { value: new THREE.Vector3(0.4, 0.2, 0.7) },
                u_irisOuterColor: { value: new THREE.Vector3(0.2, 0.3, 0.6) },
                u_irisCryptColor: { value: new THREE.Vector3(0, 0, 0) },

                // shape
                u_scleraSqueeze: { value: 0.0 },
                u_pupilPosition: { value: new THREE.Vector2(0.5, 0.5) },
                u_pupilRadius:   { value: 0.1 },
                u_pupilSqueeze:  { value: 0.0 },
                u_irisRadius:    { value: 0.28 },

                // eyelid
                u_blink:       { value: 0.25 },
                u_eyelidBias:  { value: 0.0 },

                // angles
                u_scleraAngle: { value: 0.0 },
                u_irisAngle:   { value: 0.0 },
                u_pupilAngle:  { value: 0.0 },
                u_eyelidAngle: { value: 0.0 },

                // iris texture
                u_soften:          { value: 0.01 },
                u_fiberFreq:       { value: 35.0 },
                u_limbalWidth:     { value: 0.06 },
                u_irisRadialComp:  { value: 3.0 },
                u_irisCryptFreq:   { value: 8.0 },
            },
            side:        THREE.FrontSide,
            transparent: true,
        });

        this.geo  = this._buildConvexDisc();
        this.mesh = new THREE.Mesh(this.geo, this.mat);
        ctx.scene.add(this.mesh);
    }

    setupGui(folder, ctx) {
        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.mat.uniforms,
            this.shader.dirPath
        );

        // u_eyeRadius needs a geo rebuild
        const radiusBinding = this._shaderControls.bindings.find(b => b.key === 'u_eyeRadius');
        if (radiusBinding) {
            radiusBinding.dispose();
            folder.addBinding(this._shaderControls.params, 'u_eyeRadius', {
                label: 'Eye Radius', min: 10, max: 300, step: 1,
            }).on('change', ({ value }) => {
                this.mat.uniforms.u_eyeRadius.value = value;
                this.options.radius = value;
                this.geo.dispose();
                this.geo = this._buildConvexDisc();
                this.mesh.geometry = this.geo;
            });
        }

        // Animated params — expose toggles so they can be overridden manually
        this._animParams = { animateBlink: true, animatePupil: true };
        const anim = folder.addFolder({ title: 'Animation', expanded: true });
        anim.addBinding(this._animParams, 'animateBlink', { label: 'Auto Blink' });
        anim.addBinding(this._animParams, 'animatePupil', { label: 'Auto Pupil' });
    }

    collectParams() {
        return {
            shader: this._shaderControls?.collectParams() ?? {},
            anim:   { ...this._animParams },
        };
    }

    applyParams(data) {
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader);
        }
        if (data.anim) {
            Object.assign(this._animParams, data.anim);
        }
    }

    preFrame(ctx) {
        const t = ctx.clock.getElapsedTime();

        if (this._animParams?.animateBlink) {
            const slow  = (0.5 + 0.5 * Math.sin(t * 0.3)) / 2;
            const blink = Math.pow(Math.max(0.0, Math.sin(t * 1.5)), 16);
            this.mat.uniforms.u_blink.value = slow + blink;
        }

        if (this._animParams?.animatePupil) {
            const x = 0.3 * Math.sin(t * 0.7)
                    + 0.15 * Math.sin(t * 1.3)
                    + 0.05 * Math.sin(t * 2.9);
            const y = 0.3 * Math.sin(t * 0.5)
                    + 0.15 * Math.sin(t * 1.7)
                    + 0.05 * Math.sin(t * 3.1);
            this.mat.uniforms.u_pupilPosition.value.set(0.5 + x / 2, 0.5 + y / 2);
        }
    }

    dispose(ctx) {
        this._shaderControls?.dispose();
        this.geo?.dispose();
        this.mat?.dispose();
        ctx.scene.remove(this.mesh);
    }

    // ── Geometry ──────────────────────────────────────────────────────────────
    // Translates p5's buildConvexDisc TRIANGLE_STRIP to indexed Three.js geometry.
    // vTexCoord is derived in the vert shader from world XY / eyeRadius,
    // so UVs don't need to be baked here.

    _buildConvexDisc() {
        const { radius, rings, segments, dome } = this.options;

        const totalVerts = rings * (segments + 1) * 2;
        const positions  = new Float32Array(totalVerts * 3);
        const indices    = [];

        let vIdx = 0;
        let baseVert = 0;

        for (let i = 0; i < rings; i++) {
            const r0 = (i / rings) * radius;
            const r1 = ((i + 1) / rings) * radius;
            const z0 = Math.sqrt(1.0 - Math.pow(r0 / radius, 2)) * dome * radius;
            const z1 = Math.sqrt(1.0 - Math.pow(r1 / radius, 2)) * dome * radius;

            for (let j = 0; j <= segments; j++) {
                const angle = (Math.PI * 2 / segments) * j;
                const cos_a = Math.cos(angle);
                const sin_a = Math.sin(angle);

                // inner ring vertex
                positions[vIdx * 3]     = cos_a * r0;
                positions[vIdx * 3 + 1] = sin_a * r0;
                positions[vIdx * 3 + 2] = z0;
                vIdx++;

                // outer ring vertex
                positions[vIdx * 3]     = cos_a * r1;
                positions[vIdx * 3 + 1] = sin_a * r1;
                positions[vIdx * 3 + 2] = z1;
                vIdx++;
            }

            // Convert triangle strip to indexed triangles
            for (let j = 0; j < segments; j++) {
                const i0 = baseVert + j * 2;
                const i1 = baseVert + j * 2 + 1;
                const i2 = baseVert + (j + 1) * 2;
                const i3 = baseVert + (j + 1) * 2 + 1;
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }

            baseVert += (segments + 1) * 2;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }
}