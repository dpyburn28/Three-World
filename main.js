
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

// ---------- GUI ----------
function setupGui() {
    const pane = new Pane({
        title: "Parameters",
        expanded: true
    });
    console.log(pane)
    
    const basic = pane.addFolder({title: 'Basics', expanded: false})
    basic.addBinding(PARAMS, 'factor');
    basic.addBinding(PARAMS, 'title');
    basic.addBinding(PARAMS, 'color');

    // `min` and `max`: slider
    basic.addBinding(
        PARAMS, 'percentage',
        {min: 0, max: 100, step: 10}
    ).on('change', (ev) => { // events
        console.log(`change: ${ev.value}`)
    })

    // `options`: list
    basic.addBinding(
        PARAMS, 'theme',
        {options: {Dark: 'dark', Light: 'light'}}
    );

    const f = pane.addFolder({
        title: 'Title',
        expanded: false,
    });

    f.addBinding(PARAMS, 'text');
    f.addBinding(PARAMS, 'size');

    pane.addButton({
        title: 'Export',

    }).on('click', () => {
        const state = pane.exportState();
        console.log(state);
    })

    // --- Monitor state ---
    const monitors = pane.addFolder({title: 'Monitor State', expanded: false})
    monitors.addBinding(PARAMS, 'wave',);

    monitors.addBinding(PARAMS, 'wave', {
        readonly: true,
        view: 'graph',
        min: -1,
        max: 1,
        interval: 0
    })

    // buffer size
    monitors.addBinding(PARAMS, 'wave', {
        readonly: true,
        bufferSize: 10
    });

    // --- Bindings ---
    const bindings = pane.addFolder({title: 'Bindings', expanded: false})

    // range
    bindings.addBinding(PARAMS, 'speed', {
        min:0,
        max:100,
    })

    // step
    bindings.addBinding(PARAMS, 'count', {
        step: 10,
        min: 0,
        max: 100,
    });

    // Number list 
    bindings.addBinding(PARAMS, 'quality', {
        options: {
            low: 0,
            medium: 50,
            high: 100,
        },
    });

    // Formatter
    bindings.addBinding(PARAMS, 'k', {
        format: (v) => v.toFixed(6),
    });
    
    // string list
    bindings.addBinding(PARAMS, 'theme', {
        options: {
            none: '',
            dark: 'dark-theme.json',
            light: 'light-theme.json',
        },
    });

    // color
    const color = bindings.addFolder({title:'Color', expanded: false})
    color.addBinding(PARAMS, 'background');
    color.addBinding(PARAMS, 'tint', {
        color: {type:'float'}
    });
    color.addBinding(PARAMS, 'primary');
    color.addBinding(PARAMS, 'secondary');
    color.addBinding(PARAMS, 'hexColor', {
        view: 'color',
    });
    // color picker
    color.addBinding(PARAMS, 'tint', {
        picker: 'inline',
        expanded: true,
    });

    // point
    const twoD = bindings.addFolder({title:'2D', expanded: false})
    twoD.addBinding(PARAMS, 'offset', {
        x: {step: 20, },
        y: {min:0, max:100, inverted: true}
    })
    // inline picker
    twoD.addBinding(PARAMS, 'offset', {
        picker: 'inline',
        expanded: true,
    });

    // 3d
    const threeD = bindings.addFolder({title:'3D+4D', expanded: false})
    threeD.addBinding(PARAMS, 'source')
    threeD.addBinding(PARAMS, 'camera', {
        y: {step:10},
        z: {max:0}
    })

    // 4d
    threeD.addBinding(PARAMS, 'color', {
        x: {min: 0, max: 1},
        y: {min: 0, max: 1},
        z: {min: 0, max: 1},
        w: {min: 0, max: 1},
    });

    // --- UI ---

    // tab
    const ui = pane.addFolder({title: 'UI', expanded: false})
    const tab = ui.addTab({
        pages: [
            {title: 'Parameters'},
            {title: 'advanced'}
        ]
    })

    tab.pages[0].addBinding(PARAMS, 'wave')

    // --- PLUGINS ---
    const plugins = pane.addFolder({title: 'Plugins'})

    // ESSENTIALS
    const essentials = plugins.addFolder({title: 'Essentials', expanded: false})
    pane.registerPlugin(EssentialsPlugin)

    // range
    essentials.addBinding(PARAMS, 'range', {
        min: 0,
        max: 100,
        step: 1,
    });

    // Radio Grid
    const scales = [10, 20, 25, 50, 75, 100]
    essentials.addBinding(PARAMS, 'size', {
        view: 'radiogrid',
        groupName: 'size',
        size: [3, 2],
        cells: (x, y) => ({
            title: `${scales[y * 3 + x]}%`,
            value: scales[y*3+x]
        }),
        label: 'radiogrid'
    }).on('change', (ev) => {
        console.log(ev);
    });

    var blades = essentials.addFolder({title: 'blades', expanded: true})

    // FPS graph
    fpsGraph = blades.addBlade({
        view: 'fpsgraph',
        label: 'fpsgraph',
    });

    

    // Button Grid
    blades.addBlade({
        view: 'buttongrid',
        size: [3, 3],
        cells: (x, y) => ({
            title: [
            ['NW', 'N', 'NE'],
            ['W',  '*', 'E'],
            ['SW', 'S', 'SE'],
            ][y][x],
        }),
        label: 'buttongrid',
    }).on('click', (ev) => {
        console.log(ev);
    });

    // Cubic Bezier
    blades.addBlade({
        view: 'cubicbezier',
        value: [0.5, 0, 0.5, 1],

        expanded: true,
        label: 'cubicbezier',
        picker: 'inline',
    }).on('change', (ev) => {
        console.log(ev);
    });

    // CAMERA KIT PLUGIN
    pane.registerPlugin(CameraKitPlugin)
    const cameraKit = plugins.addFolder({title: 'Camera Kit', expanded: true})
    PARAMS.flen = 55
    PARAMS.fnum = 1.8
    PARAMS.iso = 100
    
    // Ring input
    cameraKit.addBinding(PARAMS, 'fnum', {
        view: 'cameraring',
        series: 1, // ring apprearance
        unit: {ticks: 10, pixels: 40, value: 0.2},
        wide: true,
        min: 1.4,
        max: 2.5,
        step: 0.02
    })

    // Wheel input
    cameraKit.addBinding(PARAMS, 'iso', {
        // Ring control
        view: 'camerawheel',
        // Appearance of the ring view: 0 | 1 | 2
        amount: 100,
    });


    return pane
}
