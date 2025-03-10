/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

console.log("particleWorker_Multithread.js loaded successfully")

// =============== 消息處理 ===============
// >>> 處理主線程發來的各種消息 <<<
self.onmessage = function(e) {
    // --處理消息--
    switch (e.data.type) {
        // --初始化--
        case 'init':
            
            canvas.width = e.data.canvasWidth; // 畫布寬度
            canvas.height = e.data.canvasHeight; // 畫布高度
            particleTypes = e.data.particleTypes; // 粒子類型數量
            particleGroups = e.data.particleGroups; // 粒子組
            particleCounts = e.data.particleCounts; // 粒子數量
            performanceData = e.data.performanceData; // 性能計數器
            
            // --初始化網格--
            // --是否使用網格--
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            
            // 創建共享內存管理器
            sharedMemory = new SharedMemoryManager(particleCounts);
            // --網格初始化--
            
            // --如果使用多線程,初始化多線程系統--
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
            performanceData = e.data.performanceData; // 性能計數器
            frictionFactor = calculateFrictionFactor(currentDt, currentTHalf); // 摩擦係數
            // 創建共享內存管理器
            sharedMemory = new SharedMemoryManager(particleCounts);
            // --如果使用多線程,初始化多線程系統--
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

    try {
        // 執行多線程計算
        await rule_direct_multithread(particleTypes);

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

        performanceData.totalTime = performance.now() - startTime;
        
        // 發送更新消息
        self.postMessage({ 
            type: 'update',
            particles: particles,
            particleGroups: particleGroups,
            performanceData: performanceData,
            nearbyParticlesList: nearbyParticlesList,
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

// >>>> 主循環 <<<<
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
        "vx": 0, // 粒子X速度
        "vy": 0, // 粒子Y速度
        "color": c, // 粒子顏色
        "type": type // 粒子類型
    };
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



// >>> 多線程初始化 <<<
async function initializeMultithreadSystem() {
    try {
        // 初始化共享內存
        const totalParticles = particleCounts.reduce((a, b) => a + b, 0);
        sharedMemory = new SharedMemoryManager(totalParticles, {
            width: canvas.width,
            height: canvas.height,
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
        if (!particleTypes || !ballRadius) {
            reject(new Error('必要的初始化參數缺失'));
            return;
        }

        const worker = new Worker('particleCalculator.js',
            {
                sharedMemory: {
                    particleData: sharedMemory.getBuffer('particleData'),
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


async function rule_direct_multithread(types) {
    const startTime = performance.now();
    performanceData.gAffectCalcCountsTimes = 0;
    performanceData.particleSkippedCountsTimes = 0;

    try {
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

// =============== 變量聲明區域 ===============
// >>> 粒子系統核心變量 <<<
// --粒子數據相關--
let particles = [];          // 儲存所有粒子對象的數組
let particleTypes = 0;       // 粒子類型總數
let particleCounts = [];     // 每種類型的粒子數量
let particleColors = [];     // 每種類型的粒子顏色
let nextParticleId = 0;      // 下一個要分配的粒子ID
let ballRadius = 0;          // 粒子半徑

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

// >>> 多線程系統變量 <<<
// --線程控制--
let isUsingMultithread = false;  // 是否使用多線程
let sharedMemory = null;  // 共享內存管理器
let workerPool = [];             // 工作線程池
let MAX_WORKERS = navigator.hardwareConcurrency-3 || 4;  // 最大工作線程數
let minParticlesPerWorker = 100;  // 每個工作線程的最小粒子數

// >>> 共享內存變數 <<<
let particleData = null;              // 粒子數據
let startIndex = 0;
let endIndex = 0;
let particleType = 0;

// =============== 常量定義 ===============
// >>> 時間和物理常量 <<<
let DEFAULT_DT = 1/144;        // 默認時間步長
let DEFAULT_T_HALF = 0.040;    // 默認半衰期
let currentTHalf = DEFAULT_T_HALF  // 當前半衰期
let currentDt = DEFAULT_DT      // 當前時間步長