/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

console.log("particleWorker_Multithread.js loaded successfully");

// =============== 變量聲明區域 ===============
// >>> 粒子系統核心變量 <<<
// --粒子數據相關--
let variables = {
    particles: [],          // 儲存所有粒子對象的數組
    particleGroups: [],     // 粒子分組數組
    particleTypes: 0,       // 粒子類型總數
    particleCounts: [],     // 每種類型的粒子數量
    particleColors: [],     // 每種類型的粒子顏色
    nextParticleId: 0,      // 下一個要分配的粒子ID
    ballRadius: 0,          // 粒子半徑

    // --網格系統相關--
    isUsingGrid: true,      // 是否使用網格系統
    particleGrids: [],      // 粒子網格數組
    grid: null,            // 主網格對象
    showGrid: false,        // 是否顯示網格
    selectedCell: null,     // 當前選中的網格單元
    gridData: null,         // 網格數據
    setectGridDistance: 0,  // 網格選擇距離
    cellSize: 0,           // 網格單元大小

    // >>> 物理計算相關變量 <<<
    // --力和距離矩陣--
    forceMatrix: [],        // 粒子間作用力矩陣
    distanceMatrix: [],     // 粒子間距離矩陣
    isThrough: false,       // 是否允許穿透
    offsetsList: [{dx: 0, dy: 0}],  // 偏移量列表

    // --性能和更新控制--
    updateIntervalCountsTimes: 0, // 更新次數計數器
    lastResizeTime: 0, // 上次調整畫布時間
    isInited: false, // 是否初始化
    isRunnable: true,      // 是否可運行
    canUpdate: false,       // 是否可以更新
    isUpdating: false,      // 是否正在更新
    isMovingCanvas: false, // 是否正在移動畫布
    updateInterval: 16.66,  // 更新間隔(ms)
    frictionFactor: 0,      // 摩擦係數
    performanceData: {},    // 性能數據對象

    // >>> 視覺和交互相關變量 <<<
    // --畫布相關--
    canvas: { width: 0, height: 0 },  // 畫布尺寸

    // --滑鼠交互--
    mouseX: 0,             // 滑鼠X座標
    mouseY: 0,             // 滑鼠Y座標
    isMouseActive: false,   // 滑鼠是否活動
    mouseForce: 0,         // 滑鼠作用力
    selectedParticleId: null,  // 選中的粒子ID

    // --視覺效果--
    enableParticleAffcetRadiusShow: false,  // 是否顯示粒子影響半徑
    RadiusShow: [],        // 影響半徑顯示數據

    // >>> 多線程系統變量 <<<
    // --線程控制--
    isUsingMultithread: false,  // 是否使用多線程
    sharedMemory: null,  // 共享內存管理器
    workerPool: [],             // 工作線程池
    MAX_WORKERS: navigator.hardwareConcurrency-3 || 4,  // 最大工作線程數
    minParticlesPerWorker: 100,  // 每個工作線程的最小粒子數

    // >>> 共享內存變數 <<<
    particleData: null,              // 粒子數據
    startIndex: 0,
    endIndex: 0,
    particleType: 0,

    // =============== 常量定義 ===============
    // >>> 時間和物理常量 <<<
    DEFAULT_DT: 1/144,        // 默認時間步長
    DEFAULT_T_HALF: 0.040,    // 默認半衰期
    currentTHalf: DEFAULT_T_HALF,  // 當前半衰期
    currentDt: DEFAULT_DT,      // 當前時間步長
}
// =============== 原有類別定義 ===============
// --Grid類(now is only for draw grid)--
class Grid {
    // --構造函數--
    constructor(cellSize, width, height) {
        this.cellSize = cellSize; // 網格單元大小
        this.canvasWidth = width; // 畫布寬度
        this.canvasHeight = height; // 畫布高度
        this.isNotGridPerfectlyFit = (width % this.cellSize == 0 && height % this.cellSize == 0)?0:1; // 是否完美適配
        this.width = Math.ceil(width / cellSize); // 網格寬度
        this.height = Math.ceil(height / cellSize); // 網格高度
        this.cells = new Array(this.width * this.height); // 網格單元數組
        this.nearbyCells = new Array(this.width * this.height); // 附近單元數組
        this.nearbyCellsCache = 0;  // 附近單元數量
        this.nearbyCellsSkipped = new Array(this.width * this.height); // 跳過單元數組
        this.nearbyCellsSkippedCache = 0; // 跳過單元數量
        //newGridNearByCacheLen = this.nearbyCache.length;
    }
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
            // --初始化網格--
            // --是否使用網格--
            // --網格 just for getNearbyCells--
            grid = new Grid(cellSize, canvas.width, canvas.height); // 網格
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            
            // 創建共享內存管理器
            sharedMemory = new SharedMemoryManager(particleCounts);
            // --網格初始化--
            particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 粒子網格
            
