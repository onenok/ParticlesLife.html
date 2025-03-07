/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

console.log("particleWorker_Singlethread.js loaded successfully");

// =============== 變量聲明區域 ===============
// >>> 粒子系統核心變量 <<<
// --粒子數據相關--
let particles = [];          // 儲存所有粒子對象的數組
let particleGroups = [];     // 粒子分組數組
let particleTypes = 0;       // 粒子類型總數
let particleCounts = [];     // 每種類型的粒子數量
let particleColors = [];     // 每種類型的粒子顏色
let nextParticleId = 0;      // 下一個要分配的粒子ID
let ballRadius = 0;          // 粒子半徑

// --網格系統相關--
let isUsingGrid = true;      // 是否使用網格系統
let particleGrids = [];      // 粒子網格數組
let grid = null;            // 主網格對象
let showGrid = false;        // 是否顯示網格
let selectedCell = null;     // 當前選中的網格單元
let gridData = null;         // 網格數據
let setectGridDistance = 0;  // 網格選擇距離
let cellSize = 0;           // 網格單元大小

// >>> 物理計算相關變量 <<<
// --力和距離矩陣--
let forceMatrix = [];        // 粒子間作用力矩陣
let distanceMatrix = [];     // 粒子間距離矩陣
let isThrough = false;       // 是否允許穿透
let offsetsList = [{dx: 0, dy: 0}];  // 偏移量列表

// --性能和更新控制--
let updateIntervalCountsTimes = 0; // 更新次數計數器
let lastResizeTime = 0; // 上次調整畫布時間
let isInited = false; // 是否初始化
let isRunnable = true;      // 是否可運行
let canUpdate = false;       // 是否可以更新
let isUpdating = false;      // 是否正在更新
let isMovingCanvas = false; // 是否正在移動畫布
let updateInterval = 16.66;  // 更新間隔(ms)
let frictionFactor = 0;      // 摩擦係數
let performanceData = {};    // 性能數據對象

// >>> 視覺和交互相關變量 <<<
// --畫布相關--
let canvas = { width: 0, height: 0 };  // 畫布尺寸

// --滑鼠交互--
let mouseX = 0;             // 滑鼠X座標
let mouseY = 0;             // 滑鼠Y座標
let isMouseActive = false;   // 滑鼠是否活動
let mouseForce = 0;         // 滑鼠作用力
let selectedParticleId = null;  // 選中的粒子ID

// --視覺效果--
let enableParticleAffcetRadiusShow = false;  // 是否顯示粒子影響半徑
let RadiusShow = [];        // 影響半徑顯示數據

// =============== 常量定義 ===============
// >>> 時間和物理常量 <<<
const DEFAULT_DT = 1/144;        // 默認時間步長
const DEFAULT_T_HALF = 0.040;    // 默認半衰期
let currentTHalf = DEFAULT_T_HALF;  // 當前半衰期
let currentDt = DEFAULT_DT;      // 當前時間步長

// =============== 原有類別定義 ===============
// --Grid類用於優化粒子間相互作用的計算--
class Grid {
    // --構造函數--
    constructor(cellSize, width, height, ParticlesCount) {
        this.cellSize = cellSize; // 網格單元大小
        this.canvasWidth = width; // 畫布寬度
        this.canvasHeight = height; // 畫布高度
        this.isNotGridPerfectlyFit = (width % this.cellSize == 0 && height % this.cellSize == 0)?0:1; // 是否完美適配
        this.width = Math.ceil(width / cellSize); // 網格寬度
        this.height = Math.ceil(height / cellSize); // 網格高度
        this.cells = new Array(this.width * this.height).fill().map(() => []); // 網格單元數組

        this.nearbyCache = new Array(ParticlesCount * 4); // 附近粒子數組
        this.offsetsX = new Float32Array(ParticlesCount * 4); // 偏移量X
        this.offsetsY = new Float32Array(ParticlesCount * 4); // 偏移量Y
        this.offsetsCache = 0;  // 偏移量數量
        this.nearbyCells = new Array(this.width * this.height); // 附近單元數組
        this.nearbyCellsCache = 0;  // 附近單元數量
        this.nearbyCellsSkipped = new Array(this.width * this.height); // 跳過單元數組
        this.nearbyCellsSkippedCache = 0; // 跳過單元數量
        //newGridNearByCacheLen = this.nearbyCache.length;
    }

    // --清空網格--
    clear() {
        this.cells.forEach(cell => cell.length = 0); // 清空網格單元
    }

    // --添加粒子--
    add(particle) {
        checkIfParticleIsOutOfBounds();
        checkAllParticlesIfNaN('add particle NaN detected');
        // 檢查座標是否在合理範圍內
        if (particle.x < 0 || particle.x > this.canvasWidth || 
            particle.y < 0 || particle.y > this.canvasHeight) {
            // --輸出有問題的粒子座標--
            console.warn('Particle position out of bounds:', {
                x: particle.x, // 粒子X座標
                y: particle.y, // 粒子Y座標
                vx: particle.vx, // 粒子X方向速度
                vy: particle.vy, // 粒子Y方向速度
                canvasWidth: this.canvasWidth, // 畫布寬度
                canvasHeight: this.canvasHeight, // 畫布高度
                outBounds: particle.x < 0 || particle.x > this.canvasWidth ? (particle.x < 0 ? 'x out Left' : 'x out Right') : (particle.y < 0 ? 'y out Top' : 'y out Bottom') // 是否超出邊界
            });
        }

        
        // 確保 cellSize 不為 0
        if (this.cellSize <= 0) {
            console.error('Invalid cellSize:', this.cellSize); // 輸出有問題的網格單元大小
            throw new Error('Invalid cellSize');
        }

        const cellX = Math.floor(particle.x / this.cellSize); // 粒子X網格座標
        const cellY = Math.floor(particle.y / this.cellSize); // 粒子Y網格座標
        
        particle.gridX = cellX; // 粒子X網格座標
        particle.gridY = cellY; // 粒子Y網格座標

        // --粒子是否在網格內--
        if (cellX >= 0 && cellX < this.width && cellY >= 0 && cellY < this.height) {
            particle.isOutside = false; // 粒子是否在網格內
            this.cells[cellY * this.width + cellX].push(particle); // 將粒子添加到網格單元中
            return true; // 返回true
        }
        // --粒子是否在網格外-- (已廢棄, 暫未刪除)
        else {
            particle.isOutside = true; // 粒子是否在網格外
            return false; // 返回false
        }
    }

    // --取得實際網格座標--
    wrapCoordinate(value, max) {
        // --當座標超出邊界時，將其轉換為對應的實際座標--
        // --(例如: -1 變成 max-1, max+1 變成 1)--
        return ((value % max) + max) % max;
    }

