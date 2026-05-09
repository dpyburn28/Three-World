window.CameraSystem = class CameraSystem extends SystemHandle {
    constructor(options = {}) {
        super('Camera');

        // Default params — scenes override via options
        Object.assign(this._params, {
            posX: 0, posY: 0, posZ: 5,
            lookX: 0, lookY: 0, lookZ: 0,
            fov: 75, near: 0.1, far: 1000,
            orbit: true,
            ...options,
        });

        // GUI ranges — scenes can override before init()
        this._ranges = {
            posX:  { min: -2000, max: 2000,  step: 1    },
            posY:  { min: -500,  max: 500,   step: 1    },
            posZ:  { min: -2000, max: 2000,  step: 1    },
            lookX: { min: -2000, max: 2000,  step: 1    },
            lookY: { min: -500,  max: 500,   step: 1    },
            lookZ: { min: -2000, max: 2000,  step: 1    },
            fov:   { min: 10,    max: 120,   step: 1    },
            near:  { min: 0.01,  max: 100,   step: 0.01 },
            far:   { min: 100,   max: 50000, step: 100  },
        };

        this._camera = null;
        this._orbitControls = null;
    }

    init(ctx, folder) {
        this._camera = ctx.camera;
        this._renderer = ctx.renderer;

        // Create OrbitControls (starts disabled)
        this._orbitControls = new THREE.OrbitControls(this._camera, this._renderer.domElement);
        this._orbitControls.enabled = this._params.orbit;
        this._orbitControls.target.set(this._params.lookX, this._params.lookY, this._params.lookZ);

        // Sync GUI params when user orbits
        this._orbitControls.addEventListener('change', () => {
            if (!this._params.orbit) return;
            const p = this._params, c = this._camera, t = this._orbitControls.target;
            p.posX = c.position.x;
            p.posY = c.position.y;
            p.posZ = c.position.z;
            p.lookX = t.x;
            p.lookY = t.y;
            p.lookZ = t.z;
            for (const b of this._bindings) b.refresh();
        });

        this._applyToCamera();
        super.init(ctx, folder);

        // Apply initial orbit state after GUI is built
        if (this._params.orbit) this._setOrbitEnabled(true);
    }

    _buildGui() {
        const f = this._folder;

        // Orbit toggle at the top
        this._bind(f, 'orbit', { label: 'Orbit Controls' }).on('change', (ev) => {
            this._setOrbitEnabled(ev.value);
        });

        const pos = f.addFolder({ title: 'Position', expanded: true });
        this._bind(pos, 'posX', { label: 'X', ...this._ranges.posX }).on('change', () => this._applyToCamera());
        this._bind(pos, 'posY', { label: 'Y', ...this._ranges.posY }).on('change', () => this._applyToCamera());
        this._bind(pos, 'posZ', { label: 'Z', ...this._ranges.posZ }).on('change', () => this._applyToCamera());

        const look = f.addFolder({ title: 'Look At', expanded: false });
        this._bind(look, 'lookX', { label: 'X', ...this._ranges.lookX }).on('change', () => this._applyToCamera());
        this._bind(look, 'lookY', { label: 'Y', ...this._ranges.lookY }).on('change', () => this._applyToCamera());
        this._bind(look, 'lookZ', { label: 'Z', ...this._ranges.lookZ }).on('change', () => this._applyToCamera());

        const lens = f.addFolder({ title: 'Lens', expanded: false });
        this._bind(lens, 'fov',  { label: 'FOV',  ...this._ranges.fov  }).on('change', () => this._applyToCamera());
        this._bind(lens, 'near', { label: 'Near', ...this._ranges.near }).on('change', () => this._applyToCamera());
        this._bind(lens, 'far',  { label: 'Far',  ...this._ranges.far  }).on('change', () => this._applyToCamera());
    }

    _setOrbitEnabled(enabled) {
        this._orbitControls.enabled = enabled;
        if (enabled) {
            // Sync orbit target from current lookAt params
            this._orbitControls.target.set(this._params.lookX, this._params.lookY, this._params.lookZ);
            this._orbitControls.update();
        } else {
            // Re-apply manual params to camera
            this._applyToCamera();
        }
    }

    _applyToCamera() {
        const p = this._params, c = this._camera;
        if (!c) return;

        // When orbit is active, only apply lens settings — OrbitControls owns position/lookAt
        if (this._params.orbit && this._orbitControls) {
            this._orbitControls.target.set(p.lookX, p.lookY, p.lookZ);
            this._orbitControls.object.position.set(p.posX, p.posY, p.posZ);
            this._orbitControls.update();
        } else {
            c.position.set(p.posX, p.posY, p.posZ);
            c.lookAt(p.lookX, p.lookY, p.lookZ);
        }

        c.fov  = p.fov;
        c.near = p.near;
        c.far  = p.far;
        c.updateProjectionMatrix();
    }

    applyParams(data) {
        super.applyParams(data);
        if ('orbit' in data) this._setOrbitEnabled(data.orbit);
        this._applyToCamera();
    }

    resetCamera() {
        const c = this._camera;
        if (!c) return;
        c.position.set(0, 0, 5);
        c.lookAt(0, 0, 0);
        c.fov  = 75;
        c.near = 0.1;
        c.far  = 1000;
        c.updateProjectionMatrix();

        if (this._orbitControls) {
            this._orbitControls.target.set(0, 0, 0);
            this._orbitControls.update();
        }
    }

    dispose() {
        if (this._orbitControls) {
            this._orbitControls.dispose();
            this._orbitControls = null;
        }
        super.dispose();
    }
}
