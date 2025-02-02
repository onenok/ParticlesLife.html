/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

// vvvvvvvv純變數宣告vvvvvvvv   
// 變數的值可能會在運行後由html檔案的javascript部分給予
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
let performanceData = {
    totalTime: 0,
    gAffectCalcTime: 0,
    positionUpdateTime: 0,
};
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

let isNotGridPerfectlyFit = 0;
// 網格類，用於優化粒子間相互作用的計算
class Grid {
    constructor(cellSize, width, height) {
        this.cellSize = cellSize;
        this.canvasWidth = width;
        this.canvasHeight = height;
        isNotGridPerfectlyFit = (width % this.cellSize == 0 && height % this.cellSize == 0)?0:1;
        //console.log(isNotGridPerfectlyFit);
        this.width = Math.ceil(width / this.cellSize);
        this.height = Math.ceil(height / this.cellSize);
        this.cells = new Array(this.width * this.height).fill().map(() => []);
    }

    // 清空網格
    clear() {
        //isThroughconsoleLog("clear");
        // [重置所有網格單元為空數組]
        // 遍歷每個網格單元，將其長度設為0，effectively 清空它們
        // 這比重新創建整個網格結構更高效
        this.cells.forEach(cell => cell.length = 0);
        //isThroughconsoleLog("clear1");
    }

    // 將粒子添加到網格中
    add(particle) {
        // [計算粒子所在的網格單元索引並將粒子添加到對應的單元中]
        // 使用粒子的 x 和 y 坐標除以單元格大小，然後向下取整，得到網格索引
        const cellX = Math.floor(particle.x / this.cellSize);
        const cellY = Math.floor(particle.y / this.cellSize);
        // 檢查計算出的索引是否在有效範圍內
        if (cellX >= 0 && cellX < this.width && cellY >= 0 && cellY < this.height) {
            // 將粒子添加到對應的網格單元數組中
            particle.isOutside = false;
            this.cells[cellY * this.width + cellX].push(particle);
        }else{
            particle.isOutside = true;
        }
    }

    // 獲取給定粒子附近的所有粒子
    getNearby(particle, radius, isThrough) {
        // [找出給定粒子周圍可能產生相互作用的所有粒子]
        // 計算粒子所在的網格單元
        const cellX = Math.floor(particle.x / this.cellSize);
        const cellY = Math.floor(particle.y / this.cellSize);
        // 計算需要檢查的網格範圍（以單元格為單位）
        let radiusCells = Math.ceil(radius / this.cellSize);
        const nearby = [];
        const offsets = [];
        if (isThrough) {
            radiusCells = radiusCells + isNotGridPerfectlyFit;
            // 遍歷周圍的網格單元，包括粒子所在的單元
            for (let y = cellY - radiusCells; y <= cellY + radiusCells; y++) {
                for (let x = cellX - radiusCells; x <= cellX + radiusCells; x++) {
                    // 將這些網格單元中的所有粒子添加到 nearby 數組中
                    let dy = y < 0 ? -1 : y >= this.height ? 1 : 0;
                    let dx = x < 0 ? -1 : x >= this.width ? 1 : 0;
                    let wrappedY = (y + this.height) % this.height;
                    let wrappedX = (x + this.width) % this.width;
                    // 修改這裡：先獲取網格單元，然後再進行操作
                    let cell = this.cells[wrappedY * this.width + wrappedX];
                    nearby.push.apply(nearby, cell);
                    // 為每個粒子添加對應的偏移
                    for (let i = 0; i < cell.length; i++) {
                        offsets.push({'dx': dx*this.canvasWidth, 'dy': dy*this.canvasHeight});
                    }
                }
            }
        } else {
            for (let y = Math.max(0, cellY - radiusCells); y <= Math.min(this.height - 1, cellY + radiusCells); y++) {
                for (let x = Math.max(0, cellX - radiusCells); x <= Math.min(this.width - 1, cellX + radiusCells); x++) {
                    let cell = this.cells[y * this.width + x]
                    nearby.push.apply(nearby, cell);
                    // 為每個粒子添加對應的偏移
                    for (let i = 0; i < cell.length; i++) {
                        offsets.push({'dx': 0, 'dy': 0});
                    }
                }
            }
        }
        // 返回所有可能產生相互作用的粒子
        return [nearby, offsets];
    }