    // --獲取附近粒子--
    getNearby(particle, radius, isThrough) {
        //getNearbyNearByCacheLen = this.nearbyCache.length;
        // 清空緩存數組
        this.offsetsCache = 0;  // 偏移量數量

        const pos = {
            x: particle.gridX, // 粒子X網格座標
            y: particle.gridY // 粒子Y網格座標
        };
        let radiusCells = Math.ceil(radius / this.cellSize); // 半徑單元數

        // --是否允許穿透--
        if (!isThrough) {
            return this.getNearbyNormal(pos, radiusCells, (radiusCells+1.5) * (radiusCells+1.5)); // 正常情況下
        }
        // >>>穿透情況下<<<

        radiusCells += this.isNotGridPerfectlyFit; // 半徑單元數
        const radiusCellsPlus1point5Squared = (radiusCells + 1.5) * (radiusCells + 1.5); // 半徑平方

        // --遍歷單元Y座標--
        for (let dy = -radiusCells; dy <= radiusCells; dy++) {
            const dySquared = dy * dy; // 單元Y座標平方
            const actualY = dy + pos.y; // 單元Y座標
            const wrappedGridY = this.wrapCoordinate(actualY, this.height); // 單元Y座標
            const baseIndex = wrappedGridY * this.width; // 單元索引
            
            // --遍歷單元X座標--
            for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                // --單元是否在半徑外--
                if (dx * dx + dySquared > radiusCellsPlus1point5Squared) continue; 
                
                const actualX = dx + pos.x; // 單元X座標
                const wrappedGridX = this.wrapCoordinate(actualX, this.width); // 單元X座標
                
                const cell = this.cells[baseIndex + wrappedGridX]; // 單元
                
                try {
                    // --單元是否存在粒子--
                    if (cell.length > 0) {
                        const offsetX = (actualX < 0 || actualX >= this.width) ? 
                            (actualX < 0 ? -1 : 1) * this.canvasWidth : 0; // 偏移量X
                        const offsetY = (actualY < 0 || actualY >= this.height) ? 
                            (actualY < 0 ? -1 : 1) * this.canvasHeight : 0; // 偏移量Y
                        
                        // --遍歷單元粒子--
                        for (let i = 0; i < cell.length; i++) {
                            this.nearbyCache[this.offsetsCache] = cell[i]; // 附近粒子
                            this.offsetsX[this.offsetsCache] = offsetX; // 偏移量X
                            this.offsetsY[this.offsetsCache] = offsetY; // 偏移量Y
                            this.offsetsCache++; // 增加偏移量數量
                        }
                    }
                } catch (error) {
                    console.log(`crashhhhhhhhhhhhhhhhhhhhhhhhhhh`);
                    console.log(`error: ${error}`);
                    let particleConsoleText = "";
                    Object.keys(particle).forEach(key => {
                        particleConsoleText += `${key}= ${particle[key]}, `;
                    });
                    console.log(`particle: ${particleConsoleText}`);
                    console.log(`baseIndex: ${baseIndex}`);
                    console.log(`wrappedGridX: ${wrappedGridX}`);
                    console.log(`wrappedGridY: ${wrappedGridY}`);
                    console.log(`this.cells: ${this.cells}`);
                    console.log(`this.cells[baseIndex + wrappedGridX]: ${this.cells[baseIndex + wrappedGridX]}`);
                    console.log(`cell: ${cell}`);
                    console.log(`pos: x= ${pos.x}, y= ${pos.y}`);
                    console.log(`radiusCells: ${radiusCells}`);
                    console.log(`radiusCellsPlus1point5Squared: ${radiusCellsPlus1point5Squared}`);
                    console.log(`this.width: ${this.width}`);
                    console.log(`this.height: ${this.height}`);
                    throw error;
                }
            }
        }
        
        /*if (this.offsetsX.length < this.offsetsCache || this.offsetsY.length < this.offsetsCache) {
            console.log(`bug detected in getNearby: `, {
                "offsetsX": this.offsetsX,
                "offsetsY": this.offsetsY,
                "offsetsCache": this.offsetsCache,
                "getNearbyNearByCacheLen": getNearbyNearByCacheLen,
                "newGridNearByCacheLen": newGridNearByCacheLen,
                "pos": pos,
                "radiusCells": radiusCells,
                "radiusCellsPlus1point5Squared": radiusCellsPlus1point5Squared,
                "thisWidth": this.width,
                "thisHeight": this.height,
                "thisCells": this.cells,
            });
            throw new Error;
        }*/

        // --返回附近粒子--
        return {
            particles: this.nearbyCache, // 附近粒子
            offsetsX: this.offsetsX, // 偏移量X
            offsetsY: this.offsetsY, // 偏移量Y
            offsetCount: this.offsetsCache // 偏移量數量
        };


    }

    // --獲取附近粒子(正常情況下)--
    getNearbyNormal(pos, radiusCells, radiusCellsSquared) {
        const startX = Math.max(0, pos.x - radiusCells); // 單元X座標起始
        const endX = Math.min(this.width - 1, pos.x + radiusCells); // 單元X座標結束
        const startY = Math.max(0, pos.y - radiusCells); // 單元Y座標起始
        const endY = Math.min(this.height - 1, pos.y + radiusCells); // 單元Y座標結束

        // --遍歷單元Y座標--
        for (let y = startY; y <= endY; y++) {
            const dy = y - pos.y; // 單元Y座標差
            const dySquared = dy * dy; // 單元Y座標平方
            const baseIndex = y * this.width; // 單元索引

            // --遍歷單元X座標--
            for (let x = startX; x <= endX; x++) {
                const dx = x - pos.x; // 單元X座標差
                // --單元是否在半徑外--
                if (dx * dx + dySquared > radiusCellsSquared) continue; // 跳過半徑外的單元
                
                const cell = this.cells[baseIndex + x]; // 單元
                // --單元是否存在粒子--
                if (cell.length > 0) {
                    for (let i = 0; i < cell.length; i++) {
                        this.nearbyCache[this.offsetsCache] = cell[i]; // 附近粒子
                        this.offsetsCache++; // 增加偏移量數量
                    }
                }
            }
        }

        // --返回附近粒子--
        return {
            particles: this.nearbyCache, // 附近粒子
            offsetCount: this.offsetsCache // 偏移量數量
        };
    }

    // --獲取附近單元--
    getNearbyCells(cellX, cellY, radius) {
        this.nearbyCellsCache = 0; // 附近單元數量
        this.nearbyCellsSkippedCache = 0; // 跳過單元數量
        let radiusCells = Math.ceil(radius / this.cellSize); // 半徑單元數
        
        // --是否允許穿透--
        if (isThrough) {
            radiusCells = radiusCells + this.isNotGridPerfectlyFit; // 半徑單元數
            const radiusCellsPlus1point5Squared = (radiusCells + 1.5) * (radiusCells + 1.5); // 半徑平方
            // --遍歷單元Y座標--
            for (let dy = -radiusCells; dy <= radiusCells; dy++) {
                const wrappedY = (((cellY + dy) % this.height) + this.height) % this.height; // 單元Y座標 
                // --遍歷單元X座標--
                for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                    const wrappedX = (((cellX + dx) % this.width) + this.width) % this.width; // 單元X座標
                    // --單元是否在半徑外--
                    if ((dx * dx + dy * dy) > radiusCellsPlus1point5Squared) {
                        this.nearbyCellsSkipped[this.nearbyCellsSkippedCache] = {
                            x: wrappedX, // 單元X座標
                            y: wrappedY, // 單元Y座標
                            cellRadiusNotSqrtYet: dx * dx + dy * dy // 單元半徑平方
                        };
                        this.nearbyCellsSkippedCache++; // 增加跳過單元數量
                        continue; // 跳過單元
                    }
                    this.nearbyCells[this.nearbyCellsCache] = {
                        x: wrappedX, // 單元X座標
                        y: wrappedY, // 單元Y座標
                        cellRadiusNotSqrtYet: dx * dx + dy * dy // 單元半徑平方
                    };
                    this.nearbyCellsCache++; // 增加附近單元數量
                }
            }
        } 
        // --不允許穿透--
        else {
            const radiusCellsPlus1point5Squared = (radiusCells + 1.5) * (radiusCells + 1.5); // 半徑平方
            const startX = Math.max(0, cellX - radiusCells); // 單元X座標起始
            const endX = Math.min(this.width - 1, cellX + radiusCells); // 單元X座標結束
            const startY = Math.max(0, cellY - radiusCells); // 單元Y座標起始
            const endY = Math.min(this.height - 1, cellY + radiusCells); // 單元Y座標結束

            // --遍歷單元Y座標--
            for (let y = startY; y <= endY; y++) {
                const dy = y - cellY; // 單元Y座標差
                const dySquared = dy * dy; // 單元Y座標平方
                // --遍歷單元X座標--
                for (let x = startX; x <= endX; x++) {
                    const dx = x - cellX; // 單元X座標差
                    // --單元是否在半徑外--
                    if (dx * dx + dySquared > radiusCellsPlus1point5Squared) {
                        // --跳過半徑外的單元--
                        this.nearbyCellsSkipped[this.nearbyCellsSkippedCache] = {
                            x, y, // 單元座標
                            cellRadiusNotSqrtYet: dx * dx + dySquared // 單元半徑平方
                        };
                        this.nearbyCellsSkippedCache++; // 增加跳過單元數量
                        continue; // 跳過單元
                    }
                    // --添加附近單元--
                    this.nearbyCells[this.nearbyCellsCache] = {
                        x, y, // 單元座標
                        cellRadiusNotSqrtYet: dx * dx + dySquared // 單元半徑平方
                    };
                    this.nearbyCellsCache++; // 增加附近單元數量
                }
            }
        }

        // --返回附近單元--
        return {
            nearbyCells: this.nearbyCells.slice(0, this.nearbyCellsCache), // 附近單元
            radiusCells: radiusCells, // 半徑單元數
            nearbyCellsSkipped: this.nearbyCellsSkipped.slice(0, this.nearbyCellsSkippedCache) // 跳過的單元
        };
    }
}

