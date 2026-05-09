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
        for (const sys of Object.values(this.systems)) sys.preFrame(ctx);
        for (const obj of this.objects) obj.preFrame(ctx);
        // effects run via composer pass — intentionally excluded
    }

    draw(ctx) {
        for (const obj of this.objects) obj.draw(ctx);
    }

    collectParams() {
        return {
            systems: Object.fromEntries(Object.entries(this.systems).map(([k, s]) => [k, s.collectParams()])),
            objects: Object.fromEntries(this.objects.map(o => [o.name, o.collectParams()])),
            effects: Object.fromEntries(this.effects.map(f => [f.name, f.collectParams()])),
        };
    }

    applyParams(data) {
        for (const [name, sys] of Object.entries(this.systems))
            if (data.systems?.[name]) sys.applyParams(data.systems[name]);
        for (const obj of this.objects)
            if (data.objects?.[obj.name]) obj.applyParams(data.objects[obj.name]);
        for (const fx of this.effects)
            if (data.effects?.[fx.name]) fx.applyParams(data.effects[fx.name]);
    }

    dispose(ctx) {
        for (const sys of Object.values(this.systems)) sys.destroy(ctx);
        for (const obj of this.objects) obj.destroy(ctx);
        for (const fx of this.effects) fx.destroy(ctx);
        this.systems = {};
        this.objects.length = 0;
        this.effects.length = 0;
    }
}