            // --如果使用多線程,初始化多線程系統--
            console.log('Initializing multithreading system with grids:', particleGrids);
            initializeMultithreadSystem().then(() => {
                console.log('Multithreading system initialized successfully');
            }).catch(error => {
                console.error('Failed to initialize multithreading system:', error);
                isUsingMultithread = false;
                self.postMessage({type: 'FailedMultithread', isUsingMultithread: false});
            });
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
            grid = new Grid(cellSize, canvas.width, canvas.height); // 網格
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            // 創建共享內存管理器
            sharedMemory = new SharedMemoryManager(particleCounts);
            // --網格初始化--
            particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 粒子網格
            // --如果使用多線程,初始化多線程系統--
            console.log('Initializing multithreading system with grids:', particleGrids);
            initializeMultithreadSystem().then(() => {
                console.log('Multithreading system initialized successfully');
            }).catch(error => {
                console.error('Failed to initialize multithreading system:', error);
                isUsingMultithread = false;
                self.postMessage({type: 'FailedMultithread', isUsingMultithread: false});
            });
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
                grid = new Grid(cellSize, canvas.width, canvas.height); // 網格
                // --網格初始化--
                particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height); // 粒子網格
            }
            
            // 設置定時器檢查畫布是否停止改變
            setTimeout(() => {
                const currentTime = performance.now();
                // 如果最後一次 resize 發生在超過 1 秒前
                if (currentTime - lastResizeTime >= 500) {
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
                grid = new Grid(cellSize, canvas.width, canvas.height); // 網格
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
            if (isUsingMultithread) {
                if (isUsingGrid) {
                    initializeWorkerPool();
                } else {
                    // 在多線程直接計算模式下初始化工作線程池
                    initializeWorkerPool();
                }
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

        // --設置多線程--
        case 'setMultithread':
            isUsingMultithread = e.data.enabled;
            if (!isUsingMultithread) {
                // 非多線程模式下總是終止工作線程池
                terminateWorkerPool();
            } else if (isUsingGrid || !isUsingGrid) {
                // 多線程模式下,根據 isUsingGrid 決定使用哪種計算模式
                initializeWorkerPool();
            }
            
            // 設置更新間隔
            clearInterval(updateIntervalId);
            updateIntervalFunction();
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
async function update() {
    if (!isRunnable || isMovingCanvas) {
        return;
    }
    performanceMonitor.start();
    const startTime = performance.now();
    
    // 清空性能計數器
    Object.keys(performanceData).forEach(key => {
        if (!(performanceData[key] instanceof Array) && !(/Max|All|Average/.test(key))) {
            performanceData[key] = 0;
        }
    });
    
    // 初始化網格數據
    gridData = {
        width: grid.width,
        height: grid.height,
        selectedCell: null,
        radiusCells: 0,
        nearbyCells: [],
        nearbyCellsSkipped: [],
    };

    try {
        // 執行多線程計算
        if (isUsingGrid) {
            await rule_grid_multithread(particleTypes);
        } else {
            await rule_direct_multithread(particleTypes);
        }

        // 處理滑鼠互動
        if (isMouseActive) {
            particleGroups.forEach(group => applyMouseForce(group));
        }

        // 執行多線程位置更新
        await rule_update_multithread(particleTypes);

        // 處理粒子碰撞
        const particleCollisionStartTime = performance.now();
        performanceData.particleCollisionCountsTimes = 0;
        particlesCollision(particleTypes);
        performanceData.particleCollisionTime = performance.now() - particleCollisionStartTime;

        // 更新網格
        if (isUsingGrid) {
            const gridResetStartTime = performance.now();
            particleGrids = addAllParticleToGrid(particleTypes, cellSize, canvas.width, canvas.height);
            performanceData.gridResetTime += performance.now() - gridResetStartTime;
        }

        // 處理粒子影響範圍顯示
        particles = particleGroups.flat();
        let nearbyParticlesList = [];
        if (selectedParticleId && enableParticleAffcetRadiusShow) {
            let selectedParticle = particles[selectedParticleId];
            const Ptype = selectedParticle.type;
            
            for (let i = 0; i < particleTypes; i++) {
                if (RadiusShow[i]) {
                    const distance = distanceMatrix[Ptype][i];
                    nearbyParticlesList[i] = particleGroups[i].filter(p => {
                        const px = p.x;
                        const py = p.y;
                        const sx = selectedParticle.x;
                        const sy = selectedParticle.y;
                        return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance;
                    });
                }
            }
        }

        // 處理網格顯示
        if (showGrid && selectedCell) {
            const nearbyCells = grid.getNearbyCells(selectedCell.x, selectedCell.y, setectGridDistance);
            gridData.nearbyCells = nearbyCells.nearbyCells;
            gridData.radiusCells = nearbyCells.radiusCells;
            gridData.nearbyCellsSkipped = nearbyCells.nearbyCellsSkipped;
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
    } catch (error) {
        console.error('Error in update:', error);
        self.postMessage({
            type: 'error',
            message: error.message
        });
    }

    performanceMonitor.end();
}

// =============== 輔助函數 ===============

// >>> 網格管理 <<<
function addAllParticleToGrid(Types, cellSize, canvasWidth, canvasHeight) {
    // --初始化性能計數器--
    performanceData.gridResetAndAddCountsTimes = 0;
    
    checkIfParticleIsOutOfBounds();
    
    // --創建網格數組--
    let multiGrids = [];
    
    // --為每種類型的粒子創建網格--
    for (let i = 0; i < Types; i++) {
            // 創建多線程網格
            multiGrids[i] = new MultithreadGrid(
                cellSize,
                canvasWidth,
                canvasHeight,
                particleGroups[i].length
            );
            
            // 創建並初始化 ParticleData
            const particleData = new ParticleData(particleGroups[i].length);
            multiGrids[i].particleData = particleData;
            
            // --遍歷粒子組--
            particleGroups[i].forEach((p, index) => {
                multiGrids[i].add(p, index);
                particleData.add(p, index);
                performanceData.gridResetAndAddCountsTimes++;
        });
    }
    return multiGrids;
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
        // 如果性能不佳,調整策略
        if (isUsingMultithread) {
            // 暫無
        }
        // 使用網格
        else if (isUsingGrid) {
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

// =============== 多線程類別定義 ===============

// --SharedMemoryManager類處理所有共享內存的分配和管理--
class SharedMemoryManager {
    constructor(totalParticles, gridConfig = null) {
        this.totalParticles = totalParticles;
        this.buffers = {};
        this.views = {};
        
        // 計算所需的緩衝區大小
        const particleDataSize = totalParticles * 4 * Int32Array.BYTES_PER_ELEMENT;
        
        // 如果提供了網格配置，計算網格緩衝區大小
        let gridBufferSize = 0;
        if (gridConfig) {
            const { width, height, cellSize } = gridConfig;
            const totalCells = Math.ceil(width / cellSize) * Math.ceil(height / cellSize);
            const maxParticlesPerCell = Math.ceil(Math.sqrt(totalParticles)); // 估算每個單元格的最大粒子數
            gridBufferSize = totalCells * (1 + maxParticlesPerCell) * Int32Array.BYTES_PER_ELEMENT;
        }

        // 創建緩衝區
        this.buffers = {
            particleData: new SharedArrayBuffer(particleDataSize),
            cells: new SharedArrayBuffer(gridBufferSize || 1024), // 如果沒有網格配置，使用最小值
            nearby: new SharedArrayBuffer(totalParticles * Int32Array.BYTES_PER_ELEMENT),
            offsetsX: new SharedArrayBuffer(totalParticles * Float32Array.BYTES_PER_ELEMENT),
            offsetsY: new SharedArrayBuffer(totalParticles * Float32Array.BYTES_PER_ELEMENT),
            sync: new SharedArrayBuffer(4)
        };

        // 初始化視圖
        this.views = {
            particleData: new Int32Array(this.buffers.particleData),
            cells: new Int32Array(this.buffers.cells),
            nearby: new Int32Array(this.buffers.nearby),
            offsetsX: new Float32Array(this.buffers.offsetsX),
            offsetsY: new Float32Array(this.buffers.offsetsY),
            sync: new Int32Array(this.buffers.sync)
        };
    }

    getBuffer(name) {
        return this.buffers[name];
    }

    getView(name) {
        return this.views[name];
    }

    clear() {
        Object.values(this.views).forEach(view => {
            view.fill(0);
        });
    }
}

class ParticleData {
    constructor(ParticlesCount) {
        this.particleData = {
            x: new Int32Array(this.sharedMemory.getBuffer('particleData'), 0, ParticlesCount),
            y: new Int32Array(this.sharedMemory.getBuffer('particleData'), ParticlesCount * Int32Array.BYTES_PER_ELEMENT, ParticlesCount),
            vx: new Int32Array(this.sharedMemory.getBuffer('particleData'), 2 * ParticlesCount * Int32Array.BYTES_PER_ELEMENT, ParticlesCount),
            vy: new Int32Array(this.sharedMemory.getBuffer('particleData'), 3 * ParticlesCount * Int32Array.BYTES_PER_ELEMENT, ParticlesCount)
        };
        this.syncCounter = this.sharedMemory.getView('sync');
    }

    add(particle, index) {
        storeAtomicFloat(this.particleData.x, index, particle.x);
        storeAtomicFloat(this.particleData.y, index, particle.y);
        storeAtomicFloat(this.particleData.vx, index, particle.vx);
        storeAtomicFloat(this.particleData.vy, index, particle.vy);
    }

    clear() {
        this.sharedMemory.clear();
    }

    getData() {
        return this.particleData;
    }

    getSyncCounter() {
        return this.syncCounter;
    }
}

// --MultithreadGrid類處理多線程環境下的粒子網格計算--
class MultithreadGrid {
    constructor(cellSize, width, height, particleCount) {
        // 基本屬性初始化
        this.cellSize = cellSize;
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.width = Math.ceil(width / cellSize);
        this.height = Math.ceil(height / cellSize);
        
        // 計算每個網格的最大粒子數
        const CIRCLE_PACKING_DENSITY = 0.9069;
        const cellArea = cellSize * cellSize;
        const particleArea = Math.PI * ballRadius * ballRadius;
        const theoreticalMaxParticles = Math.floor((cellArea * CIRCLE_PACKING_DENSITY) / particleArea);
        this.MAX_PARTICLES_PER_CELL = Math.max(50, Math.ceil(theoreticalMaxParticles * 1.5));
        
        // 創建共享內存管理器
        this.sharedMemory = new SharedMemoryManager(particleCount, {
            width,
            height,
            cellSize
        });
        
        // 初始化網格數據
        const totalCells = this.width * this.height;
        this.cells = {
            count: new Int32Array(this.sharedMemory.getBuffer('cells'), 0, totalCells),
            particles: new Int32Array(
                this.sharedMemory.getBuffer('cells'),
                totalCells * Int32Array.BYTES_PER_ELEMENT,
                totalCells * this.MAX_PARTICLES_PER_CELL
            )
        };

        // 初始化緩存
        this.nearbyCache = new Int32Array(this.sharedMemory.getBuffer('nearby'));
        this.offsetsX = new Float32Array(this.sharedMemory.getBuffer('offsetsX'));
        this.offsetsY = new Float32Array(this.sharedMemory.getBuffer('offsetsY'));
        this.offsetsCache = 0;
        
        // 同步計數器
        this.syncCounter = this.sharedMemory.getView('sync');
    }

    add(particle, index) {
        // -- 計算網格索引 --
        const cellX = Math.floor(particle.x / this.cellSize);
        const cellY = Math.floor(particle.y / this.cellSize);
        
        // -- 更新粒子網格位置 --
        particle.gridX = cellX;
        particle.gridY = cellY;
        
        // -- 檢查並添加到網格 --
        if (cellX >= 0 && cellX < this.width && cellY >= 0 && cellY < this.height) {
            const cellIndex = cellY * this.width + cellX;
            const count = Atomics.add(this.cells.count, cellIndex, 1);
            
            if (count >= this.MAX_PARTICLES_PER_CELL) {
                Atomics.sub(this.cells.count, cellIndex, 1);
                console.warn('Cell capacity exceeded:', {cellX, cellY, count, maxParticles: this.MAX_PARTICLES_PER_CELL});
                return false;
            }

            try {
                const storeIndex = cellIndex * this.MAX_PARTICLES_PER_CELL + count;
                Atomics.store(this.cells.particles, storeIndex, index);
                return true;
            } catch (error) {
                Atomics.sub(this.cells.count, cellIndex, 1);
                console.error('Failed to store particle:', error);
                return false;
            }
        }
        return false;
    }

    clear() {
        // --重置網格狀態--
        Atomics.store(this.syncCounter, 0, 0);               // 重置同步計數器
        for (let i = 0; i < this.cells.count.length; i++) {
            Atomics.store(this.cells.count, i, 0);           // 重置每個單元的粒子計數
        }
    }

    getNearbyParticles(gridX, gridY, radius, isThrough = false) {
        // --初始化搜索參數--
        const radiusCells = Math.ceil(radius / this.cellSize);    // 計算搜索半徑覆蓋的網格單元數
        const centerCellX = gridX;    // 使用傳入的網格座標
        const centerCellY = gridY;    // 使用傳入的網格座標
        
        this.offsetsCache = 0;    // 重置偏移量緩存計數器

        // --處理穿透邊界的情況--
        if (isThrough) {
            const radiusCellsPlus1point5Squared = (radiusCells + 1.5) * (radiusCells + 1.5);
            radiusCells += this.isNotGridPerfectlyFit;

            for (let dy = -radiusCells; dy <= radiusCells; dy++) {
                const dySquared = dy * dy;
                const actualY = dy + centerCellY;
                const wrappedGridY = ((actualY % this.height) + this.height) % this.height;
                const baseIndex = wrappedGridY * this.width;

                for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                    if (dx * dx + dySquared > radiusCellsPlus1point5Squared) continue;

                    const actualX = dx + centerCellX;
                    const wrappedGridX = ((actualX % this.width) + this.width) % this.width;
                    
                    const cellIndex = baseIndex + wrappedGridX;
                    const particleCount = Atomics.load(this.cells.count, cellIndex);

                    if (particleCount > 0) {
                        const offsetX = (actualX < 0 || actualX >= this.width) ? 
                            (actualX < 0 ? -1 : 1) * this.canvasWidth : 0;
                        const offsetY = (actualY < 0 || actualY >= this.height) ? 
                            (actualY < 0 ? -1 : 1) * this.canvasHeight : 0;

                        for (let i = 0; i < particleCount; i++) {
                            const particleIndex = Atomics.load(
                                this.cells.particles,
                                cellIndex * this.MAX_PARTICLES_PER_CELL + i
                            );
                            this.nearbyCache[this.offsetsCache] = particleIndex;
                            this.offsetsX[this.offsetsCache] = offsetX;
                            this.offsetsY[this.offsetsCache] = offsetY;
                            this.offsetsCache++;
                        }
                    }
                }
            }
        } else {
            // --處理不穿透邊界的情況--
            const startX = Math.max(0, centerCellX - radiusCells);
            const endX = Math.min(this.width - 1, centerCellX + radiusCells);
            const startY = Math.max(0, centerCellY - radiusCells);
            const endY = Math.min(this.height - 1, centerCellY + radiusCells);
            const radiusSquared = radiusCells * radiusCells;

            for (let y = startY; y <= endY; y++) {
                const dy = y - centerCellY;
                const dySquared = dy * dy;
                const baseIndex = y * this.width;

                for (let x = startX; x <= endX; x++) {
                    const dx = x - centerCellX;
                    if (dx * dx + dySquared > radiusSquared) continue;

                    const cellIndex = baseIndex + x;
                    const particleCount = Atomics.load(this.cells.count, cellIndex);

                    if (particleCount > 0) {
                        for (let i = 0; i < particleCount; i++) {
                            const particleIndex = Atomics.load(
                                this.cells.particles,
                                cellIndex * this.MAX_PARTICLES_PER_CELL + i
                            );
                            this.nearbyCache[this.offsetsCache] = particleIndex;
                            this.offsetsX[this.offsetsCache] = 0;
                            this.offsetsY[this.offsetsCache] = 0;
                            this.offsetsCache++;
                        }
                    }
                }
            }
        }

        return {
            particles: this.nearbyCache,
            offsetCount: this.offsetsCache,
            offsetsX: this.offsetsX,
            offsetsY: this.offsetsY
        };
    }
}

// >>> 多線程初始化 <<<
async function initializeMultithreadSystem() {
    try {
        // 初始化共享內存
        const totalParticles = particleCounts.reduce((a, b) => a + b, 0);
        sharedMemory = new SharedMemoryManager(totalParticles, {
            width: canvas.width,
            height: canvas.height,
            cellSize: cellSize
        });

        // 初始化工作線程池
        await initializeWorkerPool();
        
        console.log('Multithreading system initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize multithreading system:', error);
        throw error;
    }
}

// 初始化單個工作線程
function initializeWorker() {
    return new Promise((resolve, reject) => {
        // 檢查必要的全局變量
        if (!particleGrids || !particleTypes || !ballRadius) {
            reject(new Error('必要的初始化參數缺失'));
            return;
        }

        const worker = new Worker('particleCalculator.js',
            {
                sharedMemory: {
                    particleData: sharedMemory.getBuffer('particleData'),
                    cells: sharedMemory.getBuffer('cells'),
                    nearby: sharedMemory.getBuffer('nearby'),
                    offsetsX: sharedMemory.getBuffer('offsetsX'),
                    offsetsY: sharedMemory.getBuffer('offsetsY'),
                    sync: sharedMemory.getBuffer('sync')
                }
            }
        );

        // 設置初始化超時
        const timeout = setTimeout(() => {
            worker.terminate(); // 終止超時的worker
            reject(new Error('Worker 初始化超時'));
        }, 5000);

        // 處理worker消息
        worker.onmessage = function(e) {
            if (e.data.type === 'initComplete') {
                clearTimeout(timeout);
                if (e.data.status === 'success') {
                    console.log('Worker 初始化成功');
                    resolve(worker);
                } else {
                    worker.terminate();
                    reject(new Error(e.data.error || 'Worker 初始化失敗'));
                }
            } else if (e.data.type === 'calculateComplete') {
                performanceData.calcCount += e.data.calcCount;
                performanceData.skippedCount += e.data.skippedCount;
            } else if (e.data.type === 'error') {
                console.error('Worker 錯誤:', e.data.message);
                // 不要在這裡 reject，因為這可能是運行時錯誤
            }
        };

        // 處理worker錯誤
        worker.onerror = function(error) {
            clearTimeout(timeout);
            console.error('Worker 創建錯誤:', error);
            worker.terminate();
            reject(error);
        };

        // 處理worker終止
        worker.onmessageerror = function(error) {
            clearTimeout(timeout);
            console.error('Worker 消息錯誤:', error);
            worker.terminate();
            reject(error);
        };

        try {
            // 發送初始化消息
            worker.postMessage({
                type: 'initSharedMemory',
                grid: particleGrids,
                particleTypes: particleTypes,
                ballRadius: ballRadius,
            });
            console.log('Worker 初始化消息已發送');
        } catch (error) {
            clearTimeout(timeout);
            worker.terminate();
            reject(new Error('發送初始化消息失敗: ' + error.message));
        }
    });
}

// 添加atomicFloat輔助函數
function storeAtomicFloat(array, index, value) {
    return Atomics.store(array, index, Math.round(value * 1000));
}

function loadAtomicFloat(array, index) {
    return Atomics.load(array, index) / 1000;
}

// >>> 多線程初始化 <<<
async function initializeWorkerPool() {
    const numWorkers = navigator.hardwareConcurrency || 4;
    workerPool = new Array(numWorkers);
    
    for (let i = 0; i < numWorkers; i++) {
        workerPool[i] = new Worker('particleWorker.js');
    }
}

// 工作線程初始化
async function initializeWorker(worker) {
    return new Promise((resolve, reject) => {
        worker.postMessage({
            type: 'initSharedMemory',
            sharedMemory: sharedMemory.getBuffers(),
            grid: grid,
            particleTypes: particleTypes,
            ballRadius: ballRadius,
            canvas: {
                width: canvas.width,
                height: canvas.height
            }
        });

        worker.onmessage = (e) => {
            if (e.data.type === 'initComplete') {
                if (e.data.status === 'success') {
                    resolve();
                } else {
                    reject(new Error(e.data.error));
                }
            }
        };
    });
}

// =============== 工作線程池管理 ===============
// --終止工作線程池--
function terminateWorkerPool() {
    // --是否存在工作線程池--
    if (workerPool) {
        workerPool.forEach(worker => worker.terminate()); // 終止工作線程
        workerPool = []; // 清空工作線程池
    }
}

// =============== 粒子規則函數 ===============

// >>> 多線程計算實現 <<<
async function rule_grid_multithread(types) {
    const startTime = performance.now();
    performanceData.gAffectCalcCountsTimes = 0;
    performanceData.particleSkippedCountsTimes = 0;

    try {
        if (isUsingGrid) {
            // 使用網格模式的計算邏輯
            const promises = [];
            for (let i = 0; i < types; i++) {
                const particleCount = particleGroups[i].length;
                const workersNeeded = Math.min(workerPool.length, Math.ceil(particleCount / minParticlesPerWorker));
                
                if (workersNeeded > 0 && particleCount > 0) {
                    const particlesPerWorker = Math.ceil(particleCount / workersNeeded);
                    
                    for (let j = 0; j < workersNeeded; j++) {
                        const startIndex = j * particlesPerWorker;
                        const endIndex = Math.min(startIndex + particlesPerWorker, particleCount);
                        
                        if (startIndex < endIndex) {
                            promises.push(new Promise((resolve, reject) => {
                                const worker = workerPool[j];
                                worker.postMessage({
                                    type: 'calculate',
                                    startIndex,
                                    endIndex,
                                    particleType: i,
                                    forceMatrix,
                                    distanceMatrix,
                                    isThrough,
                                    currentDt: currentDt,
                                    frictionFactor
                                });
                                
                                worker.onmessage = (e) => {
                                    if (e.data.type === 'calculateComplete') {
                                        performanceData.gAffectCalcCountsTimes += e.data.calcCount;
                                        performanceData.particleSkippedCountsTimes += e.data.skippedCount;
                                        resolve();
                                    } else if (e.data.type === 'error') {
                                        reject(new Error(e.data.message));
                                    }
                                };
                            }));
                        }
                    }
                }
            }
            await Promise.all(promises);
        } else {
            // 直接模式的計算邏輯
            const promises = [];
            for (let i = 0; i < types; i++) {
                const particleCount = particleGroups[i].length;
                const workersNeeded = Math.min(workerPool.length, Math.ceil(particleCount / minParticlesPerWorker));
                
                if (workersNeeded > 0 && particleCount > 0) {
                    const particlesPerWorker = Math.ceil(particleCount / workersNeeded);
                    
                    for (let j = 0; j < workersNeeded; j++) {
                        const startIndex = j * particlesPerWorker;
                        const endIndex = Math.min(startIndex + particlesPerWorker, particleCount);
                        
                        if (startIndex < endIndex) {
                            promises.push(new Promise((resolve, reject) => {
                                const worker = workerPool[j];
                                worker.postMessage({
                                    type: 'calculateDirect',
                                    startIndex,
                                    endIndex,
                                    particleType: i,
                                    forceMatrix,
                                    distanceMatrix,
                                    isThrough,
                                    currentDt: currentDt,
                                    frictionFactor
                                });
                                
                                worker.onmessage = (e) => {
                                    if (e.data.type === 'calculateDirectComplete') {
                                        performanceData.gAffectCalcCountsTimes += e.data.calcCount;
                                        performanceData.particleSkippedCountsTimes += e.data.skippedCount;
                                        resolve();
                                    } else if (e.data.type === 'error') {
                                        reject(new Error(e.data.message));
                                    }
                                };
                            }));
                        }
                    }
                }
            }
            await Promise.all(promises);
        }
    } catch (error) {
        console.error('Error in rule_grid_multithread:', error);
        throw error;
    }

    performanceData.gAffectCalcTime = performance.now() - startTime;
}

async function rule_direct_multithread(types) {
    const startTime = performance.now();
    performanceData.gAffectCalcCountsTimes = 0;
    performanceData.particleSkippedCountsTimes = 0;

    try {
        if (isUsingGrid) {
            // 使用網格模式的計算邏輯
            const promises = [];
            for (let i = 0; i < types; i++) {
                const particleCount = particleGroups[i].length;
                const workersNeeded = Math.min(workerPool.length, Math.ceil(particleCount / minParticlesPerWorker));
                
                if (workersNeeded > 0 && particleCount > 0) {
                    const particlesPerWorker = Math.ceil(particleCount / workersNeeded);
                    
                    for (let j = 0; j < workersNeeded; j++) {
                        const startIndex = j * particlesPerWorker;
                        const endIndex = Math.min(startIndex + particlesPerWorker, particleCount);
                        
                        if (startIndex < endIndex) {
                            promises.push(new Promise((resolve, reject) => {
                                const worker = workerPool[j];
                                worker.postMessage({
                                    type: 'calculateDirect',
                                    startIndex,
                                    endIndex,
                                    particleType: i,
                                    forceMatrix,
                                    distanceMatrix,
                                    isThrough,
                                    currentDt: currentDt,
                                    frictionFactor
                                });
                                
                                worker.onmessage = (e) => {
                                    if (e.data.type === 'calculateDirectComplete') {
                                        performanceData.gAffectCalcCountsTimes += e.data.calcCount;
                                        performanceData.particleSkippedCountsTimes += e.data.skippedCount;
                                        resolve();
                                    } else if (e.data.type === 'error') {
                                        reject(new Error(e.data.message));
                                    }
                                };
                            }));
                        }
                    }
                }
            }
            await Promise.all(promises);
        } else {
            // 直接模式的計算邏輯
            const promises = [];
            for (let i = 0; i < types; i++) {
                const particleCount = particleGroups[i].length;
                const workersNeeded = Math.min(workerPool.length, Math.ceil(particleCount / minParticlesPerWorker));
                
                if (workersNeeded > 0 && particleCount > 0) {
                    const particlesPerWorker = Math.ceil(particleCount / workersNeeded);
                    
                    for (let j = 0; j < workersNeeded; j++) {
                        const startIndex = j * particlesPerWorker;
                        const endIndex = Math.min(startIndex + particlesPerWorker, particleCount);
                        
                        if (startIndex < endIndex) {
                            promises.push(new Promise((resolve, reject) => {
                                const worker = workerPool[j];
                                worker.postMessage({
                                    type: 'calculateDirect',
                                    startIndex,
                                    endIndex,
                                    particleType: i,
                                    forceMatrix,
                                    distanceMatrix,
                                    isThrough,
                                    currentDt: currentDt,
                                    frictionFactor
                                });
                                
                                worker.onmessage = (e) => {
                                    if (e.data.type === 'calculateDirectComplete') {
                                        performanceData.gAffectCalcCountsTimes += e.data.calcCount;
                                        performanceData.particleSkippedCountsTimes += e.data.skippedCount;
                                        resolve();
                                    } else if (e.data.type === 'error') {
                                        reject(new Error(e.data.message));
                                    }
                                };
                            }));
                        }
                    }
                }
            }
            await Promise.all(promises);
        }
    } catch (error) {
        console.error('Error in rule_direct_multithread:', error);
        throw error;
    }

    performanceData.gAffectCalcTime = performance.now() - startTime;
}

async function rule_update_multithread(types) {
    const startTime = performance.now();
    performanceData.positionUpdateCountsTimes = 0;

    try {
        const promises = [];
        for (let i = 0; i < types; i++) {
            const particleCount = particleGroups[i].length;
            const workersNeeded = Math.min(workerPool.length, Math.ceil(particleCount / minParticlesPerWorker));
            
            if (workersNeeded > 0 && particleCount > 0) {
                const particlesPerWorker = Math.ceil(particleCount / workersNeeded);
                
                for (let j = 0; j < workersNeeded; j++) {
                    const startIndex = j * particlesPerWorker;
                    const endIndex = Math.min(startIndex + particlesPerWorker, particleCount);
                    
                    if (startIndex < endIndex) {
                        promises.push(new Promise((resolve, reject) => {
                            const worker = workerPool[j];
                            worker.postMessage({
                                type: 'positionUpdate',
                                startIndex,
                                endIndex,
                                particleType: i,
                                currentDt: dt,
                                frictionFactor,
                                isThrough
                            });
                            
                            worker.onmessage = (e) => {
                                if (e.data.type === 'positionUpdateComplete') {
                                    performanceData.positionUpdateCountsTimes++;
                                    resolve();
                                } else if (e.data.type === 'error') {
                                    reject(new Error(e.data.message));
                                }
                            };
                        }));
                    }
                }
            }
        }
        await Promise.all(promises);
    } catch (error) {
        console.error('Error in rule_update_multithread:', error);
        throw error;
    }

    performanceData.positionUpdateTime = performance.now() - startTime;
}