    getNearbyCells(cellX, cellY, radius) {
        const nearbyCells = [];
        let radiusCells = Math.ceil(radius / this.cellSize);
        if (isThrough) {
            radiusCells = radiusCells + isNotGridPerfectlyFit;
            for (let y = cellY - radiusCells; y <= cellY + radiusCells; y++) {
                for (let x = cellX - radiusCells; x <= cellX + radiusCells; x++) {
                        const wrappedY = (y + this.height) % this.height;
                        const wrappedX = (x + this.width) % this.width;
                        nearbyCells.push({x: wrappedX, y: wrappedY});
                }
            }
        } else {
            for (let y = Math.max(0, cellY - radiusCells); y <= Math.min(this.height - 1, cellY + radiusCells); y++) {
                for (let x = Math.max(0, cellX - radiusCells); x <= Math.min(this.width - 1, cellX + radiusCells); x++) {
                    nearbyCells.push({x, y});
                }
            }
        }
        
        return nearbyCells;
    }
}


// 修改 rule_grid 函數使用矩陣
function rule_grid(type1, types) {
    // 取得 被施力粒子 群
    const p1 = particleGroups[type1];
    // 計算摩擦力
    const frictionFactor = calculateFrictionFactor(currentDt, currentTHalf);
    // 被施力粒子 群 循環 
    for (let i = 0; i < p1.length; i++) {
        // 取得 被施力粒子
        const a = p1[i];
        // 更新速度（應用摩擦力）
        a.vx *= frictionFactor;
        a.vy *= frictionFactor;
        // 計算應用力
        let rfx = 0, rfy = 0;
        // 粒子種類循環 
        for (let t = 0; t < types; t++) {
            // 初始化 fx, fy
            let fx = 0, fy = 0;
            // 取得 被施力粒子 和 施力粒子 間的距離和引力
            const r = distanceMatrix[type1][t];
            const r2 = r * r;
            const g = forceMatrix[type1][t];
            // 取得 被施力粒子 附近的施力粒子 及 其偏移值 
            const getNearbyStartTime = performance.now();
            const nearbylist = particleGrids[t].getNearby(a, r, isThrough);
            performanceData.getNearbyTime += performance.now() - getNearbyStartTime;
            // 將 施力粒子 群 附近的粒子 及 其偏移值 賦值to變數
            const nearbyParticles = nearbylist[0];
            const offsets = nearbylist[1];
            // 計算 施力粒子 群 對 被施力粒子 的應用力
            // 施力粒子 群 循環 
            let gAffectCalcStartTime = performance.now();
            for (let j = 0; j < nearbyParticles.length; j++) {
                // 取得 施力粒子
                const b = nearbyParticles[j];
                // 取得 施力粒子 的偏移值
                const offset = offsets[j];
                // 跳過自身
                if (a === b) continue;
                // 計算 施力粒子 和 被施力粒子 之間的距離 
                const dx = (b.x + offset.dx) - a.x;
                const dy = (b.y + offset.dy) - a.y;
                const distSquared = dx * dx + dy * dy;
                // 如果距離大於 施力粒子 群 的半徑，則跳過
                if (distSquared >= r2) continue;
                // 開方 施力粒子 和 被施力粒子 之間的距離
                const dist = Math.sqrt(distSquared);
                // 計算 施力粒子 對 被施力粒子 的應用力
                const F = calculateForce(dist/r, g);
                fx += F * dx / dist;
                fy += F * dy / dist; 
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

function rule_grid_update(p1) {
    // 更新位置
    for (let i = 0; i < p1.length; i++) {
        const a = p1[i];
        const positionUpdateStartTime = performance.now();
        if (isThrough) {
            a.x = (a.x + a.vx * currentDt + canvas.width) % canvas.width;
            a.y = (a.y + a.vy * currentDt + canvas.height) % canvas.height;
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
    }
    //isThroughconsoleLog("rule4", performance.now());
}

// 修改 update 函數使用矩陣
function update() {
    const startTime = performance.now();
    // 重置性能數據
    performanceData = {
        totalTime: 0,
        gAffectCalcTime: 0,
        positionUpdateTime: 0,
        gridResetTime: 0,
        getNearbyTime: 0,
        ParticleAffcetCalcTime: 0
    };
    // 設置網格數據
    gridData = {
        width: grid.width,
        height: grid.height,
        cellSize: cellSize,
        selectedCell: selectedCell,
        nearbyCells: selectedCell ? grid.getNearbyCells(selectedCell.x, selectedCell.y, setectGridDistance) : []
    };

    // 應用所有規則
    for (let i = 0; i < particleTypes; i++) {
        rule_grid(i, particleTypes);
    }
    // 更新粒子位置
    for (let i = 0; i < particleTypes; i++) {
        for (let j = 0; j < particleTypes; j++) {
            rule_grid_update(particleGroups[i]);
        }
    }
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
                const nearbylist = particleGrids[i].getNearby(selectedParticle, distanceMatrix[Ptype][i], isThrough);
                const offsets = nearbylist[1];
                const distance = distanceMatrix[Ptype][i];
                // 過濾出 施力粒子 附近的粒子
                nearbyParticlesList[i] = nearbylist[0].filter((p, i) => {
                    const dx = offsets[i].dx;
                    const dy = offsets[i].dy;
                    const px = p.x+dx;
                    const py = p.y+dy;
                    const sx = selectedParticle.x;
                    const sy = selectedParticle.y;

                    return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance;
                });
                //console.log(`nearbyParticlesList[${i}]: ${nearbyParticlesList[i]}`);
            }

        }
        //console.log(nearbyParticlesList);
    }
    performanceData.ParticleAffcetCalcTime = performance.now() - particleAffcetCalcTime;
    // 計算附近網格列表
    if (showGrid) {
        //isThroughconsoleLog("g"); 
        gridData.nearbyCells = selectedCell ? grid.getNearbyCells(selectedCell.x, selectedCell.y, setectGridDistance) : [];
        //isThroughconsoleLog("h");
    }

    performanceData.totalTime = performance.now() - startTime;
    // 發送更新消息
    self.postMessage({ 
        type: 'update', 
        particles, 
        particleGroups,
        performanceData, 
        nearbyCells: gridData.nearbyCells,
        gridDataWidth: grid.width,
        gridDataHeight: grid.height,
        nearbyParticlesList,
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
            p.vx += force * dx;
            p.vy += force * dy;
        }
    }
}
function addAllParticleToGrid(Types, cellSize, canvasWidth, canvasHeight) {
    let Grids = [];
    for (let i = 0; i < Types; i++) {
        Grids[i] = new Grid(cellSize, canvasWidth, canvasHeight);
        particleGroups[i].forEach(p => Grids[i].add(p));
    }
    return Grids;
}

// 處理主線程發來的消息
self.onmessage = function (e) {
    switch (e.data.type) {
        case 'init':
            // 初始化畫布和粒子
            nextParticleId = 0; // 重置 id 計數器
            canvas.width = e.data.canvasWidth;
            canvas.height = e.data.canvasHeight;
            particleTypes = e.data.particleTypes;
            particleColors = e.data.particleColors;
            particleCounts = e.data.particleCounts;
            cellSize = e.data.cellSize;
            
            // 初始化矩陣和粒子
            for (let i = 0; i < particleTypes; i++) {
                particleGroups[i] = create(particleCounts[i], particleColors[i], i);
            }
            // 初始化網格
            particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height);
            grid = new Grid(cellSize, canvas.width, canvas.height);
            break;
            
        case 'updateRules':
            // 更新規則矩陣
            forceMatrix = e.data.forceMatrix;
            distanceMatrix = e.data.distanceMatrix;
            break;
            
        case 'setThrough':
            // 設置穿透模式
            isThrough = e.data.isThrough;
            offsetsList = isThrough?[
                {dx: 0, dy: 0},
                {dx: -1*canvas.width, dy: -1*canvas.height}, {dx: 0, dy: -1*canvas.height}, {dx: canvas.width, dy: -1*canvas.height},
                {dx: -1*canvas.width, dy: 0}, {dx: canvas.width, dy: 0},
                {dx: -1*canvas.width, dy: canvas.height}, {dx: 0, dy: canvas.height}, {dx: canvas.width, dy: canvas.height}
            ]:[{dx: 0, dy: 0}];
            break;
        case 'updateCanvasSize':
            // 更新畫布大小
            canvas.width = e.data.width;
            canvas.height = e.data.height;
            if (cellSize) {
                particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height);
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
            }
            break;
        case 'setMouseInactive':
            // 設置滑鼠為非活動狀態
            isMouseActive = false;
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


