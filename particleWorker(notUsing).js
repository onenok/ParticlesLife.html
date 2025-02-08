/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

// vvvvvvvv純變數宣告vvvvvvvv   
// 變數的值可能會在運行後由html檔案的javascript部分給予
// 是否使用直接計算
let isUsingGrid = true;
// 粒子系統的常量和變量 
let particles = [];  // 存儲所有粒子的數組
let particleGroups = [];  // 存儲不同類型的粒子數組
let particleGrids = [];  // 存儲不同類型的粒子網格
// 創建全局網格對象
let grid;
// 畫布相關
let canvas = { width: 0, height: 0 };  // 畫布尺寸
let ballRadius = 0;  // 粒子半徑
// 穿透相關
let isThrough = false;  // 是否允許粒子穿過邊界
let offsetsList = isThrough?[
    {dx: 0, dy: 0},
    {dx: -1*canvas.width, dy: -1*canvas.height}, {dx: 0, dy: -1*canvas.height}, {dx: 1*canvas.width, dy: -1*canvas.height},
    {dx: -1*canvas.width, dy: 0}, {dx: 1*canvas.width, dy: 0},
    {dx: -1*canvas.width, dy: 1*canvas.height}, {dx: 0, dy: 1*canvas.height}, {dx: 1*canvas.width, dy: 1*canvas.height}
]:[{dx: 0, dy: 0}];
// 新增：粒子交互規則矩陣
let forceMatrix = [];  // 存儲粒子間的引力值
let distanceMatrix = [];  // 存儲粒子間的作用距離
let particleColors = [];  // 存儲每種粒子的顏色 (HSL格式)
let particleCounts = [];  // 存儲每種粒子的數量
let particleTypes = 0;  // 默認粒子類型數量
// 
// 性能數據對象，用於記錄各部分的執行時間
let performanceData = {};
// 粒子 id
let nextParticleId = 0;
// 選中的粒子id
let selectedParticleId = null;
// 滑鼠相關
let mouseX = 0;
let mouseY = 0;
let isMouseActive = false;
let mouseForce = 0;
// 網格相關
let showGrid = false;
let selectedCell = null;
let gridData = null;
let setectGridDistance = 0;
let cellSize = 0;
// 更新相關
let canUpdate = false;
let isUpdating = false;
// 粒子交互相關
let enableParticleAffcetRadiusShow = false;
let RadiusShow = [];
// 更新間隔
let updateInterval = 16.66; // 預設速度設為 16.66 毫秒，約等於 60 FPS
let frictionFactor = 0;
// ^^^^^^^^純變數宣告^^^^^^^^   
// -----------------------------

// main loop
let updateIntervalId = setInterval(() => {
    if (canUpdate) {
        canUpdate = false;
        update();
    }
}, updateInterval);

// force計算函數
function calculateForce(r, a) {
    const BETA = 0.3;
    if (r < BETA) {
        return r / BETA - 1;
    } else if (BETA < r && r < 1) {
        return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA));
    } else {
        return 0;
    }
}

// 添加時間步長相關常量
const DEFAULT_DT = 1/144;  // 預設時間步長（144FPS）
let currentDt = DEFAULT_DT;

// 添加t_half相關常量和變數
const DEFAULT_T_HALF = 0.040; // 預設半衰期為0.040秒
let currentTHalf = DEFAULT_T_HALF;

// 計算衰減係數的函數
function calculateFrictionFactor(dt, tHalf) {
    return Math.pow(0.5, dt/tHalf);
}

function isThroughconsoleLog(str) {
    if (isThrough) {
        console.log(str);
    }
}

// 創建單個粒子的函數
function particle(x, y, c, type) {
    // 為每個新粒子分配一個唯一的 id
    const id = nextParticleId++;
    return {
        "id": id,
        "x": x,
        "y": y,
        "gridX": 0,
        "gridY": 0,
        "vx": 0,
        "vy": 0,
        "color": c,
        "type": type
    };
}

