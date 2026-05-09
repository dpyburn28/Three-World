window.CityLayout = class CityLayout extends SystemHandle {
    constructor(options = {}) {
        super('Layout');

        Object.assign(this._params, {
            gridRows:      2,
            gridCols:      2,
            blockWidth:    60,
            blockDepth:    80,
            roadWidth:     12,
            sidewalkWidth: 4,
            curbHeight:    0.15,
            curbWidth:     0.15,
            cornerRadius:  3,
            ...options,
        });

        this._onChange = null;  // set by scene to trigger city rebuild
    }

    _buildGui() {
        const f = this._folder;
        const change = () => { if (this._onChange) this._onChange(); };

        const grid = f.addFolder({ title: 'Grid', expanded: true });
        this._bind(grid, 'gridRows',   { label: 'Rows',        min: 1,  max: 8,   step: 1   }).on('change', change);
        this._bind(grid, 'gridCols',   { label: 'Columns',     min: 1,  max: 8,   step: 1   }).on('change', change);
        this._bind(grid, 'blockWidth', { label: 'Block Width',  min: 20, max: 200, step: 1   }).on('change', change);
        this._bind(grid, 'blockDepth', { label: 'Block Depth',  min: 20, max: 200, step: 1   }).on('change', change);

        const road = f.addFolder({ title: 'Roads', expanded: false });
        this._bind(road, 'roadWidth',     { label: 'Road Width',     min: 4,    max: 40,  step: 0.5  }).on('change', change);
        this._bind(road, 'sidewalkWidth', { label: 'Sidewalk Width', min: 1,    max: 15,  step: 0.5  }).on('change', change);
        this._bind(road, 'curbHeight',    { label: 'Curb Height',    min: 0.05, max: 1.0, step: 0.01 }).on('change', change);
        this._bind(road, 'curbWidth',     { label: 'Curb Width',     min: 0.05, max: 1.0, step: 0.01 }).on('change', change);
        this._bind(road, 'cornerRadius',  { label: 'Corner Radius',  min: 0,    max: 10,  step: 0.5  }).on('change', change);
    }

    applyParams(data) {
        super.applyParams(data);
        if (this._onChange) this._onChange();
    }

    /**
     * Compute the full grid layout.
     *
     * Grid coordinates:
     *   Intersection (i, j) center at:
     *     x_j = j * (blockWidth + roadWidth)
     *     z_i = i * (blockDepth + roadWidth)
     *   Centered at origin by subtracting (totalX/2, totalZ/2).
     *
     * gridRows = number of blocks along Z (needs gridRows+1 horizontal roads)
     * gridCols = number of blocks along X (needs gridCols+1 vertical roads)
     */
    computeLayout() {
        const p = this._params;
        const rows = Math.max(1, Math.round(p.gridRows));
        const cols = Math.max(1, Math.round(p.gridCols));

        const spacingX = p.blockWidth + p.roadWidth;
        const spacingZ = p.blockDepth + p.roadWidth;

        // Total extent of intersection grid
        const totalX = cols * spacingX;
        const totalZ = rows * spacingZ;
        const offsetX = totalX / 2;
        const offsetZ = totalZ / 2;

        // Intersection centers (gridRows+1 rows, gridCols+1 cols)
        const intersections = [];
        for (let i = 0; i <= rows; i++) {
            for (let j = 0; j <= cols; j++) {
                intersections.push({
                    x: j * spacingX - offsetX,
                    z: i * spacingZ - offsetZ,
                    hasPosX: j < cols,
                    hasNegX: j > 0,
                    hasPosZ: i < rows,
                    hasNegZ: i > 0,
                });
            }
        }

        // Road segments (non-overlapping with intersections)
        const halfRW = p.roadWidth / 2;
        const vertical = [];   // roads along Z axis
        const horizontal = []; // roads along X axis

        // Vertical roads: one per intersection column, between adjacent rows
        for (let j = 0; j <= cols; j++) {
            const x = j * spacingX - offsetX;
            for (let i = 0; i < rows; i++) {
                const zStart = i * spacingZ - offsetZ + halfRW;
                const zEnd   = (i + 1) * spacingZ - offsetZ - halfRW;
                vertical.push({ col: j, x, zStart, zEnd, length: zEnd - zStart });
            }
        }

        // Horizontal roads: one per intersection row, between adjacent columns
        for (let i = 0; i <= rows; i++) {
            const z = i * spacingZ - offsetZ;
            for (let j = 0; j < cols; j++) {
                const xStart = j * spacingX - offsetX + halfRW;
                const xEnd   = (j + 1) * spacingX - offsetX - halfRW;
                horizontal.push({ row: i, z, xStart, xEnd, length: xEnd - xStart });
            }
        }

        // Blocks (the rectangular areas between roads where buildings go)
        const blocks = [];
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const cx = j * spacingX - offsetX + spacingX / 2;
                const cz = i * spacingZ - offsetZ + spacingZ / 2;
                blocks.push({ cx, cz, width: p.blockWidth, depth: p.blockDepth });
            }
        }

        // Grid origin = position of first intersection column/row (for shader)
        const gridOriginX = -offsetX;
        const gridOriginZ = -offsetZ;

        return {
            blocks,
            roads: { vertical, horizontal },
            intersections,
            params: {
                roadWidth:     p.roadWidth,
                sidewalkWidth: p.sidewalkWidth,
                curbHeight:    p.curbHeight,
                curbWidth:     p.curbWidth,
                cornerRadius:  p.cornerRadius,
            },
            gridSpacingX: spacingX,
            gridSpacingZ: spacingZ,
            gridOriginX,
            gridOriginZ,
        };
    }
}
