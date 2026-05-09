window.ScenePresetManager = class ScenePresetManager {
    constructor(folder, scene, dirPath) {
        this._presets = new PresetHandler(folder, dirPath, {
            collect: () => scene.entities.collectParams(),
            apply:   (data) => scene.entities.applyParams(data),
        });
    }
}
