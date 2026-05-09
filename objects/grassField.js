window.GrassField = class GrassField extends SceneObject {
    constructor(options = {}) {
        super();
        this.name = 'Grass Field';

        // Defaults — overridable at construction
        this.options = {
            bladeCols:  80,
            bladeRows:  80,
            segments:   5,
            fieldSize:  600.0,
            bladeHeight:80.0,
            windSystem: null,   // ← injected by scene
            ...options,
        };
    }

    async load(ctx) {
        const grass = await loadShaderFromDirectory('shaders/grass');
        this.shader = grass;

        this.mat = new THREE.ShaderMaterial({
            vertexShader:   grass.vertexShader,
            fragmentShader: grass.fragmentShader,
            uniforms: {
                u_time:               { value: 0 },
                u_resolution:         { value: new THREE.Vector2(innerWidth, innerHeight) },
                u_frame:              { value: 0 },
                u_mouse:              { value: new THREE.Vector2() },

                u_bladeHeight:        { value: this.options.bladeHeight },
                u_fieldSize:          { value: this.options.fieldSize   },

                // Wind — base
                u_windDir:            { value: new THREE.Vector2(1, 0) },
                u_windSpeed:          { value: 1.8   },
                u_windStrength:       { value: 12.0  },
                u_windWaveFreq:       { value: 0.019 },
                u_windWaveHarmonics:  { value: 1     },

                // Wind — gusts
                u_gustStrength:       { value: 18.0  },
                u_gustSpeed:          { value: 3.0   },
                u_gustScale:          { value: 0.003 },
                u_gustSharpness:      { value: 2.0   },

                // Wind — turbulence
                u_turbulence:         { value: 3.0   },
                u_turbBaseFreq:       { value: 0.005 },
                u_turbOctaves:        { value: 5     },
                u_turbLacunarity:     { value: 2.1   },
                u_turbGain:           { value: 0.55  },
                u_turbTimeScale:      { value: 1.0   },

                // Wind — boundary layer
                u_boundaryLayer:      { value: 1     },
                u_roughnessLength:    { value: 0.05  },
                u_referenceHeight:    { value: 200.0 },

                // Wind — shear
                u_shear:              { value: 1     },
                u_shearAngle:         { value: 0.436 }, // 25 degrees in radians
                u_shearHeight:        { value: 150.0 },

                // Proximity
                u_proximityField:     { value: null  },
                u_pftResolution:      { value: 256.0 },
                u_interactionMap:     { value: null  },
                u_colliders:          { value: new Array(8).fill(new THREE.Vector4()) },
                u_numColliders:       { value: 0     },
                u_influenceMult:      { value: 1.8   },
            },
            side: THREE.DoubleSide,
        });

        this._buildGeo();
        this.mesh = new THREE.Mesh(this.geo, this.mat);
        ctx.scene.add(this.mesh);

        // Register mesh so SceneManager's global uniform tracker picks up u_time etc.
        // (traverse hits it automatically since it's in the scene)

        this._onMouseMove = (e) => {
            this.mat.uniforms.u_mouse.value.set(
                e.clientX / innerWidth,
                1.0 - e.clientY / innerHeight
            );
        };
        window.addEventListener('mousemove', this._onMouseMove);
    }

    setupGui(folder, ctx) {
        // Uniform controls auto-wired from controls.json
        this._shaderControls = new ShaderControls(
            folder, 
            this.shader.controls, 
            this.mat.uniforms,
            this.shader.dirPath
        );

        // Intercept u_fieldSize — needs geo rebuild
        const fieldBinding = this._shaderControls.bindings.find(b => b.key === 'u_fieldSize');
        if (fieldBinding) {
            fieldBinding.dispose();
            folder.addBinding(this._shaderControls.params, 'u_fieldSize', {
                label: 'Field Size', min: 100, max: 2000, step: 10,
            }).on('change', ({ value }) => {
                this.mat.uniforms.u_fieldSize.value = value;
                this._rebuildGeo();
            });
        }

        // Geometry params
        this.geoParams = {
            bladeCols: this.options.bladeCols,
            bladeRows: this.options.bladeRows,
            segments:  this.options.segments,
        };

        const geoFolder = folder.addFolder({ title: 'Geometry', expanded: true });

        this._geoBindings = [
            geoFolder.addBinding(this.geoParams, 'bladeCols', { label: 'Blade Cols', min: 1, max: 200, step: 1 })
                .on('change', () => this._rebuildGeo()),
            geoFolder.addBinding(this.geoParams, 'bladeRows', { label: 'Blade Rows', min: 1, max: 200, step: 1 })
                .on('change', () => this._rebuildGeo()),
            geoFolder.addBinding(this.geoParams, 'segments', { label: 'Segments', min: 1, max: 16, step: 1 })
                .on('change', () => this._rebuildGeo()),
        ]
        
    }

    collectParams() {
        return {
            shader: this._shaderControls?.collectParams() ?? {},
            geo: { ...this.geoParams }
        }
    }

    applyParams(data) {
        if (data.shader && this._shaderControls) {
            this._shaderControls.applyParams(data.shader)
        }
        if (data.geo) {
            Object.assign(this.geoParams, data.geo);
            this._rebuildGeo()
            for (const b of this._geoBindings ?? []) b.refresh()
        }
    }

    preFrame(ctx) {
        // u_time / u_resolution / u_frame auto-updated by SceneManager
        // nothing extra needed here unless you have object-specific per-frame logic
            this.options.windSystem?.applyToUniforms(this.mat.uniforms);
    }

    dispose(ctx) {
        window.removeEventListener('mousemove', this._onMouseMove);
        this._shaderControls?.dispose();
        this.geo?.dispose();
        this.mat?.dispose();
        ctx.scene.remove(this.mesh);
    }

    // ── Private ────────────────────────────────────────────────────────────

    _buildGeo() {
        this.geo = buildGrass(
            this.geoParams?.bladeCols ?? this.options.bladeCols,
            this.geoParams?.bladeRows ?? this.options.bladeRows,
            this.geoParams?.segments  ?? this.options.segments,
            this.mat.uniforms.u_fieldSize.value
        );
    }

    _rebuildGeo() {
        this.geo.dispose();
        this._buildGeo();
        this.mesh.geometry = this.geo;
    }
}

