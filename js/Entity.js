window.Entity = class Entity {
    constructor(name) {
        this.name           = name;
        this._params        = {};
        this._folder        = null;
        this._bindings      = [];
        this._shaderHandles = {};
    }

    async load(ctx)       {}
    setupGui(folder, ctx) {}
    preFrame(ctx)         {}
    draw(ctx)             {}
    dispose(ctx)          {}

    _bind(folder, key, opts) {
        const b = folder.addBinding(this._params, key, opts);
        this._bindings.push(b);
        return b;
    }

    registerShader(name, handle) {
        this._shaderHandles[name] = handle;
        return handle;
    }

    collectParams() {
        const shaders = Object.fromEntries(
            Object.entries(this._shaderHandles).map(([k, h]) => [k, h.collectParams()])
        );
        return { ...this._params, ...shaders };
    }

    applyParams(data) {
        const params = {};
        for (const [k, v] of Object.entries(data)) {
            if (k in this._shaderHandles) this._shaderHandles[k].applyParams(v);
            else params[k] = v;
        }
        Object.assign(this._params, params);
        for (const b of this._bindings) b.refresh();
    }

    async init(ctx, parentFolder, dirPath) {
        await this.load(ctx);
        if (parentFolder) {
            this._folder = parentFolder.addFolder({ title: this.name, expanded: false });
            this.setupGui(this._folder, ctx);
            if (dirPath) {
                new PresetHandler(this._folder, dirPath, {
                    collect: () => this.collectParams(),
                    apply:   (data) => this.applyParams(data),
                });
            }
        }
    }

    destroy(ctx) {
        this._folder?.dispose();
        this.dispose(ctx);
    }
}