// 生成隨機 X 坐標
function rX() {
    return Math.random() * (canvas.width - 100) + 50;
}

// 生成隨機 Y 坐標
function rY() {
    return Math.random() * (canvas.height - 100) + 50;
}

// 生成指定類型的粒子組
function create(count, c, type) {
    let group = [];
    for (let i = 0; i < count; i++) {
        group.push(particle(rX(), rY(), c, type));
    }
    return group;
}

// 初始化矩陣
forceMatrix = [];
distanceMatrix = [];

// 網格類，用於優化粒子間相互作用的計算
class Grid {
    constructor(cellSize, width, height, ParticlesCount) {
        this.cellSize = cellSize;
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.isNotGridPerfectlyFit = (width % this.cellSize == 0 && height % this.cellSize == 0)?0:1;
        this.width = Math.ceil(width / cellSize);
        this.height = Math.ceil(height / cellSize);
        this.cells = new Array(this.width * this.height).fill().map(() => []);
        
        // 性能優化：預分配緩存數組
        this.nearbyCache = new Array(ParticlesCount * 4);
        // 設置為總粒子數減1
        this.offsetsX = new Float32Array(ParticlesCount * 4);
        this.offsetsY = new Float32Array(ParticlesCount * 4);
        this.offsetsCache = 0;
        this.nearbyCells = new Array(this.width * this.height);
        this.nearbyCellsCache = 0;
        this.nearbyCellsSkipped = new Array(this.width * this.height);
        this.nearbyCellsSkippedCache = 0;
    }

    // 清空網格
    clear() {
        //isThroughconsoleLog("clear");
        // [重置所有網格單元為空數組]
        // 遍歷每個網格單元，將其長度設為0，effectively 清空它們
        // 這比重新創建整個網格結構更高效
        this.cells.forEach(cell => cell.length = 0);
    }
    add(particle) {
        // [計算粒子所在的網格單元索引並將粒子添加到對應的單元中]
        // 使用粒子的 x 和 y 坐標除以單元格大小，然後向下取整，得到網格索引
        const cellX = Math.floor(particle.x / this.cellSize);
        const cellY = Math.floor(particle.y / this.cellSize);
        particle.gridX = cellX;
        particle.gridY = cellY;
        // 檢查計算出的索引是否在有效範圍內
        if (cellX >= 0 && cellX < this.width && cellY >= 0 && cellY < this.height) {
            // 將粒子添加到對應的網格單元數組中
            particle.isOutside = false;
            this.cells[cellY * this.width + cellX].push(particle);
        } else {
            particle.isOutside = true;
        }
    }

    wrapCoordinate(value, max) {
        return ((value % max) + max) % max;
    }

    getNearby(particle, radius, isThrough) {
        // 清空緩存數組
        this.nearbyCache.length = 0;
        this.offsetsCache = 0;

        const pos = {
            x: particle.gridX,
            y: particle.gridY
        };
        let radiusCells = Math.ceil(radius / this.cellSize);

        if (!isThrough) {
            return this.getNearbyNormal(pos, radiusCells, radiusCells * radiusCells);
        }
        radiusCells += this.isNotGridPerfectlyFit;
        const radiusCellsSquared = radiusCells * radiusCells;

        for (let dy = -radiusCells; dy <= radiusCells; dy++) {
            const dySquared = dy * dy;
            // 計算實際的網格座標
            const actualY = dy + pos.y;
            // 計算包裝後的網格座標
            const wrappedGridY = this.wrapCoordinate(actualY, this.height);
            const baseIndex = wrappedGridY * this.width;
            
            for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                if (dx * dx + dySquared > radiusCellsSquared) continue;
                
                // 計算實際的網格座標
                const actualX = dx + pos.x;
                // 計算包裝後的網格座標
                const wrappedGridX = this.wrapCoordinate(actualX, this.width);
                
                const cell = this.cells[baseIndex + wrappedGridX];
                
                if (cell.length > 0) {
                    
                    // 根據實際網格座標判斷是否需要偏移，以及偏移方向
                    const offsetX = (actualX < 0 || actualX >= this.width) ? 
                        (actualX < 0 ? -1 : 1) * this.canvasWidth : 0;
                    const offsetY = (actualY < 0 || actualY >= this.height) ? 
                        (actualY < 0 ? -1 : 1) * this.canvasHeight : 0;
                    
                    // 填充偏移量
                    for (let i = 0; i < cell.length; i++) {
                        this.nearbyCache[this.offsetsCache] = cell[i];
                        this.offsetsX[this.offsetsCache] = offsetX;
                        this.offsetsY[this.offsetsCache] = offsetY;
                        this.offsetsCache++;
                    }
                }
            }
        }

