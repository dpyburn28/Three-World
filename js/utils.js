
async function loadShader(url) {
    const res = await fetch(url);
    return res.text();
}

function fetchScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

const _objectCache = {};

async function loadObject(name) {
    if (!_objectCache[name]) {
        _objectCache[name] = _loadObjectImpl(name);
    }
    return _objectCache[name];
}

async function _loadObjectImpl(name) {
    const dirCandidates = [
        `objects/${name}/${name}.js`,
        `objects/${name}/scene.js`,
        `objects/${name}/main.js`,
    ];

    for (const path of dirCandidates) {
        try {
            await fetchScript(path);
            return `objects/${name}`;
        } catch (_) {}
    }

    try {
        await fetchScript(`objects/${name}.js`);
        return null;
    } catch (_) {}

    throw new Error(`[loadObject] Could not find object "${name}"`);
}
