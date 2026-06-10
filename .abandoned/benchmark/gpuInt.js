// GPU.js 整數版本
export class GPUIntImplementation {
    constructor() {
        this.kernel = null;
        this.gpu = null;
    }

    async init(data) {
        // 檢查並初始化 GPU
        if (!this.gpu) {
            if (typeof GPU === 'undefined') {
                throw new Error('GPU.js 未正確載入，請確保 GPU.js 庫已經載入完成');
            }
            try {
                window.testGPU = new GPU();  // 測試用
                this.gpu = new GPU();
            } catch (error) {
                console.error('GPU.js 初始化失敗:', error);
                throw new Error('GPU.js 初始化失敗，可能不支援或瀏覽器限制');
            }
        }

        try {
            // 創建計算核心
            // 創建兩個獨立的 kernel，分別計算 X 和 Y 方向的力
            const kernelX = this.gpu.createKernel(function(posX, types, forceMatrix, maxDistance) {
                const i = this.thread.x;
                // 載入位置（轉換到定點數，×16）
                const x1 = Math.floor(posX[i * 2] * 16);
                const y1 = Math.floor(posX[i * 2 + 1] * 16);
                const type1 = Math.floor(types[i]);
                
                let totalForceX = 0;
                
                for (let j = 0; j < this.constants.particleCount; j++) {
                    if (i === j) continue;
                    
                    const x2 = Math.floor(posX[j * 2] * 16);
                    const y2 = Math.floor(posX[j * 2 + 1] * 16);
                    const type2 = Math.floor(types[j]);
                    
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const distSq = dx * dx + dy * dy;  // ×256
                    
                    const maxDistFixed = Math.floor(maxDistance * 16);
                    const maxDistSq = maxDistFixed * maxDistFixed;
                    
                    if (distSq < maxDistSq) {
                        const dist = Math.floor(Math.sqrt(distSq));  // ×16
                        const normalizedDist = Math.floor((dist * 256) / maxDistFixed);  // ×256
                        
                        let forceMagnitude = 0;
                        const BETA_FIXED = Math.floor(0.3 * 256);  // 77
                        
                        if (normalizedDist < BETA_FIXED) {
                            forceMagnitude = Math.floor((normalizedDist * 256) / BETA_FIXED) - 256;
                        } 
                        else if (normalizedDist < 256) {
                            const force = Math.floor(forceMatrix[type1 * 4 + type2] * 256);
                            const numerator = Math.abs((normalizedDist * 2) - 256 - BETA_FIXED);
                            const denominator = 256 - BETA_FIXED;
                            forceMagnitude = Math.floor((force * (256 - (numerator * 256) / denominator)) / 256);
                        }
                        
                        if (forceMagnitude !== 0) {
                            const forceScale = Math.floor((forceMagnitude * 256) / dist);
                            totalForceX += Math.floor((dx * forceScale) / 256);
                        }
                    }
                }
                
                // 轉換回浮點數（×16 → ×1）
                return totalForceX / 16;
            })
            .setConstants({ particleCount: data.positions.length / 2 })
            .setOutput([data.positions.length / 2])
            .setOptimizeFloatMemory(true);

            const kernelY = this.gpu.createKernel(function(posX, types, forceMatrix, maxDistance) {
                const i = this.thread.x;
                // 載入位置（轉換到定點數，×16）
                const x1 = Math.floor(posX[i * 2] * 16);
                const y1 = Math.floor(posX[i * 2 + 1] * 16);
                const type1 = Math.floor(types[i]);
                
                let totalForceY = 0;
                
                for (let j = 0; j < this.constants.particleCount; j++) {
                    if (i === j) continue;
                    
                    const x2 = Math.floor(posX[j * 2] * 16);
                    const y2 = Math.floor(posX[j * 2 + 1] * 16);
                    const type2 = Math.floor(types[j]);
                    
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const distSq = dx * dx + dy * dy;  // ×256
                    
                    const maxDistFixed = Math.floor(maxDistance * 16);
                    const maxDistSq = maxDistFixed * maxDistFixed;
                    
                    if (distSq < maxDistSq) {
                        const dist = Math.floor(Math.sqrt(distSq));  // ×16
                        const normalizedDist = Math.floor((dist * 256) / maxDistFixed);  // ×256
                        
                        let forceMagnitude = 0;
                        const BETA_FIXED = Math.floor(0.3 * 256);  // 77
                        
                        if (normalizedDist < BETA_FIXED) {
                            forceMagnitude = Math.floor((normalizedDist * 256) / BETA_FIXED) - 256;
                        } 
                        else if (normalizedDist < 256) {
                            const force = Math.floor(forceMatrix[type1 * 4 + type2] * 256);
                            const numerator = Math.abs((normalizedDist * 2) - 256 - BETA_FIXED);
                            const denominator = 256 - BETA_FIXED;
                            forceMagnitude = Math.floor((force * (256 - (numerator * 256) / denominator)) / 256);
                        }
                        
                        if (forceMagnitude !== 0) {
                            const forceScale = Math.floor((forceMagnitude * 256) / dist);
                            totalForceY += Math.floor((dy * forceScale) / 256);
                        }
                    }
                }
                
                // 轉換回浮點數（×16 → ×1）
                return totalForceY / 16;
            })
            .setConstants({ particleCount: data.positions.length / 2 })
            .setOutput([data.positions.length / 2])
            .setOptimizeFloatMemory(true);

            this.kernel = { x: kernelX, y: kernelY };

        } catch (error) {
            console.error('GPU.js kernel 創建失敗:', error);
            throw new Error('GPU.js kernel 創建失敗，請檢查計算邏輯');
        }
    }

    async run(data) {
        if (!this.kernel || !this.kernel.x || !this.kernel.y) {
            throw new Error('GPU.js kernel 未初始化');
        }
        try {
            // 分別計算 X 和 Y 方向的力
            const forceX = this.kernel.x(
                data.positions,
                data.types,
                data.forceMatrix,
                data.maxDistance
            );
            const forceY = this.kernel.y(
                data.positions,
                data.types,
                data.forceMatrix,
                data.maxDistance
            );

            // 合併結果
            return forceX.map((fx, i) => [fx, forceY[i]]);
        } catch (error) {
            console.error('GPU.js 運算失敗:', error);
            throw error;
        }
    }

    cleanup() {
        try {
            if (this.kernel) {
                this.kernel = null;
            }
            if (this.gpu) {
                this.gpu = null;
            }
        } catch (error) {
            console.warn('GPU.js 清理失敗:', error);
        }
    }
}
