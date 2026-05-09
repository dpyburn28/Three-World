window.SceneEntities = class SceneEntities {
    constructor() {
        this.systems = {};
        this.objects = [];
        this.effects = [];
    }

    addSystem(name, system) {
        this.systems[name] = system;
        return system;
    }

    addObject(obj) {
        this.objects.push(obj);
        return obj;
    }

    addEffect(effect) {
        this.effects.push(effect);
        return effect;
    }

    find(name) {
        return this.objects.find(o => o.name === name);
    }

    preFrame(ctx) {
        for (const obj of this.objects) obj.preFrame(ctx);
    }

    draw(ctx) {
        for (const obj of this.objects) obj.draw(ctx);
    }

    collectParams() {
        const params = {};
        for (const [name, sys] of Object.entries(this.systems)) {
            params[name] = sys.collectParams();
        }
        return params;
    }

    applyParams(data) {
        for (const [name, sys] of Object.entries(this.systems)) {
            if (data[name]) sys.applyParams(data[name]);
        }
    }

    dispose(ctx) {
        for (const sys of Object.values(this.systems)) sys.dispose();
        for (const fx of this.effects) fx.destroy(ctx);
        for (const obj of this.objects) obj.destroy(ctx);
        this.systems = {};
        this.objects.length = 0;
        this.effects.length = 0;
    }
}