// =============== 原有函數定義 ===============
// --計算粒子間作用力--
const BETA = 0.3;
function calculateForce(r, a) {
    // --粒子間距小於BETA--
    if (r < BETA) { 
        return r / BETA - 1; // 返回作用力
    } 
    // --粒子間距在BETA和1之間--
    else if (BETA < r && r < 1) { 
        return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA)); // 返回作用力
    }
    return 0; // 返回作用力
}

// --計算摩擦係數--
function calculateFrictionFactor(dt, tHalf) {
    return Math.pow(0.5, dt/tHalf); // 返回摩擦係數
}

// =============== 主循環 ===============

// 每秒初始化更新次數
setInterval(() => {
    self.postMessage({type: 'updateUpdateIntervalCountsTimes', updateIntervalCountsTimes: updateIntervalCountsTimes});
    updateIntervalCountsTimes = 0;
}, 1000);

let updateIntervalId;
function updateIntervalFunction() {
    updateIntervalId = setInterval(() => {
        if (isInited && canUpdate && !isUpdating && isRunnable && !isMovingCanvas) {
            const startTime = performance.now(); // 開始時間
            updateIntervalCountsTimes++; // 更新次數
            isUpdating = true;
            update();
            isUpdating = false;
            performanceData.updateIntervalTime = performance.now() - startTime; // 更新時間
        }
    }, updateInterval);
}

// =============== 粒子規則函數 ===============
// >>> 網格優化計算 <<<
function rule_grid(types) {
    // --初始化性能計數器--
    performanceData.getNearbyCountsTimes = 0; // 附近粒子數量
    performanceData.gAffectCalcCountsTimes = 0; // 作用力計算次數
    performanceData.particleSkippedCountsTimes = 0; // 粒子跳過次數
    
    // --遍歷所有粒子類型--
    for (let type = 0; type < types; type++) {
        const p1 = particleGroups[type]; // 粒子類型
        // --處理每個粒子--
        for (let i = 0; i < p1.length; i++) {
            const a = p1[i]; // 粒子
            // --應用摩擦力--
            a.vx *= frictionFactor; // 粒子X速度
            a.vy *= frictionFactor; // 粒子Y速度
            checkAllParticlesIfNaN(`rule_grid start the ${performanceData.gAffectCalcCountsTimes} times NaN detected`, {
                a: a, // 粒子
                canvasWidth: canvas.width, // 畫布寬度
                canvasHeight: canvas.height, // 畫布高度
                ballRadius: ballRadius, // 粒子半徑
            });
            const oldX = a.x; // 粒子X
            const oldY = a.y; // 粒子Y
            const oldVx = a.vx; // 粒子X速度
            const oldVy = a.vy; // 粒子Y速度
            // --計算合力--
            let rfx = 0, rfy = 0; // 初始化最終作用力
            // --計算不同類型粒子間的相互作用--
            for (let t = 0; t < types; t++) {
                let fx = 0, fy = 0; // 初始化單種粒子間的作用力
                const r = distanceMatrix[type][t]; // 距離
                const r2 = r * r; // 距離平方
                const g = forceMatrix[type][t]; // 作用力
                
                const getNearbyStartTime = performance.now(); // 開始時間
                const nearby = particleGrids[t].getNearby(a, r, isThrough); // 附近粒子
                performanceData.getNearbyCountsTimes++; // 附近粒子數量
                performanceData.getNearbyTime += performance.now() - getNearbyStartTime; // 計算時間
                
                const nearbyCount = nearby.offsetCount; // 附近粒子數量
                const nearbyParticles = nearby.particles; // 附近粒子
                let gAffectCalcStartTime = performance.now(); // 開始時間
                
                
                // --是否通過邊界--
                if (isThrough) {
                    if (!nearby.offsetsX || !nearby.offsetsY) {
                        console.log(`NaN detected in rule_grid nearby.offsetsX or nearby.offsetsY is not defined: `, {
                            nearby: nearby,
                            nearbyParticles: nearbyParticles,
                            nearbyCount: nearbyCount,
                        });
                        throw new Error;
                    }
                    // --遍歷附近粒子--
                    for (let j = 0; j < nearbyCount; j++) {
                        performanceData.gAffectCalcCountsTimes++; // 作用力計算次數
                        const b = nearbyParticles[j]; // 附近粒子
                        if (a === b) continue; // 跳過自身
                        
                        const dx = (b.x + nearby.offsetsX[j]) - a.x; // 粒子X座標差
                        const dy = (b.y + nearby.offsetsY[j]) - a.y; // 粒子Y座標差
                        const distSquared = dx * dx + dy * dy; // 距離平方

                        // --距離是否大於半徑平方--
                        if (distSquared === 0 || distSquared >= r2) {
                            performanceData.particleSkippedCountsTimes++; // 粒子跳過次數
                            continue; // 跳過粒子
                        }
                        
                        const dist = Math.sqrt(distSquared); // 距離
                        const F = calculateForce(dist/r, g); // 作用力
                        fx += F * dx / dist; // 粒子X作用力
                        fy += F * dy / dist; // 粒子Y作用力
                        if (isNaN(fx) || isNaN(fy)) {
                            console.log(`NaN detected in rule_grid: ${performanceData.gAffectCalcCountsTimes} times:`, {
                                pId: a.id, // 粒子ID
                                pType: type, // 粒子類型
                                fx: fx, // 粒子X作用力
                                fy: fy, // 粒子Y作用力
                                dx: dx, // 粒子X座標差
                                dy: dy, // 粒子Y座標差
                                dist: dist, // 距離
                                F: F, // 作用力
                                r: r, // 距離
                                r2: r2, // 距離平方
                                g: g, // 作用力
                                b: b, // 附近粒子
                                nearby: nearby, // 附近粒子
                                nearbyOffsetsX: nearby.offsetsX[j], // 附近粒子偏移量X
                                nearbyOffsetsY: nearby.offsetsY[j], // 附近粒子偏移量Y
                                canvasWidth: canvas.width, // 畫布寬度
                                canvasHeight: canvas.height, // 畫布高度
                                ballRadius: ballRadius, // 粒子半徑
                            });
                            throw new Error;
                        }
                    }
                } 
                // --不穿過邊界--
                else {
                    // --遍歷附近粒子--
                    for (let j = 0; j < nearbyCount; j++) {
                        performanceData.gAffectCalcCountsTimes++; // 作用力計算次數
                        const b = nearbyParticles[j]; // 附近粒子
                        if (a === b) continue; // 跳過自身
                        
                        const dx = b.x - a.x; // 粒子X座標差
                        const dy = b.y - a.y; // 粒子Y座標差
                        const distSquared = dx * dx + dy * dy; // 距離平方

                        // --距離是否大於半徑平方--
                        if (distSquared === 0 || distSquared >= r2) {
                            performanceData.particleSkippedCountsTimes++; // 粒子跳過次數
                            continue; // 跳過粒子
                        }
                        
                        const dist = Math.sqrt(distSquared); // 距離
                        const F = calculateForce(dist/r, g); // 作用力
                        fx += F * dx / dist; // 粒子X作用力
                        fy += F * dy / dist; // 粒子Y作用力
                    }
                }
                
                rfx += fx * r * 10; // 粒子X作用力
                rfy += fy * r * 10; // 粒子Y作用力
                
                performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime; // 計算時間
            }
            
            gAffectCalcStartTime = performance.now(); // 開始時間
            a.vx += rfx * currentDt; // 粒子X速度
            a.vy += rfy * currentDt; // 粒子Y速度
            performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime; // 計算時間
            checkAllParticlesIfNaN(`rule_grid end the ${performanceData.gAffectCalcCountsTimes} times NaN detected`, {
                a: a, // 粒子
                canvasWidth: canvas.width, // 畫布寬度
                canvasHeight: canvas.height, // 畫布高度
                ballRadius: ballRadius, // 粒子半徑
                oldX: oldX, // 粒子X
                oldY: oldY, // 粒子Y
                oldVx: oldVx, // 粒子X速度
                oldVy: oldVy, // 粒子Y速度
            });
        }
    }
}

