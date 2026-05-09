
let manager;
let presetManager
let guiManager

// Engine Variables
let scene, camera, renderer; // THREE 
let clock, t = 0; // Time
let videoCapturer, isCapturing = false; // Recording
let audioRecorder = null;               // Audio capture
let capturedFrames = 0;                 // Frame counter for drift calc
let composer, passes = {} // Post-Processing

// Scene variables
const meshes = {}, geo = {}, materials = {}



// ---------- SETUP ENGINE ----------

function setup() {
    // ---- THREE Setup ---
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement)
    clock = new THREE.Clock()

    camera.position.z = 5;

    // --- Recording (CCapture) ---
    if (typeof CCapture !== 'undefined') {
        videoCapturer = new CCapture({
            format: 'webm',
            framerate: 60,
            name: 'render',
            quality: 99,
            verbose: false,
        });
    }

    window._startRecording = function() {
        if (!videoCapturer) return;
        videoCapturer.start();
        isCapturing = true;
        capturedFrames = 0;

        // --- Audio capture ---
        const synth = manager.active?.synth;
        if (synth) {
            try {
                const ctx    = synth.getContext();
                const master = synth.getMasterNode();
                audioRecorder = new AudioRecorder(ctx, master);
                audioRecorder.start();
                console.log('[Recorder] Audio capture started');
            } catch (e) {
                console.warn('[Recorder] Failed to start audio capture:', e);
                audioRecorder = null;
            }
        } else {
            console.warn('[Recorder] No AudioDriver in active scene — recording video only');
        }

        console.log('[Recorder] Started');
    };

    window._stopRecording = function() {
        if (!videoCapturer) return;
        videoCapturer.stop();
        videoCapturer.save();
        isCapturing = false;

        // --- Audio capture + drift info ---
        if (audioRecorder) {
            audioRecorder.stop();
            audioRecorder.save('audio.wav');

            const realDuration    = audioRecorder.getRealDuration();
            const virtualDuration = capturedFrames / 60;

            console.log('[Recorder] Frames captured:', capturedFrames);
            console.log('[Recorder] Virtual duration:', virtualDuration.toFixed(2) + 's');
            console.log('[Recorder] Real duration:   ', realDuration.toFixed(2) + 's');

            if (virtualDuration > 0) {
                const driftRatio   = realDuration / virtualDuration;
                const driftPercent = Math.abs(driftRatio - 1.0) * 100;
                console.log('[Recorder] Drift: ' + driftPercent.toFixed(1) + '% (ratio: ' + driftRatio.toFixed(4) + ')');

                if (driftPercent > 2) {
                    console.log('%c[Recorder] Drift detected — use this ffmpeg command:', 'color: orange; font-weight: bold');
                    console.log('ffmpeg -i render.webm -i audio.wav -c:v copy -c:a libopus -filter:a "atempo=' + driftRatio.toFixed(4) + '" -shortest output.webm');
                } else {
                    console.log('%c[Recorder] No significant drift — use this ffmpeg command:', 'color: lightgreen; font-weight: bold');
                    console.log('ffmpeg -i render.webm -i audio.wav -c:v copy -c:a libopus output.webm');
                }
            }

            audioRecorder = null;
        }

        videoCapturer = new CCapture({
            format: 'webm',
            framerate: 60,
            name: 'render',
            quality: 99,
            verbose: false,
        });
        console.log('[Recorder] Stopped');
    };

    // --- Post-Processing ---
    composer = new THREE.EffectComposer(renderer)
    composer.addPass(new THREE.RenderPass(scene, camera)); // pass 1: render scene to texture
    
    // --- Create CTX ---
    const ctx = { scene, camera, renderer, composer, passes, clock };
    manager = new SceneManager(ctx);

    // --- Create Gui Pane ---
    let gui = new Pane({title:'params'})
    const guiContainer = gui.element.parentElement
    guiContainer.style.maxHeight = '100vh'
    guiContainer.style.overflowY = 'auto'
    guiContainer.style.position = 'fixed'
    guiContainer.style.top = '0'
    guiContainer.style.right = '0'
    guiContainer.style.zIndex = '1000'
    manager.setPane(gui)
}



// ---------- INITIALIZATION ----------

async function init() {
    // --- Create Scene ---
    await manager.create('gf')

    // --- Start Animation Loop ---
    animate();
}



// ---------- ANIMATION LOOP ----------

function animate() {
    // --- Pre-Frame ---
    requestAnimationFrame(animate)
    t = clock.getElapsedTime()

    // --- Draw Frame ---
    manager.preFrame()
    manager.draw()

    // --- Render ---
    composer.render()

    // --- Post Frame ---
    manager.postFrame()

    // --- Capture frame (CCapture) ---
    if (isCapturing) {
        videoCapturer.capture(renderer.domElement);
        capturedFrames++;
    }
}




// ---------- EVENTS ----------

window.addEventListener('keydown', (e) => {
    if (e.key === 'r') {
        isCapturing ? window._stopRecording() : window._startRecording();
    }
})

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix(); // must call this after changing camera props

    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);  // calls setSize on all passes automatically
    for (key in passes) {
        if (passes[key].dispose) passes[key].dispose()
        if (passes[key].setSize) passes[key].setSize(innerWidth, innerHeight)
        if (passes[key].material.uniforms.uResolution) passes[key].material.uniforms.uResolution.value = new THREE.Vector2(innerWidth, innerHeight)
        console.log(passes[key])
    }
});



// ---------- START ----------

setup()
init()

