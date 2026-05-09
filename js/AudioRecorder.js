// ── AudioRecorder ──────────────────────────────────────────────────────────
//
// Captures raw PCM audio output via a ScriptProcessorNode tapped in parallel
// with the existing audio playback chain. Encodes to 16-bit stereo WAV on stop.
//
// Usage:
//   const rec = new AudioRecorder(audioCtx, masterGainNode);
//   rec.start();
//   // ... perform ...
//   rec.stop();
//   rec.save('audio.wav');
//

window.AudioRecorder = class AudioRecorder {

    constructor(audioContext, sourceNode) {
        this._ctx        = audioContext;
        this._source     = sourceNode;
        this._processor  = null;
        this._silentGain = null;
        this._buffers    = [[], []];   // [leftChunks[], rightChunks[]]
        this._sampleRate = audioContext.sampleRate;
        this._startTime  = 0;
        this._stopTime   = 0;
        this._isRecording = false;
    }

    // ── Recording Control ─────────────────────────────────────────────────

    start() {
        this._buffers    = [[], []];
        this._startTime  = this._ctx.currentTime;
        this._isRecording = true;

        // Create ScriptProcessorNode (4096 samples, stereo in/out)
        this._processor = this._ctx.createScriptProcessor(4096, 2, 2);

        // Silent gain so the recording branch doesn't add to playback volume
        this._silentGain = this._ctx.createGain();
        this._silentGain.gain.value = 0;

        // Wire: source → processor → silence → destination
        this._source.connect(this._processor);
        this._processor.connect(this._silentGain);
        this._silentGain.connect(this._ctx.destination);

        this._processor.onaudioprocess = (e) => {
            if (!this._isRecording) return;
            // Must copy — browser reuses the underlying buffer
            this._buffers[0].push(new Float32Array(e.inputBuffer.getChannelData(0)));
            this._buffers[1].push(new Float32Array(e.inputBuffer.getChannelData(1)));
        };
    }

    stop() {
        this._isRecording = false;
        this._stopTime = this._ctx.currentTime;

        if (this._processor) {
            this._processor.onaudioprocess = null;
            // Targeted disconnect to preserve master → analyser connection
            try { this._source.disconnect(this._processor); } catch (_) {}
            this._processor.disconnect();
            this._processor = null;
        }
        if (this._silentGain) {
            this._silentGain.disconnect();
            this._silentGain = null;
        }
    }

    // ── Download ──────────────────────────────────────────────────────────

    save(filename = 'audio.wav') {
        const wav  = this._encodeWAV();
        const blob = new Blob([wav], { type: 'audio/wav' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ── Accessors ─────────────────────────────────────────────────────────

    getRealDuration() {
        return this._stopTime - this._startTime;
    }

    getSampleRate() {
        return this._sampleRate;
    }

    getTotalSamples() {
        let total = 0;
        for (const chunk of this._buffers[0]) total += chunk.length;
        return total;
    }

    // ── WAV Encoding (16-bit stereo PCM) ──────────────────────────────────

    _encodeWAV() {
        const totalSamples = this.getTotalSamples();
        const numChannels  = 2;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign   = numChannels * bytesPerSample;
        const byteRate     = this._sampleRate * blockAlign;
        const dataSize     = totalSamples * numChannels * bytesPerSample;

        // 1. Merge chunks into contiguous arrays
        const left  = new Float32Array(totalSamples);
        const right = new Float32Array(totalSamples);
        let offset  = 0;
        for (let i = 0; i < this._buffers[0].length; i++) {
            left.set(this._buffers[0][i], offset);
            right.set(this._buffers[1][i], offset);
            offset += this._buffers[0][i].length;
        }

        // 2. Interleave stereo and convert float [-1,1] → Int16
        const pcm = new Int16Array(totalSamples * numChannels);
        for (let i = 0; i < totalSamples; i++) {
            const l = Math.max(-1, Math.min(1, left[i]));
            const r = Math.max(-1, Math.min(1, right[i]));
            pcm[i * 2]     = l < 0 ? l * 0x8000 : l * 0x7FFF;
            pcm[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7FFF;
        }

        // 3. Build WAV container (44-byte header + PCM data)
        const buffer = new ArrayBuffer(44 + dataSize);
        const view   = new DataView(buffer);

        // RIFF header
        this._writeStr(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this._writeStr(view, 8, 'WAVE');

        // fmt sub-chunk
        this._writeStr(view, 12, 'fmt ');
        view.setUint32(16, 16, true);                    // sub-chunk size (PCM)
        view.setUint16(20, 1, true);                     // audio format (1 = PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, this._sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // data sub-chunk
        this._writeStr(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // PCM payload
        new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));

        return buffer;
    }

    _writeStr(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }
};