// >>> 直接力計算 <<<
function rule_direct(types) {
    // --初始化性能計數器--
    performanceData.gAffectCalcCountsTimes = 0; // 作用力計算次數
    performanceData.particleSkippedCountsTimes = 0; // 粒子跳過次數
    
    // --遍歷所有粒子類型--
    for (let type1 = 0; type1 < types; type1++) {
        const p1 = particleGroups[type1]; // 粒子類型
        // --處理每個粒子--
        for (let i = 0; i < p1.length; i++) {
            const a = p1[i]; // 粒子
            a.vx *= frictionFactor; // 粒子X速度
            a.vy *= frictionFactor; // 粒子Y速度
            
            // --計算合力--
            let rfx = 0, rfy = 0; // 初始化最終作用力
            // --計算不同類型粒子間的相互作用--
            for (let type2 = 0; type2 < types; type2++) {
                const p2 = particleGroups[type2]; // 粒子類型
                let fx = 0, fy = 0; // 初始化單種粒子間的作用力
                const r = distanceMatrix[type1][type2]; // 距離
                const r2 = r * r; // 距離平方
                const g = forceMatrix[type1][type2]; // 作用力
                let gAffectCalcStartTime = performance.now(); // 開始時間
                
                // --是否穿過邊界--
                if (isThrough) {
                    offsetsList.length = 1;  // 重置陣列
                    offsetsList[0] = {dx: 0, dy: 0};  // 重置初始偏移量
                    let boundaryFlags = 0; // 邊界標誌
                    
                    // --粒子X座標是否大於畫布寬度--
                    if (a.x + r > canvas.width) {
                        offsetsList.push({dx: canvas.width, dy: 0}); // 偏移量
                        boundaryFlags |= 1; // 邊界標誌
                    } 
                    // --粒子X座標是否小於0--
                    if (a.x - r < 0) {
                        offsetsList.push({dx: -1*canvas.width, dy: 0}); // 偏移量
                        boundaryFlags |= 2; // 邊界標誌
                    }
                    // --粒子Y座標是否大於畫布高度--
                    if (a.y + r > canvas.height) {
                        offsetsList.push({dx: 0, dy: canvas.height}); // 偏移量
                        boundaryFlags |= 4; // 邊界標誌
                    }
                    // --粒子Y座標是否小於0--
                    if (a.y - r < 0) {
                        offsetsList.push({dx: 0, dy: -1*canvas.height}); // 偏移量
                        boundaryFlags |= 8; // 邊界標誌
                    }
                    
                    // --粒子X座標是否大於畫布寬度且粒子Y座標是否小於0--
                    if ((boundaryFlags & 1) && (boundaryFlags & 8)) {
                        offsetsList.push({dx: canvas.width, dy: -1*canvas.height}); // 偏移量
                    }
                    // --粒子X座標是否大於畫布寬度且粒子Y座標是否大於畫布高度--
                    if ((boundaryFlags & 1) && (boundaryFlags & 4)) {
                        offsetsList.push({dx: canvas.width, dy: canvas.height}); // 偏移量
                    }
                    // --粒子X座標是否小於0且粒子Y座標是否小於0--
                    if ((boundaryFlags & 2) && (boundaryFlags & 8)) {
                        offsetsList.push({dx: -1*canvas.width, dy: -1*canvas.height}); // 偏移量
                    }
                    // --粒子X座標是否小於0且粒子Y座標是否大於畫布高度--
                    if ((boundaryFlags & 2) && (boundaryFlags & 4)) {
                        offsetsList.push({dx: -1*canvas.width, dy: canvas.height}); // 偏移量
                    }
                    
                    // --遍歷附近粒子--
                    for (let j = 0; j < p2.length; j++) {
                        const b = p2[j]; // 附近粒子
                        if (a === b) continue; // 跳過自身
                        
                        // --遍歷偏移量--
                        for (let k = 0; k < offsetsList.length; k++) {
                            performanceData.gAffectCalcCountsTimes++; // 作用力計算次數
                            const offset = offsetsList[k]; // 偏移量
                            const dx = (b.x + offset.dx) - a.x; // 粒子X座標差
                            const dy = (b.y + offset.dy) - a.y; // 粒子Y座標差
                            const distSquared = dx * dx + dy * dy; // 距離平方
                            
                            // --距離是否大於半徑平方--
                            if (distSquared === 0 || distSquared >= r2) {
                                performanceData.particleSkippedCountsTimes++; // 粒子跳過次數
                                continue; // 跳過粒子
                            }
                            
                            const dist = Math.sqrt(distSquared); // 距離
                            const F = calculateForce(dist/r, g); // 作用力
                            fx += F * dx / dist; // 粒子X作用力
                            fy += F * dy / dist; // 粒子Y作用力
                        }
                    }
                } 
                // --不穿過邊界--
                else {
                    // --遍歷附近粒子--
                    for (let j = 0; j < p2.length; j++) {
                        performanceData.gAffectCalcCountsTimes++; // 作用力計算次數
                        const b = p2[j]; // 附近粒子
                        if (a === b) continue; // 跳過自身
                        
                        const dx = b.x - a.x; // 粒子X座標差
                        const dy = b.y - a.y; // 粒子Y座標差
                        const distSquared = dx * dx + dy * dy; // 距離平方
                        
                        // --距離是否大於半徑平方--
                        if (distSquared === 0 || distSquared >= r2) {
                            performanceData.particleSkippedCountsTimes++; // 粒子跳過次數
                            continue; // 跳過粒子
                        }
                        
                        const dist = Math.sqrt(distSquared); // 距離
                        const F = calculateForce(dist/r, g); // 作用力
                        fx += F * dx / dist; // 粒子X作用力
                        fy += F * dy / dist; // 粒子Y作用力
                    }
                }
                
                rfx += fx * r * 10; // 粒子X作用力
                rfy += fy * r * 10; // 粒子Y作用力
                performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime; // 計算時間
            }
            
            gAffectCalcStartTime = performance.now(); // 開始時間
            a.vx += rfx * currentDt; // 粒子X速度
            a.vy += rfy * currentDt; // 粒子Y速度
            performanceData.gAffectCalcTime += performance.now() - gAffectCalcStartTime; // 計算時間
        }
    }
}

