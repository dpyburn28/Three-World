window.ScenePresetManager = class ScenePresetManager {
    constructor(folder, scene, dirPath) {
        this._presets = new PresetHandler(folder, dirPath, {

            collect: () => ({
                scene: scene.collectParams?.() ?? {},

                objects: Object.fromEntries(
                    (scene.objects ?? []).map(obj => [obj.name, obj.collectParams?.() ?? {}])
                ),

                postEffects: Object.fromEntries(
                    (scene.postEffects ?? []).map(fx => [fx.name, fx.collectParams?.() ?? {}])
                ),
            }),

            apply: (data) => {
                if (data.scene) {
                    scene.applyParams?.(data.scene);
                }
                if (data.objects) {
                    for (const obj of scene.objects ?? []) {
                        const d = data.objects[obj.name];
                        if (d) obj.applyParams?.(d);
                    }
                }
                if (data.postEffects) {
                    for (const fx of scene.postEffects ?? []) {
                        const d = data.postEffects[fx.name];
                        if (d) fx.applyParams?.(d);
                    }
                }
            },
        });
    }
}