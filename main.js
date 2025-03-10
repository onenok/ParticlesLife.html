/*
 * Copyright (c) 2024 OneNok_HK
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

console.log("main.js loaded successfully")

// 創建 Web Worker
let worker = new Worker('particleWorker_Singlethread.js');
// 用戶可控制數據的初始化
const gameState = {
    // 粒子系統基本設置
    threadMode: 'multithread',
    particleTypes: 3,
    particleCounts: [250, 250, 250],
    particleColors: [
        'hsl(0, 100%, 50%)',   // 紅色
        'hsl(120, 100%, 50%)', // 綠色
        'hsl(240, 100%, 50%)'  // 藍色
    ],
    particleGroups: [],
    // 交互矩陣
    forceMatrix: [
        [1, 0.5, 0],
        [0, 1, 0.5],
        [0.5, 0, 1]
    ],
    distanceMatrix: [
        [300, 300, 300],
        [300, 300, 300],
        [300, 300, 300]
    ],
    
    // 物理參數
    tHalf: 0.020,         // 摩擦半衰期
    dt: 1/144,           // 時間步長
    
    // 顯示設置
    isThrough: false,     // 無邊界模式
    
    // 滑鼠交互
    mouseForce: 100,
    
    // 其他設置
    enableParticleAffcetRadiusShow: false,
    selectedParticleId: null,
    selectedParticleType: null,
    nearbyParticlesList: [],
    ballRadius: 1.5,
    RadiusShow: [true, true, true],
    // 更新控制
    updateInterval: 0,    // 0 為無上限
    isMovingCanvas: false
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded")

    // 添加變量
    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 0;

    let particles = [];
    let performanceDataLocal = {
        updateIntervalCountsTimes: 0,
        totalTimeAll: [],
        totalTimeMax: 0,
        totalTimeAverage: 0,
        gAffectCalcTimeAll: [],
        gAffectCalcTimeMax: 0,
        gAffectCalcTimeAverage: 0,
        positionUpdateTimeAll: [],
        positionUpdateTimeMax: 0,
        positionUpdateTimeAverage: 0,
        particleCollisionTimeAll: [],
        particleCollisionTimeMax: 0,
        particleCollisionTimeAverage: 0,
        ParticleAffcetCalcTimeAll: [],
        ParticleAffcetCalcTimeMax: 0,
        ParticleAffcetCalcTimeAverage: 0
    };
    let performanceData = {
        totalTime: 0,
        gAffectCalcTime: 0,
        gAffectCalcCountsTimes: 0,
        particleSkippedCountsTimes: 0,
        positionUpdateTime: 0,
        positionUpdateCountsTimes: 0,
        ParticleAffcetCalcTime: 0,
        particleCollisionTime: 0,
        particleCollisionCountsTimes: 0,
    };
    let totalTimeAverageUpdateMs = 1000;
    let gAffectCalcTimeAverageUpdateMs = 1000;
    let positionUpdateTimeAverageUpdateMs = 1000;
    let ParticleAffcetCalcTimeAverageUpdateMs = 1000;
    let particleCollisionTimeAverageUpdateMs = 1000;
    let totalTimeAverageUpdateLastTime = 0;
    let gAffectCalcTimeAverageUpdateLastTime = 0;
    let positionUpdateTimeAverageUpdateLastTime = 0;
    let ParticleAffcetCalcTimeAverageUpdateLastTime = 0;
    let particleCollisionTimeAverageUpdateLastTime = 0;

    const canvas2d = document.getElementById("board2d");
    const ctx = canvas2d.getContext("2d");


    function draw(particlesGroups) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas2d.width, canvas2d.height);
        
        particlesGroups.forEach(particles => {
            //console.log(`particles.count: ${particles.count}`);
            for (let i = 0; i < particles.count; i++) {
                let p = {
                    x: loadAtomicFloat(particles.getData().x, i),
                    y: loadAtomicFloat(particles.getData().y, i),
                    vx: loadAtomicFloat(particles.getData().vx, i),
                    vy: loadAtomicFloat(particles.getData().vy, i),
                    color: loadAtomicFloat(particles.getData().color, i),
                    type: loadAtomicFloat(particles.getData().type, i),
                    id: loadAtomicFloat(particles.getData().id, i)
                };    
                
                ctx.beginPath();
                ctx.arc(p.x, p.y, gameState.ballRadius, 0, Math.PI * 2);
                
                if (gameState.enableParticleAffcetRadiusShow) {
                    if (gameState.selectedParticleId === null) {
                        ctx.fillStyle = 'gray';
                        ctx.fill();
                        ctx.closePath();
                    }else if (p.id === gameState.selectedParticleId) {
                        let isXOverflow = false;
                        let isYOverflow = false;
                        let newx = p.x;
                        let newy = p.y;
                        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                        ctx.fill();
                        ctx.closePath();
                        for (let i = 0; i < gameState.RadiusShow.length; i++) {
                            if (gameState.RadiusShow[i]) {
                                hsl = gameState.particleColors[i];
                                h = hsl.match(/hsl\((\d+),\s*\d+%,\s*\d+%\)/)[1];
                                hsla = `hsla(${h}, 100%, 50%, 0.3)`;
                                radius = gameState.distanceMatrix[gameState.selectedParticleType][i];
                                ctx.beginPath();
                                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                                ctx.fillStyle = hsla;
                                ctx.fill();
                                ctx.closePath();
                                if (throughCheckbox.checked) {
                                    isXOverflow = false;
                                    isYOverflow = false;
                                    newx = p.x;
                                    newy = p.y;
                                    if ((p.x < radius || p.x > canvas2d.width - radius)){
                                        isXOverflow = true;
                                        newx = p.x < radius ? p.x + canvas2d.width : p.x - canvas2d.width;
                                        ctx.beginPath();
                                        ctx.arc(newx, p.y, radius, 0, Math.PI * 2);
                                        ctx.fillStyle = hsla;
                                        ctx.fill();
                                        ctx.closePath();
                                    }
                                    if ((p.y < radius || p.y > canvas2d.height - radius)){
                                        isYOverflow = true;
                                        newy = p.y < radius ? p.y + canvas2d.height : p.y - canvas2d.height;
                                        ctx.beginPath();
                                        ctx.arc(p.x, newy, radius, 0, Math.PI * 2);
                                        ctx.fillStyle = hsla;
                                        ctx.fill();
                                        ctx.closePath();
                                    }
                                    if (isXOverflow && isYOverflow) {
                                        ctx.beginPath();
                                        ctx.arc(newx, newy, radius, 0, Math.PI * 2);
                                        ctx.fillStyle = hsla;
                                        ctx.fill();
                                        ctx.closePath();
                                    }
                                }
                            }
                        }
                    } else { 
                        if (gameState.RadiusShow[p.type]) {
                            ctx.fillStyle = (gameState.nearbyParticlesList[p.type]||[]).includes(p) ? p.color : 'gray';
                            ctx.fill();
                            ctx.closePath();
                        }
                    }
                } else {
                    ctx.fillStyle = p.color;
                    ctx.fill();
                    ctx.closePath();
                }
            };
        });
    }


    function drawWarningCanvasMoving() {
        const canvasWidth = canvas2d.width;
        const canvasHeight = canvas2d.height;
        ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'; // Yellow background like console.warn
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.font = 'bold 20px monospace'; // Console-like font
        ctx.fillStyle = '#000'; // Dark text
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText('⚠️ 畫布正在移動中', canvasWidth/2, canvasHeight/2, canvasWidth); // Added warning emoji and using fillText for solid text
    }
    
    // --SharedMemoryManager類處理所有共享內存的分配和管理--
    class SharedMemoryManager {
        constructor(particleTypes, particleCounts){
            this.particleTypes = particleTypes;
            this.particleCounts = particleCounts;
            this.buffers = {};
            this.views = {};
            
            // 為每種粒子類型創建獨立的緩衝區
            this.buffers.particleGroups = [];
            for (let i = 0; i < particleTypes; i++) {
                const count = particleCounts[i];
                // 每個粒子需要 7 個 Int32 (x, y, vx, vy, color, type, id)
                const bufferSize = count * 7 * Int32Array.BYTES_PER_ELEMENT;
                this.buffers.particleGroups[i] = new SharedArrayBuffer(bufferSize);
            }

            // 創建同步計數器緩衝區
            this.buffers.sync = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * particleTypes);
        }

        // 獲取指定類型的粒子緩衝區
        getParticleBuffer(type) {
            return this.buffers.particleGroups[type];
        }

        // 獲取同步計數器
        getSyncBuffer() {
            return this.buffers.sync;
        }

        clear() {
            // 清除所有緩衝區
            for (let i = 0; i < this.particleTypes; i++) {
                const particleView = new Int32Array(this.buffers.particleGroups[i]);
                particleView.fill(0);
            }
            
            // 清除同步計數器
            const syncView = new Int32Array(this.buffers.sync);
            syncView.fill(0);
        }
    }

    // 修改 ParticleData 類以配合新的 SharedMemoryManager
    class ParticleData {
        constructor(type, sharedMemoryManager) {
            const buffer = sharedMemoryManager.getParticleBuffer(type);
            this.count = sharedMemoryManager.particleCounts[type];
            
            this.particleData = {
                x: new Int32Array(buffer, 0, this.count),
                y: new Int32Array(buffer, this.count * Int32Array.BYTES_PER_ELEMENT, this.count),
                vx: new Int32Array(buffer, 2 * this.count * Int32Array.BYTES_PER_ELEMENT, this.count),
                vy: new Int32Array(buffer, 3 * this.count * Int32Array.BYTES_PER_ELEMENT, this.count),
                color: new Int32Array(buffer, 4 * this.count * Int32Array.BYTES_PER_ELEMENT, this.count),
                type: new Int32Array(buffer, 5 * this.count * Int32Array.BYTES_PER_ELEMENT, this.count),
                id: new Int32Array(buffer, 6 * this.count * Int32Array.BYTES_PER_ELEMENT, this.count)
            };
            
            this.syncCounter = new Int32Array(sharedMemoryManager.getSyncBuffer())[type];
        }

        add(particle, index) {
            storeAtomicFloat(this.particleData.x, index, particle.x);
            storeAtomicFloat(this.particleData.y, index, particle.y);
            storeAtomicFloat(this.particleData.vx, index, particle.vx);
            storeAtomicFloat(this.particleData.vy, index, particle.vy);
            storeAtomicFloat(this.particleData.color, index, particle.color);
            storeAtomicFloat(this.particleData.type, index, particle.type);
            storeAtomicFloat(this.particleData.id, index, particle.id);
        }

        clear() {
            this.particleData.x.fill(0);
            this.particleData.y.fill(0);
            this.particleData.vx.fill(0);
            this.particleData.vy.fill(0);
            this.particleData.color.fill(0);
            this.particleData.type.fill(0);
            this.particleData.id.fill(0);
        }

        getData() {
            return this.particleData;
        }

        getSyncCounter() {
            return this.syncCounter;
        }
    }
    
    // 添加atomicFloat輔助函數
    function storeAtomicFloat(array, index, value) {
        return Atomics.store(array, index, Math.round(value * 1000));
    }

    function loadAtomicFloat(array, index) {
        return Atomics.load(array, index) / 1000;
    }

    // >>> 生成指定類型的粒子組 <<<
    function create(count, c, type, sharedMemory) {
        // 創建 ParticleData 實例來管理共享內存
        const particleData = new ParticleData(type, sharedMemory);
        
        // 直接在共享內存中創建粒子
        for (let i = 0; i < count; i++) {
            const x = rX();
            const y = rY();
            const id = nextParticleId++;
            
            // 存儲粒子數據到共享內存
            storeAtomicFloat(particleData.getData().x, i, x);
            storeAtomicFloat(particleData.getData().y, i, y);
            storeAtomicFloat(particleData.getData().vx, i, 0);
            storeAtomicFloat(particleData.getData().vy, i, 0);
            storeAtomicFloat(particleData.getData().color, i, c);
            storeAtomicFloat(particleData.getData().type, i, type);
            storeAtomicFloat(particleData.getData().id, i, id);
        }
        
        return particleData;
    }
    // >>> 生成隨機X坐標 <<<
    function rX() {
        return Math.random() * (canvas2d.width - 100) + 50; // 隨機X坐標
    }

    // >>> 生成隨機Y坐標 <<<
    function rY() {
        return Math.random() * (canvas2d.height - 100) + 50; // 隨機Y坐標
    }

    // 初始化遊戲函數修改
    function initGame() {
        let sharedMemory = new SharedMemoryManager(gameState.particleTypes, gameState.particleCounts);
        gameState.particleGroups = []; // 粒子類型
        nextParticleId = 0; // 重置 id 計數器
        // --初始化矩陣和粒子--
        for (let type = 0; type < gameState.particleTypes; type++) {
            gameState.particleGroups[type] = create(gameState.particleCounts[type], gameState.particleColors[type], type, sharedMemory); // 創建粒子
        }
        //console.log(`gameState.particleGroups: ${JSON.stringify(gameState.particleGroups)}`);
        Object.keys(performanceDataLocal).forEach(key => {
            if (performanceDataLocal[key] instanceof Array) {
                performanceDataLocal[key] = [];
            } else {
                performanceDataLocal[key] = 0;
            }
        });
        worker.postMessage({
            type: 'init',
            particleCounts: gameState.particleCounts,
            canvasWidth: canvas2d.width,
            canvasHeight: canvas2d.height,
            particleGroups: gameState.particleGroups,
            particleTypes: gameState.particleTypes,
            performanceData: performanceData,
            ballRadius: gameState.ballRadius  // 添加 ballRadius 參數
        });
    }
    // 隨機化值
    function randomizeValues() {
        document.querySelectorAll('.particle-force').forEach(p => {
            const value = (Math.random() * 2 - 1).toFixed(1);
            p.value = value;
            p.dispatchEvent(new Event('input'));
        });
        document.querySelectorAll('.particle-distance').forEach(p => {
            const value = Math.floor(Math.random() * (300 - 10 + 1)) + 10;
            p.value = value;
            p.dispatchEvent(new Event('input'));
        });
        updateRules();
    }
    // 隨機化並重新開始
    function randomizeAndRestart() {
        randomizeValues();
        initGame();
    }



    function update() {
        // 更新所選單元格的顯示
        draw(gameState.particleGroups);
        if (gameState.isMovingCanvas) {
            drawWarningCanvasMoving();
        }
        if (performanceData.totalTime > performanceDataLocal.totalTimeMax) {
            performanceDataLocal.totalTimeMax = performanceData.totalTime;
        }
        if (performanceData.gAffectCalcTime > performanceDataLocal.gAffectCalcTimeMax){
            performanceDataLocal.gAffectCalcTimeMax = performanceData.gAffectCalcTime;
        }
        if (performanceData.positionUpdateTime > performanceDataLocal.positionUpdateTimeMax){
            performanceDataLocal.positionUpdateTimeMax = performanceData.positionUpdateTime;
        }
        if (performanceData.particleCollisionTime > performanceDataLocal.particleCollisionTimeMax){
            performanceDataLocal.particleCollisionTimeMax = performanceData.particleCollisionTime;
        }
        if (performanceData.ParticleAffcetCalcTime > performanceDataLocal.ParticleAffcetCalcTimeMax){
            performanceDataLocal.ParticleAffcetCalcTimeMax = performanceData.ParticleAffcetCalcTime;
        }
        performanceDataLocal.totalTimeAll.push(performanceData.totalTime);
        performanceDataLocal.gAffectCalcTimeAll.push(performanceData.gAffectCalcTime);
        performanceDataLocal.positionUpdateTimeAll.push(performanceData.positionUpdateTime);
        performanceDataLocal.particleCollisionTimeAll.push(performanceData.particleCollisionTime);
        performanceDataLocal.ParticleAffcetCalcTimeAll.push(performanceData.ParticleAffcetCalcTime);
        // 更新性能數據顯示
        document.getElementById('total-time').textContent = performanceData.totalTime.toFixed(2);
        if (performance.now() - totalTimeAverageUpdateLastTime >= totalTimeAverageUpdateMs) {
            performanceDataLocal.totalTimeAverage = performanceDataLocal.totalTimeAll.reduce((a, b) => a + b, 0) / performanceDataLocal.totalTimeAll.length;
            document.getElementById('total-time-average').textContent = performanceDataLocal.totalTimeAverage.toFixed(2);
            performanceDataLocal.totalTimeAll = [];  
            totalTimeAverageUpdateLastTime = performance.now();
        }
        document.getElementById('total-time-max').textContent = performanceDataLocal.totalTimeMax.toFixed(2);

        document.getElementById('g-Affect-Calc-time').textContent = performanceData.gAffectCalcTime.toFixed(2);
        if (performance.now() - gAffectCalcTimeAverageUpdateLastTime >= gAffectCalcTimeAverageUpdateMs) {
            performanceDataLocal.gAffectCalcTimeAverage = performanceDataLocal.gAffectCalcTimeAll.reduce((a, b) => a + b, 0) / performanceDataLocal.gAffectCalcTimeAll.length;
            document.getElementById('g-Affect-Calc-time-average').textContent = performanceDataLocal.gAffectCalcTimeAverage.toFixed(2);
            performanceDataLocal.gAffectCalcTimeAll = [];
            gAffectCalcTimeAverageUpdateLastTime = performance.now();
        }
        document.getElementById('g-Affect-Calc-time-max').textContent = performanceDataLocal.gAffectCalcTimeMax.toFixed(2);
        document.getElementById('g-Affect-Calc-time-single-average').textContent = performanceData.gAffectCalcCountsTimes > 0 ? ((performanceDataLocal.gAffectCalcTimeAverage/performanceData.gAffectCalcCountsTimes).toFixed(6)) : '不適用';
        document.getElementById('g-Affect-Calc-time-run-per-update').textContent = performanceData.gAffectCalcCountsTimes;
        document.getElementById('particleSkippedCountsTimes').textContent = performanceData.particleSkippedCountsTimes;
        document.getElementById('particleValidCountsTimes').textContent = performanceData.gAffectCalcCountsTimes - performanceData.particleSkippedCountsTimes;

        document.getElementById('position-update-time').textContent = performanceData.positionUpdateTime.toFixed(2);
        if (performance.now() - positionUpdateTimeAverageUpdateLastTime >= positionUpdateTimeAverageUpdateMs) {
            performanceDataLocal.positionUpdateTimeAverage = performanceDataLocal.positionUpdateTimeAll.reduce((a, b) => a + b, 0) / performanceDataLocal.positionUpdateTimeAll.length;
            document.getElementById('position-update-time-average').textContent = performanceDataLocal.positionUpdateTimeAverage.toFixed(2);
            performanceDataLocal.positionUpdateTimeAll = [];
            positionUpdateTimeAverageUpdateLastTime = performance.now();
        }
        document.getElementById('position-update-time-max').textContent = performanceDataLocal.positionUpdateTimeMax.toFixed(2);
        document.getElementById('position-update-time-single-average').textContent = performanceData.positionUpdateCountsTimes > 0 ? ((performanceDataLocal.positionUpdateTimeAverage/performanceData.positionUpdateCountsTimes).toFixed(4)) : '不適用';
        document.getElementById('position-update-time-run-per-update').textContent = performanceData.positionUpdateCountsTimes;

        document.getElementById('particle-collision-time').textContent = performanceData.particleCollisionTime.toFixed(2);
        if (performance.now() - particleCollisionTimeAverageUpdateLastTime >= particleCollisionTimeAverageUpdateMs) {
            performanceDataLocal.particleCollisionTimeAverage = performanceDataLocal.particleCollisionTimeAll.reduce((a, b) => a + b, 0) / performanceDataLocal.particleCollisionTimeAll.length;
            document.getElementById('particle-collision-time-average').textContent = performanceDataLocal.particleCollisionTimeAverage.toFixed(2);
            performanceDataLocal.particleCollisionTimeAll = [];
            particleCollisionTimeAverageUpdateLastTime = performance.now();
        }
        document.getElementById('particle-collision-time-max').textContent = performanceDataLocal.particleCollisionTimeMax.toFixed(2);
        document.getElementById('particle-collision-time-single-average').textContent = performanceData.particleCollisionCountsTimes > 0 ? ((performanceDataLocal.particleCollisionTimeAverage/performanceData.particleCollisionCountsTimes).toFixed(4)) : '不適用';
        document.getElementById('particle-collision-time-run-per-update').textContent = performanceData.particleCollisionCountsTimes;

        document.getElementById('Particle-Affect-Calc-time').textContent = performanceData.ParticleAffcetCalcTime.toFixed(2);
        if (performance.now() - ParticleAffcetCalcTimeAverageUpdateLastTime >= ParticleAffcetCalcTimeAverageUpdateMs) {
            performanceDataLocal.ParticleAffcetCalcTimeAverage = performanceDataLocal.ParticleAffcetCalcTimeAll.reduce((a, b) => a + b, 0) / performanceDataLocal.ParticleAffcetCalcTimeAll.length;
            document.getElementById('Particle-Affect-Calc-time-average').textContent = performanceDataLocal.ParticleAffcetCalcTimeAverage.toFixed(2);
            performanceDataLocal.ParticleAffcetCalcTimeAll = [];
            ParticleAffcetCalcTimeAverageUpdateLastTime = performance.now();
        }
        document.getElementById('Particle-Affect-Calc-time-max').textContent = performanceDataLocal.ParticleAffcetCalcTimeMax.toFixed(2);

        // 更新選中粒子的屬性顯示
        if (gameState.enableParticleAffcetRadiusShow){
            const propertyElement = document.getElementById('selectedParticleProperty');
            if (gameState.selectedParticleId !== null && particles.length > 0) {
                const selectedParticle = particles.find(p => p.id === gameState.selectedParticleId);
                if (selectedParticle) {
                    const properties = [
                        `\n`,
                        `類型: ${selectedParticle.type + 1}`,
                        `位置: (${selectedParticle.x.toFixed(2)}, ${selectedParticle.y.toFixed(2)})`,
                        `速度: (${selectedParticle.vx.toFixed(2)}, ${selectedParticle.vy.toFixed(2)})`,
                        `顏色: ${selectedParticle.color}`,
                        `是否在邊界外: ${selectedParticle.isOutside ? '是' : '否'}`
                    ];
                    propertyElement.innerHTML = properties.join('<br>');
                } else {
                    propertyElement.textContent = '找不到選中的粒子';
                }
            } else {
                propertyElement.textContent = '未選中粒子';
            }
        }

        // 計算並顯示 FPS
        frameCount++;
        const currentTime = performance.now();
        if (currentTime - lastTime >= 1000) {
            fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
            document.getElementById('fps').textContent = fps;
            frameCount = 0;
            lastTime = currentTime;
        }
        gameUPS = performanceDataLocal.updateIntervalCountsTimes;
        document.getElementById('gameUPS').textContent = gameUPS;
        
        let totalTimeAddShowContent = '';
        const totalTimeAddShowContentList = [Number(performanceDataLocal.gAffectCalcTimeAverage.toFixed(2)), Number(performanceDataLocal.positionUpdateTimeAverage.toFixed(2)), Number(performanceDataLocal.particleCollisionTimeAverage.toFixed(2)), Number(performanceDataLocal.ParticleAffcetCalcTimeAverage.toFixed(2))];
        totalTimeAddShowContent += `${totalTimeAddShowContentList.join(' + ')}<br><br>`;
        let sum = 0;
        for (let i = 2; i <= totalTimeAddShowContentList.length; i++) {
            sum = totalTimeAddShowContentList.slice(0, i).reduce((a, b) => a + b, 0);
            totalTimeAddShowContent += `${Number(sum.toFixed(2))}${totalTimeAddShowContentList.slice(i).length > 0 ? ` + ${totalTimeAddShowContentList.slice(i).join(' + ')}` : ''}<br><br>`;
        }
        document.getElementById('total-time-add-show').innerHTML = totalTimeAddShowContent;

        requestAnimationFrame(() => {
            worker.postMessage({ type: 'canUpdate' });
            update();
        });
    }

    // 接收來自 Worker 的消息
    worker.onmessage = function (e) {
        if (e.data.type === 'update') {
            particles = e.data.particles;
            gameState.particleGroups = e.data.particleGroups;
            //console.log(`before performanceDataLocal.totalTimeAverage: ${performanceDataLocal.totalTimeAverage}`);
            performanceData = e.data.performanceData;
            //console.log(`after performanceDataLocal.totalTimeAverage: ${performanceDataLocal.totalTimeAverage}`);
            if (gameState.enableParticleAffcetRadiusShow){
                gameState.nearbyParticlesList = e.data.nearbyParticlesList;
                for (let i = 0; i < gameState.nearbyParticlesList.length; i++) {
                    //console.log(`gameState.nearbyParticlesList[${i}]: ${gameState.nearbyParticlesList[i]}`);
                    document.getElementById(`particle-nearby-particles-${i}`).textContent = `範圍內的類型${i + 1}粒子數量: ${gameState.nearbyParticlesList[i] ? gameState.nearbyParticlesList[i].length : 0}`;
                }
            }
        }
        if (e.data.type === 'setMovingCanvas') {
            gameState.isMovingCanvas = e.data.isMovingCanvas;
        }
        if (e.data.type === 'updateUpdateIntervalCountsTimes') {
            performanceDataLocal.updateIntervalCountsTimes = e.data.updateIntervalCountsTimes;
        }
    };

    // 控制板切換
    const toggleButton = document.getElementById('toggle-controls');
    const controlPanel = document.getElementById('controls');

    toggleButton.addEventListener('click', () => {
        controlPanel.classList.toggle('visible');
        if (controlPanel.classList.contains('visible')) {
            toggleButton.style.right = '310px';
            toggleButton.textContent = '✕';
        } else {
            toggleButton.style.right = '10px';
            toggleButton.textContent = '☰';
        }
        updateCanvasSize();
    });

    // 自動隱藏切換按鈕
    let hideTimeout;
    document.addEventListener('mousemove', () => {
        toggleButton.style.opacity = '0.5';
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            toggleButton.style.opacity = '0';
        }, 3000);
    });

    // 匯出規則
    function exportRules() {
        const rules = {};
        // 添加規則
        rules['forceMatrix'] = gameState.forceMatrix;
        rules['distanceMatrix'] = gameState.distanceMatrix;
        // 添加粒子數量
        rules['particleCounts'] = gameState.particleCounts;
        // 添加粒子類型
        rules['particleTypes'] = gameState.particleTypes;
        // 添加粒子顏色
        rules['particleColors'] = gameState.particleColors;
        // 添加穿透模式狀態
        rules['isThrough'] = gameState.isThrough;
        rules['tHalf'] = gameState.tHalf;
        rules['dt'] = gameState.dt;
        rules['mouseForce'] = gameState.mouseForce;

        // 添加顏色
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rules));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "particle_rules.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    // 導入規則
    function importRules(shouldRestart) {
        const fileInput = document.getElementById('import-file');
        fileInput.value = '';
        fileInput.dataset.shouldRestart = shouldRestart;
        fileInput.click();
    }

    function handleFileSelect(event) {
        //console.log('handleFileSelect');
        const file = event.target.files[0];
        const shouldRestart = event.target.dataset.shouldRestart === 'true';
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const rules = JSON.parse(e.target.result);
                Object.keys(rules).forEach(id => {
                    if (id === 'isThrough') {
                        // 設置穿透模式狀態
                        gameState.isThrough = rules[id];
                    } else if (id === 'particleCounts') {
                        gameState.particleCounts = rules[id];
                    } else if (id === 'particleTypes') {
                        gameState.particleTypes = rules[id];
                    } else if (id === 'particleColors') {
                        gameState.particleColors = rules[id];
                    } else if (id === 'tHalf') {
                        gameState.tHalf = rules[id];
                    } else if (id === 'dt') {
                        gameState.dt = rules[id];
                    } else if (id === 'mouseForce') {
                        gameState.mouseForce = rules[id];
                    } else if (/force(Matrix)*?/.test(id)) {
                        gameState.forceMatrix = rules[id];
                    } else if (/distance(Matrix)*?/.test(id)) {
                        gameState.distanceMatrix = rules[id];
                    }
                });
                //console.log('updateParticleSystem');
                updateParticleSystem();
                //console.log('updateEveryThing');
                updateEveryThing();
                if (shouldRestart) {
                    setTimeout(initGame, 100);
                }
            };
            reader.readAsText(file);
        }
    }

    // 為匯出規則添加事件監聽器
    document.getElementById('export-rules').addEventListener('click', exportRules);
    // 為導入規則添加事件監聽器
    document.getElementById('import-rules').addEventListener('click', () => importRules(false));
    // 為導入規則並重新開始添加事件監聽器
    document.getElementById('import-rules-and-restart').addEventListener('click', () => importRules(true));
    // 為導入文件添加事件監聽器
    document.getElementById('import-file').addEventListener('change', handleFileSelect);

    let mouseX = 0;
    let mouseY = 0;
    let isMouseDown = false;
    let isUpdateMouse = false;
    let isUpdateMouseDownUp = false;

    // 穿透模式切換
    const throughCheckbox = document.getElementById("isThrough");
    throughCheckbox.addEventListener('change', () => {
        gameState.isThrough = throughCheckbox.checked;
        worker.postMessage({ type: 'setThrough', isThrough: gameState.isThrough });
    });

    // 運算模式切換
    const threadModeSelect = document.getElementById("threadMode");
    // 初始化選擇值
    threadModeSelect.value = gameState.threadMode;
    // 添加事件監聽器
    threadModeSelect.addEventListener('change', async () => {
        const newMode = threadModeSelect.value;
        const currentMode = gameState.threadMode;
        
        if (newMode === currentMode) return;

        gameState.threadMode = newMode;

        // 終止當前 worker
        if (worker) {
            worker.terminate();
        }

        // 根據選擇的模式初始化相應的 worker
        switch (newMode) {
            case "multithread":
                worker = new Worker('particleWorker_multithread_fixed.js');
                break;
                
            case "multithread_gpu":
                // 預留給 GPU 加速模式
                console.log("GPU acceleration mode is under development");
                return;
                
            case "multithread_wasm":
                // 預留給 WebAssembly 模式
                console.log("WebAssembly mode is under development");
                return;
                
            default:
                console.error("Unknown thread mode:", newMode);
                return;
        }

        // 初始化新的 worker
        worker.postMessage({ 
            type: 'changeThreadInit',
            particleGroups: gameState.particleGroups,
            canvasWidth: canvas2d.width,
            canvasHeight: canvas2d.height,
            particleTypes: gameState.particleTypes,
            particleColors: gameState.particleColors,
            particleCounts: gameState.particleCounts,
            performanceData: performanceData,
        });

        // 更新所有相關狀態
        updateEveryThing();
    });
        
    // 添加按鈕事件監聽器
    document.getElementById('randomize-button').addEventListener('click', randomizeValues);
    document.getElementById('restart-button').addEventListener('click', initGame);
    document.getElementById('randomize-and-restart-button').addEventListener('click', randomizeAndRestart);
    document.addEventListener("keydown", function(event) {
        if (event.key === "r") {
            randomizeValues();
        }
        if (event.key === "s") {
            initGame();
        }
        if (event.key === "f") {
            randomizeAndRestart();
        }
        if (event.key === "x") {
            isUpdateMouseDownUp = false;
        }
        if (event.key === "z") {
            isUpdateMouse = false;
        }
        if (event.key === "t") {
            throughCheckbox.checked = !throughCheckbox.checked;
            throughCheckbox.dispatchEvent(new Event('change'));
        }
        if (event.key === "m") {
            const currentIndex = threadModeSelect.selectedIndex;
            let nextIndex = (currentIndex + 1) % threadModeSelect.options.length;
            let nextOption = threadModeSelect.options[nextIndex];
            
            while (nextOption.disabled) {
                nextIndex = (nextIndex + 1) % threadModeSelect.options.length;
                nextOption = threadModeSelect.options[nextIndex];
            }
            threadModeSelect.selectedIndex = nextIndex;
            threadModeSelect.dispatchEvent(new Event('change'));
        }
    });

    // 添加滑鼠事件監聽器
    canvas2d.addEventListener('mousedown', (e) => {
        if (!gameState.enableParticleAffcetRadiusShow){
            isUpdateMouseDownUp = true;
            isUpdateMouse = true;
            isMouseDown = true;
            updateMousePosition(e);
        }
    });
    canvas2d.addEventListener('mouseup', () => {
        if (isUpdateMouseDownUp) {
            isMouseDown = false;
            worker.postMessage({ type: 'setMouseInactive' });
        }
    });
    canvas2d.addEventListener('mousemove', (e) => {
        if (isUpdateMouse) {
            updateMousePosition(e);
        }
    });
    function updateMousePosition(e) {
        const rect = canvas2d.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        if (isMouseDown) {
            worker.postMessage({ type: 'updateMousePosition', x: mouseX, y: mouseY });
        }
    }
    
    // 更新HTML
    function updateHTML(){
        const throughCheckbox = document.getElementById('isThrough');
        const particleTypes = document.getElementById('particle-types');
        const updateInterval = document.getElementById('updateInterval');
        const tHalf = document.getElementById('t-half');
        const mouseForce = document.getElementById('mouse-force');

        particleTypes.value = gameState.particleTypes;
        throughCheckbox.checked = gameState.isThrough;
        throughCheckbox.dispatchEvent(new Event('change'));
        updateInterval.value = gameState.updateInterval;
        updateInterval.dispatchEvent(new Event('input'));
        tHalf.value = gameState.tHalf;
        tHalf.dispatchEvent(new Event('input'));
        mouseForce.value = gameState.mouseForce;
        mouseForce.dispatchEvent(new Event('input'));

    };
    
    function updateCanvasSize() {
        const controlPanel = document.getElementById('controls');
        const isPanelVisible = controlPanel.classList.contains('visible');
        const width = document.documentElement.clientWidth - (isPanelVisible ? 300 : 0);
        const height = document.documentElement.clientHeight;

        canvas2d.width = width;
        canvas2d.height = height;

        // 設置 Canvas 樣式
        canvas2d.style.position = 'absolute';
        canvas2d.style.left = '0';
        canvas2d.style.top = '0';

        worker.postMessage({ type: 'updateCanvasSize', width, height });
    }

    // 更新規則
    function updateRules() {
        // 使用 gameState 中的矩陣數據
        worker.postMessage({
            type: 'updateRules',
            forceMatrix: gameState.forceMatrix,
            distanceMatrix: gameState.distanceMatrix
        });
    }

    // 更新顏色
    function updateColors() {
        //console.log(`index.html: gameState.particleColors: ${gameState.particleColors}`);
        worker.postMessage({
            type: 'updateColors',
            particleColors: gameState.particleColors
        });
    }

    // 監聽視窗大小變化
    window.addEventListener("resize", updateCanvasSize);

    function updateMouseForce(){
        worker.postMessage({ type: 'updateMouseForce', force: gameState.mouseForce });
    }
    function updateUpdateInterval(){
        worker.postMessage({ type: 'updateUpdateInterval', interval: gameState.updateInterval });
    }
    function updateDt(){
        worker.postMessage({ type: 'updateDt', dt: gameState.dt });
    }
    function updateBallRadius(){
        worker.postMessage({ type: 'updateBallRadius', ballRadius: gameState.ballRadius });
    }
    function updateRadiusShow(){
        worker.postMessage({ type: 'updateRadiusShow', RadiusShow: gameState.RadiusShow });
    }
    function updateTHalf(){
        worker.postMessage({ type: 'updateTHalf', tHalf: gameState.tHalf });
    }

    /* not used
    function updateIsUsingMultithread(){
        worker.postMessage({ type: 'setIsUsingMultithread', isUsingMultithread: gameState.isUsingMultithread });
    }
    */

    function updateEveryThing(){
        updateHTML();
        updateCanvasSize();
        updateRules();
        updateColors();
        updateMouseForce();
        updateUpdateInterval();
        updateBallRadius();
        updateRadiusShow();
        updateTHalf();
        updateDt();
    }

    // 為滑鼠力量滑塊添加事件監聽器
    const mouseForceSlider = document.getElementById('mouse-force');
    const mouseForceNumber = document.getElementById('mouse-force-number');
    mouseForceSlider.addEventListener('input', () => {
        mouseForceNumber.value = mouseForceSlider.value;
        worker.postMessage({ type: 'updateMouseForce', force: parseFloat(mouseForceSlider.value) });
    });
    mouseForceNumber.addEventListener('input', () => {
        mouseForceSlider.value = mouseForceNumber.value;
        worker.postMessage({ type: 'updateMouseForce', force: parseFloat(mouseForceNumber.value) });
    });

    // 為更新間隔滑塊添加事件監聽器
    const updateIntervalSlider = document.getElementById('updateInterval');
    const updateIntervalNumber = document.getElementById('updateInterval-number');
    const updateIntervalText = document.getElementById('updateInterval-text');
    updateIntervalSlider.addEventListener('input', () => {
        const value = updateIntervalSlider.value;
        if (value == 0) {
            updateIntervalNumber.value = null;
            updateIntervalText.value = "無上限";
        } else {
            updateIntervalNumber.value = value;
            updateIntervalText.value = '';
        }
        worker.postMessage({ type: 'updateUpdateInterval', interval: parseInt(value == 0 ? 0 : 1000 / value) });
    });
    updateIntervalNumber.addEventListener('input', () => {
        const value = updateIntervalNumber.value;
        updateIntervalSlider.value = value;
        if (value == 0) {
            updateIntervalText.value = "無上限";
            updateIntervalNumber.value = null;
        } else {
            updateIntervalText.value = '';
        }
        worker.postMessage({ type: 'updateUpdateInterval', interval: parseInt(value == 0 ? 0 : 1000 / value) });
    });

    // 添加t_half控制事件監聽器
    document.getElementById('t-half').addEventListener('input', (e) => {
        const tHalf = parseFloat(e.target.value);
        document.getElementById('t-half-number').value = tHalf;
        worker.postMessage({ type: 'updateTHalf', tHalf: tHalf });
    });

    document.getElementById('t-half-number').addEventListener('input', (e) => {
        const tHalf = parseFloat(e.target.value);
        document.getElementById('t-half').value = tHalf;
        worker.postMessage({ type: 'updateTHalf', tHalf: tHalf });
    });
    

    const enableParticleAffcetRadiusShowCheckbox = document.getElementById('enableParticleAffcetRadiusShow');
    enableParticleAffcetRadiusShowCheckbox.addEventListener('change', () => {
        gameState.enableParticleAffcetRadiusShow = enableParticleAffcetRadiusShowCheckbox.checked;
        worker.postMessage({ type: 'toggleParticleAffcetRadiusShow', enable: gameState.enableParticleAffcetRadiusShow });
    });

    /*
    const isOneRadiusShowCheckbox = document.getElementById('isOneRadiusShow');
    isOneRadiusShowCheckbox.addEventListener('change', () => {
        isOneRadiusShow = isOneRadiusShowCheckbox.checked;
    });
    const isTwoRadiusShowCheckbox = document.getElementById('isTwoRadiusShow');
    isTwoRadiusShowCheckbox.addEventListener('change', () => {
        isTwoRadiusShow = isTwoRadiusShowCheckbox.checked;
    });
    const isThreeRadiusShowCheckbox = document.getElementById('isThreeRadiusShow');
    isThreeRadiusShowCheckbox.addEventListener('change', () => {
        isThreeRadiusShow = isThreeRadiusShowCheckbox.checked;
    });
    */
    
    function initializeMatrices(types, oldForceMatrix, oldDistanceMatrix) {
        forceMatrix = new Array(types);
        for (let i = 0; i < types; i++) {
            forceMatrix[i] = new Array(types);
            for (let j = 0; j < types; j++) {
                // Keep old force value if available, otherwise use 0
                forceMatrix[i][j] = oldForceMatrix && i < oldForceMatrix.length && j < oldForceMatrix[i].length ? 
                    oldForceMatrix[i][j] : Math.random()*2-1;
            }
        }
        gameState.forceMatrix = forceMatrix;
        //console.log(`index.html: forceMatrix: ${forceMatrix}`);
        
        distanceMatrix = new Array(types);
        for (let i = 0; i < types; i++) {
            distanceMatrix[i] = new Array(types);
            for (let j = 0; j < types; j++) {
                // Keep old distance value if available, otherwise use 100
                distanceMatrix[i][j] = oldDistanceMatrix && i < oldDistanceMatrix.length && j < oldDistanceMatrix[i].length ?
                    oldDistanceMatrix[i][j] : 150;
            }
        }
        gameState.distanceMatrix = distanceMatrix;
        //console.log(`index.html: distanceMatrix: ${distanceMatrix}`);
        
        particleGroups = new Array(types);
        for (let i = 0; i < types; i++) {
            particleGroups[i] = [];
        }
        gameState.particleGroups = particleGroups;
        //console.log(`index.html: particleGroups: ${particleGroups}`);
    }
    function initializeColors(types) {
        particleColors = new Array(types);
        for (let i = 0; i < types; i++) {
            particleColors[i] = `hsl(${i * 360 / types}, 100%, 50%)`;
        }
        gameState.particleColors = particleColors;
    }
    function initializeParticleCounts(types) {
        particleCounts = new Array(types);
        for (let i = 0; i < types; i++) {
            particleCounts[i] = gameState.particleCounts[i] || 250;
        }
        gameState.particleCounts = particleCounts;
    }
    // 添加粒子類型數量監聽器
    document.getElementById('particle-types').addEventListener('input', (e) => {
        const types = parseInt(e.target.value);
        gameState.particleTypes = types;
        initializeColors(types);
        initializeMatrices(types, gameState.forceMatrix, gameState.distanceMatrix);
        initializeParticleCounts(types);
        updateParticleSystem();
        updateEveryThing();
        initGame();
    });

    // 修改單元格選擇功能
    canvas2d.addEventListener('click', (e) => {
        if (gameState.enableParticleAffcetRadiusShow) {
            const rect = canvas2d.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // 找到最近的粒子
            selectedParticle = particles.reduce((closest, particle) => {
                const dx = particle.x - x;
                const dy = particle.y - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return (distance < closest.distance)&&(distance < 10) ? { particle, distance } : closest;
            }, { particle: null, distance: Infinity }).particle;
            if (selectedParticle) {
                gameState.selectedParticleId = selectedParticle.id;
                gameState.selectedParticleType = selectedParticle.type;
                document.getElementById('selectedParticleId').textContent = gameState.selectedParticleId;
                // 請求 worker 計算附近的粒子
                worker.postMessage({ 
                    type: 'updateSelectedParticle', 
                    particleId: gameState.selectedParticleId,
                });
            } else {
                document.getElementById('selectedParticleId').textContent = '無';
                gameState.selectedParticleId = null;
                gameState.selectedParticleType = null;
                worker.postMessage({ 
                    type: 'updateSelectedParticle', 
                    particleId: null,
                });
                gameState.nearbyParticlesList = [];
            }
        }
    });

    // 創建粒子類型控制界面
    function createParticleTypeControls(type, total, min, max, step, count) {
        const defaultColor = gameState.particleColors[type];
        
        return `
            <div class="particle-type" data-type="${type}">
                <h4>類型 ${type + 1}</h4>
                <div>
                    <label>數量:</label>
                    <input type="range" class="particle-count" min="${min}" max="${max}" step="${step}" value="${count}">
                    <input type="number" class="particle-count-number" min="${min}" max="${max}" step="${step}" onkeyup="if(this.value>${max}){this.value=${max}}else if(this.value<${min}){this.value=${min}}" value="${count}">
                </div>
                <div>
                    <label>顏色:</label>
                    <div class="color-inputs">
                        <input type="color" class="particle-color" value="${hslToHex(defaultColor)}">
                        <span class="hsl-display">${defaultColor}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function createMatrixTable(types, matrixType, min, max, step, matrix){
        let html = '<table class="matrix-container">';
        for (let i = 0; i < types; i++) {
            html += `<tr>`;
            for (let j = 0; j < types; j++) {
                html += `<td><input type="number" class="matrix-input ${matrixType}" data-i="${i}" data-j="${j}" min="${min}" max="${max}" step="${step}" onkeyup="if(this.value>${max}){this.value=${max}}else if(this.value<${min}){this.value=${min}}" value="${matrix[i][j]}"></td>`;
            }
            html += `</tr>`;
        }
        html += '</table>';
        return html;
    }

    // 更新粒子系統
    function updateParticleSystem() {
        const types = gameState.particleTypes;
        const particleSettings = document.getElementById('particle-settings');
        const interactionMatrix = document.getElementById('interaction-matrix');
        const particleAffcetRadiusShow = document.getElementById('particle-affcet-radius-show');
        const particleNearbyParticles = document.getElementById('particle-nearby-particles');
        for (let i = 0; i < types; i++) {
            gameState.RadiusShow[i] = gameState.RadiusShow[i] || true;
        };
        
        // 更新粒子類型控制
        particleSettings.innerHTML = '';
        for (let i = 0; i < types; i++) {
            particleSettings.innerHTML += createParticleTypeControls(i, types, 0, 500, 10, gameState.particleCounts[i]);
        }
        
        // 更新交互矩陣
        interactionMatrix.innerHTML = `
            <div class="matrix-table">  
                <h4>粒子引力</h4>
                <p class="description">數值越大，粒子越容易聚集在一起</p>
                ${createMatrixTable(types, 'particle-force', -1, 1, 0.05, gameState.forceMatrix)}
            </div>

            <div class="matrix-table">
                <h4>粒子距離</h4>
                <p class="description">數值越大，引力范圍越大</p>
                ${createMatrixTable(types, 'particle-distance', 10, 300, 10, gameState.distanceMatrix)}
            </div>
        `;
        
        particleAffcetRadiusShow.innerHTML = '';
        for (let i = 0; i < types; i++) {
            particleAffcetRadiusShow.innerHTML += `
                <div class="particle-affcet-radius-show">
                    <label for="show-particle-affcet-radius-${i}">顯示類型${i + 1}粒子影響範圍</label>
                    <input type="checkbox" class="show-particle-affcet-radius" id="show-particle-affcet-radius-${i}" data-type="${i}" checked>
                </div>
            `;
        }
        particleNearbyParticles.innerHTML = "";
        for (let i = 0; i < types; i++) {
            particleNearbyParticles.innerHTML += `
                <p class="particle-nearby-particles" id="particle-nearby-particles-${i}">範圍內的類型${i + 1}粒子數量: N/A</p>
            `;
        }
        
        // 添加事件監聽器
        setupParticleControlEventListeners();
        setupMatrixEventListeners();
        setupParticleAffcetRadiusShowEventListeners();
    }
    // 設置粒子控制的事件監聽器
    function setupParticleControlEventListeners() {
        // 數量控制
        document.querySelectorAll('.particle-count').forEach(input => {
            const numberInput = input.parentElement.querySelector('.particle-count-number');
            const type = parseInt(input.closest('.particle-type').dataset.type);
            
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                numberInput.value = value;
                gameState.particleCounts[type] = value;
                initGame();
            });
            
            numberInput.addEventListener('input', (e) => {
                const value = Math.min(Math.max(parseFloat(e.target.value) || 0, parseFloat(e.target.min)), parseFloat(e.target.max));
                input.value = value;
                gameState.particleCounts[type] = value;
                initGame();
            });
        });

        // 顏色控制
        document.querySelectorAll('.particle-color').forEach(input => {
            const type = parseInt(input.closest('.particle-type').dataset.type);
            const hslDisplay = input.parentElement.querySelector('.hsl-display');
            
            input.addEventListener('input', (e) => {
                const hsl = hexToHsl(e.target.value);
                gameState.particleColors[type] = hsl;
                hslDisplay.textContent = hsl;
                worker.postMessage({
                    type: 'updateColors',
                    particleColors: gameState.particleColors
                });
            });
        });
    }
    // 設置矩陣輸入的事件監聽器
    function setupMatrixEventListeners() {
        document.querySelectorAll('.particle-force').forEach(input => {
            input.addEventListener('input', (e) => {
                const force = Math.min(Math.max(parseFloat(e.target.value) || 0, parseFloat(e.target.min)), parseFloat(e.target.max));
                const i = parseInt(e.target.dataset.i);
                const j = parseInt(e.target.dataset.j);
                gameState.forceMatrix[i][j] = parseFloat(force);
                updateRules();
            });
        });

        document.querySelectorAll('.particle-distance').forEach(input => {
            input.addEventListener('input', (e) => {
                const i = parseInt(e.target.dataset.i);
                const j = parseInt(e.target.dataset.j);
                const distance = Math.min(Math.max(parseFloat(e.target.value) || 0, parseFloat(e.target.min)), parseFloat(e.target.max));
                gameState.distanceMatrix[i][j] = parseFloat(distance);
                updateRules();
            });
        });
    }
    // 設置粒子影響範圍顯示的事件監聽器
    function setupParticleAffcetRadiusShowEventListeners() {
        document.querySelectorAll('.show-particle-affcet-radius').forEach(input => {
            input.addEventListener('change', (e) => {
                const type = parseInt(e.target.dataset.type);
                gameState.RadiusShow[type] = e.target.checked;
                worker.postMessage({
                    type: 'updateRadiusShow',
                    RadiusShow: gameState.RadiusShow
                });
            });
        });
    }

    // HSL 轉 Hex 顏色函數
    function hslToHex(hsl) {
        const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (!match) return '#000000';
        
        const h = parseInt(match[1]) / 360;
        const s = parseInt(match[2]) / 100;
        const l = parseInt(match[3]) / 100;
        
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        const toHex = x => {
            const hex = Math.round(x * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // Hex 轉 HSL 顏色函數
    function hexToHsl(hex) {
        // 移除 # 號（如果有的話）
        hex = hex.replace(/^#/, '');
        
        // 解析 RGB 值
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        
        // 轉換為 0-1 範圍
        const rr = r / 255;
        const gg = g / 255;
        const bb = b / 255;
        
        const max = Math.max(rr, gg, bb);
        const min = Math.min(rr, gg, bb);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case rr: h = (gg - bb) / d + (gg < bb ? 6 : 0); break;
                case gg: h = (bb - rr) / d + 2; break;
                case bb: h = (rr - gg) / d + 4; break;
            }
            
            h /= 6;
        }
        
        return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    }
    
    // 初始化遊戲並開始更新循環
    updateParticleSystem();
    updateEveryThing();
    initGame();
    draw(gameState.particleGroups);
    update();
});
