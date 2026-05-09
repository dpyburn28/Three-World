// must come after three.min.js and EffectComposer.js
class PingPongPass extends THREE.Pass {
  constructor(shader, extraUniforms = {}) {
    super();

    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    //   type: THREE.FloatType,
    };

    this.prev = new THREE.WebGLRenderTarget(innerWidth, innerHeight, opts);
    this.next = new THREE.WebGLRenderTarget(innerWidth, innerHeight, opts);

    this.material = new THREE.ShaderMaterial({
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      uniforms: {
        tCurrent: { value: null }, // composer's scene output
        tPrev:    { value: null }, // our previous frame
        ...extraUniforms,
      },
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  render(renderer, writeBuffer, readBuffer) {
    // readBuffer is the composer's output so far (scene render)
    this.material.uniforms.tCurrent.value = readBuffer.texture;
    this.material.uniforms.tPrev.value    = this.prev.texture;

    // render feedback into our next target
    renderer.setRenderTarget(this.next);
    renderer.render(this.scene, this.camera);

    // if renderToScreen, blit to canvas; otherwise pass forward in composer chain
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.render(this.scene, this.camera);

    // swap
    [this.prev, this.next] = [this.next, this.prev];
  }

  setSize(width, height) {
    this.prev.setSize(width, height);
    this.next.setSize(width, height);
  }

  dispose() {
    this.prev.dispose();
    this.next.dispose();
    this.material.dispose();
  }
}