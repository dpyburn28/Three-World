window.PresetHandler = class PresetHandler {

    // folder   — Tweakpane folder to append preset UI into
    // dirPath  — e.g. 'shaders/sky' or 'scenes/gf'
    // collect  — () => data   : snapshot current state
    // apply    — (data) => {} : restore state from snapshot
    constructor(folder, dirPath, { collect, apply }) {
        this._folder  = folder;
        this._dirPath = dirPath;
        this._collect = collect;
        this._apply   = apply;
        this._params  = { selected: '' };
        this._init();
    }

    async _init() {
        const indexPath = `${this._dirPath}/presets/.index.json`;
        let names = [];
        try {
            const res = await fetch(indexPath);
            if (res.ok) names = await res.json();
        } catch (_) { return; }

        if (!names.length) return;

        const pf = this._folder.addFolder({ title: 'Presets', expanded: true });
        this._params.selected = names[0];

        pf.addBinding(this._params, 'selected', {
            label: 'Preset',
            options: Object.fromEntries(names.map(n => [n, n])),
        });

        pf.addButton({ title: 'Load' })
            .on('click', () => this.load(this._params.selected));

        pf.addButton({ title: 'Export' })
            .on('click', () => this.export());

        if (names.includes('default')) {
            await this.load('default');
            this._params.selected = 'default';
        }
    }

    async load(name) {
        const path = `${this._dirPath}/presets/${name}.json`;
        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error();
            const data = await res.json();
            this._apply(data);
            console.log(`[PresetHandler] Loaded "${name}" from ${this._dirPath}`);
        } catch (_) {
            console.warn(`[PresetHandler] Could not load preset "${name}" from ${this._dirPath}`);
        }
    }

    export() {
        const data     = this._collect();
        const json     = JSON.stringify(data, null, 4);
        const blob     = new Blob([json], { type: 'application/json' });
        const url      = URL.createObjectURL(blob);
        const a        = document.createElement('a');
        a.href         = url;
        a.download     = `${this._params.selected || 'preset'}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log(`[PresetHandler] Exported from ${this._dirPath}`);
    }
}