        return {
            particles: this.nearbyCache,
            offsetsX: this.offsetsX,
            offsetsY: this.offsetsY,
            offsetCount: this.offsetsCache
        };
    }

    getNearbyNormal(pos, radiusCells, radiusCellsSquared) {
        const startX = Math.max(0, pos.x - radiusCells);
        const endX = Math.min(this.width - 1, pos.x + radiusCells);
        const startY = Math.max(0, pos.y - radiusCells);
        const endY = Math.min(this.height - 1, pos.y + radiusCells);

        for (let y = startY; y <= endY; y++) {
            const dy = y - pos.y;
            const dySquared = dy * dy;
            const baseIndex = y * this.width;

            for (let x = startX; x <= endX; x++) {
                const dx = x - pos.x;
                if (dx * dx + dySquared > radiusCellsSquared) continue;
                
                const cell = this.cells[baseIndex + x];
                if (cell.length > 0) {
                    for (let i = 0; i < cell.length; i++) {
                        this.nearbyCache[this.offsetsCache] = cell[i];
                        this.offsetsCache++;
                    }
                }
            }
        }

        return {
            particles: this.nearbyCache,
            offsetCount: this.offsetsCache
        };
    }

    getNearbyCells(cellX, cellY, radius) {
        this.nearbyCellsCache = 0;
        this.nearbyCellsSkippedCache = 0;
        let radiusCells = Math.ceil(radius / this.cellSize);
        
        if (isThrough) {
            radiusCells = radiusCells + isNotGridPerfectlyFit;
            const radiusCellsPlus1point5Squared = (radiusCells + 1.5) * (radiusCells + 1.5);
            for (let dy = -radiusCells; dy <= radiusCells; dy++) {
                const wrappedY = (((cellY + dy) % this.height) + this.height) % this.height;
                for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                    if ((dx * dx + dy * dy) > radiusCellsPlus1point5Squared) {
                        this.nearbyCellsSkipped[this.nearbyCellsSkippedCache] = {x: (((cellX + dx) % this.width) + this.width) % this.width, y: wrappedY, cellRadiusNotSqrtYet: dx * dx + dy * dy};
                        this.nearbyCellsSkippedCache++;
                        continue;
                    }
                    const wrappedX = (((cellX + dx) % this.width) + this.width) % this.width;
                    this.nearbyCells[this.nearbyCellsCache] = {x: wrappedX, y: wrappedY, cellRadiusNotSqrtYet: dx * dx + dy * dy};
                    this.nearbyCellsCache++;
                }
            }
        } else {
            const radiusCellsPlus1point5Squared = (radiusCells + 1.5) * (radiusCells + 1.5);
            const startX = Math.max(0, cellX - radiusCells);
            const endX = Math.min(this.width - 1, cellX + radiusCells);
            const startY = Math.max(0, cellY - radiusCells);
            const endY = Math.min(this.height - 1, cellY + radiusCells);

            for (let y = startY; y <= endY; y++) {
                const dy = y - cellY;
                const dySquared = dy * dy;

                for (let x = startX; x <= endX; x++) {
                    const dx = x - cellX;
                    if (dx * dx + dySquared > radiusCellsPlus1point5Squared) {
                        this.nearbyCellsSkipped[this.nearbyCellsSkippedCache] = {x, y, cellRadiusNotSqrtYet: dx * dx + dySquared};
                        this.nearbyCellsSkippedCache++;
                        continue;
                    }

                    this.nearbyCells[this.nearbyCellsCache] = {x, y, cellRadiusNotSqrtYet: dx * dx + dySquared};
                    this.nearbyCellsCache++;
                }
            }
        }
        //console.log(this.nearbyCellsSkipped);
        return {
            nearbyCells: this.nearbyCells.slice(0, this.nearbyCellsCache),
            radiusCells: radiusCells,
            nearbyCellsSkipped: this.nearbyCellsSkipped.slice(0, this.nearbyCellsSkippedCache),
        };
    }
}

