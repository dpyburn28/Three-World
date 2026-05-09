window.PostProcessEffect = class PostProcessEffect {
    constructor() {}

    // Override in subclass
    async load(ctx)       {}
    setupGui(folder, ctx) {}
    collectParams()       { return {}; }
    applyParams(data)     {}
    dispose(ctx)          {}

    async init(ctx, parentFolder) {
        await this.load(ctx);
        if (parentFolder) {
            this._folder = parentFolder.addFolder({ title: this.name, expanded: true });
            this.setupGui(this._folder, ctx);
        }
    }

    destroy(ctx) {
        this._folder?.dispose();
        this.dispose(ctx);
    }
}