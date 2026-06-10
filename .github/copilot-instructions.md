# Copilot 指導文件：粒子生命模擬器

## 專案架構與開發狀態

### 主程式（穩定版本）
位於根目錄的主要程式碼：
- `main.js`: 主線程，負責 UI 渲染和使用者互動
- `particleWorker_multithread_fixed.js`: 優化後的多線程 Worker，處理粒子計算
- `particleCalculator.js`: 核心粒子計算邏輯
- `ui-range.js`: 自定義範圍輸入元件
- `style.css`: UI 樣式定義

### 效能優化開發（進行中）
專案目前正在進行效能優化，使用兩個特殊目錄：

1. `.testing/` - 優化實驗區：
   - 新的架構嘗試
   - 效能改進實驗
   - 安全的程式碼重構

2. `benchmark/` - 效能測試工具：
   - 比較不同實現方法的效能
   - 包含 WebGL、WASM SIMD、GPU.js 等實現
   - 用於指導優化方向的決策

## 關鍵模式與慣例

### 多線程通訊
Worker 通訊使用結構化消息格式：
```javascript
{
  type: 'update' | 'init' | 'reset',
  data: {
    // 配置資料
  }
}
```

### 效能優化原則
1. 密集計算移至 Web Worker
2. 使用 TypedArray 進行數據傳輸
3. 避免在主線程進行粒子計算

### 狀態管理
- 粒子狀態集中在 Worker 中管理
- UI 狀態通過 main.js 控制
- 使用自定義事件進行狀態同步

## 效能優化指南

### 優化實驗流程
1. 在 `benchmark/` 運行效能測試比較不同方案
2. 選擇最佳方案後在 `.testing/` 進行實作
3. 確認改進後再合併回主程式

### 優化方案比較（benchmark/）
提供多種優化實現供測試：
- WebGL (webglFloat.js/webglInt.js)
- WASM SIMD (wasmSIMDFloat.js/wasmSIMDInt.js)
- GPU.js (gpu.js/gpuFloat.js/gpuInt.js)
- 原生 JavaScript（基準測試）

### 新架構嘗試（.testing/）
包含以下改進方向：
- SharedMemoryManager：優化記憶體使用
- WorkerPool：改進多執行緒管理
- 重構的粒子計算邏輯

## 程式碼維護準則

### 版本控制
- 主要功能變更前先在 `.testing/` 驗證
- 使用 benchmark 測試驗證效能改進
- 保持主程式的穩定性

### 效能考量
- 避免在主線程進行大量計算
- 使用 TypedArray 進行數據傳輸
- 注意多線程安全性

## 專案運行

### 主程式
1. 使用任何 HTTP 伺服器啟動
2. 在瀏覽器開啟 `index.html`

### 效能測試
1. 開啟 `benchmark/benchmark.html`
2. 依照提示執行各項測試
3. 比較不同實現的效能數據