// 修改 rule_grid 函數使用矩陣
function rule_grid(types) {
    performanceData.getNearbyCountsTimes = 0;
    performanceData.gAffectCalcCountsTimes = 0;
    performanceData.particleSkippedCountsTimes = 0;
    for (let type = 0; type < types; type++) {
        const p1 = particleGroups[type];
        for (let i = 0; i < p1.length; i++) {
            const a = p1[i];
            a.vx *= frictionFactor;
            a.vy *= frictionFactor;
            
            let rfx = 0, rfy = 0;
            for (let t = 0; t < types; t++) {
                let fx = 0, fy = 0;
                const r = distanceMatrix[type][t];
                const r2 = r * r;
                const g = forceMatrix[type][t];
                
                const getNearbyStartTime = performance.now();
                const nearby = particleGrids[t].getNearby(a, r, isThrough);
                performanceData.getNearbyCountsTimes++;
                performanceData.getNearbyTime += performance.now() - getNearbyStartTime;
                
                const nearbyCount = nearby.offsetCount;
                const nearbyParticles = nearby.particles;
                let gAffectCalcStartTime = performance.now();
                if (isThrough) {
                    // 由於nearby.particles.length和nearby.offsetCount基本上是一樣的
                    // 並且nearby.offsetCount是一個數值。
                    // 因此使用 nearby.offsetCount 來遍歷
                    const nearbyOffsetsX = nearby.offsetsX;
                    const nearbyOffsetsY = nearby.offsetsY;
                    for (let j = 0; j < nearbyCount; j++) {
                        performanceData.gAffectCalcCountsTimes++;
                        const b = nearbyParticles[j];
                        if (a === b) continue;
                        
                        const dx = (b.x + nearbyOffsetsX[j]) - a.x;
                        const dy = (b.y + nearbyOffsetsY[j]) - a.y;
                        const distSquared = dx * dx + dy * dy;
                        if (distSquared >= r2) {
                            performanceData.particleSkippedCountsTimes++;
                            continue;
                        }
                        
                        const dist = Math.sqrt(distSquared);
                        const F = calculateForce(dist/r, g);
                        fx += F * dx / dist;
                        fy += F * dy / dist;
                    }
                } else {
                    // 由於nearby.particles.length和nearby.offsetCount基本上是一樣的
                    // 並且nearby.offsetCount是一個數值。
                    // 因此使用 nearby.offsetCount 來遍歷
                    for (let j = 0; j < nearbyCount; j++) {
                        performanceData.gAffectCalcCountsTimes++;
                        // 取得 施力粒子
                        const b = nearbyParticles[j];
                        // 跳過自身
                        if (a === b) continue;
                        // 計算 施力粒子 和 被施力粒子 之間的距離 
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const distSquared = dx * dx + dy * dy;
                        // 如果距離大於 施力粒子 群 的半徑，則跳過
                        if (distSquared >= r2) {
                            performanceData.particleSkippedCountsTimes++;
                            continue;
                        }
                        // 開方 施力粒子 和 被施力粒子 之間的距離
                        const dist = Math.sqrt(distSquared);
                        // 計算 施力粒子 對 被施力粒子 的應用力
                        const F = calculateForce(dist/r, g);
                        fx += F * dx / dist;
                        fy += F * dy / dist;
                    }
                }
                // 整合 施力粒子 群 對 被施力粒子 的應用力
                rfx += fx * r * 10;
                rfy += fy * r * 10;
                performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime;
            }
            
            gAffectCalcStartTime = performance.now();
            // 更新速度（應用力）
            a.vx += rfx * currentDt;
            a.vy += rfy * currentDt;
            performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime;
        }
    }
}

