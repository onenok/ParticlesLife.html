/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

// 粒子系統的常量和變量
let particles = [];  // 存儲所有粒子的數組
let one = [], two = [], three = [];  // 分別存儲三種類型粒子的數組
let canvas = { width: 0, height: 0 };  // 畫布尺寸
const ballRadius = 3;  // 粒子半徑
let isThrough = false;  // 是否允許粒子穿過邊界
const minDistSquaone = 0;  // 最小距離的平方，用於避免粒子重疊

// 在文件開頭添加新的變量
let showGrid = false;
let selectedCell = null;

// 性能數據對象，用於記錄各部分的執行時間
let performanceData = {
    totalTime: 0,
    offsetsLoopTime: 0,
    positionUpdateTime: 0,
};

// 在文件開頭添加一個全局變量來追蹤粒子 id
let nextParticleId = 0;

function isThroughconsoleLog(str) {
    if (isThrough) {
        console.log(str);
    }
}

// 創建單個粒子的函數
function particle(x, y, c, type) {
    // 為每個新粒子分配一個唯一的 id
    const id = nextParticleId++;
    return { "id": id, "x": x, "y": y, "vx": 0, "vy": 0, "color": c, "type": type };
}

// 生成隨機 X 坐標
function rX() {
    return Math.random() * (canvas.width - 100) + 50;
}

// 生成隨機 Y 坐標
function rY() {
    return Math.random() * (canvas.height - 100) + 50;
}

// 創建一組粒子的函數
function create(n, c, type) {
    let group = [];
    for (let i = 0; i < n; i++) {
        group.push(particle(rX(), rY(), c, type));
    }
    return group;
}

let isNotGridPerfectlyFit = 0;
// 網格類，用於優化粒子間相互作用的計算
class Grid {
    constructor(cellSize, width, height) {
        this.cellSize = cellSize;
        this.canvasWidth = width;
        this.canvasHeight = height;
        // 修改這裡：使用 Math.ceil 來確保網格完全覆蓋畫布
        isNotGridPerfectlyFit = (width % this.cellSize == 0 && height % this.cellSize == 0)?0:1;
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
                    nearby.push(...cell);
                    // 為每個粒子添加對應的偏移
                    cell.forEach(() => offsets.push({'dx': dx*this.canvasWidth, 'dy': dy*this.canvasHeight}));
                }
            }
        } else {
            for (let y = Math.max(0, cellY - radiusCells); y <= Math.min(this.height - 1, cellY + radiusCells); y++) {
                for (let x = Math.max(0, cellX - radiusCells); x <= Math.min(this.width - 1, cellX + radiusCells); x++) {
                    let cell = this.cells[y * this.width + x]
                    nearby.push(...cell);
                    // 為每個粒子添加對應的偏移
                    cell.forEach(() => offsets.push({'dx': 0, 'dy': 0}));
                }
            }
        }
        // 返回所有可能產生相互作用的粒子
        return [nearby, offsets];
    }

    getNearbyCells(cellX, cellY, radius) {
        const nearbyCells = [];
        const radiusCells = Math.ceil(radius / this.cellSize)+isNotGridPerfectlyFit;
        
        for (let y = cellY - radiusCells; y <= cellY + radiusCells; y++) {
            for (let x = cellX - radiusCells; x <= cellX + radiusCells; x++) {
                if (isThrough) {
                    const wrappedY = (y + this.height) % this.height;
                    const wrappedX = (x + this.width) % this.width;
                    nearbyCells.push({x: wrappedX, y: wrappedY});
                } else {
                    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                        nearbyCells.push({x, y});
                    }
                }
            }
        }
        return nearbyCells;
    }
}

// 創建全局網格對象
let grid;

