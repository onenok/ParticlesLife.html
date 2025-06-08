/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

// =============== 常量定義 ===============
const BETA = 0.3;
// =============== 實用小函數區域 ===============
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
            type: type,
            index: index,
        };
    },
    getParticleById(id) {
        let particleCumulativeCount = 0;
        let t = 0;
        let i = 0;
        try {
            for (let type = 0; type < particleTypes; type++) {
                const particleCount = particleCounts[type];
                if (particleCumulativeCount + particleCount > id) {
                    t = type;
                    i = id - particleCumulativeCount;
                    return this.getParticle(type, id - particleCumulativeCount);
                }
                particleCumulativeCount += particleCount;
            }
        } catch (error) {
            console.error(`Worker ${workerId} particlesCollision failed to get particle by id ${id} type ${t} index ${i}:`, error);
        }
        
        console.warn(`Particle with id ${id} not found`);
        return null;
    },

    updateParticle(type, index, updates) {
        const view = this.getParticleView(type);
        if (updates.x !== undefined) storeAtomicFloat(view.x, index, updates.x);
        if (updates.y !== undefined) storeAtomicFloat(view.y, index, updates.y);
        if (updates.vx !== undefined) storeAtomicFloat(view.vx, index, updates.vx);
        if (updates.vy !== undefined) storeAtomicFloat(view.vy, index, updates.vy);
    }
};
/**
 * 一次性控制臺輸出函數，只會輸出一次指定訊息
 * @param {string} key 唯一鍵值
 * @param {string} message 要輸出的訊息
 */
const onceConsole = (() => {
    const printed = new Set();
    return (key, ...message) => {
        if (!printed.has(key)) {
            console.log(key, ...message);
            printed.add(key);
        }
    };
})();
// =============== 輔助函數 ===============
// 計算粒子間作用力
function calculateForce(r, a) {
    if (r < BETA) {
        return r / BETA - 1;
    } 
    else if (BETA < r && r < 1) {
        return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA));
    }
    return 0;
}

// 原子操作輔助函數
function storeAtomicFloat(array, index, value) {
    return Atomics.store(array, index, Math.round(value * 1000));
}

function loadAtomicFloat(array, index) {
    return Atomics.load(array, index) / 1000;
}

// =============== 全局變量 ===============
let sharedMemory = null;
let particleViews = null;
let syncView = null;
let canvas = { width: 0, height: 0 };
let workerId = -1;
let particleTypes = 0;
let particleCounts = [];
let ballRadius = 0;
let isThrough = false;
let forceMatrix = [];
let distanceMatrix = [];
let currentDt = 1/144; // 預設時間步長為 1/144 秒
let frictionFactor = 1;
let test = 0;

