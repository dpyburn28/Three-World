
window.PresetManager = {}

window.PresetManager = class PresetManager {
    constructor() {

    }

    async getPresetIndex(dir) {
        const res = await fetch(`${dir}/.index.json`)
        const names = await res.json()
        return names
    }

    async getPreset(dir, preset) {
        const res = await fetch(`${dir}/${preset}.json`)
        const obj = await res.json()
        return obj
    }

    async exportPreset(gui) {
        const state = gui.exportState()
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json'})
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `name.json`
        a.click()
    }

    

}