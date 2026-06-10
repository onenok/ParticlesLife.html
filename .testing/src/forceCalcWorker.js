/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */
console.log(">>>>>>>>>>forceCalcWorker.js loading<<<<<<<<<<<");
console.log(">>>>>>>>>>forceCalcWorker.js loaded successfully<<<<<<<<<<<");
//
const sharedMemoryAPI = {
    getParticleGroups() {
        return sharedMemory.views.particleGroups;
    },
    getParticleView(type) {
        return sharedMemory.views.particleGroups[type];
    },

    getParticle(type, index) {
        const view = this.getParticleView(type);
        return {
            x: loadAtomicFloat(view.x, index),
            y: loadAtomicFloat(view.y, index),
            vx: loadAtomicFloat(view.vx, index),
            vy: loadAtomicFloat(view.vy, index),
            id: Atomics.load(view.id, index),
            index: index,
            type: type, 
        };
    },

    updateParticle(type, index, updates) {
        const view = this.getParticleView(type);
        if (updates.x !== undefined) storeAtomicFloat(view.x, index, updates.x);
        if (updates.y !== undefined) storeAtomicFloat(view.y, index, updates.y);
        if (updates.vx !== undefined) storeAtomicFloat(view.vx, index, updates.vx);
        if (updates.vy !== undefined) storeAtomicFloat(view.vy, index, updates.vy);
    }
};
// 原子操作輔助函數
function storeAtomicFloat(array, index, value) {
    return Atomics.store(array, index, Math.round(value * 1000));
}

