import { BaseImplementation } from './baseImplementation.js';

// WebAssembly SIMD 浮點數版本
export class WasmSIMDFloatImplementation extends BaseImplementation {
    static wasmModule = null;

    constructor() {
        super();
        this.simulation = null;
        this.module = null;
    }

    static async _loadModule() {
        if (!WasmSIMDFloatImplementation.wasmModule) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = './particles_simd.js';
                script.onload = () => {
                    if (typeof window.createModule !== 'function') {
                        reject(new Error('createModule 未定義'));
                    } else {
                        resolve();
                    }
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });

            WasmSIMDFloatImplementation.wasmModule = await window.createModule({
                locateFile: (path) => {
                    if (path.endsWith('.wasm')) {
                        return './particles_simd.wasm';
                    }
                    return path;
                }
            });
        }
        return WasmSIMDFloatImplementation.wasmModule;
    }

    async _initializeImplementation(data) {
        try {
            this.module = await WasmSIMDFloatImplementation._loadModule();
            
            this.simulation = new this.module.ParticleSimulation();

            this.simulation.init(data.positions, data.types, data.forceMatrix, data.maxDistance);

        } catch (error) {
            console.error('WASM SIMD 初始化失敗:', error);
            throw new Error(`WASM 初始化失敗: ${error.message}`);
        }
    }

    async _runImplementation(data) {
        if (!this.simulation) {
            throw new Error('WASM 模擬器尚未初始化');
        }

        try {
            this.simulation.calculate();

            const forces = this.simulation.getForces();
            const particleCount = forces.length / 2;
            const resultForces = [];

            for (let i = 0; i < particleCount; i++) {
                const fx = forces[i * 2];
                const fy = forces[i * 2 + 1];
                resultForces.push([fx, fy]);
            }

            return resultForces;
        } catch (error) {
            console.error('WASM SIMD 執行失敗:', error);
            throw new Error(`WASM 執行失敗: ${error.message}`);
        }
    }

    async _cleanupImplementation() {
        if (this.simulation) {
            this.simulation.delete();
            this.simulation = null;
        }
    }
}
