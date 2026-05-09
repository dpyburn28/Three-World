window.SceneObject = class SceneObject {
    constructor() {}

    // Override in subclass
    async load(ctx)          {}
    setupGui(folder, ctx)    {}
    preFrame(ctx)            {}
    draw(ctx)                {}
    dispose(ctx)             {}

    // Override to participate in scene presets
    collectParams() { return {}; }
    applyParams(data) {}

    // Called by scene — adds this object's folder into the scene's folder
    // dirPath: if provided (e.g. 'objects/Building'), enables per-object presets
    async init(ctx, parentFolder, dirPath) {
        await this.load(ctx);
        if (parentFolder) {
            this._folder = parentFolder.addFolder({ title: this.name, expanded: false });
            this.setupGui(this._folder, ctx);
            if (dirPath) {
                this._presets = new PresetHandler(this._folder, dirPath, {
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