function rule_direct(types) {
    performanceData.gAffectCalcCountsTimes = 0;
    performanceData.particleSkippedCountsTimes = 0;
    // 計算摩擦力
    // 被施力粒子 群 循環 
    for (let type1 = 0; type1 < types; type1++) {
        const p1 = particleGroups[type1];
        for (let i = 0; i < p1.length; i++) {
            // 取得 被施力粒子
            const a = p1[i];
            // 更新速度（應用摩擦力）
            a.vx *= frictionFactor;
            a.vy *= frictionFactor;
            // 初始化 rfx, rfy
            let rfx = 0, rfy = 0;
            // 
            for (let type2 = 0; type2 < types; type2++) {
                const p2 = particleGroups[type2];
                // 初始化 fx, fy
                let fx = 0, fy = 0;
                // 取得 被施力粒子 和 施力粒子 間的距離和引力
                const r = distanceMatrix[type1][type2];
                const r2 = r * r;
                const g = forceMatrix[type1][type2];
                let gAffectCalcStartTime = performance.now();
                if (isThrough) {
                    let offsetsList = [{dx: 0, dy: 0}];
                    let boundaryFlags = 0;
                    if (a.x + r > canvas.width) {
                        // 右邊界
                        offsetsList.push({dx: canvas.width, dy: 0});
                        boundaryFlags |= 1;
                    } 
                    if (a.x - r < 0) {
                        // 左邊界
                        offsetsList.push({dx: -1*canvas.width, dy: 0});
                        boundaryFlags |= 2;
                    }
                    if (a.y + r > canvas.height) {
                        // 下邊界
                        offsetsList.push({dx: 0, dy: canvas.height});
                        boundaryFlags |= 4;
                    }
                    if (a.y - r < 0) {
                        // 上邊界
                        offsetsList.push({dx: 0, dy: -1*canvas.height});
                        boundaryFlags |= 8;
                    }
                    if ((boundaryFlags & 1) && (boundaryFlags & 8)) {
                        // 右上邊界
                        offsetsList.push({dx: canvas.width, dy: -1*canvas.height});
                        //console.log("右上邊界");
                    }
                    if ((boundaryFlags & 1) && (boundaryFlags & 4)) {
                        // 右下邊界
                        offsetsList.push({dx: canvas.width, dy: canvas.height});
                        //console.log("右下邊界");
                    }
                    if ((boundaryFlags & 2) && (boundaryFlags & 8)) {
                        // 左上邊界
                        offsetsList.push({dx: -1*canvas.width, dy: -1*canvas.height});
                        //console.log("左上邊界");
                    }
                    if ((boundaryFlags & 2) && (boundaryFlags & 4)) {
                        // 左下邊界
                        offsetsList.push({dx: -1*canvas.width, dy: canvas.height});
                        //console.log("左下邊界");
                    }
                    //console.log(boundaryFlags);
                    //console.log(offsetsList);
                    // 施力粒子 群 循環
                    for (let j = 0; j < p2.length; j++) {
                        // 取得 施力粒子
                        const b = p2[j];
                        // 跳過自身
                        if (a === b) continue;
                        for (let k = 0; k < offsetsList.length; k++) {
                            performanceData.gAffectCalcCountsTimes++;
                            const offset = offsetsList[k];
                            // 計算 施力粒子 和 被施力粒子 之間的距離 
                            const dx = (b.x + offset.dx) - a.x;
                            const dy = (b.y + offset.dy) - a.y;
                            const distSquared = dx * dx + dy * dy;
                            // 如果距離大於 施力粒子 群 的半徑，則跳過
                            if (distSquared >= r2) {
                                performanceData.particleSkippedCountsTimes++;
                                continue;
                            }
                            // 開方 施力粒子 和 被施力粒子 之間的距離
                            const dist = Math.sqrt(distSquared);
                            // 計算 施力粒子 對 被施力粒子 的應用力
                            const F = calculateForce(dist/r, g);
                            fx += F * dx / dist;
                            fy += F * dy / dist; 
                        }
                    }
                } else {
                    // 施力粒子 群 循環 
                    for (let j = 0; j < p2.length; j++) {
                        performanceData.gAffectCalcCountsTimes++;
                        // 取得 施力粒子
                        const b = p2[j];
                        // 跳過自身
                        if (a === b) continue;
                        // 計算 施力粒子 和 被施力粒子 之間的距離 
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const distSquared = dx * dx + dy * dy;
                        // 如果距離大於 施力粒子 群 的半徑，則跳過
                        if (distSquared >= r2) {
                            performanceData.particleSkippedCountsTimes++;
                            continue;
                        }
                        // 開方 施力粒子 和 被施力粒子 之間的距離
                        const dist = Math.sqrt(distSquared);
                        // 計算 施力粒子 對 被施力粒子 的應用力
                        const F = calculateForce(dist/r, g);
                        fx += F * dx / dist;
                        fy += F * dy / dist; 
                    }
                }
                // 整合 施力粒子 群 對 被施力粒子 的應用力
                rfx += fx * r * 10;
                rfy += fy * r * 10; 
                performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime;
            }
            gAffectCalcStartTime = performance.now();
            // 更新速度（應用力）
            a.vx += rfx * currentDt;
            a.vy += rfy * currentDt;
            performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime;
        }
    }
}


