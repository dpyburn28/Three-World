window.SceneRegistry = {}

window.SceneManager = class SceneManager {
    constructor(ctx) {
        this.ctx = ctx;
        this.active = null;
        this.activeName = null;
        this.pane = null;

        this._global = {
            time: 0,
            frame: 0,
            resolution: `${innerWidth} x ${innerHeight}`
        }
        this._sceneSelect = { scene: '' }
        this._fpsGraph = null
        this._globalFolder = null
        this._sceneFolder = null
        this._sceneDirPath = null
    }

    setPane(pane) {
        this.pane = pane;
        this.enableGuiPlugins()
        this._buildGlobalFolder()
    }

    enableGuiPlugins() {
        this.pane.registerPlugin(EssentialsPlugin)
        this.pane.registerPlugin(CameraKitPlugin)

    }

    _buildGlobalFolder() {
        const folder = this.pane.addFolder({ title: 'Global', expanded: true });
        this._globalFolder = folder;

        // Scene selector (populated async)
        this._buildSceneSelector(folder)

        // FPS graph blade
        this._fpsGraph = folder.addBlade({
            view: 'fpsgraph',
            label: 'fps',
        });

        // Read-only monitors
        folder.addBinding(this._global, 'time', {
            readonly: true,
            format: v => v.toFixed(2),
            label: 'time (s)',
        });

        folder.addBinding(this._global, 'frame', {
            readonly: true,
            label: 'frame',
        });

        folder.addBinding(this._global, 'resolution', {
            readonly: true,
            label: 'resolution',
        });
    }

    async _buildSceneSelector(folder) {
        console.log('[SceneSelector] 1. starting _buildSceneSelector')
        try {
            const res = await fetch('scenes/index.json')
            const scenes = await res.json()

            const options = {}
            for (const name of scenes) options[name] = name

            this._sceneSelect.scene = this.activeName || scenes[0]

            this._sceneBlade = folder.addBinding(this._sceneSelect, 'scene', {
                label: 'scene',
                options,
            })

            this._sceneBlade.on('change', (ev) => {
                if (ev.value !== this.activeName) {
                    this.create(ev.value)
                }
            })
        } catch (e) {
            console.error('[SceneSelector] FAILED:', e)
        }
    }

    async create(name) {
        this._sceneDirPath = null; // ← reset every time
        
        if (!SceneRegistry[name]) {
            this._sceneDirPath = await this._loadScript(name); // null = flat file
        }
        if (!SceneRegistry[name]) {
            console.error(`[SceneManager] "${name}" didn't register itself after loading.`);
            return;
        }

        // Old scene teardown
        if (this.active) {
            this.active.onDeactivate?.(this.ctx);
            this._clearScene();
        }
        if (this._sceneFolder) {
            this._sceneFolder.dispose();
            this._sceneFolder = null;
        }

        const scene = SceneRegistry[name]();

        // Build folder first so load() receives it
        this._sceneFolder = this.pane?.addFolder({ title: scene.name || name, expanded: true });

        // Single load call
        await scene.load?.(this.ctx, this._sceneFolder);
        this._collectGlobalUniforms();

        // Scene-level GUI (camera etc.)
        scene.setupGui?.(this._sceneFolder, this.ctx);

        // Scene presets
        if (this._sceneDirPath) {
            new ScenePresetManager(this._sceneFolder, scene, this._sceneDirPath)

        }

        scene.onActivate?.(this.ctx);
        this.active = scene;
        this.activeName = name;

        // Sync dropdown if it exists
        if (this._sceneBlade && this._sceneSelect.scene !== name) {
            this._sceneSelect.scene = name
            this._sceneBlade.refresh()
        }

        console.log(`[SceneManager] Active: "${name}" (${this._sceneDirPath ?? 'flat'})`);
    }

    // removes all objects and passes added by the previous scene
    _clearScene() {
        this._clearGlobalUniforms()
        const { scene, composer, passes } = this.ctx;

        // clear Three.js scene objects (keep lights etc if you want)
        while (scene.children.length > 0) {
            const obj = scene.children[0];
            obj.geometry?.dispose();
            obj.material?.dispose();
            scene.remove(obj);
        }

        // remove all composer passes except RenderPass (index 0)
        const keep = composer.passes[0];
        composer.passes = [keep];

        // clear the shared passes object
        for (const key in passes) delete passes[key];
    }

    async _loadScript(name) {

        const dirCandidates = [
            `scenes/${name}/${name}.js`, 
            `scenes/${name}/scene.js`,   
            `scenes/${name}/main.js`,      
        ]
        const flatPath = `scenes/${name}.js`;

        // try directory form first
        for (const path of dirCandidates) {
            try {
                await this._fetchScript(path)
                return `scenes/${name}`
            } catch (_) {}
        }

        // fall back to flat file
        try {
            await this._fetchScript(flatPath)
            return null // flat file - no preset dir
        } catch(_) {}
        
        throw new Error(`[SceneManager] Could not find scene "${name}" at either path`);
    }

    _fetchScript(src) {
        return fetchScript(src);
    }

    // Scan scene meshes + composer passes for known global uniform names
    _collectGlobalUniforms() {
        this._globalUniforms = [];
        const GLOBAL_KEYS = ['uTime', 'uResolution', 'uFrame', 'u_time', 'u_resolution', 'u_frame'];

        const register = (uniforms) => {
            if (!uniforms) return;
            for (const key of GLOBAL_KEYS) {
                if (key in uniforms) {
                    this._globalUniforms.push({ key, ref: uniforms[key] });
                }
            }
        };

        // Scan scene objects
        this.ctx.scene.traverse(obj => {
            if (obj.material?.uniforms) register(obj.material.uniforms);
        });

        // Scan composer passes (skip RenderPass at index 0 — no uniforms)
        for (let i = 1; i < this.ctx.composer.passes.length; i++) {
            const pass = this.ctx.composer.passes[i];
            register(pass.uniforms);           // ShaderPass exposes uniforms directly
            register(pass.material?.uniforms); // PingPongPass etc. wrap in .material
        }

        console.log(`[SceneManager] Tracking ${this._globalUniforms.length} global uniforms`);
    }

    _updateGlobalUniforms() {
        const t    = this.ctx.clock.getElapsedTime();
        const res  = new THREE.Vector2(innerWidth, innerHeight);
        const frame = this._global.frame;

        for (const { key, ref } of this._globalUniforms) {
            if (key === 'uTime' || key === 'u_time')       ref.value = t;
            if (key === 'uResolution' || key === 'u_resolution') ref.value = res;
            if (key === 'uFrame' || key === 'u_frame')      ref.value = frame;
        }
    }

    // Call in _clearScene so stale refs don't linger between scene switches
    _clearGlobalUniforms() {
        this._globalUniforms = [];
    }

    preFrame() { 
        // --- Tick Global State ---
        this._global.time = this.ctx.clock.getElapsedTime()
        this._global.frame++
        this._global.resolution = `${innerWidth} x ${innerHeight}`

        // --- FPS Graph ---
        this._fpsGraph?.begin()

        this._updateGlobalUniforms()
        this.active?.preFrame?.(this.ctx); 
    }
    draw() { 
        this.active?.draw?.(this.ctx); 
    }

    postFrame() {
        this._fpsGraph?.end()
        this.pane.refresh()
    }
}


