/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

const BETA = 0.3;
// 計算粒子間作用力
function calculateForce(r, a) {
    if (r < BETA) {
        return r / BETA - 1;
    } else if (BETA < r && r < 1) {
        return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA));
    }
    return 0;
}

// =============== 多線程類別定義 ===============
// --ParticleData類處理粒子數據的共享內存管理--
class ParticleData {
    constructor(ParticlesCount) {
        this.sharedMemory = new SharedMemoryManager(ParticlesCount);
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
}

// --MultithreadGrid類處理多線程環境下的粒子網格計算--
class MultithreadGrid {
    constructor(cellSize, width, height, ParticlesCount) {
        if (!ballRadius) {
            throw new Error('ballRadius is required for MultithreadGrid initialization');
        }

        // -- 基本屬性初始化 --
        this.cellSize = cellSize;                     // 網格單元大小
        this.canvasWidth = width;                     // 畫布寬度
        this.canvasHeight = height;                   // 畫布高度
        this.ballRadius = ballRadius;                 // 粒子半徑
        this.isNotGridPerfectlyFit = (width % this.cellSize == 0 && height % this.cellSize == 0) ? 0 : 1;  // 檢查網格是否完美適配畫布
        this.width = Math.ceil(width / cellSize);     // 計算網格寬度(單元數)
        this.height = Math.ceil(height / cellSize);   // 計算網格高度(單元數)
        
        // -- 計算每個網格的最大粒子數 --
        const CIRCLE_PACKING_DENSITY = 0.9069;  
        const cellArea = cellSize * cellSize;    
        const particleArea = Math.PI * ballRadius * ballRadius;  
        const theoreticalMaxParticles = Math.floor((cellArea * CIRCLE_PACKING_DENSITY) / particleArea);  
        this.MAX_PARTICLES_PER_CELL = Math.max(100, Math.ceil(theoreticalMaxParticles * 1.5));

        // -- 使用 SharedMemoryManager --
        this.sharedMemory = new SharedMemoryManager(ParticlesCount);
        
        // -- 初始化網格視圖 --
        const totalCells = this.width * this.height;
        this.cells = {
            count: new Int32Array(this.sharedMemory.getBuffer('cells'), 0, totalCells),
            particles: new Int32Array(this.sharedMemory.getBuffer('cells'), totalCells * Int32Array.BYTES_PER_ELEMENT, totalCells * this.MAX_PARTICLES_PER_CELL)
        };

        // -- 初始化附近粒子查找緩存 --
        this.nearbyCache = new Int32Array(this.sharedMemory.getBuffer('nearby'));
        this.offsetsX = new Float32Array(this.sharedMemory.getBuffer('offsetsX'));
        this.offsetsY = new Float32Array(this.sharedMemory.getBuffer('offsetsY'));
        this.offsetsCache = 0;

        // -- 同步機制 --
        this.syncCounter = this.sharedMemory.getView('sync');
    }

    // 清除網格數據
    clear() {
        this.cells.count.fill(0);
        this.cells.particles.fill(0);
    }

    // 添加粒子到網格
    add(particleIndex, gridX, gridY) {
        const cellIndex = gridY * this.width + gridX;
        const count = Atomics.add(this.cells.count, cellIndex, 1);
        if (count < this.MAX_PARTICLES_PER_CELL) {
            Atomics.store(
                this.cells.particles,
                cellIndex * this.MAX_PARTICLES_PER_CELL + count,
                particleIndex
            );
        }
    }

    // 獲取網格尺寸
    getSize() {
        return {
            width: this.width,
            height: this.height,
            cellSize: this.cellSize
        };
    }