function rule_update(types) {
    performanceData.positionUpdateCountsTimes = 0;
    // 更新位置
    for (let j = 0; j < types; j++) {
        const p1 = particleGroups[j];
        for (let i = 0; i < p1.length; i++) {
            const a = p1[i];
            const positionUpdateStartTime = performance.now();
            if (isThrough) {
                a.x = (((a.x + a.vx * currentDt) % canvas.width) + canvas.width) % canvas.width;
                a.y = (((a.y + a.vy * currentDt) % canvas.height) + canvas.height) % canvas.height;
            } else {
                let nextX = a.x + a.vx * currentDt;
                let nextY = a.y + a.vy * currentDt;

                if (nextX < ballRadius || nextX > canvas.width - ballRadius) {
                    a.vx *= -1;
                    nextX = 2*Math.max(ballRadius, Math.min(nextX, canvas.width - ballRadius))-nextX;
                }
                if (nextY < ballRadius || nextY > canvas.height - ballRadius) {
                    a.vy *= -1;
                    nextY = 2*Math.max(ballRadius, Math.min(nextY, canvas.height - ballRadius))-nextY;
                }

                a.x = nextX;
                a.y = nextY;
            }
            performanceData.positionUpdateTime += performance.now() - positionUpdateStartTime;
            performanceData.positionUpdateCountsTimes++;
        }
        //isThroughconsoleLog("rule4", performance.now());
    }
}

