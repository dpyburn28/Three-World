/**
 * Canonical sun controller + visible mesh. Feeds u_sunDir, u_sunColor, u_sunSize, u_sunBloom
 * (and optional u_sunIntensity / u_sunPos when materials define them).
 */
window.Sun = class Sun extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Sun';
        this.options = {
            distance: 8500,
            meshRadius: 120,
            meshVisible: true,
            hideMeshBelowHorizon: true,
            ...options,
        };

        this._dir = new THREE.Vector3(0.8, 0.15, 0.2).normalize();
        /** Spherical control: azimuth deg (0 = +X, CCW from above), elevation deg (0 = horizon, 90 = zenith) */
        const initAngles = this._anglesFromDirection(this._dir);
        this._params = {
            azimuth:   initAngles.azimuth,
            elevation: initAngles.elevation,
            distance:  this.options.distance,
            intensity: 1.0,
            sunSize:   0.03,
            sunBloom:  0.4,
            meshRadius: this.options.meshRadius,
            meshVisible: this.options.meshVisible,
            /** When true (default), do not draw the visible sun mesh below the horizon */
            hideMeshBelowHorizon: this.options.hideMeshBelowHorizon !== false,
        };

        this._color = { r: 1.0, g: 0.95, b: 0.75 };
        this._bindings = [];
    }

    _updateDirectionFromAngles() {
        const az = this._params.azimuth * Math.PI / 180;
        const el = this._params.elevation * Math.PI / 180;
        const ce = Math.cos(el);
        this._dir.set(
            ce * Math.cos(az),
            Math.sin(el),
            ce * Math.sin(az)
        ).normalize();
    }

    _anglesFromDirection(v) {
        const y = Math.max(-1, Math.min(1, v.y));
        const elev = Math.asin(y) * 180 / Math.PI;
        const az = Math.atan2(v.z, v.x) * 180 / Math.PI;
        return { azimuth: az, elevation: elev };
    }

    /**
     * Preset / legacy: { x, y, z } world-space direction (not necessarily normalized).
     */
    importDirectionFromPreset(dir) {
        if (!dir || dir.x === undefined) return;
        const v = new THREE.Vector3(dir.x, dir.y, dir.z);
        if (v.lengthSq() < 1e-8) return;
        v.normalize();
        this._dir.copy(v);
        const a = this._anglesFromDirection(v);
        this._params.azimuth = a.azimuth;
        this._params.elevation = a.elevation;
        for (const b of this._bindings) {
            try { b.refresh(); } catch (_) {}
        }
    }

    /**
     * After ShaderControls applies a sky preset, pull disk/color into Sun state.
     * @param {{ skipDirection?: boolean }} opts — if skipDirection, keep current angles (e.g. after importDirectionFromPreset)
     */
    importFromShaderUniforms(uniforms, opts = {}) {
        if (!uniforms) return;
        if (!opts.skipDirection && uniforms.u_sunDir?.value) {
            this._dir.copy(uniforms.u_sunDir.value);
            const a = this._anglesFromDirection(this._dir);
            this._params.azimuth = a.azimuth;
            this._params.elevation = a.elevation;
        }
        if (uniforms.u_sunSize) this._params.sunSize = uniforms.u_sunSize.value;
        if (uniforms.u_sunBloom) this._params.sunBloom = uniforms.u_sunBloom.value;
        if (uniforms.u_sunColor?.value) {
            const c = uniforms.u_sunColor.value;
            this._color.r = c.r;
            this._color.g = c.g;
            this._color.b = c.b;
        }
        this._syncMeshTransform();
        this._syncMeshMaterial();
        for (const b of this._bindings) {
            try { b.refresh(); } catch (_) {}
        }
    }

    getSunDirection() {
        return this._dir;
    }

    getSunData() {
        return {
            direction: { x: this._dir.x, y: this._dir.y, z: this._dir.z },
            azimuth:   this._params.azimuth,
            elevation: this._params.elevation,
            color:     { ...this._color },
            intensity: this._params.intensity,
            sunSize:   this._params.sunSize,
            sunBloom:  this._params.sunBloom,
            distance:  this._params.distance,
        };
    }

    /**
     * Write sun fields into a Three.js uniforms object if those keys exist.
     */
    applyToUniforms(uniforms) {
        if (!uniforms) return;

        if (uniforms.u_sunDir) {
            uniforms.u_sunDir.value.copy(this._dir);
        }

        if (uniforms.u_sunColor) {
            const c = uniforms.u_sunColor.value;
            const i = this._params.intensity;
            c.setRGB(this._color.r * i, this._color.g * i, this._color.b * i);
        }

        if (uniforms.u_sunIntensity) {
            uniforms.u_sunIntensity.value = this._params.intensity;
        }

        if (uniforms.u_sunSize) {
            uniforms.u_sunSize.value = this._params.sunSize;
        }

        if (uniforms.u_sunBloom) {
            uniforms.u_sunBloom.value = this._params.sunBloom;
        }

        if (uniforms.u_sunPos) {
            const p = uniforms.u_sunPos.value;
            if (p && p.isVector3) {
                p.copy(this._dir).multiplyScalar(this._params.distance);
            }
        }

        if (uniforms.u_sunAngularRadius) {
            uniforms.u_sunAngularRadius.value = this._params.sunSize;
        }
    }

    async load(ctx) {
        this._updateDirectionFromAngles();

        const geo = new THREE.SphereGeometry(this._params.meshRadius, 24, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(this._color.r, this._color.g, this._color.b),
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.name = 'SunMesh';
        this.mesh.renderOrder = 999;
        this.mesh.frustumCulled = false;
        ctx.scene.add(this.mesh);
        this._syncMeshTransform();
        this._syncMeshMaterial();
        this._updateMeshVisibility();
    }

    /**
     * Additive sun mesh has depthWrite:false — when the sun is below the horizon it would
     * otherwise composite on top of terrain ("light through the ground"). Hide it unless
     * the user opts in with hideMeshBelowHorizon === false.
     */
    _updateMeshVisibility() {
        if (!this.mesh) return;
        const aboveHorizon = this._dir.y > -0.03;
        const hideBelow = this._params.hideMeshBelowHorizon !== false;
        this.mesh.visible = this._params.meshVisible && (!hideBelow || aboveHorizon);
    }

    _syncMeshTransform() {
        if (!this.mesh) return;
        this.mesh.position.copy(this._dir).multiplyScalar(this._params.distance);
        this.mesh.scale.setScalar(1);
    }

    _syncMeshMaterial() {
        if (!this.mesh?.material) return;
        const i = this._params.intensity;
        this.mesh.material.color.setRGB(
            this._color.r * i,
            this._color.g * i,
            this._color.b * i
        );
    }

    setupGui(folder, ctx) {
        const p = this._params;

        const ang = folder.addFolder({ title: 'Direction', expanded: true });
        this._bindings.push(
            ang.addBinding(p, 'azimuth', {
                label: 'Azimuth (°)', min: -180, max: 180, step: 0.5,
            }).on('change', () => {
                this._updateDirectionFromAngles();
                this._syncMeshTransform();
                this._updateMeshVisibility();
            }),
            ang.addBinding(p, 'elevation', {
                label: 'Elevation (°)', min: -30, max: 89, step: 0.5,
            }).on('change', () => {
                this._updateDirectionFromAngles();
                this._syncMeshTransform();
                this._updateMeshVisibility();
            }),
        );

        const col = folder.addFolder({ title: 'Color & intensity', expanded: false });
        this._bindings.push(
            col.addBinding(this._color, 'r', { label: 'R', min: 0, max: 2, step: 0.01 }).on('change', () => this._syncMeshMaterial()),
            col.addBinding(this._color, 'g', { label: 'G', min: 0, max: 2, step: 0.01 }).on('change', () => this._syncMeshMaterial()),
            col.addBinding(this._color, 'b', { label: 'B', min: 0, max: 2, step: 0.01 }).on('change', () => this._syncMeshMaterial()),
            col.addBinding(p, 'intensity', { label: 'Intensity', min: 0, max: 3, step: 0.01 }).on('change', () => this._syncMeshMaterial()),
        );

        const skyMatch = folder.addFolder({ title: 'Sky disk (u_sunSize / u_sunBloom)', expanded: false });
        this._bindings.push(
            skyMatch.addBinding(p, 'sunSize', { label: 'Sun size', min: 0.001, max: 0.5, step: 0.001 }),
            skyMatch.addBinding(p, 'sunBloom', { label: 'Sun bloom', min: 0, max: 2, step: 0.01 }),
        );

        const vis = folder.addFolder({ title: 'Visible mesh', expanded: false });
        this._bindings.push(
            vis.addBinding(p, 'distance', { label: 'Distance', min: 1000, max: 20000, step: 100 }).on('change', () => this._syncMeshTransform()),
            vis.addBinding(p, 'meshRadius', { label: 'Radius', min: 20, max: 800, step: 5 }).on('change', () => {
                if (this.mesh?.geometry) {
                    this.mesh.geometry.dispose();
                    this.mesh.geometry = new THREE.SphereGeometry(p.meshRadius, 24, 16);
                }
                this._syncMeshTransform();
            }),
            vis.addBinding(p, 'meshVisible', { label: 'Visible' }).on('change', () => {
                this._updateMeshVisibility();
            }),
            vis.addBinding(p, 'hideMeshBelowHorizon', {
                label: 'Hide mesh below horizon',
            }).on('change', () => this._updateMeshVisibility()),
        );
    }

    preFrame(ctx) {
        this._updateDirectionFromAngles();
        this._syncMeshTransform();
        this._updateMeshVisibility();
    }

    collectParams() {
        return {
            angles: {
                azimuth:   this._params.azimuth,
                elevation: this._params.elevation,
            },
            color: { ...this._color },
            intensity: this._params.intensity,
            sunSize:   this._params.sunSize,
            sunBloom:  this._params.sunBloom,
            distance:  this._params.distance,
            meshRadius: this._params.meshRadius,
            meshVisible: this._params.meshVisible,
            hideMeshBelowHorizon: this._params.hideMeshBelowHorizon,
        };
    }

    applyParams(data) {
        if (!data) return;
        if (data.angles) {
            if (data.angles.azimuth !== undefined) this._params.azimuth = data.angles.azimuth;
            if (data.angles.elevation !== undefined) this._params.elevation = data.angles.elevation;
            this._updateDirectionFromAngles();
        }
        if (data.color) {
            if (data.color.r !== undefined) this._color.r = data.color.r;
            if (data.color.g !== undefined) this._color.g = data.color.g;
            if (data.color.b !== undefined) this._color.b = data.color.b;
        }
        if (data.intensity !== undefined) this._params.intensity = data.intensity;
        if (data.sunSize !== undefined) this._params.sunSize = data.sunSize;
        if (data.sunBloom !== undefined) this._params.sunBloom = data.sunBloom;
        if (data.distance !== undefined) this._params.distance = data.distance;
        if (data.meshRadius !== undefined) {
            this._params.meshRadius = data.meshRadius;
            if (this.mesh?.geometry) {
                this.mesh.geometry.dispose();
                this.mesh.geometry = new THREE.SphereGeometry(this._params.meshRadius, 24, 16);
            }
        }
        if (data.meshVisible !== undefined) {
            this._params.meshVisible = data.meshVisible;
        }
        if (data.hideMeshBelowHorizon !== undefined) {
            this._params.hideMeshBelowHorizon = data.hideMeshBelowHorizon;
        }

        this._syncMeshTransform();
        this._syncMeshMaterial();
        this._updateMeshVisibility();
        for (const b of this._bindings) {
            try { b.refresh(); } catch (_) {}
        }
    }

    dispose(ctx) {
        for (const b of this._bindings) b.dispose();
        this._bindings = [];
        if (this.mesh) {
            this.mesh.geometry?.dispose();
            this.mesh.material?.dispose();
            ctx.scene.remove(this.mesh);
        }
        this.mesh = null;
    }
};
