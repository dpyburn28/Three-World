window.PresetHandler = class PresetHandler {

    // folder  — Tweakpane folder to append preset UI into
    // scope   — storage namespace, e.g. 'scenes/gf' or 'objects/Building'
    // collect — () => data   : snapshot current state
    // apply   — (data) => {} : restore state from snapshot
    constructor(folder, scope, { collect, apply }) {
        this._parent     = folder;
        this._scope      = scope;
        this._collect    = collect;
        this._apply      = apply;
        this._params     = { name: '', fileSelected: '', localSelected: '' };
        this._pf         = null;
        this._fileNames  = [];
        this._init();
    }

    _lsKey(name)      { return `three-world:${this._scope}:${name}`; }
    _indexPath()      { return `${this._scope}/presets/.index.json`; }
    _presetPath(name) { return `${this._scope}/presets/${name}.json`; }

    _localNames() {
        const prefix = `three-world:${this._scope}:`;
        const names  = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(prefix)) names.push(k.slice(prefix.length));
        }
        return names.sort();
    }

    async _init() {
        try {
            const res = await fetch(this._indexPath());
            if (res.ok) this._fileNames = await res.json();
        } catch (_) {}

        this._build();

        // Auto-load default on first visit (no saved presets yet)
        if (this._fileNames.includes('default') && this._localNames().length === 0) {
            await this._loadFromFile('default');
        }
    }

    _build() {
        this._pf?.dispose();
        const localNames = this._localNames();

        const pf = this._parent.addFolder({ title: 'Presets', expanded: true });
        this._pf = pf;

        // ── Built-in presets (file-based, read-only) ──────────────────────
        if (this._fileNames.length > 0) {
            if (!this._fileNames.includes(this._params.fileSelected)) {
                this._params.fileSelected = this._fileNames[0];
            }
            pf.addBinding(this._params, 'fileSelected', {
                label:   'Built-in',
                options: Object.fromEntries(this._fileNames.map(n => [n, n])),
            });
            pf.addButton({ title: 'Load Built-in' })
                .on('click', () => this._loadFromFile(this._params.fileSelected));
            pf.addBlade({ view: 'separator' });
        }

        // ── Save / Export / Import ─────────────────────────────────────────
        pf.addBinding(this._params, 'name', { label: 'Name' });
        pf.addButton({ title: 'Save' })
            .on('click', () => this._save());
        pf.addButton({ title: 'Export JSON' })
            .on('click', () => this._export());
        pf.addButton({ title: 'Import JSON' })
            .on('click', () => this._import());

        // ── Saved presets (localStorage, read-write) ───────────────────────
        if (localNames.length > 0) {
            pf.addBlade({ view: 'separator' });
            if (!localNames.includes(this._params.localSelected)) {
                this._params.localSelected = localNames[0];
            }
            pf.addBinding(this._params, 'localSelected', {
                label:   'Saved',
                options: Object.fromEntries(localNames.map(n => [n, n])),
            });
            pf.addButton({ title: 'Load' })
                .on('click', () => this._loadFromStorage());
            pf.addButton({ title: 'Delete' })
                .on('click', () => this._delete());
        }
    }

    async _loadFromFile(name) {
        try {
            const res = await fetch(this._presetPath(name));
            if (!res.ok) throw new Error();
            this._apply(await res.json());
            console.log(`[PresetHandler] Loaded built-in "${name}" (${this._scope})`);
        } catch (_) {
            console.warn(`[PresetHandler] Could not load built-in "${name}" (${this._scope})`);
        }
    }

    _loadFromStorage() {
        const name = this._params.localSelected;
        if (!name) return;
        const raw = localStorage.getItem(this._lsKey(name));
        if (!raw) {
            console.warn(`[PresetHandler] No saved preset "${name}" (${this._scope})`);
            return;
        }
        try {
            this._apply(JSON.parse(raw));
            console.log(`[PresetHandler] Loaded "${name}" (${this._scope})`);
        } catch (e) {
            console.warn('[PresetHandler] Parse error:', e);
        }
    }

    _save() {
        const name = this._params.name.trim();
        if (!name) {
            console.warn('[PresetHandler] Enter a name before saving');
            return;
        }
        localStorage.setItem(this._lsKey(name), JSON.stringify(this._collect()));
        this._params.localSelected = name;
        this._build();
        console.log(`[PresetHandler] Saved "${name}" (${this._scope})`);
    }

    _delete() {
        const name = this._params.localSelected;
        if (!name) return;
        localStorage.removeItem(this._lsKey(name));
        const remaining = this._localNames();
        this._params.localSelected = remaining[0] ?? '';
        this._build();
        console.log(`[PresetHandler] Deleted "${name}" (${this._scope})`);
    }

    _export() {
        const name = this._params.name.trim() || this._params.localSelected || 'preset';
        const blob = new Blob([JSON.stringify(this._collect(), null, 2)], { type: 'application/json' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `${name}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    _import() {
        const input    = document.createElement('input');
        input.type     = 'file';
        input.accept   = '.json';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const name = file.name.replace(/\.json$/, '');
            localStorage.setItem(this._lsKey(name), await file.text());
            this._params.localSelected = name;
            this._params.name          = name;
            this._build();
            this._loadFromStorage();
        };
        input.click();
    }
}