// 修改 update 函數使用矩陣
function update() {
    const startTime = performance.now();
    // 重置性能數據
    //let keys = [];
    //console.log(performanceData.totalTimeAverage);
    Object.keys(performanceData).forEach(key => {
        if (!(performanceData[key] instanceof Array) && !(/Max|All|Average/.test(key))) {
            performanceData[key] = 0;
            //keys.push(key);
        }
    });
    //console.log(keys);
    // 設置網格數據
    gridData = {
        width: grid.width,
        height: grid.height,
        cellSize: cellSize,
        selectedCell: selectedCell,
        radiusCells: 0,
        nearbyCells: [],
        nearbyCellsSkipped: [],
    };

    // 應用所有規則
    if (isUsingGrid) {
        rule_grid(particleTypes);
    } else {
        rule_direct(particleTypes);
    }
    // 更新粒子位置
    rule_update(particleTypes);
    // 添加滑鼠吸引力
    if (isMouseActive) {
        particleGroups.forEach(group => applyMouseForce(group));
    }
    // 清空網格
    // 將 施力粒子 群加入網格
    const gridResetStartTime = performance.now();
    particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height);
    performanceData.gridResetTime += performance.now() - gridResetStartTime;
    // 將所有粒子組合為一個數組
    particles = particleGroups.flat();

    // 計算附近粒子列表
    let nearbyParticlesList = [];
    const particleAffcetCalcTime = performance.now();
    if (selectedParticleId && enableParticleAffcetRadiusShow) {
        // 取得 施力粒子
        let selectedParticle = particles[selectedParticleId];
        // 取得 施力粒子 的類型
        const Ptype = selectedParticle.type;
        // 粒子種類循環 
        for (let i = 0; i < particleTypes; i++) {
            if (RadiusShow[i]) {
                // 取得 施力粒子 附近的粒子 及 其偏移值 
                const nearby = particleGrids[i].getNearby(selectedParticle, distanceMatrix[Ptype][i], isThrough);
                const offsetsCount = nearby.offsetCount;
                const offsetsX = nearby.offsetsX;
                const offsetsY = nearby.offsetsY;
                const distance = distanceMatrix[Ptype][i];
                // 過濾出 施力粒子 附近的粒子
                if (isThrough) {
                    nearbyParticlesList[i] = nearby.particles.slice(0, offsetsCount).filter((p, i) => {
                        const dx = offsetsX[i];
                        const dy = offsetsY[i];
                        const px = p.x+dx;
                        const py = p.y+dy;
                        const sx = selectedParticle.x;
                        const sy = selectedParticle.y;

                        return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance;
                    });
                } else {
                    nearbyParticlesList[i] = nearby.particles.slice(0, offsetsCount).filter((p, i) => {
                        const px = p.x;
                        const py = p.y;
                        const sx = selectedParticle.x;
                        const sy = selectedParticle.y;
                        return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance;
                    });
                }
                //console.log(`nearbyParticlesList[${i}]: ${nearbyParticlesList[i]}`);
            }

        }
        //console.log(nearbyParticlesList);
    }
    performanceData.ParticleAffcetCalcTime = performance.now() - particleAffcetCalcTime;
    // 計算附近網格列表
    if (showGrid) {
        //isThroughconsoleLog("g"); 
        if (selectedCell) {
            const nearbyCells = grid.getNearbyCells(selectedCell.x, selectedCell.y, setectGridDistance);
            gridData.nearbyCells = nearbyCells.nearbyCells;
            gridData.radiusCells = nearbyCells.radiusCells;
            gridData.nearbyCellsSkipped = nearbyCells.nearbyCellsSkipped;
        }
        //isThroughconsoleLog("h");
    }

    performanceData.totalTime = performance.now() - startTime;
    // 發送更新消息
    self.postMessage({ 
        type: 'update', 
        particles: particles, 
        particleGroups: particleGroups,
        performanceData: performanceData, 
        nearbyCells: gridData.nearbyCells,
        gridDataWidth: grid.width,
        gridDataHeight: grid.height,
        nearbyParticlesList: nearbyParticlesList,
        nearbyCellsSkipped: gridData.nearbyCellsSkipped,
        radiusCells: gridData.radiusCells,
    });
}

// 應用滑鼠力量到粒子組
function applyMouseForce(particleGroup) {
    for (let i = 0; i < particleGroup.length; i++) {
        const p = particleGroup[i];
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const distSquared = dx * dx + dy * dy;
        if (distSquared > 0) {
            const force = mouseForce / Math.sqrt(distSquared);
            p.vx += (force * dx) / frictionFactor;
            p.vy += (force * dy) / frictionFactor;
        }
    }
}
function addAllParticleToGrid(Types, cellSize, canvasWidth, canvasHeight) {
    performanceData.gridResetAndAddCountsTimes = 0;
    let Grids = [];
    for (let i = 0; i < Types; i++) {
        Grids[i] = new Grid(cellSize, canvasWidth, canvasHeight, particleGroups[i].length);
        particleGroups[i].forEach(p => {
            Grids[i].add(p);
            performanceData.gridResetAndAddCountsTimes++;
        });
    }
    return Grids;
}