// =============== 消息處理 ===============
// >>> 處理主線程發來的各種消息 <<<
self.onmessage = function(e) {
    // --處理消息--
    switch (e.data.type) {
        // --初始化--
        case 'init':
            particleGroups = []; // 粒子類型
            nextParticleId = 0; // 重置 id 計數器
            canvas.width = e.data.canvasWidth; // 畫布寬度
            canvas.height = e.data.canvasHeight; // 畫布高度
            particleTypes = e.data.particleTypes; // 粒子類型數量
            particleColors = e.data.particleColors; // 粒子顏色
            particleCounts = e.data.particleCounts; // 粒子數量
            cellSize = e.data.cellSize; // 網格大小
            performanceData = e.data.performanceData; // 性能計數器
            // --初始化矩陣和粒子--
            for (let i = 0; i < particleTypes; i++) {
                particleGroups[i] = create(particleCounts[i], particleColors[i], i); // 創建粒子
            }
            // --網格 just for getNearbyCells--
            grid = new Grid(cellSize, canvas.width, canvas.height, 0); // 網格
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            
            // --網格初始化--
            particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 粒子網格
            isInited = true;
            break;
        // --更改線程初始化--
        case 'changeThreadInit':
            particleGroups = e.data.particleGroups; // 粒子類型
            canvas.width = e.data.canvasWidth; // 畫布寬度
            canvas.height = e.data.canvasHeight; // 畫布高度
            particleTypes = e.data.particleTypes; // 粒子類型數量
            particleColors = e.data.particleColors; // 粒子顏色
            particleCounts = e.data.particleCounts; // 粒子數量
            cellSize = e.data.cellSize; // 網格大小
            performanceData = e.data.performanceData; // 性能計數器
            isUsingGrid = e.data.isUsingGrid; // 是否使用網格
            // --初始化網格--
            grid = new Grid(cellSize, canvas.width, canvas.height, 0); // 網格
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            // --網格初始化--
            particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 粒子網格
            isInited = true;
            break;
        // --更新規則矩陣--
        case 'updateRules':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            forceMatrix = e.data.forceMatrix; // 作用力矩陣
            distanceMatrix = e.data.distanceMatrix; // 距離矩陣
            break;
        
        // --設置穿透模式--
        case 'setThrough':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            isThrough = e.data.isThrough; // 穿透模式
            checkAllParticlesIfNaN('setThrough NaN detected');
            break;

        // --更新畫布大小--
        case 'updateCanvasSize':
            isMovingCanvas = true; // 設置為正在移動畫布
            self.postMessage({type: 'setMovingCanvas', isMovingCanvas: true}); // 發送消息
            lastResizeTime = performance.now(); // 記錄當前時間
            
            // 更新畫布尺寸
            canvas.width = e.data.width; // 畫布寬度
            canvas.height = e.data.height; // 畫布高度
            
            // --檢查畫布尺寸是否有效--
            if (canvas.width < ballRadius || canvas.height < ballRadius) {
                isRunnable = false; // 設置為不可運行
                break; // 跳過
            }
            checkAllParticlesIfNaN('update canvas size NaN detected');
            checkIfParticleIsOutOfBounds(); // 檢查粒子是否超出邊界
            
            isRunnable = true; // 設置為可運行
            
            // --更新網格--
            if (cellSize) {
                // --網格 just for getNearbyCells--
                grid = new Grid(cellSize, canvas.width, canvas.height, 0); // 網格
                // --網格初始化--
                particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 粒子網格
            }
            
            // 設置定時器檢查畫布是否停止改變
            setTimeout(() => {
                const currentTime = performance.now();
                // 如果最後一次 resize 發生在超過 1 秒前
                if (currentTime - lastResizeTime >= 100) {
                    isMovingCanvas = false; // 設置為非移動狀態
                    self.postMessage({type: 'setMovingCanvas', isMovingCanvas: false}); // 發送消息
                }
            }, 500);
            break;

        // --請求更新--
        case 'canUpdate':
            canUpdate = true; // 可以更新
            break;

        // --更新粒子顏色--
        case 'updateColors':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            particleColors = e.data.particleColors; // 粒子顏色
            // --遍歷所有粒子類型--
            for (let i = 0; i < particleTypes; i++) {
                // --遍歷粒子組--
                particleGroups[i].forEach(p => {
                    p.color = particleColors[i]; // 更新粒子顏色
                });
            }
            break;

        // --更新滑鼠位置--
        case 'updateMousePosition':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            mouseX = e.data.x; // 滑鼠X座標
            mouseY = e.data.y; // 滑鼠Y座標
            isMouseActive = true; // 滑鼠是否活動
            break;

        // --更新滑鼠力量--
        case 'updateMouseForce':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            mouseForce = e.data.force; // 滑鼠力量
            break;

        // --更新網格大小--
        case 'updateCellSize':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            cellSize = e.data.size; // 網格大小
            // --更新網格--
            if (canvas.width && canvas.height) {
                // --更新網格--
                grid = new Grid(cellSize, canvas.width, canvas.height, 0); // 網格
                // --新增多線程初始化--
                // --是否使用多線程--
                particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 粒子網格
            }
            break;

        // --設置滑鼠非活動狀態--
        case 'setMouseInactive':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            isMouseActive = false; // 滑鼠非活動狀態
            break;

        // --設置是否使用網格--
        case 'setIsUsingGrid':
            isUsingGrid = e.data.isUsingGrid;
            if (isUsingGrid) {
                particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 添加所有粒子到網格
            }
            break;

        // --更新粒子半徑--
        case 'updateBallRadius':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            ballRadius = e.data.ballRadius; // 粒子半徑
            break;

        // --更新網格顯示--
        case 'toggleGrid':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            showGrid = e.data.show; // 網格顯示
            break;

        // --選中網格--
        case 'selectCell':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            selectedCell = e.data.cell; // 選中網格
            break;

        // --更新選中網格距離--
        case 'updateSetectGridDistance':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            setectGridDistance = e.data.distance; // 選中網格距離
            break;

        // --更新更新間隔--
        case 'updateUpdateInterval':
            updateInterval = e.data.interval; // 更新間隔
            clearInterval(updateIntervalId); // 清除更新間隔
            updateIntervalFunction();
            break;

        // --更新選中粒子--
        case 'updateSelectedParticle':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            selectedParticleId = e.data.particleId; // 選中粒子
            break;

        // --更新粒子影響半徑顯示--
        case 'toggleParticleAffcetRadiusShow':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            enableParticleAffcetRadiusShow = e.data.enable; // 粒子影響半徑顯示
            break;

        // --更新THalf--
        case 'updateTHalf':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            currentTHalf = e.data.tHalf; // THalf
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            break;

        // --更新粒子影響半徑顯示--
        case 'updateRadiusShow':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            RadiusShow = e.data.RadiusShow; // 粒子影響半徑顯示
            break;
        case 'updateRestitution':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            restitution = e.data.value;
            break;
    }
};

