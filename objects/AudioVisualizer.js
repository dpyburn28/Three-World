window.AudioVisualizer = class AudioVisualizer extends SceneObject {

    constructor(options = {}) {
        super();
        this.name = 'Audio Visualizer';
        this.options = {
            audioDriver: null,
            ...options,
        };

        this._params = {
            mode:        'waveform',
            sensitivity: 1.5,
            smoothing:   0.8,
            color:       '#44aaff',
        };

        this._scene  = null;
        this._meshes = [];
        this._geos   = [];
        this._mats   = [];

        // Mode-specific references (nulled on destroy)
        this._waveformLine   = null;
        this._bars           = null;
        this._barBinRanges   = null;
        this._circWaveLine   = null;
        this._spectrumBars   = null;
        this._spectrogramMesh = null;
        this._spectrogramData = null;
        this._spectrogramTex  = null;
        this._waterfallMesh   = null;
        this._waterfallFreqs  = null;
        this._waterfallColors = null;
        this._lissajousLine   = null;
        this._meterPeakBar    = null;
        this._meterRmsBar     = null;
        this._meterHoldBar    = null;
        this._meterScaleLines = null;
        this._peakHoldValue   = -100;
        this._peakHoldTime    = 0;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async load(ctx) {
        this._scene = ctx.scene;
        this._createVis();
    }

    setupGui(folder, ctx) {
        const p = this._params;

        folder.addBinding(p, 'mode', {
            options: {
                'Waveform':          'waveform',
                'Spectrum':          'bars',
                'Circular Waveform': 'circularWave',
                'Circular Spectrum': 'circularSpectrum',
                'Spectrogram':       'spectrogram',
                '3D Waterfall':      'waterfall',
                'Lissajous':         'lissajous',
                'Level Meter':       'meter',
            },
            label: 'Mode',
        }).on('change', () => {
            this._destroyVis();
            this._createVis();
        });

        folder.addBinding(p, 'sensitivity', {
            min: 0.5, max: 5.0, step: 0.1, label: 'Sensitivity',
        });

        folder.addBinding(p, 'smoothing', {
            min: 0, max: 0.95, step: 0.01, label: 'Smoothing',
        });

        folder.addBinding(p, 'color', { label: 'Color' });
    }

    preFrame(ctx) {
        const driver = this.options.audioDriver;
        if (!driver) return;

        if (driver._analyser) {
            driver._analyser.smoothingTimeConstant = this._params.smoothing;
        }

        switch (this._params.mode) {
            case 'waveform':         this._updateWaveform(driver);         break;
            case 'bars':             this._updateBars(driver);             break;
            case 'circularWave':     this._updateCircularWave(driver);     break;
            case 'circularSpectrum': this._updateCircularSpectrum(driver); break;
            case 'spectrogram':      this._updateSpectrogram(driver);      break;
            case 'waterfall':        this._updateWaterfall(driver);        break;
            case 'lissajous':        this._updateLissajous(driver);        break;
            case 'meter':            this._updateMeter(driver);            break;
        }
    }

    dispose(ctx) {
        this._destroyVis();
    }

    collectParams() {
        return { ...this._params };
    }

    applyParams(data) {
        if (!data) return;
        const modeChanged = data.mode && data.mode !== this._params.mode;
        Object.assign(this._params, data);
        if (modeChanged) {
            this._destroyVis();
            this._createVis();
        }
    }

    // ── Mode Switching ───────────────────────────────────────────────────────

    _createVis() {
        switch (this._params.mode) {
            case 'waveform':         this._createWaveform();         break;
            case 'bars':             this._createBars();             break;
            case 'circularWave':     this._createCircularWave();     break;
            case 'circularSpectrum': this._createCircularSpectrum(); break;
            case 'spectrogram':      this._createSpectrogram();      break;
            case 'waterfall':        this._createWaterfall();        break;
            case 'lissajous':        this._createLissajous();        break;
            case 'meter':            this._createMeter();            break;
        }
    }

    _destroyVis() {
        for (const m of this._meshes) this._scene.remove(m);
        for (const g of this._geos) g.dispose();
        for (const m of this._mats) m.dispose();
        if (this._spectrogramTex) this._spectrogramTex.dispose();
        this._meshes          = [];
        this._geos            = [];
        this._mats            = [];
        this._waveformLine    = null;
        this._bars            = null;
        this._barBinRanges    = null;
        this._circWaveLine    = null;
        this._spectrumBars    = null;
        this._spectrogramMesh = null;
        this._spectrogramData = null;
        this._spectrogramTex  = null;
        this._waterfallMesh   = null;
        this._waterfallFreqs  = null;
        this._waterfallColors = null;
        this._lissajousLine   = null;
        this._meterPeakBar    = null;
        this._meterRmsBar     = null;
        this._meterHoldBar    = null;
        this._meterScaleLines = null;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    // Map FFT bin index to logarithmic bar index
    _buildLogBinRanges(barCount, binCount) {
        const ranges = [];
        const minFreq = 30;
        const maxFreq = 20000;
        const nyquist = 24000; // approximate for 48kHz sample rate
        for (let i = 0; i < barCount; i++) {
            const f0 = minFreq * Math.pow(maxFreq / minFreq, i / barCount);
            const f1 = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / barCount);
            const bin0 = Math.max(0, Math.floor(f0 / nyquist * binCount));
            const bin1 = Math.min(binCount - 1, Math.floor(f1 / nyquist * binCount));
            ranges.push([bin0, Math.max(bin0, bin1)]);
        }
        return ranges;
    }

    // Average bins in a range from frequency data
    _avgBins(data, start, end) {
        if (!data) return 0;
        let sum = 0;
        const count = end - start + 1;
        for (let j = start; j <= end; j++) sum += data[j];
        return sum / count;
    }

    // Spectrogram colormap: magnitude 0–255 → RGB
    _spectrogramColor(v) {
        // black → purple → blue → cyan → green → yellow → red → white
        const stops = [
            [0,   0,   0,   0],
            [36,  80,  0,  128],
            [72,  0,   0,  255],
            [108, 0,  200, 255],
            [144, 0,  255,  50],
            [180, 255, 255,  0],
            [216, 255,  60,  0],
            [255, 255, 255, 255],
        ];

        for (let i = 1; i < stops.length; i++) {
            if (v <= stops[i][0]) {
                const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
                return [
                    Math.round(stops[i - 1][1] + (stops[i][1] - stops[i - 1][1]) * t),
                    Math.round(stops[i - 1][2] + (stops[i][2] - stops[i - 1][2]) * t),
                    Math.round(stops[i - 1][3] + (stops[i][3] - stops[i - 1][3]) * t),
                ];
            }
        }
        return [255, 255, 255];
    }

    // ── Waveform (oscilloscope) ──────────────────────────────────────────────

    _createWaveform() {
        const count = 512;
        const positions = new Float32Array(count * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.LineBasicMaterial({ color: this._params.color });
        const line = new THREE.Line(geo, mat);

        this._scene.add(line);
        this._meshes.push(line);
        this._geos.push(geo);
        this._mats.push(mat);
        this._waveformLine = line;
    }

    _updateWaveform(driver) {
        const line = this._waveformLine;
        if (!line) return;

        const data  = driver.getTimeDomainData();
        const pos   = line.geometry.attributes.position.array;
        const count = pos.length / 3;
        const width = 28;
        const halfW = width / 2;
        const sens  = this._params.sensitivity;
        const step  = data ? Math.floor(data.length / count) : 1;

        for (let i = 0; i < count; i++) {
            const sample = data ? data[i * step] : 128;
            pos[i * 3]     = (i / (count - 1)) * width - halfW;
            pos[i * 3 + 1] = ((sample - 128) / 128) * 5 * sens;
            pos[i * 3 + 2] = 0;
        }

        line.geometry.attributes.position.needsUpdate = true;
        line.material.color.set(this._params.color);
    }

    // ── Spectrum (log-frequency bars) ────────────────────────────────────────

    _createBars() {
        const count   = 64;
        const width   = 28;
        const barW    = (width / count) * 0.8;
        const spacing = width / count;
        const startX  = -width / 2 + spacing / 2;

        const geo = new THREE.BoxGeometry(barW, 1, barW);
        geo.translate(0, 0.5, 0);
        this._geos.push(geo);

        this._bars = [];
        this._barBinRanges = this._buildLogBinRanges(count, 1024);

        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(i / count, 0.8, 0.5),
            });
            this._mats.push(mat);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.x = startX + i * spacing;
            mesh.position.y = -7;
            mesh.scale.y = 0.05;

            this._scene.add(mesh);
            this._meshes.push(mesh);
            this._bars.push(mesh);
        }
    }

    _updateBars(driver) {
        if (!this._bars) return;

        const data  = driver.getFrequencyData();
        const count = this._bars.length;
        const sens  = this._params.sensitivity;

        for (let i = 0; i < count; i++) {
            const [s, e] = this._barBinRanges[i];
            const avg    = this._avgBins(data, s, e);
            const height = Math.max(0.05, (avg / 255) * 10 * sens);
            this._bars[i].scale.y = height;
        }
    }

    // ── Circular Waveform ────────────────────────────────────────────────────

    _createCircularWave() {
        const count     = 256;
        const positions = new Float32Array(count * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat  = new THREE.LineBasicMaterial({ color: this._params.color });
        const line = new THREE.LineLoop(geo, mat);

        this._scene.add(line);
        this._meshes.push(line);
        this._geos.push(geo);
        this._mats.push(mat);
        this._circWaveLine = line;
    }

    _updateCircularWave(driver) {
        const line = this._circWaveLine;
        if (!line) return;

        const data   = driver.getTimeDomainData();
        const pos    = line.geometry.attributes.position.array;
        const count  = pos.length / 3;
        const radius = 7;
        const sens   = this._params.sensitivity;
        const step   = data ? Math.floor(data.length / count) : 1;

        for (let i = 0; i < count; i++) {
            const angle  = (i / count) * Math.PI * 2;
            const sample = data ? data[i * step] : 128;
            const offset = ((sample - 128) / 128) * sens * 2;
            const r      = radius + offset;

            pos[i * 3]     = Math.cos(angle) * r;
            pos[i * 3 + 1] = Math.sin(angle) * r;
            pos[i * 3 + 2] = 0;
        }

        line.geometry.attributes.position.needsUpdate = true;
        line.material.color.set(this._params.color);
    }

    // ── Circular Spectrum ────────────────────────────────────────────────────

    _createCircularSpectrum() {
        const count       = 64;
        const innerRadius = 5;

        const geo = new THREE.BoxGeometry(0.12, 1, 0.12);
        geo.translate(0, 0.5, 0);
        this._geos.push(geo);

        this._spectrumBars = [];

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const mat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(i / count, 0.8, 0.5),
            });
            this._mats.push(mat);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.x = Math.cos(angle) * innerRadius;
            mesh.position.y = Math.sin(angle) * innerRadius;
            mesh.rotation.z = angle - Math.PI / 2;
            mesh.scale.y = 0.05;

            this._scene.add(mesh);
            this._meshes.push(mesh);
            this._spectrumBars.push(mesh);
        }
    }

    _updateCircularSpectrum(driver) {
        if (!this._spectrumBars) return;

        const data       = driver.getFrequencyData();
        const count      = this._spectrumBars.length;
        const binCount   = data ? data.length : 1024;
        const binsPerBar = Math.floor(binCount / count);
        const sens       = this._params.sensitivity;

        for (let i = 0; i < count; i++) {
            let sum = 0;
            if (data) {
                for (let j = 0; j < binsPerBar; j++) {
                    sum += data[i * binsPerBar + j];
                }
                sum /= binsPerBar;
            }
            const length = Math.max(0.05, (sum / 255) * 4 * sens);
            this._spectrumBars[i].scale.y = length;
        }
    }

    // ── Spectrogram (time-frequency heatmap) ─────────────────────────────────

    _createSpectrogram() {
        const freqBins  = 512;
        const timeRows  = 256;
        const texData   = new Uint8Array(freqBins * timeRows * 4);
        // Init to black
        for (let i = 0; i < texData.length; i += 4) {
            texData[i] = 0; texData[i + 1] = 0; texData[i + 2] = 0; texData[i + 3] = 255;
        }

        const tex = new THREE.DataTexture(texData, freqBins, timeRows, THREE.RGBAFormat);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.needsUpdate = true;

        const geo = new THREE.PlaneGeometry(28, 16);
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);

        this._scene.add(mesh);
        this._meshes.push(mesh);
        this._geos.push(geo);
        this._mats.push(mat);
        this._spectrogramMesh = mesh;
        this._spectrogramData = texData;
        this._spectrogramTex  = tex;
        this._spectrogramW    = freqBins;
        this._spectrogramH    = timeRows;
    }

    _updateSpectrogram(driver) {
        if (!this._spectrogramData) return;

        const data = driver.getFrequencyData();
        const d    = this._spectrogramData;
        const w    = this._spectrogramW;
        const h    = this._spectrogramH;
        const rowBytes = w * 4;
        const sens = this._params.sensitivity;

        // Shift all rows up by one (oldest row at top scrolls off)
        d.copyWithin(0, rowBytes);

        // Write new frequency data into the bottom row
        const lastRow = (h - 1) * rowBytes;
        const binCount = data ? data.length : 1024;
        const binsPerPx = binCount / w;

        for (let x = 0; x < w; x++) {
            let val = 0;
            if (data) {
                const bin = Math.floor(x * binsPerPx);
                val = Math.min(255, data[bin] * sens);
            }
            const [r, g, b] = this._spectrogramColor(val);
            const idx = lastRow + x * 4;
            d[idx]     = r;
            d[idx + 1] = g;
            d[idx + 2] = b;
            d[idx + 3] = 255;
        }

        this._spectrogramTex.needsUpdate = true;
    }

    // ── 3D Waterfall ─────────────────────────────────────────────────────────

    _createWaterfall() {
        const freqBins  = 64;
        const timeSlices = 64;
        const width  = 28;
        const depth  = 16;

        const geo = new THREE.PlaneGeometry(width, depth, freqBins - 1, timeSlices - 1);
        // Rotate to lie in XZ plane, facing up
        geo.rotateX(-Math.PI / 2);

        // Add vertex colors
        const vertCount = freqBins * timeSlices;
        const colors = new Float32Array(vertCount * 3);
        for (let i = 0; i < vertCount; i++) {
            colors[i * 3] = 0; colors[i * 3 + 1] = 0; colors[i * 3 + 2] = 0.1;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            wireframe: true,
            transparent: true,
            opacity: 0.8,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = -4;

        this._scene.add(mesh);
        this._meshes.push(mesh);
        this._geos.push(geo);
        this._mats.push(mat);
        this._waterfallMesh  = mesh;
        this._waterfallFreqs = freqBins;
        this._waterfallSlices = timeSlices;
        this._waterfallColors = colors;
        this._waterfallBinRanges = this._buildLogBinRanges(freqBins, 1024);
    }

    _updateWaterfall(driver) {
        if (!this._waterfallMesh) return;

        const data   = driver.getFrequencyData();
        const geo    = this._waterfallMesh.geometry;
        const pos    = geo.attributes.position.array;
        const colors = this._waterfallColors;
        const fw     = this._waterfallFreqs;
        const fh     = this._waterfallSlices;
        const sens   = this._params.sensitivity;

        // Shift all rows back by one row (row 0 = front/newest)
        // Each vertex has 3 floats. A row is fw vertices.
        const rowFloats = fw * 3;

        // Shift Y positions (height) — move rows back (from end to start)
        for (let row = fh - 1; row > 0; row--) {
            for (let col = 0; col < fw; col++) {
                const dst = (row * fw + col) * 3 + 1; // Y component
                const src = ((row - 1) * fw + col) * 3 + 1;
                pos[dst] = pos[src];
                colors[dst - 1] = colors[src - 1]; // R
                colors[dst]     = colors[src];     // G
                colors[dst + 1] = colors[src + 1]; // B
            }
        }

        // Write new data into front row (row 0)
        for (let col = 0; col < fw; col++) {
            const [s, e] = this._waterfallBinRanges[col];
            const avg = this._avgBins(data, s, e);
            const norm = avg / 255;
            const height = norm * 6 * sens;

            const idx = col * 3;
            pos[idx + 1] = height; // Y = height

            // Color by magnitude: dark blue → cyan → green → yellow → red
            const hue = 0.66 - norm * 0.66; // 0.66 (blue) → 0 (red)
            const c = new THREE.Color().setHSL(Math.max(0, hue), 0.9, 0.15 + norm * 0.5);
            colors[idx]     = c.r;
            colors[idx + 1] = c.g;
            colors[idx + 2] = c.b;
        }

        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
    }

    // ── Lissajous (phase scope) ──────────────────────────────────────────────

    _createLissajous() {
        const count = 1024;
        const positions = new Float32Array(count * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat  = new THREE.LineBasicMaterial({
            color: this._params.color,
            transparent: true,
            opacity: 0.7,
        });
        const line = new THREE.Line(geo, mat);

        this._scene.add(line);
        this._meshes.push(line);
        this._geos.push(geo);
        this._mats.push(mat);
        this._lissajousLine = line;
    }

    _updateLissajous(driver) {
        const line = this._lissajousLine;
        if (!line) return;

        const data  = driver.getTimeDomainData();
        const pos   = line.geometry.attributes.position.array;
        const count = pos.length / 3;
        const scale = 8 * this._params.sensitivity;

        for (let i = 0; i < count; i++) {
            const s0 = data ? data[i] : 128;
            const s1 = data ? data[i + 1] || data[0] : 128;

            pos[i * 3]     = ((s0 - 128) / 128) * scale;
            pos[i * 3 + 1] = ((s1 - 128) / 128) * scale;
            pos[i * 3 + 2] = 0;
        }

        line.geometry.attributes.position.needsUpdate = true;
        line.material.color.set(this._params.color);
    }

    // ── Level Meter (Peak + RMS with dB scale) ───────────────────────────────

    _createMeter() {
        const meterH = 16;
        const barW   = 2.0;
        const gap    = 0.6;

        const barGeo = new THREE.BoxGeometry(barW, 1, 0.3);
        barGeo.translate(0, 0.5, 0);
        this._geos.push(barGeo);

        // RMS bar (left)
        const rmsMat = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
        this._mats.push(rmsMat);
        const rmsBar = new THREE.Mesh(barGeo, rmsMat);
        rmsBar.position.x = -(barW / 2 + gap / 2);
        rmsBar.position.y = -meterH / 2;
        rmsBar.scale.y = 0.01;
        this._scene.add(rmsBar);
        this._meshes.push(rmsBar);
        this._meterRmsBar = rmsBar;

        // Peak bar (right)
        const peakMat = new THREE.MeshBasicMaterial({ color: 0x44aaff });
        this._mats.push(peakMat);
        const peakBar = new THREE.Mesh(barGeo, peakMat);
        peakBar.position.x = barW / 2 + gap / 2;
        peakBar.position.y = -meterH / 2;
        peakBar.scale.y = 0.01;
        this._scene.add(peakBar);
        this._meshes.push(peakBar);
        this._meterPeakBar = peakBar;

        // Peak hold indicator
        const holdGeo = new THREE.BoxGeometry(barW * 2 + gap, 0.08, 0.3);
        this._geos.push(holdGeo);
        const holdMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
        this._mats.push(holdMat);
        const holdBar = new THREE.Mesh(holdGeo, holdMat);
        holdBar.position.y = -meterH / 2;
        this._scene.add(holdBar);
        this._meshes.push(holdBar);
        this._meterHoldBar = holdBar;

        // dB scale lines and labels
        this._meterScaleLines = [];
        const dbMarks = [0, -3, -6, -12, -24, -36, -48, -60];
        const lineGeo = new THREE.BoxGeometry(0.04, 0.04, 0.3);
        this._geos.push(lineGeo);

        const totalW = barW * 2 + gap + 1.5;
        for (const db of dbMarks) {
            const norm = 1.0 - (db / -60); // 0dB → 1.0, -60dB → 0.0
            const y = -meterH / 2 + norm * meterH;

            // Tick line
            const tickGeo = new THREE.BoxGeometry(totalW, 0.03, 0.1);
            this._geos.push(tickGeo);
            const tickMat = new THREE.MeshBasicMaterial({
                color: 0x666666,
                transparent: true,
                opacity: 0.5,
            });
            this._mats.push(tickMat);
            const tick = new THREE.Mesh(tickGeo, tickMat);
            tick.position.y = y;
            this._scene.add(tick);
            this._meshes.push(tick);
        }

        this._meterHeight = meterH;
        this._peakHoldValue = -100;
        this._peakHoldTime  = 0;
    }

    _updateMeter(driver) {
        if (!this._meterPeakBar) return;

        const data = driver.getTimeDomainData();
        const meterH = this._meterHeight;
        const sens = this._params.sensitivity;

        let rms = 0;
        let peak = 0;

        if (data) {
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) {
                const s = (data[i] - 128) / 128;
                sumSq += s * s;
                const abs = Math.abs(s);
                if (abs > peak) peak = abs;
            }
            rms = Math.sqrt(sumSq / data.length);
        }

        // Apply sensitivity
        rms  = Math.min(1, rms * sens);
        peak = Math.min(1, peak * sens);

        // Convert to dB (clamped to -60)
        const rmsDb  = rms  > 0.0001 ? 20 * Math.log10(rms)  : -60;
        const peakDb = peak > 0.0001 ? 20 * Math.log10(peak) : -60;

        // Normalize to 0–1 for display (0dB=1.0, -60dB=0.0)
        const rmsNorm  = Math.max(0, 1 + rmsDb / 60);
        const peakNorm = Math.max(0, 1 + peakDb / 60);

        // Update bar heights
        this._meterRmsBar.scale.y  = Math.max(0.01, rmsNorm * meterH);
        this._meterPeakBar.scale.y = Math.max(0.01, peakNorm * meterH);

        // Color by level: green → yellow → red
        this._meterRmsBar.material.color.setHSL(
            rmsNorm < 0.7 ? 0.33 : rmsNorm < 0.9 ? 0.16 : 0.0, 0.9, 0.5
        );
        this._meterPeakBar.material.color.setHSL(
            peakNorm < 0.7 ? 0.55 : peakNorm < 0.9 ? 0.16 : 0.0, 0.9, 0.5
        );

        // Peak hold (decays 10dB/sec)
        if (peakDb > this._peakHoldValue) {
            this._peakHoldValue = peakDb;
            this._peakHoldTime = 0;
        } else {
            this._peakHoldTime += 0.016; // ~60fps
            if (this._peakHoldTime > 1.0) { // hold for 1 second
                this._peakHoldValue -= 0.5; // decay
            }
        }

        const holdNorm = Math.max(0, 1 + this._peakHoldValue / 60);
        this._meterHoldBar.position.y = -meterH / 2 + holdNorm * meterH;
    }
}
