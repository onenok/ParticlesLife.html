import { BaseImplementation } from './baseImplementation.js';

// WebAssembly SIMD 整數版本 (使用定點數模擬 i16x8)
export class WasmSIMDIntImplementation extends BaseImplementation {
    constructor() {
        super();
        this.simulation = null;
        this.module = null;
        this.POSITION_SCALE = 16;  // 定點數精度：positions ×16 (Int16)
        this.FORCE_SCALE = 256;    // forces ×256 (Int16)
    }

    async _initializeImplementation(data) {
        try {
            // 重用 Float 版的 wasmModule
            this.module = await WasmSIMDFloatImplementation._loadModule();
            
            this.simulation = new this.module.ParticleSimulation();

            // 創建 vector 並填充 (使用 default ctor + push_back)
            const positions = new this.module.VectorFloat();
            for (let val of data.positions) {
                positions.push_back(val);
            }
            const types = new this.module.VectorUint8();
            for (let val of data.types) {
                types.push_back(val);
            }
            const forceMatrix = new this.module.VectorFloat();
            for (let val of data.forceMatrix) {
                forceMatrix.push_back(val);
            }

            this.simulation.init(positions, types, forceMatrix, data.maxDistance);
            
            // 清理臨時向量
            positions.delete();
            types.delete();
            forceMatrix.delete();

        } catch (error) {
            console.error('WASM SIMD Int 初始化失敗:', error);
            throw new Error(`WASM Int 初始化失敗: ${error.message}`);
        }
    }

    async _runImplementation(data) {
        if (!this.simulation) {
            throw new Error('WASM 模擬器尚未初始化');
        }

        try {
            // 步驟1: 轉換輸入為定點數 (模擬 Int 計算)
            const particleCount = data.positions.length / 2;
            const fixedPositions = new Float32Array(data.positions.length);
            for (let i = 0; i < data.positions.length; i++) {
                fixedPositions[i] = data.positions[i] * this.POSITION_SCALE;
            }
            
            const fixedForceMatrix = new Float32Array(data.forceMatrix.length);
            for (let i = 0; i < data.forceMatrix.length; i++) {
                fixedForceMatrix[i] = data.forceMatrix[i] * this.FORCE_SCALE;
            }
            
            const fixedMaxDistance = data.maxDistance * this.POSITION_SCALE;
            
            // 步驟2: 創建 vector 並 init (每次 run 重新 init)
            const positionsVec = new this.module.VectorFloat();
            for (let val of fixedPositions) {
                positionsVec.push_back(val);
            }
            const typesVec = new this.module.VectorUint8();
            for (let val of data.types) {
                typesVec.push_back(val);
            }
            const forceMatrixVec = new this.module.VectorFloat();
            for (let val of fixedForceMatrix) {
                forceMatrixVec.push_back(val);
            }
            
            this.simulation.init(positionsVec, typesVec, forceMatrixVec, fixedMaxDistance);
            
            // 步驟3: 執行計算
            this.simulation.calculate();
            
            // 步驟4: 獲取並轉換輸出
            const forcesVector = this.simulation.getForces();
            const forces = [];
            
            for (let i = 0; i < particleCount; i++) {
                const fx_fixed = forcesVector.get(i * 2);
                const fy_fixed = forcesVector.get(i * 2 + 1);
                const fx = fx_fixed / this.POSITION_SCALE;
                const fy = fy_fixed / this.POSITION_SCALE;
                forces.push([fx, fy]);
            }
            
            // 清理
            forcesVector.delete();
            positionsVec.delete();
            typesVec.delete();
            forceMatrixVec.delete();
            
            return forces;
        } catch (error) {
            console.error('WASM SIMD Int 執行失敗:', error);
            throw new Error(`WASM Int 執行失敗: ${error.message}`);
        }
    }

    async _cleanupImplementation() {
        if (this.simulation) {
            this.simulation.delete();
            this.simulation = null;
        }
        // module 重用，不清理
    }
}
