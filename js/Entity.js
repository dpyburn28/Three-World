window.Entity = class Entity {
    constructor(name) {
        this.name      = name;
        this._params   = {};
        this._folder   = null;
        this._bindings = [];
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

    collectParams() { return { ...this._params }; }

    applyParams(data) {
        Object.assign(this._params, data);
        for (const b of this._bindings) b.refresh();
    }

    async init(ctx, parentFolder) {
        await this.load(ctx);
        if (parentFolder) {
            this._folder = parentFolder.addFolder({ title: this.name, expanded: false });
            this.setupGui(this._folder, ctx);
        }
    }

    destroy(ctx) {
        this._folder?.dispose();
        this.dispose(ctx);
    }
}
