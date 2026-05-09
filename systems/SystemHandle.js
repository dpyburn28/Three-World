window.SystemHandle = class SystemHandle {
    constructor(name = 'System') {
        this.name      = name;
        this._params   = {};
        this._folder   = null;
        this._bindings = [];
    }

    init(ctx, folder) {
        this._folder = folder.addFolder({ title: this.name, expanded: false });
        this._buildGui();
    }

    // Override in subclass — add Tweakpane bindings via this._bind()
    _buildGui() {}

    // Helper: adds a Tweakpane binding and tracks it for auto-refresh
    _bind(folder, key, opts) {
        const binding = folder.addBinding(this._params, key, opts);
        this._bindings.push(binding);
        return binding;
    }

    collectParams() { return { ...this._params }; }

    applyParams(data) {
        Object.assign(this._params, data);
        for (const b of this._bindings) b.refresh();
    }

    dispose() { this._folder?.dispose(); }
}