// =============== 更新循環 ===============
// --主要更新循環函數--
function update() {
    //checkAllParticlesIfNaN('update before check NaN detected');
    if (!isRunnable || isMovingCanvas) {
        return; // 如果不可運行或移動畫布,跳過
    }
    performanceMonitor.start(); // 開始性能監控
    const startTime = performance.now(); // 開始時間
    
    // --清空性能計數器--
    Object.keys(performanceData).forEach(key => {
        // --非數組且不包含Max、All、Average的鍵--
        if (!(performanceData[key] instanceof Array) && !(/Max|All|Average/.test(key))) {
            performanceData[key] = 0; // 清空計數器
        }
    });
    
    // --初始化網格數據--
    gridData = {
        width: grid.width, // 網格寬度
        height: grid.height, // 網格高度
        cellSize: cellSize, // 網格大小
        selectedCell: selectedCell, // 選中網格
        radiusCells: 0, // 半徑網格
        nearbyCells: [], // 附近網格
        nearbyCellsSkipped: [], // 跳過的網格
    };
    //checkAllParticlesIfNaN('update rule-start NaN detected');
    // --使用網格--
    if (isUsingGrid) {
        rule_grid(particleTypes); // 網格計算
    } 
    // --直接計算--
    else {
        rule_direct(particleTypes);
    }
    //checkAllParticlesIfNaN('update rule-end NaN detected');
    
    // --是否使用滑鼠吸引--
    if (isMouseActive) {
        particleGroups.forEach(group => applyMouseForce(group)); // 應用滑鼠力
    }
    //checkAllParticlesIfNaN('update mouse force NaN detected');
    
    // --更新粒子位置--
    const positionUpdateStartTime = performance.now(); // 位置更新開始時間
    rule_update(particleTypes); // 更新粒子位置
    performanceData.positionUpdateTime += performance.now() - positionUpdateStartTime; // 位置更新時間
    
    //checkAllParticlesIfNaN('update rule-update NaN detected');
    const particleCollisionStartTime = performance.now(); // 粒子碰撞開始時間
    performanceData.particleCollisionCountsTimes = 0; // 粒子碰撞次數
    
    // --粒子碰撞--
    particlesCollision(particleTypes);
    performanceData.particleCollisionTime = performance.now() - particleCollisionStartTime; // 粒子碰撞時間
    //checkAllParticlesIfNaN('update particles collision NaN detected');
    
    // --網格重置--
    if (isUsingGrid) {
        const gridResetStartTime = performance.now(); // 網格重置開始時間
        //checkAllParticlesIfNaN('update grid reset-start NaN detected');
        particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 添加所有粒子到網格
        //checkAllParticlesIfNaN('update grid reset-end NaN detected');
        performanceData.gridResetTime += performance.now() - gridResetStartTime; // 網格重置時間
    }
    
    particles = particleGroups.flat(); // 粒子列表
    //checkAllParticlesIfNaN('update particleGroups.flat NaN detected');
    let nearbyParticlesList = []; // 附近粒子列表
    const particleAffcetCalcTime = performance.now(); // 粒子影響半徑計算開始時間
    
    // --是否選中粒子且顯示粒子影響半徑--
    if (selectedParticleId && enableParticleAffcetRadiusShow){
        let selectedParticle = particles[selectedParticleId]; // 選中粒子
        const Ptype = selectedParticle.type; // 選中粒子類型
        // --遍歷所有粒子類型--
        for (let i = 0; i < particleTypes; i++) {
            if (isUsingGrid) {
                // --是否顯示粒子影響半徑--
                if (!RadiusShow[i]) {continue;}
                const nearby = particleGrids[i].getNearby(selectedParticle, distanceMatrix[Ptype][i], isThrough); // 獲取附近粒子
                const offsetsCount = nearby.offsetCount; // 偏移數量
                const offsetsX = nearby.offsetsX; // 偏移X
                const offsetsY = nearby.offsetsY; // 偏移Y
                const distance = distanceMatrix[Ptype][i]; // 距離
                // --是否穿過邊界--
                if (isThrough) {
                    // --過濾附近粒子--
                    nearbyParticlesList[i] = nearby.particles.slice(0, offsetsCount).filter((p, i) => {
                        const dx = offsetsX[i]; // 偏移X
                        const dy = offsetsY[i]; // 偏移Y
                        const px = p.x + dx; // 粒子X
                        const py = p.y + dy; // 粒子Y
                        const sx = selectedParticle.x; // 選中粒子X
                        const sy = selectedParticle.y; // 選中粒子Y
                        return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance; // 是否在影響半徑內
                    });
                } 
                // --不穿過邊界--
                else {
                    // --過濾附近粒子--
                    nearbyParticlesList[i] = nearby.particles.slice(0, offsetsCount).filter((p, i) => {
                        const px = p.x; // 粒子X
                        const py = p.y; // 粒子Y
                        const sx = selectedParticle.x; // 選中粒子X
                        const sy = selectedParticle.y; // 選中粒子Y
                        return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance; // 是否在影響半徑內
                    });
                }
            }
            else {
                if (!RadiusShow[i]) {continue;}
                const currentParticle = particleGroups[i]; // 當前粒子
                const distance = distanceMatrix[Ptype][i]; // 距離
                // --是否穿過邊界--
                if (isThrough) {
                    offsetsList.length = 1;  // 重置陣列
                    offsetsList[0] = {dx: 0, dy: 0};  // 重置初始偏移量
                    let boundaryFlags = 0; // 邊界標誌
                    
                    // --粒子X座標是否大於畫布寬度--
                    if (a.x + r > canvas.width) {
                        offsetsList.push({dx: canvas.width, dy: 0}); // 偏移量
                        boundaryFlags |= 1; // 邊界標誌
                    } 
                    // --粒子X座標是否小於0--
                    if (a.x - r < 0) {
                        offsetsList.push({dx: -1*canvas.width, dy: 0}); // 偏移量
                        boundaryFlags |= 2; // 邊界標誌
                    }
                    // --粒子Y座標是否大於畫布高度--
                    if (a.y + r > canvas.height) {
                        offsetsList.push({dx: 0, dy: canvas.height}); // 偏移量
                        boundaryFlags |= 4; // 邊界標誌
                    }
                    // --粒子Y座標是否小於0--
                    if (a.y - r < 0) {
                        offsetsList.push({dx: 0, dy: -1*canvas.height}); // 偏移量
                        boundaryFlags |= 8; // 邊界標誌
                    }
                    
                    // --粒子X座標是否大於畫布寬度且粒子Y座標是否小於0--
                    if ((boundaryFlags & 1) && (boundaryFlags & 8)) {
                        offsetsList.push({dx: canvas.width, dy: -1*canvas.height}); // 偏移量
                    }
                    // --粒子X座標是否大於畫布寬度且粒子Y座標是否大於畫布高度--
                    if ((boundaryFlags & 1) && (boundaryFlags & 4)) {
                        offsetsList.push({dx: canvas.width, dy: canvas.height}); // 偏移量
                    }
                    // --粒子X座標是否小於0且粒子Y座標是否小於0--
                    if ((boundaryFlags & 2) && (boundaryFlags & 8)) {
                        offsetsList.push({dx: -1*canvas.width, dy: -1*canvas.height}); // 偏移量
                    }
                    // --粒子X座標是否小於0且粒子Y座標是否大於畫布高度--
                    if ((boundaryFlags & 2) && (boundaryFlags & 4)) {
                        offsetsList.push({dx: -1*canvas.width, dy: canvas.height}); // 偏移量
                    }
                    // --過濾附近粒子--
                    nearbyParticlesList[i] = currentParticle.filter((p, i) => {
                        for (let j = 0; j < offsetsList.length; j++) {
                            const dx = offsetsList[j].dx; // 偏移X
                            const dy = offsetsList[j].dy; // 偏移Y
                            const px = p.x + dx; // 粒子X
                            const py = p.y + dy; // 粒子Y
                            const sx = selectedParticle.x; // 選中粒子X
                            const sy = selectedParticle.y; // 選中粒子Y
                            if ((px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance) {
                                return true;
                            }
                        }
                        return false;
                    });
                } 
                // --不穿過邊界--
                else {
                    // --過濾附近粒子--
                    nearbyParticlesList[i] = currentParticle.filter((p, i) => {
                        const px = p.x; // 粒子X
                        const py = p.y; // 粒子Y
                        const sx = selectedParticle.x; // 選中粒子X
                        const sy = selectedParticle.y; // 選中粒子Y
                        return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance; // 是否在影響半徑內
                    });
                }
            }
        }
    }
    performanceData.ParticleAffcetCalcTime = performance.now() - particleAffcetCalcTime; // 粒子影響半徑計算時間

    // --是否顯示網格且選中網格--
    if (showGrid && selectedCell) {
        const nearbyCells = grid.getNearbyCells(selectedCell.x, selectedCell.y, setectGridDistance); // 附近網格
        gridData.nearbyCells = nearbyCells.nearbyCells; // 附近網格
        gridData.radiusCells = nearbyCells.radiusCells; // 半徑網格
        gridData.nearbyCellsSkipped = nearbyCells.nearbyCellsSkipped; // 跳過的網格
    }

    performanceData.totalTime = performance.now() - startTime; // 總時間
    // --發送消息--
    self.postMessage({ 
        type: 'update', // 更新
        particles: particles, // 粒子列表
        particleGroups: particleGroups, // 粒子組列表
        performanceData: performanceData, // 性能計數器
        nearbyCells: gridData.nearbyCells, // 附近網格
        gridDataWidth: grid.width, // 網格寬度
        gridDataHeight: grid.height, // 網格高度
        nearbyParticlesList: nearbyParticlesList, // 附近粒子列表
        nearbyCellsSkipped: gridData.nearbyCellsSkipped, // 跳過的網格
        radiusCells: gridData.radiusCells, // 半徑網格
    });
    performanceMonitor.end(); // 結束性能監控
}

// =============== 輔助函數 ===============
// >>> 粒子位置更新 <<<
function rule_update(types) {
    // --初始化性能計數器--
    performanceData.positionUpdateCountsTimes = 0; // 位置更新次數
    
    // --遍歷所有粒子類型--
    for (let j = 0; j < types; j++) {
        const p1 = particleGroups[j]; // 粒子組
        // --遍歷粒子組--
        for (let i = 0; i < p1.length; i++) {
            const a = p1[i]; // 粒子
            // --是否穿過邊界--
            if (isThrough) {
                checkAllParticlesIfNaN(`update rule-update-through-start the ${performanceData.positionUpdateCountsTimes} times NaN detected`);
                // 確保不會除以 0
                // --畫布寬度或高度是否小於0--
                if (canvas.width < ballRadius || canvas.height < ballRadius) {
                    console.error('Invalid canvas dimensions:', canvas.width, canvas.height); // 錯誤
                    return;
                }
                const oldX = a.x; // 粒子X
                const oldY = a.y; // 粒子Y
                const oldVx = a.vx; // 粒子X速度
                const oldVy = a.vy; // 粒子Y速度
                const nextX = a.x + a.vx * currentDt; // 粒子的下一個X坐標
                const nextY = a.y + a.vy * currentDt; // 粒子的下一個Y坐標

                // 使用更安全的環繞計算
                // --計算粒子X--
                a.x = ((nextX % canvas.width) + canvas.width) % canvas.width; // 粒子X
                // --計算粒子Y--
                a.y = ((nextY % canvas.height) + canvas.height) % canvas.height; // 粒子Y
                checkAllParticlesIfNaN(`update rule-update-through-end the ${performanceData.positionUpdateCountsTimes} times NaN detected`, {
                    nextX: nextX, // 粒子X
                    nextY: nextY, // 粒子Y
                    canvasWidth: canvas.width, // 畫布寬度
                    canvasHeight: canvas.height, // 畫布高度
                    ballRadius: ballRadius, // 粒子半徑
                    particleOldX: oldX, // 粒子X
                    particleOldY: oldY, // 粒子Y
                    particleOldVx: oldVx, // 粒子X速度
                    particleOldVy: oldVy, // 粒子Y速度
                });
            } 
            // --不穿過邊界--
            else {
                checkAllParticlesIfNaN(`update rule-update-normal-start the ${performanceData.positionUpdateCountsTimes} times NaN detected`);
                let nextX = a.x + a.vx * currentDt; // 粒子的下一個X坐標
                let nextY = a.y + a.vy * currentDt; // 粒子的下一個Y坐標
                // --是否超出X邊界--
                if (nextX < ballRadius || nextX > canvas.width - ballRadius) {
                    a.vx *= -1; // 反向
                    nextX = Math.max(ballRadius, Math.min(nextX, canvas.width - ballRadius))
                }
                // --是否超出Y邊界--
                if (nextY < ballRadius || nextY > canvas.height - ballRadius) {
                    a.vy *= -1; // 反向
                    nextY = Math.max(ballRadius, Math.min(nextY, canvas.height - ballRadius))
                }
                a.x = nextX; // 粒子X
                a.y = nextY; // 粒子Y
                checkAllParticlesIfNaN(`update rule-update-normal-end the ${performanceData.positionUpdateCountsTimes} times NaN detected`);
            }
            performanceData.positionUpdateCountsTimes++; // 位置更新次數
        }
    }
}

// >>> 網格管理 <<<
function addAllParticleToGrid(Types, cellSize, canvasWidth, canvasHeight) {
    // --初始化性能計數器--
    performanceData.gridResetAndAddCountsTimes = 0;
    
    checkIfParticleIsOutOfBounds();
    
    // --創建網格數組--
    let Grids = [];
    
    // --為每種類型的粒子創建網格--
    for (let i = 0; i < Types; i++) {
        Grids[i] = new Grid(
            cellSize, 
            canvasWidth, 
            canvasHeight, 
            particleGroups[i].length
        );
        // --遍歷粒子組--
        particleGroups[i].forEach(p => {
            Grids[i].add(p);
            performanceData.gridResetAndAddCountsTimes++;
        });
    }
    return Grids;
}

// >>> 滑鼠交互處理 <<<
function applyMouseForce(particleGroup) {
    // --遍歷粒子組中的每個粒子--
    for (let i = 0; i < particleGroup.length; i++) {
        const p = particleGroup[i]; // 粒子
        // --計算滑鼠和粒子之間的距離--
        const dx = mouseX - p.x; // 滑鼠和粒子X距離
        const dy = mouseY - p.y; // 滑鼠和粒子Y距離
        const distSquared = dx * dx + dy * dy; // 距離平方
        // >>>應用力的計算和更新<<<
        // --距離大於0--
        if (distSquared > 0) {
            const force = mouseForce / Math.max(1, Math.sqrt(distSquared)); // 力
            p.vx += (force * dx) / frictionFactor; // 粒子X速度
            p.vy += (force * dy) / frictionFactor; // 粒子Y速度
        }
    }
}

// >>> 檢查粒子是否超出邊界 <<<
function checkIfParticleIsOutOfBounds() {
    // --遍歷所有粒子類型--
    for (let j = 0; j < particleTypes; j++) {
        const p1 = particleGroups[j]; // 粒子組
        // --遍歷粒子組--
        for (let i = 0; i < p1.length; i++) {
            const p = p1[i]; // 粒子
            // --檢查粒子是否超出邊界--
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
                // --是否穿過邊界--
                if (isThrough) {
                    p.x = ((p.x % canvas.width) + canvas.width) % canvas.width; // 粒子X
                    p.y = ((p.y % canvas.height) + canvas.height) % canvas.height; // 粒子Y
                } 
                // --不穿過邊界--
                else {
                    p.x = Math.max(0, Math.min(p.x, canvas.width)); // 粒子X
                    p.y = Math.max(0, Math.min(p.y, canvas.height)); // 粒子Y
                }
            }
        }
    }
}

