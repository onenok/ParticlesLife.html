// 基礎實現類範本
class BaseImplementation {
    constructor() {
        this.initialized = false;
    }

    async init(data) {
        if (this.initialized) {
            throw new Error('已經初始化過了');
        }

        try {
            await this._initializeImplementation(data);
            this.initialized = true;
        } catch (error) {
            throw new Error(`初始化失敗: ${error.message}`);
        }
    }

    async run(data) {
        if (!this.initialized) {
            throw new Error('尚未初始化');
        }

        try {
            return await this._runImplementation(data);
        } catch (error) {
            throw new Error(`執行失敗: ${error.message}`);
        }
    }

    async cleanup() {
        if (!this.initialized) {
            return;
        }

        try {
            await this._cleanupImplementation();
            this.initialized = false;
        } catch (error) {
            throw new Error(`清理失敗: ${error.message}`);
        }
    }

    // 以下方法需要被子類覆寫
    async _initializeImplementation(data) {
        throw new Error('_initializeImplementation 必須被子類實現');
    }

    async _runImplementation(data) {
        throw new Error('_runImplementation 必須被子類實現');
    }

    async _cleanupImplementation() {
        // 預設不執行任何清理
    }

    // 輔助方法
    validateData(data) {
        if (!data) throw new Error('無效的數據');
        if (!data.positions || !(data.positions instanceof Float32Array)) throw new Error('無效的位置數據');
        if (!data.types || !(data.types instanceof Uint8Array)) throw new Error('無效的類型數據');
        if (!data.forceMatrix || !(data.forceMatrix instanceof Float32Array)) throw new Error('無效的力矩陣');
        if (typeof data.maxDistance !== 'number') throw new Error('無效的最大距離');
    }
}

export { BaseImplementation };