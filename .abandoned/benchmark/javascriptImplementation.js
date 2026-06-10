// 純 JavaScript 實現
import { BaseImplementation } from './baseImplementation.js';

export class JavaScriptImplementation extends BaseImplementation {
    async _initializeImplementation(data) {
        // 驗證數據
        this.validateData(data);
        
        // 預先計算常數
        this.BETA = 0.3;
        this.INV_BETA = 1.0 / this.BETA;
        this.ONE_MINUS_BETA = 1.0 - this.BETA;
        this.INV_ONE_MINUS_BETA = 1.0 / this.ONE_MINUS_BETA;
        this.FORCE_SCALE = 10.0;
    }

    async _runImplementation(data) {
        const particleCount = data.positions.length / 2;
        const forces = new Array(particleCount);
        const maxDistSq = data.maxDistance * data.maxDistance;
        const invMaxDist = 1.0 / data.maxDistance;

        // 初始化力數組
        for (let i = 0; i < particleCount; i++) {
            forces[i] = [0, 0];
        }

        // 計算所有粒子對之間的力
        for (let i = 0; i < particleCount; i++) {
            const idx = i * 2;
            const x1 = data.positions[idx];
            const y1 = data.positions[idx + 1];
            const type1 = data.types[i];
            const typeOffset = type1 * 4;

            for (let j = 0; j < particleCount; j++) {
                if (i === j) continue;

                const jdx = j * 2;
                const dx = data.positions[jdx] - x1;
                const dy = data.positions[jdx + 1] - y1;
                const distSq = dx * dx + dy * dy;

                if (distSq >= maxDistSq) continue;

                const dist = Math.sqrt(distSq);
                const normalizedDist = dist * invMaxDist;
                let forceMagnitude = 0;

                if (normalizedDist < this.BETA) {
                    // 排斥力（固定公式）
                    forceMagnitude = normalizedDist * this.INV_BETA - 1.0;
                } else if (normalizedDist < 1.0) {
                    // 吸引/排斥力（基於類型）
                    const force = data.forceMatrix[typeOffset + data.types[j]];
                    const distFromCenter = Math.abs(2.0 * normalizedDist - 1.0 - this.BETA);
                    forceMagnitude = force * (1.0 - distFromCenter * this.INV_ONE_MINUS_BETA);
                }

                if (forceMagnitude !== 0) {
                    const scale = (forceMagnitude * this.FORCE_SCALE * data.maxDistance) / dist;
                    forces[i][0] += dx * scale;
                    forces[i][1] += dy * scale;
                }
            }
        }

        return forces;
    }
}