/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

// =============== 常量定義 ===============
const BETA = 0.3;

// =============== 輔助函數 ===============
// 計算粒子間作用力
function calculateForce(r, a) {
    if (r < BETA) {
        return r / BETA - 1;
    } else if (BETA < r && r < 1) {
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
let currentDt = 1/144;
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
                console.log('Worker ' + workerId + ': Initializing...');
            particleTypes = e.data.particleTypes;
                particleCounts = e.data.particleCounts;
            ballRadius = e.data.ballRadius;
                canvas.width = e.data.canvas.width;
                canvas.height = e.data.canvas.height;
                
                // 設置共享內存
                sharedMemory = e.data.sharedMemory;
                particleViews = sharedMemory.views.particleGroups;
                syncView = sharedMemory.views.sync;
                
                self.postMessage({ type: 'initComplete', status: 'success' });
        } catch (error) {
                console.error('Worker ' + workerId + ' initialization failed:', error);
                self.postMessage({ type: 'initComplete', status: 'failed', error: error.message });
            }
            break;
            
        case 'calculateDirect':
            if (test == 0) {
                console.log("adaseryesheshgsrhwshsgrwt34yrqhszjjf");
                test++;
            }
            try {
                const { startIndex, endIndex, particleType, forceMatrix: newForceMatrix, distanceMatrix: newDistanceMatrix, isThrough: newIsThrough, currentDt: newCurrentDt, frictionFactor: newFrictionFactor } = e.data;
                
                // 更新計算參數
                forceMatrix = newForceMatrix;
                distanceMatrix = newDistanceMatrix;
                isThrough = newIsThrough;
                currentDt = newCurrentDt;
                frictionFactor = newFrictionFactor;
                
                // 執行直接計算
                const { calcCount, skippedCount } = calculateDirectForce(startIndex, endIndex, particleType);
                
            self.postMessage({
                    type: 'calculateDirectComplete',
                calcCount,
                skippedCount
            });
        } catch (error) {
                self.postMessage({ type: 'error', message: error.message });
            }
            break;
            
        case 'positionUpdate':
            try {
                const { startIndex, endIndex, particleType, currentDt, frictionFactor, isThrough } = e.data;
                updateParticlePositions(startIndex, endIndex, particleType, currentDt, frictionFactor, isThrough);
                self.postMessage({ type: 'positionUpdateComplete' });
            } catch (error) {
                self.postMessage({ type: 'error', message: error.message });
            }
            break;
    }
};
// =============== 計算函數 ===============
function calculateDirectForce(startIndex, endIndex, particleType) {
    let calcCount = 0;
    let skippedCount = 0;
    const view1 = particleViews[particleType];
    
    for (let i = startIndex; i < endIndex; i++) {
        let totalForceX = 0;
        let totalForceY = 0;
        
        for (let type2 = 0; type2 < particleTypes; type2++) {
            const view2 = particleViews[type2];
            const force = forceMatrix[particleType][type2];
            const maxDistance = distanceMatrix[particleType][type2];
            
            if (force === 0 || maxDistance === 0) {
                skippedCount++;
                continue;
            }
            
            for (let j = 0; j < particleCounts[type2]; j++) {
                if (particleType === type2 && i === j) continue;
                
                let dx = loadAtomicFloat(view2.x, j) - loadAtomicFloat(view1.x, i);
                let dy = loadAtomicFloat(view2.y, j) - loadAtomicFloat(view1.y, i);
                
                        if (isThrough) {
                    if (Math.abs(dx) > canvas.width / 2) {
                        dx = dx - Math.sign(dx) * canvas.width;
                            }
                    if (Math.abs(dy) > canvas.height / 2) {
                        dy = dy - Math.sign(dy) * canvas.height;
                            }
                        }

                        const distSquared = dx * dx + dy * dy;
                const maxDistSquared = maxDistance * maxDistance;
                
                if (distSquared < maxDistSquared && distSquared > 0) {
                    const distance = Math.sqrt(distSquared);
                    const normalizedDist = distance / maxDistance;
                    const forceMagnitude = calculateForce(normalizedDist, force);
                    
                    if (forceMagnitude !== 0) {
                        const fx = (forceMagnitude * dx) / distance;
                        const fy = (forceMagnitude * dy) / distance;
                        totalForceX += fx;
                        totalForceY += fy;
                        calcCount++;
                    }
                }
            }
        }
        
        // 更新速度
        const currentVx = loadAtomicFloat(view1.vx, i);
        const currentVy = loadAtomicFloat(view1.vy, i);
        storeAtomicFloat(view1.vx, i, currentVx + totalForceX * currentDt);
        storeAtomicFloat(view1.vy, i, currentVy + totalForceY * currentDt);
    }
    
    return { calcCount, skippedCount };
}

function updateParticlePositions(startIndex, endIndex, particleType, dt, frictionFactor, isThrough) {
    const view = particleViews[particleType];
    
            for (let i = startIndex; i < endIndex; i++) {
        // 讀取當前位置和速度
        let x = loadAtomicFloat(view.x, i);
        let y = loadAtomicFloat(view.y, i);
        let vx = loadAtomicFloat(view.vx, i) * frictionFactor;
        let vy = loadAtomicFloat(view.vy, i) * frictionFactor;
        
        // 更新位置
        x += vx * dt;
        y += vy * dt;
        
        // 邊界處理
                if (isThrough) {
            x = ((x % canvas.width) + canvas.width) % canvas.width;
            y = ((y % canvas.height) + canvas.height) % canvas.height;
                } else {
            if (x < 0) {
                x = 0;
                vx = Math.abs(vx);
            } else if (x > canvas.width) {
                x = canvas.width;
                vx = -Math.abs(vx);
            }
            if (y < 0) {
                y = 0;
                vy = Math.abs(vy);
            } else if (y > canvas.height) {
                y = canvas.height;
                vy = -Math.abs(vy);
            }
        }
        
        // 存儲更新後的位置和速度
        storeAtomicFloat(view.x, i, x);
        storeAtomicFloat(view.y, i, y);
        storeAtomicFloat(view.vx, i, vx);
        storeAtomicFloat(view.vy, i, vy);
    }
} 