    // >>>> 粒子查找方法 <<<<
    getNearbyParticles(gridX, gridY, radius, isThrough = false) {
        // --初始化搜索參數--
        const radiusCells = Math.ceil(radius / this.cellSize);    // 計算搜索半徑覆蓋的網格單元數        
        this.offsetsCache = 0;                                    // 重置偏移量緩存計數器

        // --處理穿透邊界的情況--
        if (isThrough) {
            radiusCells += this.isNotGridPerfectlyFit;
            const radiusCellsPlus1point5Squared = (radiusCells + 1.5) * (radiusCells + 1.5);

            for (let dy = -radiusCells; dy <= radiusCells; dy++) {
                const dySquared = dy * dy;
                const actualY = dy + gridY;
                const wrappedGridY = ((actualY % this.height) + this.height) % this.height;
                const baseIndex = wrappedGridY * this.width;

                for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                    if (dx * dx + dySquared > radiusCellsPlus1point5Squared) continue;

                    const actualX = dx + gridX;
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
            const radiusSquared = radiusCells * radiusCells;
            const startX = Math.max(0, gridX - radiusCells);
            const endX = Math.min(this.width - 1, gridX + radiusCells);
            const startY = Math.max(0, gridY - radiusCells);
            const endY = Math.min(this.height - 1, gridY + radiusCells);

            for (let y = startY; y <= endY; y++) {
                const dy = y - gridY;
                const dySquared = dy * dy;
                const baseIndex = y * this.width;

                for (let x = startX; x <= endX; x++) {
                    const dx = x - gridX;
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
                            this.offsetsCache++;
                        }
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
}

// --MultithreadDirect類處理多線程環境下的直接計算--
class MultithreadDirect {
    constructor(width, height, ParticlesCount) {
        // -- 基本屬性初始化 --
        this.canvasWidth = width;                   // 畫布寬度
        this.canvasHeight = height;                 // 畫布高度
        this.sharedMemory = new SharedMemoryManager(ParticlesCount);
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

    getParticleData() {
        return this.particleData;
    }

    getCanvasSize() {
        return {
            width: this.canvasWidth,
            height: this.canvasHeight
        };
    }
}

// >>> 共享內存變數 <<<
let particleData;                      // 粒子數據
let grid;                              // 網格數據
let particleTypes;                     // 粒子類型數
let ballRadius;                        // 粒子半徑
let canvas;
let multithreadDirect;  // MultithreadDirect 實例

let startIndex;
let endIndex;
let forceMatrix;
let distanceMatrix;
let isThrough;
let currentDt;
let frictionFactor;
let particleType;

// =============== 工作線程計算函數 ===============
// 原子浮點數操作輔助函數
function storeAtomicFloat(array, index, value) {
    return Atomics.store(array, index, Math.round(value * 1000));
}

function loadAtomicFloat(array, index) {
    return Atomics.load(array, index) / 1000;
}
// >>> 力的計算 <<<

// >>> 粒子計算處理 <<<
// --處理主線程發來的消息--
self.onmessage = function(e) {
    if (e.data.type === 'initSharedMemory') {
        console.log('Worker: Initializing shared memory');
        
        try {
            // 驗證接收到的數據
            if (!e.data.grid || !e.data.particleTypes || !e.data.ballRadius || !e.data.sharedMemory) {
                throw new Error('Missing required initialization data');
            }

            // 驗證共享內存緩衝區
            const requiredBuffers = ['particleData', 'cells', 'nearby', 'offsetsX', 'offsetsY', 'sync'];
            for (const buffer of requiredBuffers) {
                if (!(buffer in e.data.sharedMemory)) {
                    throw new Error(`Missing required shared buffer: ${buffer}`);
                }
            }

            // 初始化共享內存訪問
            grid = e.data.grid;
            particleTypes = e.data.particleTypes;
            ballRadius = e.data.ballRadius;
            canvas = e.data.canvas;

            // 創建共享內存視圖
            const sharedMemory = {
                particleData: new Int32Array(e.data.sharedMemory.particleData),
                cells: new Int32Array(e.data.sharedMemory.cells),
                nearby: new Int32Array(e.data.sharedMemory.nearby),
                offsetsX: new Float32Array(e.data.sharedMemory.offsetsX),
                offsetsY: new Float32Array(e.data.sharedMemory.offsetsY),
                sync: new Int32Array(e.data.sharedMemory.sync)
            };

            // 初始化 MultithreadDirect 實例
            multithreadDirect = new MultithreadDirect(
                canvas.width,
                canvas.height,
                e.data.totalParticles || 1000,  // 默認值為1000
                sharedMemory
            );

            // 為每個 grid 添加共享內存訪問
            grid.forEach(gridItem => {
                gridItem.sharedMemory = sharedMemory;
                // ... rest of the grid initialization ...
            });

            console.log('Worker: Successfully initialized shared memory');

            // 發送初始化完成消息
            self.postMessage({
                type: 'initComplete',
                status: 'success'
            });
        } catch (error) {
            console.error('Worker initialization failed:', error);
            self.postMessage({
                type: 'initComplete',
                status: 'error',
                error: error.message
            });
        }
    } 
    else if (e.data.type === 'calculate') {
        // 確保worker已經正確初始化
        if (!grid || !particleTypes || !ballRadius) {
            self.postMessage({
                type: 'error',
                message: 'Worker not properly initialized'
            });
            return;
        }

        //console.log('Worker: Starting calculation');
        
        try {
            startIndex = e.data.startIndex;
            endIndex = e.data.endIndex;
            forceMatrix = e.data.forceMatrix;
            distanceMatrix = e.data.distanceMatrix;
            isThrough = e.data.isThrough;
            currentDt = e.data.currentDt;
            frictionFactor = e.data.frictionFactor;
            particleType = e.data.particleType;

            // 計算指定範圍內的粒子
            let calcCount = 0;
            let skippedCount = 0;

            // 獲取當前類型的 grid
            const currentGrid = grid[particleType];
            if (!currentGrid) {
                throw new Error(`Invalid particle type: ${particleType}`);
            }

            // 使用當前grid的particleData
            const currentParticleData = currentGrid.particleData;
            if (!currentParticleData) {
                throw new Error(`Missing particleData for particle type: ${particleType}`);
            }

            

            // 更新
            for (let i = startIndex; i < endIndex; i++) {
                const vx = loadAtomicFloat(currentParticleData.vx, i) * frictionFactor;
                const vy = loadAtomicFloat(currentParticleData.vy, i) * frictionFactor;
                
                let fx = 0, fy = 0;
                const x = loadAtomicFloat(currentParticleData.x, i);
                const y = loadAtomicFloat(currentParticleData.y, i);

                const gridX = Atomics.load(currentParticleData.gridX, i);
                const gridY = Atomics.load(currentParticleData.gridY, i);

                // 遍歷所有粒子類型計算相互作用
                for (let t = 0; t < particleTypes; t++) {
                    const targetGrid = grid[t];
                    if (!targetGrid) {
                        throw new Error(`Invalid target particle type: ${t}`);
                    }

                    const r = distanceMatrix[particleType][t];
                    const r2 = r * r;
                    const g = forceMatrix[particleType][t];

                    // 獲取附近的粒子
                    const nearby = targetGrid.getNearbyParticles(gridX, gridY, r, isThrough);

                    // 計算與每個附近粒子的相互作用
                    for (let j = 0; j < nearby.offsetCount; j++) {
                        const particleIndex = nearby.particles[j];
                        if (i === particleIndex && particleType === t) continue;
                        calcCount++;

                        const dx = loadAtomicFloat(targetGrid.particleData.x, particleIndex) + (nearby.offsetsX ? nearby.offsetsX[j] : 0) - x;
                        const dy = loadAtomicFloat(targetGrid.particleData.y, particleIndex) + (nearby.offsetsY ? nearby.offsetsY[j] : 0) - y;
                        const distSquared = dx * dx + dy * dy;

                        if (distSquared === 0 || distSquared >= r2) {
                            skippedCount++;
                            continue;
                        }

                        const dist = Math.sqrt(distSquared);
                        const F = calculateForce(dist/r, g);
                        fx += F * dx / dist;
                        fy += F * dy / dist;
                    }
                // 更新速度
                storeAtomicFloat(currentParticleData.vx, i, vx + fx * r * 10 * currentDt);
                storeAtomicFloat(currentParticleData.vy, i, vy + fy * r * 10 * currentDt);
                }

            }
            //console.log('Worker: Calculation complete');
            // 發送計算完成消息
            self.postMessage({
                type: 'calculateComplete',
                calcCount,
                skippedCount
            });
        } catch (error) {
            console.error('Worker: Calculation error:', error);
            self.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    else if (e.data.type === 'calculateDirect') {
        console.log('Worker: Starting calculateDirect');
        try {
            // 驗證 MultithreadDirect 實例
            if (!multithreadDirect) {
                throw new Error('MultithreadDirect not initialized');
            }

            const startIndex = e.data.startIndex;
            const endIndex = e.data.endIndex;
            const particleType = e.data.particleType;
            const forceMatrix = e.data.forceMatrix;
            const distanceMatrix = e.data.distanceMatrix;
            const isThrough = e.data.isThrough;
            const currentDt = e.data.currentDt;
            const frictionFactor = e.data.frictionFactor;

            // 驗證必要參數
            if (startIndex === undefined || endIndex === undefined) {
                throw new Error('Invalid index range');
            }
            if (particleType === undefined || !forceMatrix || !distanceMatrix) {
                throw new Error('Missing calculation parameters');
            }

            // 計算指定範圍內的粒子
            let calcCount = 0;
            let skippedCount = 0;

            // 獲取當前類型的直接計算對象
            const currentParticleData = multithreadDirect.getParticleData();
            if (!currentParticleData) {
                throw new Error('Failed to get particle data');
            }

            const canvasSize = multithreadDirect.getCanvasSize();
            if (!canvasSize || !canvasSize.width || !canvasSize.height) {
                throw new Error('Invalid canvas size');
            }

            // 更新粒子
            for (let i = startIndex; i < endIndex; i++) {
                const vx = loadAtomicFloat(currentParticleData.vx, i) * frictionFactor;
                const vy = loadAtomicFloat(currentParticleData.vy, i) * frictionFactor;
                
                let fx = 0, fy = 0;
                const x = loadAtomicFloat(currentParticleData.x, i);
                const y = loadAtomicFloat(currentParticleData.y, i);

                // 遍歷所有粒子類型計算相互作用
                for (let t = 0; t < particleTypes; t++) {
                    const r = distanceMatrix[particleType][t];
                    const r2 = r * r;
                    const g = forceMatrix[particleType][t];

                    // 遍歷目標類型的所有粒子
                    for (let j = 0; j < endIndex; j++) {
                        if (i === j && particleType === t) continue;
                        calcCount++;

                        const targetX = loadAtomicFloat(currentParticleData.x, j);
                        const targetY = loadAtomicFloat(currentParticleData.y, j);

                        let dx = targetX - x;
                        let dy = targetY - y;

                        // 處理穿透邊界的情況
                        if (isThrough) {
                            if (Math.abs(dx) > canvasSize.width / 2) {
                                dx = dx > 0 ? dx - canvasSize.width : dx + canvasSize.width;
                            }
                            if (Math.abs(dy) > canvasSize.height / 2) {
                                dy = dy > 0 ? dy - canvasSize.height : dy + canvasSize.height;
                            }
                        }

                        const distSquared = dx * dx + dy * dy;
                        if (distSquared === 0 || distSquared >= r2) {
                            skippedCount++;
                            continue;
                        }

                        const dist = Math.sqrt(distSquared);
                        const F = calculateForce(dist/r, g);
                        fx += F * dx / dist;
                        fy += F * dy / dist;
                    }
                }

                // 更新速度
                storeAtomicFloat(currentParticleData.vx, i, vx + fx * r * 10 * currentDt);
                storeAtomicFloat(currentParticleData.vy, i, vy + fy * r * 10 * currentDt);
            }

            // 發送計算完成消息
            self.postMessage({
                type: 'calculateDirectComplete',
                calcCount,
                skippedCount,
                particleType
            });
        } catch (error) {
            console.error('Worker: Direct calculation error:', error);
            self.postMessage({
                type: 'error',
                message: error.message,
                context: 'calculateDirect'
            });
        }
    }
    else if (e.data.type === 'positionUpdate') {
        console.log('Worker: Starting position update');
        try {
            currentGrid = grid[particleType];
            if (!currentGrid) {
                throw new Error(`Invalid particle type: ${particleType}`);
            }

            // 使用當前grid的particleData
            particleData = currentGrid.particleData;
            
            // 更新粒子位置
            for (let i = startIndex; i < endIndex; i++) {
                storeAtomicFloat(particleData.vx, i, loadAtomicFloat(particleData.vx, i) * frictionFactor);
                storeAtomicFloat(particleData.vy, i, loadAtomicFloat(particleData.vy, i) * frictionFactor);
                const vx = loadAtomicFloat(particleData.vx, i);
                const vy = loadAtomicFloat(particleData.vy, i);
                const x = loadAtomicFloat(particleData.x, i);
                const y = loadAtomicFloat(particleData.y, i);

                let nextX = x + vx * currentDt;
                let nextY = y + vy * currentDt;
                
                if (isThrough) {
                    nextX = (((nextX) % canvasWidth) + canvasWidth) % canvasWidth;
                    nextY = (((nextY) % canvasHeight) + canvasHeight) % canvasHeight;
                } else {
                    if (nextX < ballRadius || nextX > canvasWidth - ballRadius) {
                        storeAtomicFloat(particleData.vx, i, -vx);
                        nextX = 2 * Math.max(ballRadius, Math.min(nextX, canvasWidth - ballRadius)) - nextX;
                    }
                    if (nextY < ballRadius || nextY > canvasHeight - ballRadius) {
                        storeAtomicFloat(particleData.vy, i, -vy);
                        nextY = 2 * Math.max(ballRadius, Math.min(nextY, canvasHeight - ballRadius)) - nextY;
                    }
                }

                storeAtomicFloat(particleData.x, i, nextX);
                storeAtomicFloat(particleData.y, i, nextY);
            }
        } catch (error) {
            console.error('Worker: Position update error:', error);
            self.postMessage({
                type: 'error',
                message: error.messagem
            });
        }
        // 發送更新完成消息
        self.postMessage({
            type: 'positionUpdateComplete',
            status: 'success'
        });
    }
}; 