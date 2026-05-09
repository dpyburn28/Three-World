# shader-three

A Three.js creative coding framework for building and composing generative 3D scenes with GLSL shaders, post-processing effects, and live parameter controls.

## Stack

- **Three.js r128** — via CDN, no bundler
- **Tweakpane 4** — auto-wired GUI from `controls.json`
- **CCapture** — frame-perfect WebM recording
- **EffectComposer** — post-processing pipeline

## Getting Started

```bash
python -m http.server 8000
# or
npx http-server
```

Then open `http://localhost:8000` in your browser. The active scene is set in `main.js`.

## Structure

```
scenes/        # Each scene lazy-loads via SceneManager
objects/       # Reusable SceneObject subclasses
shaders/       # GLSL files, auto-detect u_time / u_resolution / u_frame
systems/       # Camera, Wind, MIDI, Physics
effects/       # Post-processing passes (dither, datamosh)
models/        # GLB/GLTF assets
```

## Scenes

| Scene | Description |
|-------|-------------|
| `gf` | Grass field (active) |
| `desert` | Dune terrain with sand particles and sky |
| `city` | Procedural city layout |
| `building` | Building scene |
| `feather` | Multi-feather simulation |
| `eye` | Eye scene |
| `astronaught` | GLB model loader |
| `midiInput` | MIDI-driven visuals |

## Controls

Tweakpane panel opens automatically. Parameters are defined per-scene and per-object via `controls.json` files.

## Recording

Press `R` to start/stop recording. Two files download: `render.webm` (video) and `audio.wav` (audio, if scene has audio).

**Merge without drift correction** (drift < 2%):
```bash
ffmpeg -i render.webm -i audio.wav -c:v copy -c:a libopus output.webm
```

**Merge with drift correction** (check browser console for exact ratio):
```bash
ffmpeg -i render.webm -i audio.wav -c:v copy -c:a libopus -filter:a "atempo=RATIO" -shortest output.webm
```

**PNG sequence to MP4:**
```bash
ffmpeg -r 60 -i %07d.png -c:v libx264 -crf 0 output.mp4
```
