window.Road = class Road extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Road';
        this.options = { posX: 0, posZ: 0, ...options };

        this._params = {
            roadWidth:     12,
            roadLength:    200,
            sidewalkWidth: 4,
            curbHeight:    0.15,
            curbWidth:     0.15,
        };

        this._bindings = [];
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    async load(ctx) {
        this.shader = new ShaderHandle('shaders/road');
        await this.shader.load({
            uniforms: {
                u_sunDir:   new THREE.Vector3(0.6, 0.8, 0.3).normalize(),
                u_sunColor: new THREE.Color(1.0, 0.97, 0.92),
                u_roadWidth: this._params.roadWidth,
            },
            side: THREE.FrontSide,
        });

        this.geo  = this._buildGeometry();
        this.mesh = new THREE.Mesh(this.geo, this.shader.mat);
        this.mesh.position.set(this.options.posX, 0, this.options.posZ);
        ctx.scene.add(this.mesh);
    }

    setupGui(folder, ctx) {
        this.shader.setupGui(folder);

        const gf = folder.addFolder({ title: 'Geometry', expanded: true });
        const p  = this._params;
        const rebuild = () => this._rebuild();

        this._bindings = [
            gf.addBinding(p, 'roadWidth',     { label: 'Road Width',     min: 4,   max: 40,  step: 0.5  }).on('change', rebuild),
            gf.addBinding(p, 'roadLength',     { label: 'Road Length',    min: 20,  max: 500, step: 1    }).on('change', rebuild),
            gf.addBinding(p, 'sidewalkWidth',  { label: 'Sidewalk Width', min: 1,   max: 15,  step: 0.5  }).on('change', rebuild),
            gf.addBinding(p, 'curbHeight',     { label: 'Curb Height',    min: 0.05,max: 1.0, step: 0.01 }).on('change', rebuild),
            gf.addBinding(p, 'curbWidth',      { label: 'Curb Width',     min: 0.05,max: 1.0, step: 0.01 }).on('change', rebuild),
        ];
    }

    collectParams() {
        return {
            shader:   this.shader.collectParams(),
            geometry: { ...this._params },
        };
    }

    applyParams(data) {
        if (data.shader) this.shader.applyParams(data.shader);
        if (data.geometry) {
            Object.assign(this._params, data.geometry);
            this._rebuild();
            for (const b of this._bindings) b.refresh();
        }
    }

    preFrame(ctx) {}

    dispose(ctx) {
        this.shader.dispose();
        this.geo?.dispose();
        ctx.scene.remove(this.mesh);
        for (const b of this._bindings) b.dispose();
    }

    _rebuild() {
        this.geo.dispose();
        this.geo = this._buildGeometry();
        this.mesh.geometry = this.geo;
        // Update roadWidth uniform for lane marking positioning
        if (this.shader.mat?.uniforms?.u_roadWidth) {
            this.shader.mat.uniforms.u_roadWidth.value = this._params.roadWidth;
        }
    }

    // ── Geometry Generation ────────────────────────────────────────────────────

    _buildGeometry() {
        const arrays = { verts: [], norms: [], uvs: [], types: [], idxs: [], vi: 0 };
        const p = this._params;

        const halfRW = p.roadWidth / 2;
        const cw     = p.curbWidth;
        const ch     = p.curbHeight;
        const sw     = p.sidewalkWidth;
        const halfL  = p.roadLength / 2;

        // Curb outer edge x
        const co = halfRW + cw;
        // Outer (sidewalk) edge x
        const oe = co + sw;

        // 1. Road surface (y=0, surfType=0)
        this._addQuad(arrays,
            [-halfRW, 0, -halfL],
            [ halfRW, 0, -halfL],
            [ halfRW, 0,  halfL],
            [-halfRW, 0,  halfL],
            [0, 1, 0], 0
        );

        // 2. Left curb inner face (vertical, at x=-halfRW, surfType=1)
        this._addQuad(arrays,
            [-halfRW, 0,   halfL],
            [-halfRW, 0,  -halfL],
            [-halfRW, ch, -halfL],
            [-halfRW, ch,  halfL],
            [1, 0, 0], 1
        );

        // 3. Right curb inner face (vertical, at x=+halfRW, surfType=1)
        this._addQuad(arrays,
            [halfRW, 0,  -halfL],
            [halfRW, 0,   halfL],
            [halfRW, ch,  halfL],
            [halfRW, ch, -halfL],
            [-1, 0, 0], 1
        );

        // 4. Left curb top (y=ch, from -co to -halfRW, surfType=1)
        this._addQuad(arrays,
            [-co,     ch, -halfL],
            [-halfRW, ch, -halfL],
            [-halfRW, ch,  halfL],
            [-co,     ch,  halfL],
            [0, 1, 0], 1
        );

        // 5. Right curb top (y=ch, from halfRW to co, surfType=1)
        this._addQuad(arrays,
            [halfRW, ch, -halfL],
            [co,     ch, -halfL],
            [co,     ch,  halfL],
            [halfRW, ch,  halfL],
            [0, 1, 0], 1
        );

        // 6. Left sidewalk (y=ch, from -oe to -co, surfType=2)
        this._addQuad(arrays,
            [-oe, ch, -halfL],
            [-co, ch, -halfL],
            [-co, ch,  halfL],
            [-oe, ch,  halfL],
            [0, 1, 0], 2
        );

        // 7. Right sidewalk (y=ch, from co to oe, surfType=2)
        this._addQuad(arrays,
            [co, ch, -halfL],
            [oe, ch, -halfL],
            [oe, ch,  halfL],
            [co, ch,  halfL],
            [0, 1, 0], 2
        );

        // 8. Left sidewalk outer edge (vertical, at x=-oe, surfType=2)
        this._addQuad(arrays,
            [-oe, 0,  -halfL],
            [-oe, 0,   halfL],
            [-oe, ch,  halfL],
            [-oe, ch, -halfL],
            [-1, 0, 0], 2
        );

        // 9. Right sidewalk outer edge (vertical, at x=+oe, surfType=2)
        this._addQuad(arrays,
            [oe, 0,   halfL],
            [oe, 0,  -halfL],
            [oe, ch, -halfL],
            [oe, ch,  halfL],
            [1, 0, 0], 2
        );

        // 10. Left curb outer face (vertical, at x=-co, facing -X, surfType=1)
        this._addQuad(arrays,
            [-co, ch, -halfL],
            [-co, ch,  halfL],
            [-co, 0,   halfL],
            [-co, 0,  -halfL],
            [-1, 0, 0], 1
        );

        // 11. Right curb outer face (vertical, at x=+co, facing +X, surfType=1)
        this._addQuad(arrays,
            [co, ch,  halfL],
            [co, ch, -halfL],
            [co, 0,  -halfL],
            [co, 0,   halfL],
            [1, 0, 0], 1
        );

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',    new THREE.BufferAttribute(new Float32Array(arrays.verts), 3));
        geo.setAttribute('normal',      new THREE.BufferAttribute(new Float32Array(arrays.norms), 3));
        geo.setAttribute('uv',          new THREE.BufferAttribute(new Float32Array(arrays.uvs),   2));
        geo.setAttribute('surfaceType', new THREE.BufferAttribute(new Float32Array(arrays.types), 1));
        geo.setIndex(arrays.idxs);

        return geo;
    }

    // ── Quad Helper (same as Building) ───────────────────────────────────────

    _addQuad(a, p0, p1, p2, p3, normal, surfType) {
        const base = a.vi;

        const pts = [p0, p1, p2, p3];
        for (const pt of pts) {
            a.verts.push(pt[0], pt[1], pt[2]);
            a.norms.push(normal[0], normal[1], normal[2]);
            a.types.push(surfType);
        }

        const ex = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const ey = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
        const lenX = Math.sqrt(ex[0]*ex[0] + ex[1]*ex[1] + ex[2]*ex[2]) || 1;
        const lenY = Math.sqrt(ey[0]*ey[0] + ey[1]*ey[1] + ey[2]*ey[2]) || 1;

        for (const pt of pts) {
            const dx = pt[0] - p0[0];
            const dy = pt[1] - p0[1];
            const dz = pt[2] - p0[2];
            const u = (dx * ex[0] + dy * ex[1] + dz * ex[2]) / (lenX * lenX);
            const v = (dx * ey[0] + dy * ey[1] + dz * ey[2]) / (lenY * lenY);
            a.uvs.push(u, v);
        }

        a.idxs.push(base, base + 1, base + 2);
        a.idxs.push(base, base + 2, base + 3);

        a.vi += 4;
    }
}
