import { PerformanceMonitor } from './performanceMonitor.js';
import { JavaScriptImplementation } from './javascriptImplementation.js';

// 基準測試框架
class ParticleBenchmark {
    constructor(options = {}) {
        this.iterations = options.iterations || 100;
        this.particleCount = options.particleCount || 1000;
        this.typeCount = options.typeCount || 4;
        this.implementations = new Map();
        this.testData = this.generateTestData();
        this.onProgress = options.onProgress || (() => {});
    }

    generateTestData(particleCount = this.particleCount) {
        // 初始化粒子位置（均勻分佈）
        const positions = new Float32Array(particleCount * 2);
        for (let i = 0; i < particleCount * 2; i += 2) {
            positions[i] = Math.random() * 1000;     // x
            positions[i + 1] = Math.random() * 1000; // y
        }

        // 初始化粒子類型
        const types = new Uint8Array(particleCount);
        for (let i = 0; i < particleCount; i++) {
            types[i] = Math.floor(Math.random() * this.typeCount);
        }

        // 初始化力矩陣（隨機值）
        const forceMatrix = new Float32Array(this.typeCount * this.typeCount);
        for (let i = 0; i < this.typeCount * this.typeCount; i++) {
            forceMatrix[i] = (Math.random() * 2 - 1) * 0.5; // -0.5 到 0.5
        }

        return {
            positions,
            types,
            forceMatrix,
            maxDistance: 100,
            width: 1000,
            height: 1000
        };
    }

    addImplementation(name, initFn, runFn, cleanup = () => {}) {
        this.implementations.set(name, { initFn, runFn, cleanup });
    }

    async runBenchmark() {
        const results = new Map();
        const totalSteps = this.implementations.size * (5 + this.iterations);
        let currentStep = 0;

        for (const [name, impl] of this.implementations) {
            console.log(`執行 ${name} 的基準測試...`);
            
            try {
                // 初始化
                console.log(`初始化 ${name}...`);
                const instance = await impl.initFn(this.testData);
                
                // 預熱
                console.log(`預熱 ${name}...`);
                for (let i = 0; i < 5; i++) {
                    await impl.runFn(this.testData);
                    this.onProgress(++currentStep / totalSteps);
                }

                // 效能測試
                console.log(`測試 ${name}...`);
                const times = [];
                const memoryUsage = [];
                
                for (let i = 0; i < this.iterations; i++) {
                    if (window.gc) window.gc(); // 如果可用，調用垃圾回收

                    // 強制 GC（如果可用）
                    if (window.gc) window.gc();
                    
                    // 測量基準記憶體使用量
                    const baseMemory = window.performance?.memory?.usedJSHeapSize || 0;
                    
                    const start = performance.now();
                    await impl.runFn(this.testData);
                    const end = performance.now();
                    
                    // 計算最大記憶體使用量
                    const currentMemory = window.performance?.memory?.usedJSHeapSize || 0;
                    const peakMemory = Math.max(0, currentMemory - baseMemory);
                    
                    times.push(end - start);
                    memoryUsage.push(peakMemory);
                    
                    this.onProgress(++currentStep / totalSteps);
                }

                // 清理
                await impl.cleanup();

            // 使用效能監控器
            const monitor = new PerformanceMonitor();
            monitor.startRun(name);
            
            // 計算統計
            const avg = times.reduce((a, b) => a + b) / times.length;
            const min = Math.min(...times);
            const max = Math.max(...times);
            const sorted = times.sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const stdDev = Math.sqrt(
                times.reduce((acc, t) => acc + Math.pow(t - avg, 2), 0) / times.length
            );

            // 記錄效能指標
            monitor.addMarker('統計計算完成');
            const monitorData = monitor.endRun();                // 記憶體使用統計
                const avgMemory = memoryUsage.length > 0 
                    ? memoryUsage.reduce((a, b) => a + b) / memoryUsage.length 
                    : null;

                results.set(name, {
                    avg,
                    median,
                    min,
                    max,
                    stdDev,
                    avgMemory,
                    rawTimes: times,
                    rawMemory: memoryUsage
                });

            } catch (error) {
                console.error(`${name} 測試失敗:`, error);
                results.set(name, { error: error.message });
            }
        }

        return results;
    }

    async compareAll() {
        console.log("=== 開始基準測試 ===");
        console.log(`粒子數: ${this.particleCount}`);
        console.log(`迭代次數: ${this.iterations}`);
        console.log(`粒子類型數: ${this.typeCount}`);
        console.log("==================\n");

        const results = await this.runBenchmark();
        
        console.log("\n=== 測試結果 ===");
        
        // 找出最快的實現
        let fastestName = null;
        let fastestTime = Infinity;
        
        for (const [name, stats] of results) {
            if (stats.error) {
                console.log(`\n${name}:`);
                console.log(`  錯誤: ${stats.error}`);
                continue;
            }

            console.log(`\n${name}:`);
            console.log(`  平均時間: ${stats.avg.toFixed(3)}ms`);
            console.log(`  中位數:   ${stats.median.toFixed(3)}ms`);
            console.log(`  最小值:   ${stats.min.toFixed(3)}ms`);
            console.log(`  最大值:   ${stats.max.toFixed(3)}ms`);
            console.log(`  標準差:   ${stats.stdDev.toFixed(3)}ms`);
            
            if (name.startsWith('WebGL')) {
                console.log(`  平均記憶體使用: 使用 GPU 顯示記憶體，無法測量`);
            } else if (stats.avgMemory) {
                console.log(`  平均記憶體使用: ${(stats.avgMemory / 1024 / 1024).toFixed(2)}MB (JavaScript堆記憶體)`);
            }

            if (stats.median < fastestTime) {
                fastestTime = stats.median;
                fastestName = name;
            }
        }

        if (fastestName) {
            console.log(`\n最快的實現: ${fastestName} (中位數: ${fastestTime.toFixed(3)}ms)`);
        }

        return results;
    }

    // 匯出測試結果為 JSON
    exportResults(results) {
        return JSON.stringify({
            metadata: {
                timestamp: new Date().toISOString(),
                particleCount: this.particleCount,
                iterations: this.iterations,
                typeCount: this.typeCount,
                userAgent: navigator.userAgent,
            },
            results: Object.fromEntries(results)
        }, null, 2);
    }
}

// 匯出基準測試類
export { ParticleBenchmark };
