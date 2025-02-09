/*
 * Copyright (c) 2025 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

// =============== 常量定義 ===============
// >>> 物理計算常量 <<<
const BETA = 0.3;                      // 阻尼係數,用於控制粒子間的相互作用強度

// >>> 共享內存變數 <<<
let particleData;                      // 粒子數據
let grid;                              // 網格數據
let particleTypes;                     // 粒子類型數

// =============== 工作線程計算函數 ===============
// >>> 力的計算 <<<
// --計算粒子間作用力--
function calculateForce(r, a) {
    if (r < BETA) {                    // 當距離小於BETA時
        return r / BETA - 1;           // 返回排斥力
    } else if (BETA < r && r < 1) {    // 當距離在BETA和1之間時
        return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA));    // 返回吸引力
    }
    return 0;                          // 超出作用範圍時返回0
}

// >>> 粒子計算處理 <<<
// --處理主線程發來的消息--
self.onmessage = function(e) {
    // --初始化共享內存--
    if (e.data.type === 'initSharedMemory') {
        particleData = e.data.particleData;    // 存儲粒子數據的共享內存
        grid = e.data.grid;                    // 存儲網格數據的共享內存
        particleTypes = e.data.particleTypes;  // 粒子類型總數
    } 
    // --計算粒子--
    else if (e.data.type === 'calculate') {
        // --獲取計算所需的參數--
        const {
            startIndex,                // 開始計算的粒子索引
            endIndex,                  // 結束計算的粒子索引
            forceMatrix,              // 力矩陣
            distanceMatrix,           // 距離矩陣
            isThrough,                // 是否允許穿透邊界
            currentDt,                // 當前時間步長
            frictionFactor,           // 摩擦係數
            particleType              // 當前粒子類型
        } = e.data;

        // --性能統計計數器--
        let calcCount = 0;            // 力計算次數
        let skippedCount = 0;         // 跳過的粒子數

        // --計算指定範圍內的粒子--
        for (let i = startIndex; i < endIndex; i++) {
            // 應用摩擦力到當前速度
            let vx = particleData.vx[i] * frictionFactor;    // 更新X方向速度
            let vy = particleData.vy[i] * frictionFactor;    // 更新Y方向速度
            
            // --初始化合力--
            let fx = 0, fy = 0;                     // 初始化X和Y方向的合力

            // --從共享內存讀取粒子數據--
            const x = particleData.x[i];          // 獲取粒子X坐標
            const y = particleData.y[i];          // 獲取粒子Y坐標

            // --遍歷所有粒子類型計算相互作用--
            for (let t = 0; t < particleTypes; t++) {
                const r = distanceMatrix[particleType][t];        // 獲取作用距離
                const r2 = r * r;                         // 預計算距離的平方
                const g = forceMatrix[particleType][t];          // 獲取力係數

                // --獲取附近的粒子--
                const nearby = grid[t].getNearbyParticles(x, y, r);    // 使用網格優化獲取附近粒子

                // --計算與每個附近粒子的相互作用--
                for (let j = 0; j < nearby.offsetCount; j++) {
                    const particleIndex = nearby.particles[j];
                    if (i === particleIndex) continue;               // 跳過自身
                    calcCount++;                         // 增加計算次數

                    // --計算粒子間的距離--
                    const dx = particleData.x[particleIndex] + nearby.offsetsX[j] - x;    // X方向距離
                    const dy = particleData.y[particleIndex] + nearby.offsetsY[j] - y;    // Y方向距離
                    const distSquared = dx * dx + dy * dy;                  // 距離平方

                    // --檢查是否超出作用範圍--
                    if (distSquared === 0 || distSquared >= r2) {
                        skippedCount++;                  // 增加跳過次數
                        continue;                        // 跳過此粒子
                    }

                    // --計算作用力--
                    const dist = Math.sqrt(distSquared);             // 計算實際距離
                    const F = calculateForce(dist/r, g);            // 計算力的大小
                    fx += F * dx / dist;                            // 累加X方向分量
                    fy += F * dy / dist;                            // 累加Y方向分量
                }
            }

            // --更新粒子速度--
            particleData.vx[i] = vx + fx * currentDt;    // 存儲新的X速度
            particleData.vy[i] = vy + fy * currentDt;    // 存儲新的Y速度
        }

        // --返回計算結果和性能統計--
        self.postMessage({
            type: 'calculateComplete',
            calcCount,                 // 返回力計算次數
            skippedCount              // 返回跳過的粒子數
        });
    }
};

// >>> 共享內存訪問 <<<
// --設置共享內存數據--
function setSharedMemory(data) {
    particleData = data.particleData;    // 設置粒子數據的共享內存
    grid = data.grid;                    // 設置網格數據的共享內存
    particleTypes = data.particleTypes;  // 設置粒子類型數
} 