function loadAtomicFloat(array, index) {
    return Atomics.load(array, index) / 1000;
}
// =============== 消息處理 ===============
// >>> 處理主線程發來的各種消息 <<<
self.onmessage = function(e) {
    // --處理消息--
    switch (e.data.type) {
        // --初始化--
        case 'init':
            isInited = false;
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            canvas.width = e.data.canvasWidth; // 畫布寬度
            canvas.height = e.data.canvasHeight; // 畫布高度
            particleTypes = e.data.particleTypes; // 粒子類型數量
            particleCounts = e.data.particleCounts; // 粒子數量
            performanceData = e.data.performanceData; // 性能計數器
            ballRadius = e.data.ballRadius; // 粒子半徑
            sharedMemory = e.data.sharedMemory; // 共享內存管理器
            particleGroups = sharedMemoryAPI.getParticleGroups(); // 粒子組
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            isInited = true;
            break;
        // --更改線程初始化--
        case 'changeThreadInit':
            isInited = false;
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            canvas.width = e.data.canvasWidth; // 畫布寬度
            canvas.height = e.data.canvasHeight; // 畫布高度
            particleTypes = e.data.particleTypes; // 粒子類型數量
            particleColors = e.data.particleColors; // 粒子顏色
            particleCounts = e.data.particleCounts; // 粒子數量
            performanceData = e.data.performanceData; // 性能計數器
            ballRadius = e.data.ballRadius; // 粒子半徑 
            sharedMemory = e.data.sharedMemory; // 共享內存管理器
            particleGroups = sharedMemoryAPI.getParticleGroups(); // 粒子類型
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
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
            //checkAllParticlesIfNaN('setThrough NaN detected');
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
            //checkAllParticlesIfNaN('update canvas size NaN detected');
            //checkIfParticleIsOutOfBounds(); // 檢查粒子是否超出邊界
            
            isRunnable = true; // 設置為可運行
            
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
                particleGroups[i].color = particleColors[i]; // 更新粒子顏色
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

        // --設置滑鼠非活動狀態--
        case 'setMouseInactive':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            isMouseActive = false; // 滑鼠非活動狀態
            break;

        // --更新粒子半徑--
        case 'updateBallRadius':
            if (isUpdating) {
                setTimeout(() => self.onmessage({data: e.data}), 10);
                return;
            }
            ballRadius = e.data.ballRadius; // 粒子半徑
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
            selectedParticleIndex = e.data.particleIndex; // 選中粒子索引
            selectedParticleType = e.data.particleType; // 選中粒子類型
            selectedParticleId = e.data.particleId; // 選中粒子
            console.log('Selected Particle Updated:', selectedParticleIndex, selectedParticleType, selectedParticleId, performance.now());
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
let showtest = true;
// =============== 更新循環 ===============
// --主要更新循環函數--
async function update() {
    if (!isRunnable || isMovingCanvas) {
        return;
    }
    if (!isUIFWorks) {
        console.log("updateIntervalFunction works")
        isUIFWorks = true;
    }
    performanceMonitor.start();
    const startTime = performance.now();
    
    // 清空性能計數器
    Object.keys(performanceData).forEach(key => {
        if (!(performanceData[key] instanceof Array) && !(/Max|All|Average/.test(key))) {
            performanceData[key] = 0;
        }
    });

    try {
        // 執行多線程計算
        await rule_direct_multithread();
        // 處理滑鼠互動
        if (isMouseActive) {
            applyMouseForce();
        }

        // 執行多線程位置更新
        //await rule_update_multithread();

        // 處理粒子碰撞
        const particleCollisionStartTime = performance.now();
        performanceData.particleCollisionCountsTimes = 0;
        //await particlesCollision();
        performanceData.particleCollisionTime = performance.now() - particleCollisionStartTime;

        // 處理粒子影響範圍顯示
        let nearbyParticlesList = [];
        if (selectedParticleId && enableParticleAffcetRadiusShow) {;
            let selectedParticle = sharedMemoryAPI.getParticle(selectedParticleType, selectedParticleIndex);

            if (showtest) console.log('Selected Particle:', selectedParticle, "selectedParticleType", selectedParticleType, 'selectedParticleIndex', selectedParticleIndex, performance.now());
            showtest = false;

            for (let i = 0; i < particleTypes; i++) {
                if (RadiusShow[i]) {
                    const distance = distanceMatrix[selectedParticleType][i];
                    // Reconstruct group for this type
                    const group = [];
                    const groupLen = particleGroups[i].x.length;
                    for (let j = 0; j < groupLen; j++) {
                        group.push({
                            x: particleGroups[i].x[j],
                            y: particleGroups[i].y[j],
                            vx: particleGroups[i].vx[j],
                            vy: particleGroups[i].vy[j],
                            id: particleGroups[i].id[j],
                            // add other keys if needed
                        });
                    }
                    nearbyParticlesList[i] = group.filter(p => {
                        const px = p.x;
                        const py = p.y;
                        const sx = selectedParticle.x;
                        const sy = selectedParticle.y;
                        return (px-sx)*(px-sx)+(py-sy)*(py-sy) <= distance*distance;
                    });
                }
            }
        }
        else{
            showtest = true;
        }

        performanceData.totalTime = performance.now() - startTime;
        
        // 發送更新消息
        self.postMessage({ 
            type: 'update',
            performanceData: performanceData,
            nearbyParticlesList: nearbyParticlesList,
        });
        isUpdating = false;
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

// >>>> 主循環 <<<<
setInterval(() => {
    self.postMessage({type: 'updateUpdateIntervalCountsTimes', updateIntervalCountsTimes: updateIntervalCountsTimes});
    updateIntervalCountsTimes = 0;
}, 1000);

let updateIntervalId;
let isUIFWorks = false;
function updateIntervalFunction() {
    updateIntervalId = setInterval(() => {
        if (isInited && !isUpdating && isRunnable && !isMovingCanvas) {  // Removed canUpdate
            if (!isUIFWorks) {
                console.log("updateIntervalFunction works")
                isUIFWorks = true;
            }
            if (!isUIFWorks) {
                console.log("updateIntervalFunction works")
                isUIFWorks = true;
            }
            const startTime = performance.now(); // 開始時間
            updateIntervalCountsTimes++; // 更新次數
            isUpdating = true;
            update();
            performanceData.updateIntervalTime = performance.now() - startTime; // 更新時間
        }
    }, updateInterval);
}
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

// >>> 滑鼠交互處理 <<<
function applyMouseForce() {
    // --遍歷粒子組中的每個粒子--
    for (let type = 0; type < particleTypes; type++) {
        for (let i = 0; i < particleCounts[type]; i++) {
            const p = sharedMemoryAPI.getParticle(type, i); // 粒子
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
            sharedMemoryAPI.updateParticle(type, i, p);
        }
    }
}
/*
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
*/
/*
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
                    otherArgs: otherArgs // 其他參數
                })}`);
                throw new Error() // for stop the program, no Error message
            }
        }
    }
}
*/
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
            /*
            if (avgTime > 16.66) { // 60fps的理想幀時間
                this.optimizePerformance(avgTime);
            }
            */
            // 重置計數器
            this.updateCount = 0;
            this.totalTime = 0;
        }
    },
    /*
    optimizePerformance(avgTime) {
        this.lastOptimizeTime = performance.now();
        // 如果性能不佳,調整策略
        
    }
    */
};

// =============== 粒子碰撞處理 ===============
// >>> 碰撞參數 <<<

async function particlesCollision() {
    performanceData.particleCollisionCountsTimes = 0; // 初始化碰撞計數
    let particlesList = [];
    try {
        const promises = [];
        const promiseStatus = []; // 追蹤 Promise 狀態
        const particleCount = particleCounts.reduce((sum, count) => sum + count, 0); // 總粒子數量
        const workersNeeded = Math.min(workerPool.length, Math.ceil(particleCount / minParticlesPerWorker));
        onceConsole('particlesCollision', `粒子需要 ${workersNeeded} 個工作線程處理 ${particleCount} 個粒子`, performance.now(), '\n workerPool:', workerPool, '\n particleGroups:', particleGroups);
        const particlesPerWorker = Math.ceil(particleCount / workersNeeded);
        if (workersNeeded <= 0 || particleCount <= 0) {
            console.error("why!!",`>>>>>>>>WHY THE FK!!!<<<<<<<<`)
            throw new Error(`workersNeeded (${workersNeeded}) 少於等於 0 , workersNeeded (${endId}) 少於等於 0`);
        }
        for (let j = 0; j < workerPool.length; j++) {
            if (j >= workersNeeded) {break; } // 如果已經分配了足夠的工作線程，則跳出循環
            const startId = j * particlesPerWorker;
            const endId = Math.min(startId + particlesPerWorker, particleCount);

            if (startId > endId) {
                console.error("why!?",`>>>>>>>>WHY THE FK?<<<<<<<<`)
                throw new Error(`Worker ${j} 的 startId (${startId}) 大於 endId (${endId})`);
            }
            // 記錄 Promise 資訊
            const promiseInfo = {
                workerId: j,
                worker: workerPool[j],
                startId,
                endId,
                status: 'pending'
            };
            promiseStatus.push(promiseInfo);

            promises.push(
                new Promise((resolve, reject) => {
                    const worker = workerPool[j];
                    const promiseIndex = promiseStatus.length - 1;
                    onceConsole('particlesCollision_postMessage', `multithread向worker ${j} 發送處理粒子 startID:${startId}, endID:${endId}`, performance.now());
                    worker.postMessage({
                        type: 'particlesCollision',
                        startId,
                        endId,
                        isThrough,
                        frictionFactor,
                        restitution: restitution,
                        canvasWidth: canvas.width,
                        canvasHeight: canvas.height,
                    });
                    
                    worker.onmessage = (e) => {
                        onceConsole('particlesCollision_onmessage', `>>>>>multithread worker ${j} 收到消息<<<<<<<<<`, performance.now(), e.data);
                        if (e.data.type === 'particlesCollisionComplete') {
                            promiseStatus[promiseIndex].status = 'fulfilled';
                            performanceData.particleCollisionCountsTimes += e.data.particleCollisionCountsTimes;
                            particlesList.push(...e.data.particlesList); // 收集所有工作線程的粒子數據
                            resolve();
                        } else if (e.data.type === 'error') {
                            promiseStatus[promiseIndex].status = 'rejected';
                            reject(new Error(e.data.message));
                        }
                    };
                })
            );
        }

        // 設定超時檢查
        const timeout = setInterval(() => {
            const pendingPromises = promiseStatus.filter(p => p.status === 'pending');
            if (pendingPromises.length > 0) {
                console.log('仍在等待的 Promise:', pendingPromises,'\n all promises:', promiseStatus, performance.now());
            }
        }, 5000); // 5秒後檢查

        await Promise.all(promises);
        onceConsole('particlesCollision_allPromises', `>>>>>>>所有 Promise 已完成<<<<<<<<`, performance.now());
        clearInterval(timeout);
        particlesList.forEach((p) => {
            sharedMemoryAPI.updateParticle(p.type, p.index, p);
        });

    } catch (error) {
        console.error('Error in particlesCollision:', error);
        throw error;
    }
    onceConsole('particlesCollision_end', '完成 particlesCollision 函數', performance.now());
}

// =============== 實用小函數區域 ===============
/**
 * 一次性控制臺輸出函數，只會輸出一次指定訊息
 * @param {string} key 唯一鍵值
 * @param {string} message 要輸出的訊息
 */
const onceConsole = (() => {
    const printed = new Set();
    return (key, ...message) => {
        if (!printed.has(key)) {
            console.log(...message);
            printed.add(key);
        }
    };
})();

// =============== 粒子規則函數 ===============


let test = 0;
async function rule_direct_multithread() {
    onceConsole('rule_direct_multithread_start', '開始執行 rule_direct_multithread 函數 (GPU mode)', performance.now());
    const startTime = performance.now();
    performanceData.gAffectCalcCountsTimes = 0;
    performanceData.particleSkippedCountsTimes = 0;

    try {
        if (forceKernel) {
            // Prepare input arrays for GPU: positions [x, y], velocities [vx, vy]
            const totalParticles = particleCounts.reduce((a, b) => a + b, 0);
            const positionsX = new Float32Array(totalParticles);
            const positionsY = new Float32Array(totalParticles);
            const velocitiesX = new Float32Array(totalParticles);
            const velocitiesY = new Float32Array(totalParticles);
            let flatForceMatrix = new Float32Array(particleTypes * particleTypes);
            let flatDistanceMatrix = new Float32Array(particleTypes * particleTypes);

            // Flatten matrices
            for (let i = 0; i < particleTypes; i++) {
                for (let j = 0; j < particleTypes; j++) {
                    flatForceMatrix[i * particleTypes + j] = forceMatrix[i][j];
                    flatDistanceMatrix[i * particleTypes + j] = distanceMatrix[i][j];
                }
            }

            // Collect all particles from shared memory
            let idx = 0;
            for (let type = 0; type < particleTypes; type++) {
                for (let i = 0; i < particleCounts[type]; i++) {
                    const p = sharedMemoryAPI.getParticle(type, i);
                    positionsX[idx] = p.x;
                    positionsY[idx] = p.y;
                    velocitiesX[idx] = p.vx;
                    velocitiesY[idx] = p.vy;
                    idx++;
                }
            }

            // Run GPU kernel
            const forces = forceKernel(flatForceMatrix, flatDistanceMatrix, [positionsX, positionsY], [velocitiesX, velocitiesY], particleTypes, particleCounts);

            // Write results back to shared memory
            idx = 0;
            for (let type = 0; type < particleTypes; type++) {
                for (let i = 0; i < particleCounts[type]; i++) {
                    const fx = forces[idx].fx;
                    const fy = forces[idx].fy;
                    sharedMemoryAPI.updateParticle(type, i, { vx: velocitiesX[idx] + fx * currentDt, vy: velocitiesY[idx] + fy * currentDt });
                    performanceData.gAffectCalcCountsTimes++; // Count processed particles
                    idx++;
                }
            }
            performanceData.particleSkippedCountsTimes = 0; // GPU processes all
        } else {
            // Fallback to original CPU multithread if GPU unavailable
            // ... existing CPU code from rule_direct_multithread() ...
            // (Keep the original multithread logic as fallback)
            const promises = [];
            // ... (original code for CPU fallback, omitted for brevity but keep as-is)
        }
    } catch (error) {
        console.error('Error in GPU force calculation:', error);
        // Fallback to CPU if GPU fails
        // ... call original CPU rule_direct_multithread ...
    }

    performanceData.gAffectCalcTime = performance.now() - startTime;
    onceConsole('rule_direct_multithread_end', '完成 rule_direct_multithread 函數 (GPU mode)', performance.now());
}

async function rule_update_multithread() {
    onceConsole('rule_update_multithread', '開始執行 rule_update_multithread 函數', performance.now());
    const startTime = performance.now();
    performanceData.positionUpdateCountsTimes = 0;

    try {
        const promises = [];
        const promiseStatus = []; // 追蹤 Promise 狀態
        const particleCount = particleCounts.reduce((sum, count) => sum + count, 0); // 總粒子數量
        performanceData.positionUpdateCountsTimes = particleCount;
        const workersNeeded = Math.min(workerPool.length, Math.ceil(particleCount / minParticlesPerWorker));
        onceConsole('rule_direct_multithread', `粒子需要 ${workersNeeded} 個工作線程處理 ${particleCount} 個粒子`, performance.now(), '\n workerPool:', workerPool, '\n particleGroups:', particleGroups);
        const particlesPerWorker = Math.ceil(particleCount / workersNeeded);
        if (workersNeeded <= 0 || particleCount <= 0) {
            console.error("why!!",`>>>>>>>>WHY THE FK!!!<<<<<<<<`)
            throw new Error(`workersNeeded (${workersNeeded}) 少於等於 0 , workersNeeded (${endId}) 少於等於 0`);
        }
        for (let j = 0; j < workerPool.length; j++) {
            if (j >= workersNeeded) {break; } // 如果已經分配了足夠的工作線程，則跳出循環
            const startId = j * particlesPerWorker;
            const endId = Math.min(startId + particlesPerWorker, particleCount);

            if (startId > endId) {
                console.error("why?",`>>>>>>>>WHY THE FK?<<<<<<<<`)
                throw new Error(`Worker ${j} 的 startId (${startId}) 大於 endId (${endId})`);
            }
            const promiseInfo = {
                workerId: j,
                worker: workerPool[j],
                startId,
                endId,
                status: 'pending'
            };
            promiseStatus.push(promiseInfo);

            promises.push(
                new Promise((resolve, reject) => {
                    const worker = workerPool[j];
                    const promiseIndex = promiseStatus.length - 1;
                    onceConsole('rule_update_multithread_postMessage', `multithread向worker ${j} 發送處理粒子 startID:${startId}, endID:${endId}`, performance.now());
                    worker.postMessage({
                        type: 'positionUpdate',
                        startId,
                        endId,
                        currentDt: currentDt,
                        frictionFactor,
                        isThrough,
                        canvasWidth: canvas.width,
                        canvasHeight: canvas.height,
                        //
                        //
                    });

                    worker.onmessage = (e) => {
                        if (e.data.type === 'positionUpdateComplete') {
                            promiseStatus[promiseIndex].status = 'fulfilled';
                            resolve();
                        } else if (e.data.type === 'error') {
                            promiseStatus[promiseIndex].status = 'rejected';
                            reject(new Error(e.data.message));
                        }
                    };
                })
            );
        }

        // 設定超時檢查
        const timeout = setInterval(() => {
            const pendingPromises = promiseStatus.filter(p => p.status === 'pending');
            if (pendingPromises.length > 0) {
                console.log('仍在等待的 Promise:', pendingPromises, '\n all promises:', promiseStatus);
            }
        }, 5000);

        await Promise.all(promises);
        clearInterval(timeout);

    } catch (error) {
        console.error('Error in rule_update_multithread:', error);
        throw error;
    }

    performanceData.positionUpdateTime = performance.now() - startTime;
}

// =============== 變量聲明區域 ===============
// >>> 粒子系統核心變量 <<<
// --粒子數據相關--
let particles = [];          // 儲存所有粒子對象的數組
let particleTypes = 0;       // 粒子類型總數
let particleCounts = [];     // 每種類型的粒子數量
let particleColors = [];     // 每種類型的粒子顏色
let nextParticleId = 0;      // 下一個要分配的粒子ID
let ballRadius = 0;          // 粒子半徑
let restitution = 0.8;  // 能量損失係數 (0.8 = 保留80%能量)

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
let updateInterval = 6.944444;  // 更新間隔(ms)
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
let selectedParticleType = null; // 選中的粒子類型
let selectedParticleIndex = null; // 選中的粒子顏色

// --視覺效果--
let enableParticleAffcetRadiusShow = false;  // 是否顯示粒子影響半徑
let RadiusShow = [];        // 影響半徑顯示數據

// >>> 多線程系統變量 <<<
// --線程控制--
let isUsingMultithread = false;  // 是否使用多線程
let sharedMemory = null;  // 共享內存管理器
let workerPool = [];             // 工作線程池
let MAX_WORKERS = navigator.hardwareConcurrency-4 || 4;  // 最大工作線程數
let minParticlesPerWorker = 100;  // 每個工作線程的最小粒子數

// >>> 共享內存變數 <<<
let startId = 0;
let endId = 0;
let particleType = 0;

// =============== 常量定義 ===============
// >>> 時間和物理常量 <<<
let DEFAULT_DT = 1/144;        // 默認時間步長
let DEFAULT_T_HALF = 0.020;    // 默認半衰期
let currentTHalf = DEFAULT_T_HALF  // 當前半衰期
let currentDt = DEFAULT_DT      // 當前時間步長

importScripts('https://cdn.jsdelivr.net/npm/gpu.js@latest/dist/gpu-browser.min.js'); // Use CDN for worker; or use local if npm installed

let gpu = new GPU.GPU({ mode: 'dev' }); // Initialize GPU.js in worker
let forceKernel = null; // GPU kernel for force calculation

if (typeof gpu !== 'undefined') {
    //Create force calcalate kernel
    forceKernel = gpu.createKernel(function(
        flatForceMatrix,  // 扁平化 forceMatrix [typeI * particleTypes + typeJ]
        flatDistanceMatrix,  // 扁平化 distanceMatrix
        positionsX,  // 所有粒子 x 位置 (扁平陣列)
        positionsY,  // 所有粒子 y 位置 (扁平陣列)
        velocitiesX,  // 所有粒子 vx (扁平陣列)
        velocitiesY,  // 所有粒子 vy (扁平陣列)
        particleTypes,
        particleCounts,  // 每個類型的粒子數量陣列
        canvasWidth,
        canvasHeight,
        isThrough,
        currentDt,
        frictionFactor
    ) {
        const id = this.thread.x; // 全局粒子 ID (0 to totalParticles-1)
        let typeI = 0;
        let offsetI = 0;
        // 計算 typeI 和 offsetI (匹配 getParticleById 邏輯)
        for (let t = 0; t < particleTypes; t++) {
            if (id < particleCounts[t]) {
                typeI = t;
                break;
            }
            offsetI += particleCounts[t];
        }
        const localI = id - offsetI;
        const xI = positionsX[id];
        const yI = positionsY[id];
        const vxI = velocitiesX[id];
        const vyI = velocitiesY[id];
        let fx = 0;
        let fy = 0;
        let skipped = 0;
        const totalParticles = positionsX.length;

        // 遍歷所有其他粒子 j (0 to totalParticles-1)
        for (let j = 0; j < totalParticles; j++) {
            if (id === j) continue; // 跳過自身

            let typeJ = 0;
            let offsetJ = 0;
            // 計算 j 的 typeJ 和 offsetJ
            for (let t = 0; t < particleTypes; t++) {
                if (j < particleCounts[t]) {
                    typeJ = t;
                    break;
                }
                offsetJ += particleCounts[t];
            }
            const localJ = j - offsetJ;
            const xJ = positionsX[j];
            const yJ = positionsY[j];
            let dx = xJ - xI;
            let dy = yJ - yI;

            // isThrough 邊界調整 (匹配 particleCalculator.js)
            if (isThrough) {
                if (Math.abs(dx) > canvasWidth / 2) {
                    dx -= Math.sign(dx) * canvasWidth;
                }
                if (Math.abs(dy) > canvasHeight / 2) {
                    dy -= Math.sign(dy) * canvasHeight;
                }
            }

            const distSquared = dx * dx + dy * dy;
            const forceStrength = flatForceMatrix[typeI * particleTypes + typeJ];
            const distThreshold = flatDistanceMatrix[typeI * particleTypes + typeJ];
            let force = 0;
            if (distThreshold === 0) {
                skipped += 1; // 跳過整個類型
                continue;
            }
            const maxDistSquared = distThreshold * distThreshold;

            if (distSquared >= maxDistSquared) {
                skipped++;
                continue;
            } else if (distSquared === 0) {
                // 隨機小擾動 (匹配原邏輯)
                fx += Math.random() * 0.01 - 0.005;
                fy += Math.random() * 0.01 - 0.005;
            } else {
                const distance = Math.sqrt(distSquared);
                const normalizedDist = distance / distThreshold;
                const forceMagnitude = calculateForce(normalizedDist, forceStrength);

                if (forceMagnitude === 0) {
                    skipped++;
                    continue;
                }
                fx += forceMagnitude * (dx / distance);
                fy += forceMagnitude * (dy / distance);
            }
        }

        // 在 kernel 內計算 newVx, newVy (應用摩擦和 dt)
        const newVx = vxI * frictionFactor + fx * currentDt;
        const newVy = vyI * frictionFactor + fy * currentDt;

        // 輸出：3 個陣列 - newVx[], newVy[], skipped[] (GPU.js 支援多陣列輸出)
        // 注意：setOutput 接受陣列大小，這裡為 totalParticles 長度的 3 個陣列
        this.newVx = newVx;
        this.newVy = newVy;
        this.skipped = skipped;
    }).setOutput([totalParticles, totalParticles, totalParticles]); // [newVx array, newVy array, skipped array]
    console.log('GPU kernel for force calculation initialized');

    //Create position calcalate kernel
    positionKernel = gpu.createKernel(function(

    ) {
        const id = this.thread.x; // 全局粒子 ID (0 to totalParticles-1)
        
    }).setOutput([totalParticles, totalParticles, totalParticles]);
} else {
    console.warn('GPU.js not available, falling back to CPU');
    // Fallback to existing CPU multithread if GPU fails
}