function checkAllParticlesIfNaN(consoleMessage, ...otherArgs) {
    // --遍歷所有粒子類型--
    for (let type = 0; type < particleTypes; type++) {
        const p1 = particleGroups[type]; // 粒子組
        // --遍歷粒子組--
        for (let i = 0; i < p1.length; i++) {
            const p = p1[i]; // 粒子
            // --檢查粒子是否為NaN--
            if (isNaN(p.x) || isNaN(p.y) || isNaN(p.vx) || isNaN(p.vy)) {
                console.error(`${consoleMessage}: \n${JSON.stringify({
                    particleId: p.id, // 粒子ID
                    particleX: p.x, // 粒子X座標
                    particleY: p.y, // 粒子Y座標
                    particleVx: p.vx, // 粒子X速度
                    particleVy: p.vy, // 粒子Y速度
                    particleType: type, // 粒子類型
                    cellSize: cellSize, // 網格單元大小
                    particleGridX: p.gridX, // 粒子X網格座標
                    particleGridY: p.gridY, // 粒子Y網格座標
                    otherArgs: otherArgs // 其他參數
                })}`);
                throw new Error() // for stop the program, no Error message
            }
        }
    }
}

// >>> 創建單個粒子 <<<
function particle(x, y, c, type) {
    const id = nextParticleId++; // 粒子ID
    // --返回粒子對象--
    return {
        "id": id, // 粒子ID
        "x": x, // 粒子X
        "y": y, // 粒子Y
        "gridX": 0, // 網格X
        "gridY": 0, // 網格Y
        "vx": 0, // 粒子X速度
        "vy": 0, // 粒子Y速度
        "color": c, // 粒子顏色
        "type": type // 粒子類型
    };
}

