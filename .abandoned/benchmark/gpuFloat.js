// GPU.js 浮點數版本
export class GPUFloatImplementation {
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
            const kernelX = this.gpu.createKernel(function(positions, types, forceMatrix, maxDistance) {
                const i = this.thread.x;
                const x1 = positions[i * 2];
                const y1 = positions[i * 2 + 1];
                const type1 = types[i];
                
                let totalForceX = 0.0;
                
                for (let j = 0; j < this.constants.particleCount; j++) {
                    if (i === j) continue;
                    
                    const x2 = positions[j * 2];
                    const y2 = positions[j * 2 + 1];
                    const type2 = types[j];
                    
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < maxDistance * maxDistance) {
                        const dist = Math.sqrt(distSq);
                        const normalizedDist = dist / maxDistance;
                        
                        let forceMagnitude = 0.0;
                        const BETA = 0.3;
                        
                        if (normalizedDist < BETA) {
                            forceMagnitude = normalizedDist / BETA - 1.0;
                        } 
                        else if (normalizedDist < 1.0) {
                            const force = forceMatrix[type1 * 4 + type2];
                            forceMagnitude = force * (1.0 - Math.abs(2.0 * normalizedDist - 1.0 - BETA) / (1.0 - BETA));
                        }
                        
                        if (forceMagnitude !== 0) {
                            totalForceX += (dx / dist) * forceMagnitude;
                        }
                    }
                }
                
                return totalForceX;
            })
            .setConstants({ particleCount: data.positions.length / 2 })
            .setOutput([data.positions.length / 2]);

            const kernelY = this.gpu.createKernel(function(positions, types, forceMatrix, maxDistance) {
                const i = this.thread.x;
                const x1 = positions[i * 2];
                const y1 = positions[i * 2 + 1];
                const type1 = types[i];
                
                let totalForceY = 0.0;
                
                for (let j = 0; j < this.constants.particleCount; j++) {
                    if (i === j) continue;
                    
                    const x2 = positions[j * 2];
                    const y2 = positions[j * 2 + 1];
                    const type2 = types[j];
                    
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < maxDistance * maxDistance) {
                        const dist = Math.sqrt(distSq);
                        const normalizedDist = dist / maxDistance;
                        
                        let forceMagnitude = 0.0;
                        const BETA = 0.3;
                        
                        if (normalizedDist < BETA) {
                            forceMagnitude = normalizedDist / BETA - 1.0;
                        } 
                        else if (normalizedDist < 1.0) {
                            const force = forceMatrix[type1 * 4 + type2];
                            forceMagnitude = force * (1.0 - Math.abs(2.0 * normalizedDist - 1.0 - BETA) / (1.0 - BETA));
                        }
                        
                        if (forceMagnitude !== 0) {
                            totalForceY += (dy / dist) * forceMagnitude;
                        }
                    }
                }
                
                return totalForceY;
            })
            .setConstants({ particleCount: data.positions.length / 2 })
            .setOutput([data.positions.length / 2]);

            this.kernel = { x: kernelX, y: kernelY };

        } catch (error) {
            console.error('GPU.js kernel 創建失敗:', error);
            throw new Error('GPU.js kernel 創建失敗，請檢查計算邏輯');
        }
    }

    async run(data) {
        if (!this.
            kernel || !this.kernel.x || !this.kernel.y) {
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
                this.kernel.destroy();
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
