// 效能監控工具
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.currentRun = null;
    }

    startRun(name) {
        this.currentRun = {
            name,
            startTime: performance.now(),
            startMemory: this.getMemoryUsage(),
            markers: []
        };
    }

    addMarker(name) {
        if (this.currentRun) {
            this.currentRun.markers.push({
                name,
                time: performance.now(),
                memory: this.getMemoryUsage()
            });
        }
    }

    endRun() {
        if (this.currentRun) {
            const endTime = performance.now();
            const endMemory = this.getMemoryUsage();
            
            const runData = {
                duration: endTime - this.currentRun.startTime,
                memoryDelta: endMemory - this.currentRun.startMemory,
                markers: this.currentRun.markers.map(marker => ({
                    name: marker.name,
                    timeFromStart: marker.time - this.currentRun.startTime,
                    memoryAtPoint: marker.memory
                }))
            };

            if (!this.metrics.has(this.currentRun.name)) {
                this.metrics.set(this.currentRun.name, []);
            }
            this.metrics.get(this.currentRun.name).push(runData);
            
            this.currentRun = null;
            return runData;
        }
        return null;
    }

    getMetrics(name) {
        if (name) {
            return this.metrics.get(name);
        }
        return Object.fromEntries(this.metrics);
    }

    getAverageMetrics(name) {
        const runs = this.metrics.get(name);
        if (!runs || runs.length === 0) return null;

        const sum = runs.reduce((acc, run) => ({
            duration: acc.duration + run.duration,
            memoryDelta: acc.memoryDelta + run.memoryDelta
        }), { duration: 0, memoryDelta: 0 });

        return {
            averageDuration: sum.duration / runs.length,
            averageMemoryDelta: sum.memoryDelta / runs.length
        };
    }

    clear() {
        this.metrics.clear();
        this.currentRun = null;
    }

    getMemoryUsage() {
        if (window.performance && window.performance.memory) {
            return window.performance.memory.usedJSHeapSize;
        }
        return 0;
    }

    // 匯出效能報告
    exportReport() {
        const report = {
            timestamp: new Date().toISOString(),
            metrics: {}
        };

        for (const [name, runs] of this.metrics) {
            const averageMetrics = this.getAverageMetrics(name);
            report.metrics[name] = {
                runs: runs.length,
                averageDuration: averageMetrics.averageDuration,
                averageMemoryDelta: averageMetrics.averageMemoryDelta,
                details: runs
            };
        }

        return JSON.stringify(report, null, 2);
    }
}

export { PerformanceMonitor };