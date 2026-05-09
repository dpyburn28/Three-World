window.Astronaught = class Astronaught extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Astronaught';
        this.options = {
            modelPath: 'models/astronaught.glb',
            scale: 1,
            windSystem: null,
            physicsSystem: null,
            ...options,
        };
        this._params = {
            scale: this.options.scale, rotY: 0, posY: 0, showSkeleton: false,
            // wind
            windFlexibility: 0.3, windSampleHeight: 1.5,
            // physics limb sway
            limbFlexibility: 0.005, attachOffsetY: -1.0,
        };
        this._windInfluence = {};
        this._limbInfluence = {};
        this._lastTime = 0;
        this._tmpVec = null;
    }

    async load(ctx) {
        const loader = new THREE.GLTFLoader();
        const gltf = await new Promise((resolve, reject) => {
            loader.load(this.options.modelPath, resolve, undefined, reject);
        });
        this.model = gltf.scene;

        // Collect all bones
        this._bones = {};
        this.model.traverse(child => {
            if (child.isBone) this._bones[child.name] = child;
        });

        // Capture rest pose, init per-bone params
        this._restPose = {};
        this._poseParams = {};
        for (const [name, bone] of Object.entries(this._bones)) {
            this._restPose[name] = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
            this._poseParams[name] = { x: 0, y: 0, z: 0 };
            this._windInfluence[name] = 0;
            this._limbInfluence[name] = 0;
        }

        // Compute bone depth in skeleton hierarchy
        this._boneDepth = {};
        for (const [name, bone] of Object.entries(this._bones)) {
            let depth = 0, p = bone.parent;
            while (p && p.isBone) { depth++; p = p.parent; }
            this._boneDepth[name] = depth;
        }

        this._tmpVec = new THREE.Vector3();

        // Skeleton visualizer
        this._skeletonHelper = new THREE.SkeletonHelper(this.model);
        this._skeletonHelper.visible = false;
        ctx.scene.add(this._skeletonHelper);

        // Pivot group — rotation happens around this point (the rope attachment)
        this._pivot = new THREE.Group();
        ctx.scene.add(this._pivot);
        this._pivot.add(this.model);
        this.model.position.set(0, this._params.attachOffsetY, 0);
        this._pivot.scale.setScalar(this._params.scale);
    }

    setupGui(folder, ctx) {
        this._bindings = [
            folder.addBinding(this._params, 'scale', { min: 0.001, max: 1, step: 0.001 })
                .on('change', ({ value }) => this._pivot.scale.setScalar(value)),
            folder.addBinding(this._params, 'showSkeleton', { label: 'skeleton' })
                .on('change', ({ value }) => { this._skeletonHelper.visible = value; }),
        ];

        // Only show manual transform when no physics is driving position
        if (!this.options.physicsSystem) {
            this._bindings.push(
                folder.addBinding(this._params, 'rotY', { min: -Math.PI, max: Math.PI, step: 0.01, label: 'rotation Y' })
                    .on('change', ({ value }) => { this.model.rotation.y = value; }),
                folder.addBinding(this._params, 'posY', { min: -10, max: 10, step: 0.01, label: 'position Y' })
                    .on('change', ({ value }) => { this.model.position.y = value; }),
            );
        }

        // ── Wind (only if wired) ─────────────────────────────────────────────
        if (this.options.windSystem) {
            const windFolder = folder.addFolder({ title: 'Wind', expanded: true });
            this._bindings.push(
                windFolder.addBinding(this._params, 'windFlexibility', { label: 'flexibility', min: 0, max: 2, step: 0.01 }),
                windFolder.addBinding(this._params, 'windSampleHeight', { label: 'sample height', min: 0, max: 10, step: 0.1 }),
            );
            const _allWindInf = { value: 0 };
            windFolder.addBinding(_allWindInf, 'value', { label: 'set all influence', min: 0, max: 1, step: 0.01 })
                .on('change', ({ value }) => {
                    for (const n of Object.keys(this._windInfluence)) this._windInfluence[n] = value;
                    for (const b of this._bindings) b.refresh?.();
                });
        }

        // ── Limb Physics (only if wired) ─────────────────────────────────────
        if (this.options.physicsSystem) {
            const limbFolder = folder.addFolder({ title: 'Limb Physics', expanded: true });
            this._bindings.push(
                limbFolder.addBinding(this._params, 'limbFlexibility', { label: 'flexibility', min: 0, max: 0.05, step: 0.001 }),
                limbFolder.addBinding(this._params, 'attachOffsetY', { label: 'attach offset Y', min: -3, max: 3, step: 0.01 })
                    .on('change', ({ value }) => { this.model.position.y = value; }),
            );
            const _allLimbInf = { value: 0 };
            limbFolder.addBinding(_allLimbInf, 'value', { label: 'set all limb influence', min: 0, max: 1, step: 0.01 })
                .on('change', ({ value }) => {
                    for (const n of Object.keys(this._limbInfluence)) {
                        this._limbInfluence[n] = value * Math.min(1, this._boneDepth[n] / 4);
                    }
                    for (const b of this._bindings) b.refresh?.();
                });
        }

        // ── Per-bone pose ────────────────────────────────────────────────────
        const poseFolder = folder.addFolder({ title: 'Pose', expanded: false });
        for (const [boneName, bone] of Object.entries(this._bones)) {
            const bf   = poseFolder.addFolder({ title: boneName, expanded: false });
            const p    = this._poseParams[boneName];
            const rest = this._restPose[boneName];
            this._bindings.push(
                bf.addBinding(p, 'x', { min: -Math.PI, max: Math.PI, step: 0.01 })
                    .on('change', ({ value }) => { bone.rotation.x = rest.x + value; }),
                bf.addBinding(p, 'y', { min: -Math.PI, max: Math.PI, step: 0.01 })
                    .on('change', ({ value }) => { bone.rotation.y = rest.y + value; }),
                bf.addBinding(p, 'z', { min: -Math.PI, max: Math.PI, step: 0.01 })
                    .on('change', ({ value }) => { bone.rotation.z = rest.z + value; }),
            );
            if (this.options.windSystem) {
                this._bindings.push(
                    bf.addBinding(this._windInfluence, boneName, { label: 'wind', min: 0, max: 1, step: 0.01 }),
                );
            }
            if (this.options.physicsSystem) {
                this._bindings.push(
                    bf.addBinding(this._limbInfluence, boneName, { label: 'limb phys', min: 0, max: 1, step: 0.01 }),
                );
            }
        }
    }

    collectParams() {
        const pose = {};
        for (const [name, p] of Object.entries(this._poseParams)) pose[name] = { ...p };
        return {
            ...this._params,
            pose,
            windInfluence: { ...this._windInfluence },
            limbInfluence: { ...this._limbInfluence },
        };
    }

    applyParams(data) {
        Object.assign(this._params, data);
        this._pivot.scale.setScalar(this._params.scale);
        if (!this.options.physicsSystem) {
            this.model.rotation.y = this._params.rotY;
            this.model.position.y = this._params.posY;
        }
        this._skeletonHelper.visible = this._params.showSkeleton;

        if (data.pose) {
            for (const [boneName, rot] of Object.entries(data.pose)) {
                const bone = this._bones[boneName];
                const rest = this._restPose[boneName];
                if (!bone || !rest) continue;
                Object.assign(this._poseParams[boneName], rot);
                bone.rotation.set(rest.x + rot.x, rest.y + rot.y, rest.z + rot.z);
            }
        }
        if (data.windInfluence) Object.assign(this._windInfluence, data.windInfluence);
        if (data.limbInfluence) Object.assign(this._limbInfluence, data.limbInfluence);
        for (const b of this._bindings ?? []) b.refresh();
    }

    preFrame(ctx) {
        if (!this.model) return;
        const t = ctx.clock.getElapsedTime();
        const dt = Math.min(t - (this._lastTime || t), 1 / 30);
        this._lastTime = t;

        // ── Wind-driven bone sway ────────────────────────────────────────────
        if (this.options.windSystem) {
            this.model.getWorldPosition(this._tmpVec);
            const w = this.options.windSystem.evaluate(
                this._tmpVec.x, this._tmpVec.y + this._params.windSampleHeight, this._tmpVec.z, t
            );
            const flex = this._params.windFlexibility;
            for (const [name, bone] of Object.entries(this._bones)) {
                const inf = this._windInfluence[name];
                if (inf === 0) continue;
                const rest = this._restPose[name];
                const base = this._poseParams[name];
                bone.rotation.x = rest.x + base.x + w.z * inf * flex;
                bone.rotation.y = rest.y + base.y;
                bone.rotation.z = rest.z + base.z - w.x * inf * flex;
            }
        }

        // ── Physics rope ─────────────────────────────────────────────────────
        const physics = this.options.physicsSystem;
        if (physics) {
            physics.update(t);

            // Position pivot at rope end — model hangs below via its local offset
            const pos = physics.getEndPosition();
            this._pivot.position.set(pos.x, pos.y, pos.z);

            // Tilt pivot to align with rope direction
            const dir = physics.getEndDirection();
            this._pivot.rotation.x = Math.atan2(dir.z, dir.y);
            this._pivot.rotation.z = -Math.atan2(dir.x, dir.y);

            // Limb sway — bones trail behind swing velocity
            const vel = physics.getEndVelocity();
            const clamp = 5;
            const vx = Math.max(-clamp, Math.min(clamp, vel.x));
            const vz = Math.max(-clamp, Math.min(clamp, vel.z));
            const flex = this._params.limbFlexibility;
            for (const [name, bone] of Object.entries(this._bones)) {
                const inf = this._limbInfluence[name];
                if (inf === 0) continue;
                const depthScale = Math.min(1, this._boneDepth[name] / 4);
                const rest = this._restPose[name];
                const base = this._poseParams[name];
                bone.rotation.x = rest.x + base.x + vz * inf * flex * depthScale;
                bone.rotation.y = rest.y + base.y;
                bone.rotation.z = rest.z + base.z - vx * inf * flex * depthScale;
            }
        }
    }

    draw(ctx) {}

    dispose(ctx) {
        ctx.scene.remove(this._skeletonHelper);
        ctx.scene.remove(this._pivot);
        this.model.traverse(child => {
            child.geometry?.dispose();
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => m.dispose());
            }
        });
    }
}