// =============== 消息處理 ===============
self.onmessage = function(e) {
    
    switch (e.data.type) {
        case 'initSharedMemory':
            try {
                if (!e.data.sharedMemory || e.data.workerId === undefined || e.data.particleTypes === undefined || e.data.particleCounts === undefined) {
                    throw new Error('Missing required initialization data\nmissing: ' + (!e.data.sharedMemory ? 'sharedMemory: ' + e.data.sharedMemory: '') + (!e.data.workerId ? 'workerId: ' + e.data.workerId : '') + (!e.data.particleTypes ? 'particleTypes: ' + e.data.particleTypes : '') + (!e.data.particleCounts ? 'particleCounts: ' + e.data.particleCounts : ''));
                }
                
                // 初始化基本參數
                workerId = e.data.workerId;
                console.log('Worker ' + workerId + ': received Initializing...', performance.now());
                particleTypes = e.data.particleTypes;
                particleCounts = e.data.particleCounts;
                ballRadius = e.data.ballRadius;
                canvas.width = e.data.canvas.width;
                canvas.height = e.data.canvas.height;
                
                // 設置共享內存
                sharedMemory = e.data.sharedMemory;
                particleViews = sharedMemory.views.particleGroups;
                syncView = sharedMemory.views.sync;
                console.log('Worker ' + workerId + ': initialized', performance.now());
                self.postMessage({ type: 'initComplete', status: 'success' });
        } catch (error) {
                console.error('Worker ' + workerId + ' initialization failed:', error);
                self.postMessage({ type: 'initComplete', status: 'failed', error: error.message });
            }
            break;
        case 'calculate_Force':
            onceConsole('calculate_ForceOnMessage', `Worker ${workerId} received calculate_Force message ${performance.now()}`);
            try {
                const { startId, endId, forceMatrix: newForceMatrix, distanceMatrix: newDistanceMatrix, isThrough: newIsThrough, currentDt: newCurrentDt, frictionFactor: newFrictionFactor } = e.data;
                canvas.width = e.data.canvasWidth;
                canvas.height = e.data.canvasHeight;
                // 更新計算參數
                forceMatrix = newForceMatrix;
                distanceMatrix = newDistanceMatrix;
                isThrough = newIsThrough;
                currentDt = newCurrentDt;
                frictionFactor = newFrictionFactor;
                
                // 執行直接計算
                onceConsole('calculate_Force', `Worker ${workerId} calculating forces for particle type from id ${startId} to ${endId} at ${performance.now()}`);
                const { calcCount, skippedCount } = calculate_ForceForce(startId, endId);
                //console.debug("calculate_ForceComplete");
            
                self.postMessage({
                    type: 'calculate_ForceComplete',
                    calcCount,
                    skippedCount
                });
            } catch (error) {
                console.error(`Worker ${workerId} calculate_Force failed:`, error);
                self.postMessage({ type: 'error', message: error.message });
            }
            break;
            
        case 'positionUpdate':
            onceConsole('positionUpdateOnMessage', `Worker ${workerId} received positionUpdate message ${performance.now()}`);
            canvas.width = e.data.canvasWidth;
            canvas.height = e.data.canvasHeight;
            try {
                const { startId, endId, currentDt, frictionFactor, isThrough } = e.data;
                updateParticlePositions(startId, endId, currentDt, frictionFactor, isThrough);
                onceConsole('positionUpdated', `Worker ${workerId} updated positions for particle type from id ${startId} to ${endId} at ${performance.now()}`);
                self.postMessage({ type: 'positionUpdateComplete' });
            } catch (error) {
                console.error(`Worker ${workerId} positionUpdate failed:`, error);
                self.postMessage({ type: 'error', message: error.message });
            }
            break;
        case 'particlesCollision':
            onceConsole('particlesCollisionOnMessage', `Worker ${workerId} received particlesCollision message ${performance.now()}`);
            try {
                canvas.width = e.data.canvasWidth;
                canvas.height = e.data.canvasHeight;
                const { startId, endId, isThrough, frictionFactor, restitution } = e.data;
                const { particlesList, particleCollisionCountsTimes } = particlesCollision(startId, endId, frictionFactor, isThrough, restitution);
                onceConsole('particlesCollisionComplete', `Worker ${workerId} completed particlesCollision for particle type from id ${startId} to ${endId} at ${performance.now()}`);
                self.postMessage({ type: 'particlesCollisionComplete', particlesList, particleCollisionCountsTimes });
            } catch (error) {
                console.error(`Worker ${workerId} particlesCollision failed:`, error);
                self.postMessage({ type: 'error', message: error.message });
            }
            break;
    }
};
// =============== 計算函數 ===============
function calculate_ForceForce(startId, endId) {
    onceConsole('calculate_ForceForce', `Worker ${workerId} calculating forces at ${performance.now()}`);
    let calcCount = 0;
    let skippedCount = 0;
    onceConsole('calculate_ForceForce_check', `Worker ${workerId} calculating forces for particle from id ${startId} to ${endId}\n particleViews is ${particleViews}, forceMatrix is ${forceMatrix}, distanceMatrix is ${distanceMatrix}`);
    // 檢查參數有效性
    for (let id = startId; id < endId; id++) {
        let totalForceX = 0;
        let totalForceY = 0;
        let p = sharedMemoryAPI.getParticleById(id);
        for (let type2 = 0; type2 < particleTypes; type2++) {
            calcCount+=particleCounts[type2];
            const view2 = particleViews[type2];
            const force = forceMatrix[p.type][type2];
            const maxDistance = distanceMatrix[p.type][type2];
            if (maxDistance === 0) {
                skippedCount++;
                continue;
            }
            const maxDistSquared = maxDistance * maxDistance;
            let fx = 0, fy = 0;

            for (let j = 0; j < particleCounts[type2]; j++) {
                if (p.type === type2 && p.index === j) continue;

                let dx = loadAtomicFloat(view2.x, j) - p.x;
                let dy = loadAtomicFloat(view2.y, j) - p.y;

                if (isThrough) {
                    if (Math.abs(dx) > canvas.width / 2) {
                        dx -= Math.sign(dx) * canvas.width;
                    }
                    if (Math.abs(dy) > canvas.height / 2) {
                        dy -= Math.sign(dy) * canvas.height;
                    }
                }
                

                const distSquared = dx * dx + dy * dy;
                if (distSquared >= maxDistSquared) {

                    skippedCount++;
                    continue;
                }
                else if (distSquared === 0) {
                    fx += Math.random() * 0.01 - 0.005;
                    fy += Math.random() * 0.01 - 0.005; // 隨機小擾動                  
                }
                else {

                    const distance = Math.sqrt(distSquared);
                    const normalizedDist = distance / maxDistance;
                    const forceMagnitude = calculateForce(normalizedDist, force);

                    if (forceMagnitude === 0) {
                        skippedCount++;
                        continue;
                    }
                    fx += forceMagnitude * dx / distance;
                    fy += forceMagnitude * dy / distance;
                }
            }
            totalForceX += fx * 10 * maxDistance;
            totalForceY += fy * 10 * maxDistance;
        }

        // 更新速度
        storeAtomicFloat(particleViews[p.type].vx, p.index, p.vx * frictionFactor + totalForceX * currentDt);
        storeAtomicFloat(particleViews[p.type].vy, p.index, p.vy * frictionFactor + totalForceY * currentDt);
        onceConsole('calculate_Force_totalForce', `Worker ${workerId} updated particle ${id} of type ${p.type} with forces (${p.vx + totalForceX * currentDt}, ${p.vy + totalForceY * currentDt}) at ${performance.now()}`);
        onceConsole('calculate_Force_totalForce_check', `Worker ${workerId} particle ${id} of type ${p.type} has total forces (${loadAtomicFloat(particleViews[p.type].vx, p.index)}, ${loadAtomicFloat(particleViews[p.type].vy, p.index)}) at ${performance.now()}`);
    }

    return { calcCount, skippedCount };
}

