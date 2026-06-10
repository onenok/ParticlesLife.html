// 修改後的 GPU kernel (在 forceCalcWorker.js 的 worker 上下文中使用)
// 假設 importScripts GPU.js 已載入，變數如 canvas, isThrough, currentDt, frictionFactor, forceMatrix, distanceMatrix, particleTypes, particleCounts 已設定

// Kernel 函數：每個 thread.x 計算一個粒子的 newVx, newVy (包含摩擦和 dt)
const gpuCalculateForceKernel = gpu.createKernel(function(
    flatForceMatrix,
    flatDistanceMatrix,
    positionsX,
    positionsY,
    velocitiesX,
    velocitiesY,
    particleTypes,
    particleCounts,
    canvasWidth,
    canvasHeight,
    isThrough,
    currentDt,
    frictionFactor
) {
    const id = this.thread.x; // 全局粒子 ID
    let typeI = 0;
    let offsetI = 0;
    // 計算 typeI 和 localI (如前解釋)
    for (let t = 0; t < particleTypes; t++) {
        if (id < particleCounts[t]) {
            typeI = t;
            break;
        }
        offsetI += particleCounts[t];
    }
    //const localI = id - offsetI;
    const xI = positionsX[id];
    const yI = positionsY[id];
    const vxI = velocitiesX[id]; // 讀取當前 vx
    const vyI = velocitiesY[id]; // 讀取當前 vy
    let fx = 0;
    let fy = 0;
    let skipped = 0;
    const totalParticles = positionsX.length;

    // 遍歷所有其他粒子 (j from 0 to totalParticles-1)
    for (let j = 0; j < totalParticles; j++) {
        if (id === j) continue; // 跳過自身

        let typeJ = 0;
        let offsetJ = 0;
        // 計算 j 的 typeJ 和 localJ
        for (let t = 0; t < particleTypes; t++) {
            if (j < particleCounts[t]) {
                typeJ = t;
                break;
            }
            offsetJ += particleCounts[t];
        }
        //const localJ = j - offsetJ;
        const xJ = positionsX[j];
        const yJ = positionsY[j];
        let dx = xJ - xI;
        let dy = yJ - yI;

        // isThrough 邊界調整
        if (isThrough) {
            if (Math.abs(dx) > canvasWidth / 2) {
                dx -= Math.sign(dx) * canvasWidth;
            }
            if (Math.abs(dy) > canvasHeight / 2) {
                dy -= Math.sign(dy) * canvasHeight;
            }
        }

        const distSquared = dx * dx + dy * dy;
        const force = flatForceMatrix[typeI * particleTypes + typeJ];
        const maxDistance = flatDistanceMatrix[typeI * particleTypes + typeJ];
        if (maxDistance === 0) {
            skipped += 1;
            continue;
        }
        const maxDistSquared = maxDistance * maxDistance;

        if (distSquared >= maxDistSquared) {
            skipped++;
            continue;
        } else if (distSquared === 0) {
            fx += Math.random() * 0.01 - 0.005;
            fy += Math.random() * 0.01 - 0.005;
        } else {
            const distance = Math.sqrt(distSquared);
            const normalizedDist = distance / maxDistance;
            const forceMagnitude = calculateForce(normalizedDist, force);

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

    // 輸出：newVelocitiesX[id] = newVx, newVelocitiesY[id] = newVy, skipped[id] = skipped
    return { newVx, newVy, skipped };
}).setOutput({ newVx: totalParticles, newVy: totalParticles, skipped: totalParticles }); // 3 個陣列輸出

// 使用 kernel 的函數 (在 rule_direct_multithread() 中呼叫)
function gpuCalculateForceDirect() {
    const totalParticles = particleCounts.reduce((a, b) => a + b, 0);
    const positionsX = new Float32Array(totalParticles);
    const positionsY = new Float32Array(totalParticles);
    const velocitiesX = new Float32Array(totalParticles);
    const velocitiesY = new Float32Array(totalParticles);
    const flatForceMatrix = new Float32Array(particleTypes * particleTypes);
    const flatDistanceMatrix = new Float32Array(particleTypes * particleTypes);

    // 扁平化矩陣和收集粒子 (如前)
    for (let i = 0; i < particleTypes; i++) {
        for (let j = 0; j < particleTypes; j++) {
            flatForceMatrix[i * particleTypes + j] = forceMatrix[i][j];
            flatDistanceMatrix[i * particleTypes + j] = distanceMatrix[i][j];
        }
    }
    let idx = 0;
    for (let type = 0; type < particleTypes; type++) {
        for (let i = 0; i < particleCounts[type]; i++) {
            const p = sharedMemoryAPI.getParticle(type, i);
            positionsX[idx] = p.x;
            positionsY[idx] = p.y;
            velocitiesX[idx] = p.vx; // 讀取當前 vx
            velocitiesY[idx] = p.vy; // 讀取當前 vy
            idx++;
        }
    }

    // 運行 kernel
    const result = gpuCalculateForceKernel(
        flatForceMatrix, flatDistanceMatrix, positionsX, positionsY, velocitiesX, velocitiesY,
        particleTypes, particleCounts, canvas.width, canvas.height, isThrough, currentDt, frictionFactor
    );

    // 寫回共享內存 (使用 Atomics 原子寫入)
    idx = 0;
    let totalSkipped = 0;
    for (let type = 0; type < particleTypes; type++) {
        for (let i = 0; i < particleCounts[type]; i++) {
            const newVx = result.newVx[idx];
            const newVy = result.newVy[idx];
            const skipped = result.skipped[idx];
            totalSkipped += skipped;

            // 原子寫回 vx, vy
            sharedMemoryAPI.updateParticle(type, i, { vx: newVx, vy: newVy });
            performanceData.gAffectCalcCountsTimes += 1;
            idx++;
        }
    }
    performanceData.particleSkippedCountsTimes = totalSkipped;
    console.log('GPU force calculation completed with newVx, newVy in kernel');
}

// 標準 calculateForce 函數 (用於 kernel 內)
function calculateForce(normalizedDist, force) {
    const BETA = 0.3;
    if (normalizedDist < BETA) {
        return normalizedDist / BETA - 1;
    } else if (BETA <= normalizedDist && normalizedDist < 1) {
        return force * (1 - Math.abs(2 * normalizedDist - 1 - BETA) / (1 - BETA));
    }
    return 0;
}