function buildGrass(bladeCols = 80, bladeRows = 80, segments = 5, fieldSize = 600) {
    const SCATTER = (fieldSize / bladeCols) * 0.5;

    const TOTAL_BLADES    = bladeCols * bladeRows;
    const VERTS_PER_BLADE = (segments + 1) * 2; // left + right per row
    const TRIS_PER_BLADE  = segments * 2;        // 2 triangles per quad segment

    // Pre-allocate flat arrays
    const positions = new Float32Array(TOTAL_BLADES * VERTS_PER_BLADE * 3);
    const uvs       = new Float32Array(TOTAL_BLADES * VERTS_PER_BLADE * 2);
    const indices   = new Uint32Array(TOTAL_BLADES * TRIS_PER_BLADE * 3);
    // ↑ Uint32 needed: 80×80×12 = 76 800 verts, exceeds Uint16 max (65 535)

    let vIdx = 0;        // flat position into positions/uvs arrays
    let iIdx = 0;        // flat position into indices array
    let baseVert = 0;    // absolute vertex index for the start of current blade

    for (let bx = 0; bx < bladeCols; bx++) {
        for (let bz = 0; bz < bladeRows; bz++) {

            // Grid position + scatter — mirrors p5's map() + random()
            const wx = ((bx / (bladeCols - 1)) - 0.5) * fieldSize
                     + (Math.random() - 0.5) * 2 * SCATTER;
            const wz = ((bz / (bladeRows - 1)) - 0.5) * fieldSize
                     + (Math.random() - 0.5) * 2 * SCATTER;

            // ── Vertices ───────────────────────────────────────────────────
            // All vertices share the same (wx, 0, wz) root.
            // UV carries the blade-local info the vertex shader needs:
            //   uv.x → 0 = left edge,  1 = right edge
            //   uv.y → 0 = root (base), 1 = tip
            for (let s = 0; s <= segments; s++) {
                const t = s / segments;

                // left edge
                positions[vIdx * 3]     = wx;
                positions[vIdx * 3 + 1] = 0;
                positions[vIdx * 3 + 2] = wz;
                uvs[vIdx * 2]           = 0.0;
                uvs[vIdx * 2 + 1]       = t;
                vIdx++;

                // right edge
                positions[vIdx * 3]     = wx;
                positions[vIdx * 3 + 1] = 0;
                positions[vIdx * 3 + 2] = wz;
                uvs[vIdx * 2]           = 1.0;
                uvs[vIdx * 2 + 1]       = t;
                vIdx++;
            }

            // ── Indices ────────────────────────────────────────────────────
            // Convert triangle strip winding to explicit triangles.
            // Each segment row is a quad: l0─r0 (bottom), l1─r1 (top)
            for (let s = 0; s < segments; s++) {
                const l0 = baseVert + s * 2;
                const r0 = baseVert + s * 2 + 1;
                const l1 = baseVert + (s + 1) * 2;
                const r1 = baseVert + (s + 1) * 2 + 1;

                indices[iIdx++] = l0; indices[iIdx++] = r0; indices[iIdx++] = l1;
                indices[iIdx++] = r0; indices[iIdx++] = r1; indices[iIdx++] = l1;
            }

            baseVert += VERTS_PER_BLADE;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    return geo;
}