// 粒子間相互作用的規則函數
function rule(p1, p2, g, r) {
    //isThroughconsoleLog("rule", performance.now());
    const startTime = performance.now();
    const r2 = r * r;
    //isThroughconsoleLog("rule1", performance.now());
    grid.clear();
    //isThroughconsoleLog("rule2", performance.now());
    p2.forEach(b => grid.add(b));
    //isThroughconsoleLog("rule3", performance.now());
    for (let i = 0; i < p1.length; i++) {
        let fx = 0, fy = 0;
        const a = p1[i];
        const nearbylist = grid.getNearby(a, r, isThrough);
        const nearbyParticles = nearbylist[0];
        const offsets = nearbylist[1];
        const offsetsLoopStartTime = performance.now();
        for (let j = 0; j < nearbyParticles.length; j++) {
            const b = nearbyParticles[j];
            const offset = offsets[j];
            if (a === b) continue; // 跳過自身
            const dx = a.x - (b.x + offset.dx);
            const dy = a.y - (b.y + offset.dy);
            const distSquared = dx * dx + dy * dy;
            if (distSquared > minDistSquaone && distSquared < r2) {
                const F = -g / Math.sqrt(distSquared);
                fx += F * dx;
                fy += F * dy;
            }
        }
        performanceData.offsetsLoopTime += performance.now() - offsetsLoopStartTime;
        // 更新粒子速度
        a.vx = (a.vx + fx) * 0.5;
        a.vy = (a.vy + fy) * 0.5;

        // 更新粒子位置
        const positionUpdateStartTime = performance.now();
        if (isThrough) {
            // 如果允許穿透，使用模運算處理邊界
            a.x = (a.x + a.vx + canvas.width) % canvas.width;
            a.y = (a.y + a.vy + canvas.height) % canvas.height;
        } else {
            // 如果不允許穿透，在邊界處反彈
            let nextX = a.x + a.vx;
            let nextY = a.y + a.vy;

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
    performanceData.totalTime += performance.now() - startTime;
}

// 規則對象，定義不同類型粒子間的相互作用
let rules = {
    'two-two': 0.5, 'two-two-distance': 100,
    'two-one': 0.5, 'two-one-distance': 200,
    'two-three': 0.5, 'two-three-distance': 100,
    'one-one': 0.4, 'one-one-distance': 150,
    'one-two': -0.6, 'one-two-distance': 12,
    'one-three': 0.5, 'one-three-distance': 10,
    'three-three': 0.4, 'three-three-distance': 130,
    'three-one': -0.5, 'three-one-distance': 100,
    'three-two': -0.5, 'three-two-distance': 10
};

// 更新函數，處理所有粒子的相互作用和位置更新
function update() {
    performanceData = {
        totalTime: 0,
        offsetsLoopTime: 0,
        positionUpdateTime: 0
    };
    gridData = {
        cellSize: 0,
        width: 0,
        height: 0,
        selectedCell: null,
        nearbyCells: []
    };

    // 應用所有規則
    //isThroughconsoleLog("a");
    rule(two, two, rules['two-two'], rules['two-two-distance']);
    //isThroughconsoleLog("a1");
    rule(two, one, rules['two-one'], rules['two-one-distance']);
    //isThroughconsoleLog("a2");
    rule(two, three, rules['two-three'], rules['two-three-distance']);
    //isThroughconsoleLog("a3");
    rule(one, one, rules['one-one'], rules['one-one-distance']);
    //isThroughconsoleLog("a4");
    rule(one, two, rules['one-two'], rules['one-two-distance']);
    //isThroughconsoleLog("a5");
    rule(one, three, rules['one-three'], rules['one-three-distance']);
    //isThroughconsoleLog("a6");
    rule(three, three, rules['three-three'], rules['three-three-distance']);
    //isThroughconsoleLog("a7");
    rule(three, one, rules['three-one'], rules['three-one-distance']);
    //isThroughconsoleLog("a8");
    rule(three, two, rules['three-two'], rules['three-two-distance']);
    //isThroughconsoleLog("b");

    // 添加滑鼠吸引力
    if (isMouseActive) {
        //isThroughconsoleLog("c");
        applyMouseForce(one);
        //isThroughconsoleLog("c1");
        applyMouseForce(two);
        //isThroughconsoleLog("c2");
        applyMouseForce(three);
    }
    let nearbyParticlesOne = [];
    let nearbyParticlesTwo = [];
    let nearbyParticlesThree = [];
    if (selectedParticleId && enableParticleAffcetRadiusShow) {
        let selectedParticle = particles.find(p => p.id === selectedParticleId);
        const Ptype = selectedParticle.type;
        const rOne = rules[Ptype+'-one-distance'];
        const rTwo = rules[Ptype+'-two-distance'];
        const rThree = rules[Ptype+'-three-distance'];
        grid.clear();
        one.forEach(b => grid.add(b));
        const nearbylistOne = grid.getNearby(selectedParticle, rOne, isThrough);
        const offsetsOne = nearbylistOne[1];
        nearbyParticlesOne = nearbylistOne[0].filter((p, i) => {
            const dx = offsetsOne[i].dx;
            const dy = offsetsOne[i].dy;
            return (p.x+dx-selectedParticle.x)*(p.x+dx-selectedParticle.x)+(p.y+dy-selectedParticle.y)*(p.y+dy-selectedParticle.y) <= rOne*rOne;
        });
        grid.clear();
        two.forEach(b => grid.add(b));
        const nearbylistTwo = grid.getNearby(selectedParticle, rTwo, isThrough);
        const offsetsTwo = nearbylistTwo[1];
        nearbyParticlesTwo = nearbylistTwo[0].filter((p, i) => {
            const dx = offsetsTwo[i].dx;
            const dy = offsetsTwo[i].dy;
            return (p.x+dx-selectedParticle.x)*(p.x+dx-selectedParticle.x)+(p.y+dy-selectedParticle.y)*(p.y+dy-selectedParticle.y) <= rTwo*rTwo;
        });
        grid.clear();
        three.forEach(b => grid.add(b));
        const nearbylistThree = grid.getNearby(selectedParticle, rThree, isThrough);
        const offsetsThree = nearbylistThree[1];
        nearbyParticlesThree = nearbylistThree[0].filter((p, i) => {
            const dx = offsetsThree[i].dx;
            const dy = offsetsThree[i].dy;
            return (p.x+dx-selectedParticle.x)*(p.x+dx-selectedParticle.x)+(p.y+dy-selectedParticle.y)*(p.y+dy-selectedParticle.y) <= rThree*rThree;
        });
    }
    //isThroughconsoleLog("d");
    // 合併所有粒子到一個數組
    particles = [...one, ...two, ...three];
    //isThroughconsoleLog("e");
    //isThroughconsoleLog("f");

    if (showGrid) {
        //isThroughconsoleLog("g"); 
        gridData = {
            cellSize: grid.cellSize,
            width: grid.width,
            height: grid.height,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            selectedCell: selectedCell,
            nearbyCells: selectedCell ? grid.getNearbyCells(selectedCell.x, selectedCell.y, setectGridDistance) : []
        };
        //isThroughconsoleLog("h");
    }
    self.postMessage({ type: 'update', particles, performanceData, gridData, nearbyParticlesOne, nearbyParticlesTwo, nearbyParticlesThree});
    //isThroughconsoleLog("i");
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

// 處理主線程發來的消息
self.onmessage = function (e) {
    switch (e.data.type) {
        case 'init':
            // 初始化畫布和粒子
            nextParticleId = 0; // 重置 id 計數器
            canvas.width = e.data.canvasWidth;
            canvas.height = e.data.canvasHeight;
            one = create(e.data.oneCount, e.data.colors.one, "one");
            two = create(e.data.twoCount, e.data.colors.two, "two");
            three = create(e.data.threeCount, e.data.colors.three, "three");
            particles = [...one, ...two, ...three];
            grid = new Grid(cellSize, canvas.width, canvas.height);
            break;
        case 'updateRules':
            // 更新規則
            rules = { ...rules, ...e.data.rules };
            if ('isThrough' in e.data.rules) {
                isThrough = e.data.rules.isThrough;
            }
            break;
        case 'setThrough':
            // 設置穿透模式
            isThrough = e.data.isThrough;
            break;
        case 'updateCanvasSize':
            // 更新畫布大小
            canvas.width = e.data.width;
            canvas.height = e.data.height;
            grid = new Grid(cellSize, canvas.width, canvas.height);
            break;
        case 'canUpdate':
            // 請求更新
            canUpdate = true;
            break;
        case 'updateColors':
            // 更新粒子顏色
            const colors = e.data.colors;
            particles.forEach(p => {
                if (p.type === "one") {
                    p.color = colors.one;
                } else if (p.type === "two") {
                    p.color = colors.two;
                } else if (p.type === "three") {
                    p.color = colors.three;
                }
            });
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
            grid = new Grid(cellSize, canvas.width, canvas.height);
            break;
        case 'setMouseInactive':
            // 設置滑鼠為非活動狀態
            isMouseActive = false;
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
    }
};

// 滑鼠相關變量
let selectedParticleId = null;
let mouseX = 0;
let mouseY = 0;
let isMouseActive = false;
let mouseForce = 5;
let cellSize = 50;
let setectGridDistance = 250;
let canUpdate = false;
let isUpdating = false;
let enableParticleAffcetRadiusShow = false;
let updateInterval = 16; // 預設速度設為 16 毫秒，約等於 60 FPS
let updateIntervalId = setInterval(() => {
    if (canUpdate) {
        canUpdate = false;
        update();
    }
}, updateInterval);
