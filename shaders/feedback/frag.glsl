// feedback.frag
uniform sampler2D tCurrent;  // what was just rendered
uniform sampler2D tPrev;     // last frame
uniform float uDecay;

varying vec2 vUv;

void main() {
    vec4 current = texture2D(tCurrent, vUv);
    vec4 prev    = texture2D(tPrev, vUv);
    gl_FragColor = mix(current, prev, uDecay); // blend — e.g. uDecay 0.85
}