// 處理主線程發來的消息
self.onmessage = function (e) {
    switch (e.data.type) {
        case 'init':
            // 初始化畫布和粒子
            particleGroups = [];
            nextParticleId = 0; // 重置 id 計數器
            canvas.width = e.data.canvasWidth;
            canvas.height = e.data.canvasHeight;
            particleTypes = e.data.particleTypes;
            particleColors = e.data.particleColors;
            particleCounts = e.data.particleCounts;
            cellSize = e.data.cellSize;
            performanceData = e.data.performanceData;
            // 初始化矩陣和粒子
            for (let i = 0; i < particleTypes; i++) {
                particleGroups[i] = create(particleCounts[i], particleColors[i], i);
            }
            // 初始化網格
            particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height);
            grid = new Grid(cellSize, canvas.width, canvas.height, particleGroups.length);
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf);
            break;
            
        case 'updateRules':
            // 更新規則矩陣
            forceMatrix = e.data.forceMatrix;
            distanceMatrix = e.data.distanceMatrix;
            break;
            
        case 'setThrough':
            // 設置穿透模式
            isThrough = e.data.isThrough;
            break;
        case 'updateCanvasSize':
            // 更新畫布大小
            canvas.width = e.data.width;
            canvas.height = e.data.height;
            if (cellSize) {
                particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height);
                grid = new Grid(cellSize, canvas.width, canvas.height, particleGroups.length);
            }
            break;
        case 'canUpdate':
            // 請求更新
            canUpdate = true;
            break;
        case 'updateColors':
            particleColors = e.data.particleColors; // 接收 HSL 格式的顏色
            //console.log(`particleWorker.js: particleColors: ${particleColors}`);
            for (let i = 0; i < particleTypes; i++) {
                particleGroups[i].forEach(p => {
                    p.color = particleColors[i];
                });
            }
            break;
        case 'updateMousePosition':
            // 更新滑鼠位置
            mouseX = e.data.x;
            mouseY = e.data.y;
            isMouseActive = true;
            break;
        case 'updateMouseForce':
            // 更新滑鼠力量
            mouseForce = e.data.force;
            break;
        case 'updateCellSize':
            // 更新網格大小
            cellSize = e.data.size;
            if (canvas.width && canvas.height) {
                particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height);
                grid = new Grid(cellSize, canvas.width, canvas.height, particleGroups.length);
            }
            break;
        case 'setMouseInactive':
            // 設置滑鼠為非活動狀態
            isMouseActive = false;
            break;
        case 'setIsUsingGrid':
            isUsingGrid = e.data.isUsingGrid;
            break;
        case 'updateBallRadius':
            ballRadius = e.data.ballRadius;
            break;
        case 'toggleGrid':
            showGrid = e.data.show;
            break;
        case 'selectCell':
            selectedCell = e.data.cell;
            break;
        case 'updateSetectGridDistance':
            setectGridDistance = e.data.distance;
            break;  
        case 'updateUpdateInterval':
            updateInterval = e.data.interval;
            clearInterval(updateIntervalId);
            updateIntervalId = setInterval(() => {
                if (canUpdate&&!isUpdating) {
                    isUpdating = true;
                    update();
                    isUpdating = false;
                }
            }, updateInterval);
            break;  
        case 'updateSelectedParticle':
            selectedParticleId = e.data.particleId;
            break;
        case 'toggleParticleAffcetRadiusShow':
            enableParticleAffcetRadiusShow = e.data.enable;
            break;
        case 'updateTHalf':
            currentTHalf = e.data.tHalf;
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf);
            break;
        case 'updateBallRadius':
            ballRadius = e.data.radius;
            break;
        case 'updateRadiusShow':
            RadiusShow = e.data.RadiusShow;
            //console.log(RadiusShow);
            break;
    }
};


