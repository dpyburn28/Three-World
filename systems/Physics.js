window.PhysicsSystem = class PhysicsSystem extends SystemHandle {
    constructor(options = {}) {
        super('Physics');

        Object.assign(this._params, {
            gravity:          9.8,
            damping:          0.98,
            ropeLength:       3,
            segments:         10,
            anchorX:          0,
            anchorY:          5,
            anchorZ:          0,
            constraintIters:  8,
            showRope:         true,
        });

        this._particles = [];
        this._lastT = 0;
        this._lastDt = 1 / 60;
        this._scene = null;
        this._ropeLine = null;
    }

    init(ctx, folder) {
        this._scene = ctx.scene;
        this._initRope();
        this._buildRopeVisual();
        super.init(ctx, folder);
    }

    // ── Rope init ────────────────────────────────────────────────────────────

    _initRope() {
        const p = this._params;
        const segLen = p.ropeLength / p.segments;
        this._particles = [];

        for (let i = 0; i <= p.segments; i++) {
            const x = p.anchorX + (i > 0 ? 0.5 : 0); // slight offset so it swings
            const y = p.anchorY - i * segLen;
            const z = p.anchorZ;
            this._particles.push({
                x, y, z,
                prevX: x, prevY: y, prevZ: z,
                pinned: i === 0,
            });
        }
    }

    _buildRopeVisual() {
        const count = this._params.segments + 1;
        const positions = new Float32Array(count * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._ropeGeo = geo;
        this._ropeMat = new THREE.LineBasicMaterial({ color: 0xffffff });
        this._ropeLine = new THREE.Line(geo, this._ropeMat);
        this._ropeLine.frustumCulled = false;
        this._scene.add(this._ropeLine);
        this._syncRopeVisual();
    }

    _syncRopeVisual() {
        const attr = this._ropeGeo.getAttribute('position');
        for (let i = 0; i < this._particles.length; i++) {
            const pt = this._particles[i];
            attr.setXYZ(i, pt.x, pt.y, pt.z);
        }
        attr.needsUpdate = true;
        this._ropeLine.visible = this._params.showRope;
    }

    // ── Simulation ───────────────────────────────────────────────────────────

    update(t) {
        if (t === this._lastT) return;
        const dt = Math.min(t - (this._lastT || t), 1 / 30);
        this._lastT = t;
        if (dt > 0) {
            this._lastDt = dt;
            this._step(dt);
        }
    }

    _step(dt) {
        const p = this._params;
        const pts = this._particles;
        const gdt2 = p.gravity * dt * dt;

        // Sync anchor from params
        pts[0].x = p.anchorX;
        pts[0].y = p.anchorY;
        pts[0].z = p.anchorZ;

        // Verlet integration
        for (let i = 1; i < pts.length; i++) {
            const pt = pts[i];
            const vx = (pt.x - pt.prevX) * p.damping;
            const vy = (pt.y - pt.prevY) * p.damping;
            const vz = (pt.z - pt.prevZ) * p.damping;
            pt.prevX = pt.x;
            pt.prevY = pt.y;
            pt.prevZ = pt.z;
            pt.x += vx;
            pt.y += vy - gdt2;
            pt.z += vz;
        }

        // Distance constraints
        const segLen = p.ropeLength / p.segments;
        for (let iter = 0; iter < p.constraintIters; iter++) {
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dz = b.z - a.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist === 0) continue;
                const diff = (dist - segLen) / dist * 0.5;
                if (!a.pinned) {
                    a.x += dx * diff;
                    a.y += dy * diff;
                    a.z += dz * diff;
                }
                if (!b.pinned) {
                    b.x -= dx * diff;
                    b.y -= dy * diff;
                    b.z -= dz * diff;
                }
            }
        }

        this._syncRopeVisual();
    }

    // ── Public query API ─────────────────────────────────────────────────────

    getEndPosition() {
        const pt = this._particles[this._particles.length - 1];
        return { x: pt.x, y: pt.y, z: pt.z };
    }

    getEndDirection() {
        const pts = this._particles;
        const end  = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const dx = prev.x - end.x;
        const dy = prev.y - end.y;
        const dz = prev.z - end.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        return { x: dx / len, y: dy / len, z: dz / len };
    }

    getEndVelocity() {
        const pt = this._particles[this._particles.length - 1];
        const dt = this._lastDt || 1 / 60;
        return {
            x: (pt.x - pt.prevX) / dt,
            y: (pt.y - pt.prevY) / dt,
            z: (pt.z - pt.prevZ) / dt,
        };
    }

    // ── GUI ──────────────────────────────────────────────────────────────────

    _buildGui() {
        const f = this._folder;

        const rope = f.addFolder({ title: 'Rope', expanded: true });
        this._bind(rope, 'ropeLength',      { label: 'Length',     min: 0.5, max: 10,  step: 0.1  });
        this._bind(rope, 'segments',         { label: 'Segments',   min: 3,   max: 30,  step: 1    });
        this._bind(rope, 'showRope',         { label: 'Show Rope' });

        const anchor = f.addFolder({ title: 'Anchor', expanded: false });
        this._bind(anchor, 'anchorX', { label: 'X', min: -10, max: 10, step: 0.1 });
        this._bind(anchor, 'anchorY', { label: 'Y', min: 0,   max: 20, step: 0.1 });
        this._bind(anchor, 'anchorZ', { label: 'Z', min: -10, max: 10, step: 0.1 });

        const sim = f.addFolder({ title: 'Simulation', expanded: false });
        this._bind(sim, 'gravity',         { label: 'Gravity',      min: 0,  max: 30,  step: 0.1  });
        this._bind(sim, 'damping',         { label: 'Damping',      min: 0.9, max: 1,   step: 0.001 });
        this._bind(sim, 'constraintIters', { label: 'Iterations',   min: 1,  max: 20,  step: 1    });

        // Reset button
        f.addButton({ title: 'Reset Rope' }).on('click', () => this._initRope());
    }

    // ── Dispose ──────────────────────────────────────────────────────────────

    dispose() {
        if (this._ropeLine) {
            this._scene.remove(this._ropeLine);
            this._ropeGeo?.dispose();
            this._ropeMat?.dispose();
            this._ropeLine = null;
        }
        super.dispose();
    }
}
