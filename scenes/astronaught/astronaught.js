SceneRegistry['astronaught'] = () => ({
    name: 'Astronaught',

    async load(ctx, folder) {
        this.entities = new SceneEntities();

        ctx.scene.background = new THREE.Color(0x111111);

        // Lights — FBX materials (Phong/Lambert) require scene lights
        this._ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this._dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this._dirLight.position.set(5, 10, 7);
        ctx.scene.add(this._ambient, this._dirLight);

        // Camera
        const camera = this.entities.addSystem('camera', new CameraSystem({ posZ: 3 }));
        camera.init(ctx, folder);

        // Physics rope
        const physics = this.entities.addSystem('physics', new PhysicsSystem());
        physics.init(ctx, folder);

        // Astronaught object — physics-driven, no wind
        const astronaught = this.entities.addObject(new Astronaught({ physicsSystem: physics }));
        await astronaught.init(ctx, folder, 'objects/Astronaught');
    },

    setupGui(folder, ctx) {},
    collectParams()   { return this.entities.collectParams(); },
    applyParams(data) { this.entities.applyParams(data); },
    preFrame(ctx)     { this.entities.preFrame(ctx); },
    draw(ctx)         { this.entities.draw(ctx); },
    onActivate(ctx)   {},

    onDeactivate(ctx) {
        this.entities.dispose(ctx);
        ctx.scene.remove(this._ambient, this._dirLight);
        this._ambient.dispose();
        this._dirLight.dispose();
        ctx.scene.background = null;
    },
});
