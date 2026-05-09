// THREE.Pass.FullScreenQuad doesn't exist in r128 — implement inline
class FullScreenQuad {
    constructor(material) {
        this._camera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._geometry = new THREE.PlaneGeometry(2, 2);
        this._mesh     = new THREE.Mesh(this._geometry, material);
        this._scene    = new THREE.Scene();
        this._scene.add(this._mesh);
        this.material  = material;
    }

    render(renderer) {
        renderer.render(this._scene, this._camera);
    }

    dispose() {
        this._geometry.dispose();
    }
}

// ── DatamoshPass ──────────────────────────────────────────────────────────────
// Custom THREE.Pass — manages its own ping-pong targets internally.
// u_tex  = tDiffuse from composer (current scene render)
// u_prev = previous datamosh output (internal ping-pong)

class DatamoshPass extends THREE.Pass {
    constructor(vertexShader, fragmentShader, uniforms) {
        super();

        this._ping = null; // allocated on first render (size unknown at construction)
        this._pong = null;

        this.uniforms = THREE.UniformsUtils.merge([
            { tDiffuse: { value: null } },
            uniforms,
        ]);

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms,
        });

        this.fsQuad = new FullScreenQuad(this.material);
    }

    setSize(w, h) {
        const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
        this._ping = new THREE.WebGLRenderTarget(w, h, opts);
        this._pong = new THREE.WebGLRenderTarget(w, h, opts);
    }

    render(renderer, writeBuffer, readBuffer) {
        // Lazy-init on first render
        if (!this._ping) this.setSize(readBuffer.width, readBuffer.height);

        // Feed current scene render + previous accumulated frame into the shader
        this.uniforms['tDiffuse'].value = readBuffer.texture; // u_tex via tDiffuse name
        this.uniforms['u_tex'].value    = readBuffer.texture;
        this.uniforms['u_prev'].value   = this._pong.texture;

        // Render datamosh into ping
        renderer.setRenderTarget(this._ping);
        this.fsQuad.render(renderer);

        // Copy ping → writeBuffer so the rest of the composer chain sees it
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        const copyMat = this.fsQuad.material;
        this.fsQuad.render(renderer);

        // Swap: ping becomes the new "prev" for next frame
        const tmp  = this._ping;
        this._ping = this._pong;
        this._pong = tmp;
    }

    dispose() {
        this._ping?.dispose();
        this._pong?.dispose();
        this.material.dispose();
        this.fsQuad.dispose();
    }
}

// ── DatamoshEffect ────────────────────────────────────────────────────────────

window.DatamoshEffect = class DatamoshEffect extends PostProcessEffect {
    constructor(options = {}) {
        super();
        this.name = 'Datamosh';
        this.options = {
            enabled: true,
            ...options,
        };
    }

    async load(ctx) {
        const shader = await loadShaderFromDirectory('shaders/datamosh');
        this.shader = shader;

        this.pass = new DatamoshPass(
            shader.vertexShader,
            shader.fragmentShader,
            {
                u_time:         { value: 0 },
                u_resolution:   { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_frame:        { value: 0 },
                u_tex:          { value: null },
                u_prev:         { value: null },
                u_thresholdMax: { value: 0.15 },
                u_thresholdRamp:{ value: 0.5  },
                u_spawnRate:    { value: 0.98 },
                u_spawnScale:   { value: 8.0  },
                u_spawnSpeed:   { value: 1.0  },
                u_spawnSeed:    { value: 42.0 },
                u_lumWeights:   { value: new THREE.Vector3(0.299, 0.587, 0.114) },
                u_deltaScale: { value: 1.0 },
            }
        );

        this.pass.enabled = this.options.enabled;
        ctx.composer.addPass(this.pass);
    }

    setupGui(folder, ctx) {
        this._toggleParams = { enabled: this.pass.enabled };
        folder.addBinding(this._toggleParams, 'enabled', { label: 'Enabled' })
            .on('change', ({ value }) => { this.pass.enabled = value; });

        this._shaderControls = new ShaderControls(
            folder,
            this.shader.controls,
            this.pass.uniforms,
            this.shader.dirPath
        );
    }

    collectParams() {
        return {
            enabled: this._toggleParams?.enabled ?? this.pass.enabled,
            shader:  this._shaderControls?.collectParams() ?? {},
        };
    }

    applyParams(data) {
        if (data.enabled !== undefined) {
            this._toggleParams.enabled = data.enabled;
            this.pass.enabled = data.enabled;
        }
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader);
        }
    }

    dispose(ctx) {
        this._shaderControls?.dispose();
        this.pass.dispose();
        const passes = ctx.composer.passes;
        const idx = passes.indexOf(this.pass);
        if (idx !== -1) passes.splice(idx, 1);
    }
}