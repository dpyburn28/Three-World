SceneRegistry['myScene'] = () => ({
    name: 'My Scene',

    PARAMS : {
        decay: 0.85,
        colorLevels: 4.0,
        rotSpeedX: 0.8,
        rotSpeedY: 1.2
    },

    async load(ctx) {

        // Load shaders
        const [test, feedback, dither] = await Promise.all([
            loadShaderFromDirectory('shaders/test'),
            loadShaderFromDirectory('shaders/feedback'),
            loadShaderFromDirectory('shaders/dither'),
        ]);

        this.shaders = { test, feedback, dither };

        // --- Scene ---
        ctx.scene.background = new THREE.Color('gray');

        // --- Cube ---
        this.mat = new THREE.ShaderMaterial({
            vertexShader: test.vertexShader,
            fragmentShader: test.fragmentShader,
            uniforms: {
                uTime: { value: 0 },
            },
        });
        this.cube = new THREE.Mesh(new THREE.BoxGeometry(), this.mat);
        ctx.scene.add(this.cube);

        // --- Passes ---
        ctx.passes.pingPong = new PingPongPass(
            feedback,
            { uDecay: { value: this.PARAMS.decay } }
        );
        ctx.composer.addPass(ctx.passes.pingPong);

        ctx.passes.dither = new THREE.ShaderPass({
            vertexShader: dither.vertexShader,
            fragmentShader: dither.fragmentShader,
            uniforms: {
                uBrightness:     { value: null },
                uResolution:  { value: new THREE.Vector2(innerWidth, innerHeight) },
                uColorLevels: { value: this.PARAMS.colorLevels },
            },
        });
        ctx.composer.addPass(ctx.passes.dither);
    },

    setupGui(folder, ctx) {

        const { feedback, dither } = this.shaders

        new ShaderControls(
            folder.addFolder({ title: 'Feedback', expanded: true }),
            feedback.controls,
            ctx.passes.pingPong.material.uniforms
        );

        new ShaderControls(
            folder.addFolder({ title: 'Dither', expanded: true }),
            dither.controls,
            ctx.passes.dither.uniforms
        )

        // Non-uniform bindings: just drives PARAMS, preFrame reads them
        const motion = folder.addFolder({ title: 'Motion', expanded: true });
        motion.addBinding(this.PARAMS, 'rotSpeedX', { min: 0, max: 5, step: 0.1, label: 'Rot X' });
        motion.addBinding(this.PARAMS, 'rotSpeedY', { min: 0, max: 5, step: 0.1, label: 'Rot Y' });
    },

    preFrame(ctx) {
        // this.mat.uniforms.uTime.value = ctx.clock.getElapsedTime();
        // ctx.passes.dither.uniforms.uResolution.value = new THREE.Vector2(innerWidth, innerHeight) 
    },

    draw(ctx) {
        const t = ctx.clock.getElapsedTime();
        this.cube.rotation.x = t * 0.8 * this.PARAMS.rotSpeedX;
        this.cube.rotation.y = t * 1.2 * this.PARAMS.rotSpeedY;
    },

    onDeactivate(ctx) {
        ctx.scene.background = null;
    },
});