// >>> 生成隨機X坐標 <<<
function rX() {
    return Math.random() * (canvas.width - 100) + 50; // 隨機X坐標
}

// >>> 生成隨機Y坐標 <<<
function rY() {
    return Math.random() * (canvas.height - 100) + 50; // 隨機Y坐標
}

// >>> 生成指定類型的粒子組 <<<
function create(count, c, type) {
    let group = []; // 粒子組
    // --遍歷粒子數量--
    for (let i = 0; i < count; i++) {
        group.push(particle(rX(), rY(), c, type)); // 創建粒子
    }
    return group; // 返回粒子組
}

// >>> 性能監控 <<<
const performanceMonitor = {
    lastUpdate: performance.now(),
    updateCount: 0,
    totalTime: 0,
    lastOptimizeTime: 0,
    changeRange: Math.random()*10-5,
    lastAvgTime: 0,

    start() {
        this.lastUpdate = performance.now();
    },
    
    end() {
        const currentTime = performance.now();
        const duration = currentTime - this.lastUpdate;
        this.totalTime += duration;
        this.updateCount++;
        
        // 每5秒計算平均性能
        if (currentTime - this.lastOptimizeTime >= 5000) {
            const avgTime = this.totalTime / this.updateCount;
            // 如果平均時間過高,自動調整優化策略
            if (avgTime > 16.66) { // 60fps的理想幀時間
                this.optimizePerformance(avgTime);
            }
            // 重置計數器
            this.updateCount = 0;
            this.totalTime = 0;
        }
    },
    
    optimizePerformance(avgTime) {
        this.lastOptimizeTime = performance.now();
        // 使用網格
        if (isUsingGrid) {
            const avgTimeDiff = avgTime - this.lastAvgTime;
            this.changeRange = Math.abs(avgTimeDiff) < 2.5 ? Math.round(Math.random()*2.5-1.25) : Math.sign(avgTimeDiff) == -1 ? Math.sign(this.changeRange)*Math.round(Math.random()*5) : -Math.sign(this.changeRange)*Math.round(Math.random()*5);
            cellSize = Math.max(40,Math.min(100, cellSize + this.changeRange));
            console.log('cellSize:', cellSize, "avgTime:", avgTime, "avgTimeDiff:", avgTimeDiff, "changeRange:", this.changeRange);
            this.lastAvgTime = avgTime;
            self.postMessage({
                type: 'updateCellSize',
                cellSize: cellSize
            });
            
        }
    }
};

// =============== 粒子碰撞處理 ===============
// >>> 碰撞參數 <<<
let restitution = 0.8;  // 能量損失係數 (0.8 = 保留80%能量)

function particlesCollision(types) {
    // >>> 粒子類型循環 <<<
    for (let type1 = 0; type1 < types; type1++) {
        const group1 = particleGroups[type1];
        
        // --優化循環起始--
        for (let type2 = type1; type2 < types; type2++) {
            const group2 = particleGroups[type2];
            
            // --第一組粒子循環--
            for (let i = 0; i < group1.length; i++) {
                const p1 = group1[i];
                
                // --避免自我碰撞--
                const startJ = (type1 === type2) ? i + 1 : 0;
                
                // --第二組粒子循環--
                for (let j = startJ; j < group2.length; j++) {
                    const p2 = group2[j];
                    
                    // >>> 距離計算 <<<
                    // --基本距離--
                    let dx = p2.x - p1.x;
                    let dy = p2.y - p1.y;
                    
                    // --邊界穿越處理--
                    if (isThrough) {
                        if (Math.abs(dx) > canvas.width / 2) {
                            dx = dx - Math.sign(dx) * canvas.width;
                        }
                        if (Math.abs(dy) > canvas.height / 2) {
                            dy = dy - Math.sign(dy) * canvas.height;
                        }
                    }
                    
                    // --碰撞檢測--
                    const distSquared = dx * dx + dy * dy;
                    const minDist = 2 * ballRadius;
                    
                    // >>> 碰撞處理 <<<
                    if (distSquared < minDist * minDist) {
                        const dist = Math.sqrt(distSquared);
                        
                        // --碰撞軸計算--
                        const nx = dx / dist;
                        const ny = dy / dist;
                        
                        // --切向向量計算--
                        const tx = -ny;
                        const ty = nx;
                        
                        // --相對速度計算--
                        const dvx = p2.vx - p1.vx;
                        const dvy = p2.vy - p1.vy;
                        
                        // --速度投影--
                        const normalVelocity = dvx * nx + dvy * ny;
                        const tangentVelocity = dvx * tx + dvy * ty;
                        
                        // >>> 碰撞響應 <<<
                        if (normalVelocity < 0) {
                            // --衝量計算--
                            const jn = -(1 + restitution) * normalVelocity / 2;
                            const jt = -tangentVelocity * frictionFactor / 2;
                            
                            // --速度更新--
                            p1.vx -= (jn * nx + jt * tx);
                            p1.vy -= (jn * ny + jt * ty);
                            p2.vx += (jn * nx + jt * tx);
                            p2.vy += (jn * ny + jt * ty);
                            performanceData.particleCollisionCountsTimes++; // 粒子碰撞次數
                            // --重疊修正--
                            const overlap = minDist - dist;
                            if (overlap > 0) {
                                const correction = (overlap / 2) * 1.05;
                                p1.x -= nx * correction;
                                p1.y -= ny * correction;
                                p2.x += nx * correction;
                                p2.y += ny * correction;
                                
                                // >>> 邊界檢查和修正 <<<
                                // --第一個粒子--
                                if (isThrough) {
                                    // --環繞處理--
                                    p1.x = ((p1.x % canvas.width) + canvas.width) % canvas.width;
                                    p1.y = ((p1.y % canvas.height) + canvas.height) % canvas.height;
                                    p2.x = ((p2.x % canvas.width) + canvas.width) % canvas.width;
                                    p2.y = ((p2.y % canvas.height) + canvas.height) % canvas.height;
                                } else {
                                    // --邊界彈回--
                                    if (p1.x < ballRadius) {
                                        p1.x = ballRadius;
                                        p1.vx = Math.abs(p1.vx);
                                    } else if (p1.x > canvas.width - ballRadius) {
                                        p1.x = canvas.width - ballRadius;
                                        p1.vx = -Math.abs(p1.vx);
                                    }
                                    if (p1.y < ballRadius) {
                                        p1.y = ballRadius;
                                        p1.vy = Math.abs(p1.vy);
                                    } else if (p1.y > canvas.height - ballRadius) {
                                        p1.y = canvas.height - ballRadius;
                                        p1.vy = -Math.abs(p1.vy);
                                    }
                                    
                                    // --第二個粒子--
                                    if (p2.x < ballRadius) {
                                        p2.x = ballRadius;
                                        p2.vx = Math.abs(p2.vx);
                                    } else if (p2.x > canvas.width - ballRadius) {
                                        p2.x = canvas.width - ballRadius;
                                        p2.vx = -Math.abs(p2.vx);
                                    }
                                    if (p2.y < ballRadius) {
                                        p2.y = ballRadius;
                                        p2.vy = Math.abs(p2.vy);
                                    } else if (p2.y > canvas.height - ballRadius) {
                                        p2.y = canvas.height - ballRadius;
                                        p2.vy = -Math.abs(p2.vy);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}