function updateParticlePositions(startId, endId, dt, frictionFactor, isThrough) {
    onceConsole('updateParticlePositions_start', `UPDATEING positions Worker ${workerId} from id ${startId} to ${endId} at ${performance.now()}`);
    for (let id = startId; id < endId; id++) {
        // 讀取當前位置和速度
        let p = sharedMemoryAPI.getParticleById(id);
        p.vx *= frictionFactor;
        p.vy *= frictionFactor;
        onceConsole('updateParticlePositions_read', `Worker ${workerId} read particle ${id} of type ${p.type} with position (${p.x}, ${p.y}) and velocity (${p.vx}, ${p.vy}) at ${performance.now()}`);
        // 更新位置
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // 邊界處理
        if (isThrough) {
            p.x = ((p.x % canvas.width) + canvas.width) % canvas.width;
            p.y = ((p.y % canvas.height) + canvas.height) % canvas.height;
        } else {
            if (p.x < 0) {
                p.x = 0;
                p.vx = Math.abs(p.vx);
            } else if (p.x > canvas.width) {
                p.x = canvas.width;
                p.vx = -Math.abs(p.vx);
            }
            if (p.y < 0) {
                p.y = 0;
                p.vy = Math.abs(p.vy);
            } else if (p.y > canvas.height) {
                p.y = canvas.height;
                p.vy = -Math.abs(p.vy);
            }
        }
        
        // 存儲更新後的位置和速度
        sharedMemoryAPI.updateParticle(p.type, p.index, p);
    }
}
function particlesCollision(startId, endId, frictionFactor, isThrough, restitution) {
    let particleCollisionCountsTimes = 0;
    let particlesList = [];
    onceConsole('particlesCollision_start', `particlesCollision Worker ${workerId} from id ${startId} to ${endId} at ${performance.now()}`);
    for (let id = startId; id < endId; id++) {
        // 讀取當前位置和速度
        try{
            let p = sharedMemoryAPI.getParticleById(id);
        }catch (error) {
            console.error(`Worker ${workerId} particlesCollision failed to get particle by id ${id}:`, error);
            continue; // 如果讀取失敗，則跳過此粒子
        }
        // >>> 粒子類型循環 <<<
        for (let type2 = 0; type2 < particleTypes; type2++) {
            // --避免自我碰撞--
            
            // --第二組粒子循環--
            let totalx = 0;
            let totaly = 0;
            particleCollisionCountsTimes += particleCounts[type2];
            for (let j = 0; j < particleCounts[type2]; j++) {
                if (p.type === type2 && p.index === j) continue; // 跳過自身
                const p2 = sharedMemoryAPI.getParticle(type2, j);
                
                // >>> 距離計算 <<<
                // --基本距離--
                let dx = p2.x - p.x;
                let dy = p2.y - p.y;
                
                // --邊界穿越處理--
                if (isThrough) {
                    if (Math.abs(dx) > canvas.width / 2) {
                        dx = dx - Math.sign(dx) * canvas.width;
                    }
                    if (Math.abs(dy) > canvas.height / 2) {
                        dy = dy - Math.sign(dy) * canvas.height;
                    }
                }
                if (Math.abs(dx) >= ballRadius || Math.abs(dy) >= ballRadius) {
                    continue; // 如果距離大於半徑，則跳過
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
                    const dvx = p2.vx - p.vx;
                    const dvy = p2.vy - p.vy;
                    
                    // --速度投影--
                    const normalVelocity = dvx * nx + dvy * ny;
                    const tangentVelocity = dvx * tx + dvy * ty;
                    
                    // >>> 碰撞響應 <<<
                    if (normalVelocity >= 0) {
                        continue; // 如果法向速度為正，則不處理碰撞
                    }
                    particleCollisionCountsTimes++; // 粒子碰撞次數
                    // --衝量計算--
                    const jn = -(1 + restitution) * normalVelocity / 2;
                    const jt = -tangentVelocity * frictionFactor / 2;
                    
                    // --速度更新--
                    p.vx -= (jn * nx + jt * tx);
                    p.vy -= (jn * ny + jt * ty);
                    // --重疊修正--
                    const overlap = minDist - dist;
                    if (overlap > 0) {
                        const correction = (overlap / 2) * 1.05;
                        totalx -= nx * correction;
                        totaly -= ny * correction;
                        
                        
                    }
                }
            }
            if (totalx === 0 && totaly === 0) {
                continue; // 如果沒有碰撞，則跳過
            }
            // >>> 更新粒子位置 <<<
            p.x += totalx;
            p.y += totaly;
            // >>> 邊界檢查和修正 <<<
            // --第一個粒子--
            if (isThrough) {
                // --環繞處理--
                p.x = ((p.x % canvas.width) + canvas.width) % canvas.width;
                p.y = ((p.y % canvas.height) + canvas.height) % canvas.height;
            } else {
                // --邊界彈回--
                if (p.x < ballRadius) {
                    p.x = ballRadius;
                    p.vx = Math.abs(p.vx);
                } else if (p.x > canvas.width - ballRadius) {
                    p.x = canvas.width - ballRadius;
                    p.vx = -Math.abs(p.vx);
                }
                if (p.y < ballRadius) {
                    p.y = ballRadius;
                    p.vy = Math.abs(p.vy);
                } else if (p.y > canvas.height - ballRadius) {
                    p.y = canvas.height - ballRadius;
                    p.vy = -Math.abs(p.vy);
                }
            }
            particlesList.push(p)
        }
    }
    return {particlesList, particleCollisionCountsTimes}
}