/*
 * Particles Life - WebGL Optimized Version
 * Implemented with GPU.js for force/position/collision calculations
 * Based on original code, adapted for WebGL rendering and GPU acceleration
 */

console.log("main.js loaded successfully")
// Utility function for one-time console logging
const onceConsole = (() => {
    const printed = new Set();
    return (key, ...message) => {
        if (!printed.has(key)) {
            console.log(...message);
            printed.add(key);
        }
    };
})();
// 創建 Web Worker
let worker = new Worker('forceCalcWorker.js');
// Global game state
let gameState = {
    // Loaded from JSON
    physics: {
        dt: 1 / 144,
        tHalf: 0.020,
        restitution: 0.8
    },
    boundary: {
        mode: "mirror",
        enableAdaptive: false,
        enableClamp: true
    },
    collision: {
        enableCollision: true,
        collisionIterations: 3
    },
    simulation: {
        minWidth: 400,
        minHeight: 300,
        maxVelocity: "auto",
        maxIterations: 5,
        ballRadius: 1.5
    },
    mouse: {
        force: 100,
        x: 0,
        y: 0,
        active: false
    },
    forces: {
        forceMin: -1,
        forceMax: 1,
        distMin: 0,
        distRandMin: 10,
        distRandMax: 300,
        forceRandMin: -1,
        forceRandMax: 1
    },

    // Loaded from rules.json
    particleTypes: 3,
    particleCounts: [250, 250, 250],
    particleColors: [
        'hsl(0, 100%, 50%)',
        'hsl(120, 100%, 50%)',
        'hsl(240, 100%, 50%)'
    ],
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

    isThrough: false,  // Equivalent to periodic
    enableParticleAffcetRadiusShow: false,
    selectedParticleIndex: null,
    selectedParticleId: null,
    selectedParticleType: null,
    nearbyParticlesList: [],
    RadiusShow: [true, true, true],
    updateInterval: 0,
    isMovingCanvas: false,
    isPaused: false
};

// Particle data - Float32Array for GPU
let particleData = {
    x: null,
    y: null,
    vx: null,
    vy: null,
    type: null,
    id: null
};

// GPU and WebGL
let gpu = null;
let webglCanvas = null;
let gl = null;

// Performance (adapted from original)
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;
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

let totalParticles = 0;
let nextParticleId = 0;

async function loadConfig() {
    try {
        // First, try to load from localStorage backups
        const savedSystem = localStorage.getItem('system.json');
        const savedRules = localStorage.getItem('rules.json');
        if (savedSystem && savedRules) {
            const system = JSON.parse(savedSystem);
            const rules = JSON.parse(savedRules);
            // Merge system
            Object.keys(system).forEach(key => {
                if (gameState[key] !== undefined) {
                    gameState[key] = { ...gameState[key], ...system[key] };
                }
            });
            // Override rules
            gameState.particleTypes = rules.particleTypes || gameState.particleTypes;
            gameState.particleCounts = rules.particleCounts || gameState.particleCounts;
            gameState.particleColors = rules.particleColors || gameState.particleColors;
            gameState.forceMatrix = rules.forceMatrix || gameState.forceMatrix;
            gameState.distanceMatrix = rules.distanceMatrix || gameState.distanceMatrix;
            console.log('Loaded from localStorage backup');
        }

        // Try to load/override from files
        try {
            const systemResponse = await fetch('system.json');
            if (systemResponse.ok) {
                const system = await systemResponse.json();
                Object.keys(system).forEach(key => {
                    if (gameState[key] !== undefined) {
                        gameState[key] = { ...gameState[key], ...system[key] };
                    }
                });
            }
        } catch (fileError) {
            console.warn('system.json not found or invalid, using backup/defaults');
        }

        try {
            const rulesResponse = await fetch('rules.json');
            if (rulesResponse.ok) {
                const rules = await rulesResponse.json();
                gameState.particleTypes = rules.particleTypes || gameState.particleTypes;
                gameState.particleCounts = rules.particleCounts || gameState.particleCounts;
                gameState.particleColors = rules.particleColors || gameState.particleColors;
                gameState.forceMatrix = rules.forceMatrix || gameState.forceMatrix;
                gameState.distanceMatrix = rules.distanceMatrix || gameState.distanceMatrix;
            }
        } catch (fileError) {
            console.warn('rules.json not found or invalid, using backup/defaults');
        }

        // Update totalParticles
        totalParticles = gameState.particleCounts.reduce((sum, count) => sum + count, 0);

        console.log('Configs loaded/updated');
        saveConfigBackup();  // Always backup current state to localStorage
    } catch (error) {
        console.error('Failed to load configs:', error);
        // Rely on inline defaults in gameState
        totalParticles = gameState.particleCounts.reduce((sum, count) => sum + count, 0);
    }
}

// Save config backup to localStorage (for runtime changes)
function saveConfigBackup() {
    const system = {
        simulation: gameState.simulation,
        physics: gameState.physics,
        boundary: gameState.boundary,
        collision: gameState.collision,
        mouse: gameState.mouse,
        forces: gameState.forces
    };
    const rules = {
        particleTypes: gameState.particleTypes,
        particleCounts: gameState.particleCounts,
        particleColors: gameState.particleColors,
        forceMatrix: gameState.forceMatrix,
        distanceMatrix: gameState.distanceMatrix
    };
    localStorage.setItem('system.json', JSON.stringify(system));
    localStorage.setItem('rules.json', JSON.stringify(rules));
}

async function initParticles() {
    nextParticleId = 0;
    // Ensure totalParticles is up-to-date
    totalParticles = gameState.particleCounts.reduce((a, b) => a + b, 0);

    if (particleData.x.length !== totalParticles) {
        // Re-allocate if counts changed
        particleData.x = new Float32Array(totalParticles);
        particleData.y = new Float32Array(totalParticles);
        particleData.vx = new Float32Array(totalParticles);
        particleData.vy = new Float32Array(totalParticles);
        particleData.type = new Float32Array(totalParticles);
        particleData.id = new Int32Array(totalParticles);
    }

    let index = 0;
    for (let type = 0; type < gameState.particleTypes; type++) {
        for (let i = 0; i < gameState.particleCounts[type]; i++) {
            particleData.x[index] = Math.random() * (webglCanvas.width - 100) + 50;
            particleData.y[index] = Math.random() * (webglCanvas.height - 100) + 50;
            particleData.vx[index] = 0;
            particleData.vy[index] = 0;
            particleData.type[index] = type;
            particleData.id[index] = nextParticleId++;
            index++;
        }
    }

    // Recreate kernels if particle count changed
    createKernels();

    // Update distMax
    gameState.distMax = Math.floor(Math.min(webglCanvas.width, webglCanvas.height) / 20) * 10;

    console.log(`Particles initialized: ${totalParticles} particles, distMax: ${gameState.distMax}`);
}

// Initialize game (core setup, particles initialized later when canvas ready)
async function initGame() {
    await loadConfig();

    // Initialize GPU.js if not already
    if (!gpu) {
        if (typeof GPU === 'undefined') {
            console.error('GPU.js not loaded, falling back to CPU mode');
            // Set to CPU mode
            document.getElementById('threadMode').value = 'cpu';
            initCPUMode();
            return;
        }
        try {
            gpu = new GPU.GPU();
            console.log('GPU.js initialized');
        } catch (e) {
            console.error('Failed to initialize GPU.js:', e);
            // Fallback to CPU
            document.getElementById('threadMode').value = 'cpu';
            initCPUMode();
            return;
        }
    }

    // Reset performance
    Object.keys(performanceDataLocal).forEach(key => {
        if (performanceDataLocal[key] instanceof Array) {
            performanceDataLocal[key] = [];
        } else {
            performanceDataLocal[key] = 0;
        }
    });

    // Particles will be initialized after canvas setup in DOMLoaded
    // Start update loop (it will pause if no particles)
    update();
}

// GPU Kernels
let forceKernel = null;
let positionKernel = null;
let collisionKernel = null;

// Create kernels
function createKernels() {
    const totalParticles = gameState.particleCounts.reduce((a, b) => a + b, 0);
    const types = gameState.particleTypes;

    // Flatten matrices for GPU
    const flatForceMatrix = gameState.forceMatrix.flat();
    const flatDistanceMatrix = gameState.distanceMatrix.flat();

    // Force calculation kernel (O(N^2))
    forceKernel = gpu.createKernel(function(particles, forceMatrix, distanceMatrix, mousePos, mouseForce, isThrough, canvasSize, totalParticles, types, dt) {
        const ix = this.thread.x;
        const x = particles[ix * 5 + 0];
        const y = particles[ix * 5 + 1];
        const pType = Math.floor(particles[ix * 5 + 4]);
        let totalFx = 0;
        let totalFy = 0;

        for (let j = 0; j < this.constants.totalParticles; j++) {
            if (ix === j) continue;
            const jx = particles[j * 5 + 0];
            const jy = particles[j * 5 + 1];
            let dx = jx - x;
            let dy = jy - y;
            if (isThrough) {
                if (Math.abs(dx) > canvasSize[0] / 2) dx -= Math.sign(dx) * canvasSize[0];
                if (Math.abs(dy) > canvasSize[1] / 2) dy -= Math.sign(dy) * canvasSize[1];
            }
            const distSq = dx * dx + dy * dy;
            if (distSq === 0) continue;  // Avoid division by zero
            const dist = Math.sqrt(distSq);
            const jType = Math.floor(particles[j * 5 + 4]);
            const force = forceMatrix[pType * types + jType];
            const maxDist = distanceMatrix[pType * types + jType];
            if (dist > maxDist || maxDist === 0) continue;
            const normalizedDist = dist / maxDist;
            const BETA = 0.3;
            let forceMag = 0;
            if (normalizedDist < BETA) {
                forceMag = normalizedDist / BETA - 1;
            } else if (BETA <= normalizedDist && normalizedDist < 1) {
                forceMag = force * (1 - Math.abs(2 * normalizedDist - 1 - BETA) / (1 - BETA));
            }
            if (forceMag === 0) continue;
            totalFx += forceMag * (dx / dist) * 10 * maxDist;
            totalFy += forceMag * (dy / dist) * 10 * maxDist;
        }

        // Mouse force
        if (mousePos[2]) {  // isMouseActive
            const mx = mousePos[0] - x;
            const my = mousePos[1] - y;
            const mDistSq = mx * mx + my * my;
            if (mDistSq > 0) {
            const mForce = mouseForce / Math.sqrt(mDistSq);
                totalFx += mForce * (mx / Math.sqrt(mDistSq));
                totalFy += mForce * (my / Math.sqrt(mDistSq));
            }
        }

        return [totalFx * dt, totalFy * dt];
    }).setOutput([totalParticles, 2]).setConstants({totalParticles});

    // Position update kernel (with boundary)
    positionKernel = gpu.createKernel(function(particles, forcesX, forcesY, dt, friction, canvasSize, mode, maxV, maxIterations) {
        const ix = this.thread.x;
        let vx = forcesX[ix] + particles[ix * 5 + 2] * friction;  // previous vx * friction + force
        let vy = forcesY[ix] + particles[ix * 5 + 3] * friction;
        let x = particles[ix * 5 + 0] + vx * dt;
        let y = particles[ix * 5 + 1] + vy * dt;

        // Speed clamp
        vx = Math.max(-maxV, Math.min(maxV, vx));
        vy = Math.max(-maxV, Math.min(maxV, vy));

        // Boundary handling
        if (mode === 0) {  // mirror
            let iters = 0;
            while (x < 0 && iters < maxIterations) {
                x = -x;
                vx = -vx;
                iters++;
            }
            iters = 0;
            while (x > canvasSize[0] && iters < maxIterations) {
                x = 2 * canvasSize[0] - x;
                vx = -vx;
                iters++;
            }
            iters = 0;
            while (y < 0 && iters < maxIterations) {
                y = -y;
                vy = -vy;
                iters++;
            }
            iters = 0;
            while (y > canvasSize[1] && iters < maxIterations) {
                y = 2 * canvasSize[1] - y;
                vy = -vy;
                iters++;
            }
        } else if (mode === 1) {  // periodic
            x = ((x % canvasSize[0]) + canvasSize[0]) % canvasSize[0];
            y = ((y % canvasSize[1]) + canvasSize[1]) % canvasSize[1];
        }

        return [x, y, vx, vy];
    }).setOutput([totalParticles, 4]);

    // Collision kernel (relaxation)
    collisionKernel = gpu.createKernel(function(particles, radius, restitution, iterations) {
        const ix = this.thread.x;
        let vx = particles[ix * 5 + 2];
        let vy = particles[ix * 5 + 3];
        const x = particles[ix * 5 + 0];
        const y = particles[ix * 5 + 1];

        for (let iter = 0; iter < iterations; iter++) {
            for (let j = 0; j < this.constants.totalParticles; j++) {
                if (ix === j) continue;
                const jx = particles[j * 5 + 0];
                const jy = particles[j * 5 + 1];
                let dx = jx - x;
                let dy = jy - y;
                const distSq = dx * dx + dy * dy;
                const minDistSq = (2 * radius) * (2 * radius);
                if (distSq >= minDistSq || distSq === 0) continue;
                const dist = Math.sqrt(distSq);
                const nx = dx / dist;
                const ny = dy / dist;
                // Relative velocity
                const jvx = particles[j * 5 + 2];
                const jvy = particles[j * 5 + 3];
                const dvx = jvx - vx;
                const dvy = jvy - vy;
                const normalVel = dvx * nx + dvy * ny;
                if (normalVel > 0) continue;
                const jn = -(1 + restitution) * normalVel / 2;
                vx += jn * nx / iterations;  // Partial update to relax
                vy += jn * ny / iterations;
                // Position correction (simple, to avoid overlap)
                const overlap = (2 * radius - dist) / 2;
                // Note: Position correction in GPU kernel is tricky, so relax velocity
            }
        }

        return [vx, vy];
    }).setOutput([totalParticles, 2]).setConstants({totalParticles});
}

// Update loop
function update() {
    if (gameState.isPaused) {
        requestAnimationFrame(update);
        return;
    }

    const startTime = performance.now();

    // Update dynamic params
    gameState.isThrough = document.getElementById('isThrough').checked;
    gameState.mouse.force = parseFloat(document.getElementById('mouse-force').value);
    gameState.collision.enableCollision = document.getElementById('enableCollision').checked;
    gameState.collision.collisionIterations = parseInt(document.getElementById('collisionIterations').value);
    gameState.boundary.mode = document.getElementById('boundaryMode').value;
    gameState.simulation.minWidth = parseInt(document.getElementById('minWidth').value);
    gameState.simulation.minHeight = parseInt(document.getElementById('minHeight').value);

    // Clear performance
    performanceData.totalTime = 0;
    performanceData.gAffectCalcTime = 0;
    performanceData.positionUpdateTime = 0;
    performanceData.particleCollisionTime = 0;

    const { dt, restitution } = gameState.physics;
    const friction = Math.pow(0.5, dt / gameState.physics.tHalf);

    const canvasSize = [webglCanvas.width, webglCanvas.height];
    const maxV = canvasSize[0] * 0.05 / dt;  // Auto
    const modeNum = gameState.boundary.mode === "mirror" ? 0 : 1;

    // Combine particle data for GPU kernels
    const particles = new Float32Array(totalParticles * 5);
    for (let i = 0; i < totalParticles; i++) {
        particles[i * 5 + 0] = particleData.x[i];
        particles[i * 5 + 1] = particleData.y[i];
        particles[i * 5 + 2] = particleData.vx[i];
        particles[i * 5 + 3] = particleData.vy[i];
        particles[i * 5 + 4] = particleData.type[i];
    }

    // Force calculation
    const forceStart = performance.now();
    const forces = forceKernel(
        particles,
        new Float32Array(gameState.forceMatrix.flat()),
        new Float32Array(gameState.distanceMatrix.flat()),
        [gameState.mouse.x, gameState.mouse.y, gameState.mouse.active],
        gameState.mouse.force,
        gameState.isThrough,
        canvasSize,
        totalParticles,
        gameState.particleTypes,
        dt
    );
    const forcesX = new Float32Array(totalParticles);
    const forcesY = new Float32Array(totalParticles);
    for (let i = 0; i < totalParticles; i++) {
        forcesX[i] = forces[i][0];
        forcesY[i] = forces[i][1];
    }
    performanceData.gAffectCalcTime = performance.now() - forceStart;

    // Position update
    const positionStart = performance.now();
    const newPositions = positionKernel(
        particles,
        forcesX,
        forcesY,
        dt,
        friction,
        canvasSize,
        modeNum,
        maxV,
        gameState.simulation.maxIterations
    );
    const posX = new Float32Array(totalParticles);
    const posY = new Float32Array(totalParticles);
    const velX = new Float32Array(totalParticles);
    const velY = new Float32Array(totalParticles);
    for (let i = 0; i < totalParticles; i++) {
        const row = newPositions[i];
        posX[i] = row[0];
        posY[i] = row[1];
        velX[i] = row[2];
        velY[i] = row[3];
    }
    particleData.x = posX;
    particleData.y = posY;
    particleData.vx = velX;
    particleData.vy = velY;
    performanceData.positionUpdateTime = performance.now() - positionStart;

    // Collision
    if (gameState.collision.enableCollision) {
        const collisionStart = performance.now();
        // Update particles with new positions and velocities
        for (let i = 0; i < totalParticles; i++) {
            particles[i * 5 + 0] = particleData.x[i];
            particles[i * 5 + 1] = particleData.y[i];
            particles[i * 5 + 2] = particleData.vx[i];
            particles[i * 5 + 3] = particleData.vy[i];
            particles[i * 5 + 4] = particleData.type[i];
        }
        const newVelocities = collisionKernel(
            particles,
            gameState.simulation.ballRadius,
            restitution,
            gameState.collision.collisionIterations
        );
        const newVx = new Float32Array(totalParticles);
        const newVy = new Float32Array(totalParticles);
        for (let i = 0; i < totalParticles; i++) {
            newVx[i] = newVelocities[i][0];
            newVy[i] = newVelocities[i][1];
        }
        particleData.vx = newVx;
        particleData.vy = newVy;
        performanceData.particleCollisionTime = performance.now() - collisionStart;
    } else {
        performanceData.particleCollisionTime = 0;
        performanceData.particleCollisionCountsTimes = 0;
    }

    // Render
    render();

    // Update performance display
    frameCount++;
    const currentTime = performance.now();
    if (currentTime - lastTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        document.getElementById('fps').textContent = fps;
        frameCount = 0;
        lastTime = currentTime;
        updatePerformanceDisplay();
    }

    performanceData.totalTime = performance.now() - startTime;
    performanceData.positionUpdateCountsTimes = totalParticles;

    requestAnimationFrame(update);
}

// Render with WebGL
function render() {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Simple point rendering for particles
    const positions = [];
    for (let i = 0; i < totalParticles; i++) {
        positions.push(particleData.x[i], particleData.y[i]);
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Assume vertex shader with attribute vec2 position, gl_PointSize = radius * 2
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    // Draw points
    gl.drawArrays(gl.POINTS, 0, totalParticles);

    // For radius show, if enabled, use instanced rendering or separate pass for circles
    if (gameState.enableParticleAffcetRadiusShow && gameState.selectedParticleId !== null) {
        // Stub: Render selected particle radius as circle using fragment shader or quad
        console.log('Radius show stub');
    }
}

// Update performance display (adapted from original)
function updatePerformanceDisplay() {
    document.getElementById('total-time').textContent = performanceData.totalTime.toFixed(2);
    document.getElementById('gameUPS').textContent = performanceDataLocal.updateIntervalCountsTimes;
    // ... Other performance metrics
    // For averages, as in original code
}

// UI Events (adapted from original)
document.addEventListener('DOMContentLoaded', async () => {
    webglCanvas = document.getElementById('boardwebgl2');
    gl = webglCanvas.getContext('webgl2');
    if (!gl) {
        console.error('WebGL2 not supported, trying WebGL1');
        gl = webglCanvas.getContext('webgl');
        if (!gl) {
            console.error('WebGL not supported, fallback to CPU');
            const threadModeSelect = document.getElementById('threadMode');
            if (threadModeSelect) {
                threadModeSelect.value = 'cpu';
            }
            initCPUMode();
            return;
        }
    }

    // UI elements
    const overlay = document.getElementById('small-canvas-overlay');

    // Generate dynamic UI on load
    generateParticleSettings();
    generateInteractionMatrix();

    // Toggle controls
    const toggleButton = document.getElementById('toggle-controls');
    const controlPanel = document.getElementById('controls');
    toggleButton.addEventListener('click', () => {
        controlPanel.classList.toggle('visible');
        updateCanvasSize();
    });

    // Particle types change
    const particleTypesInput = document.getElementById('particle-types');
    particleTypesInput.addEventListener('change', (e) => {
        const newTypes = parseInt(e.target.value);
        if (newTypes < 1 || newTypes > 10) return;
        gameState.particleTypes = newTypes;
        // Resize arrays
        gameState.particleCounts = gameState.particleCounts.slice(0, newTypes).concat(Array(newTypes - gameState.particleCounts.length).fill(250));
        gameState.particleColors = gameState.particleColors.slice(0, newTypes).concat(Array(newTypes - gameState.particleColors.length).fill((i) => `hsl(${(i * 120) % 360}, 100%, 50%)`));
        for (let i = gameState.particleColors.length; i < newTypes; i++) {
            gameState.particleColors[i] = `hsl(${(i * 120) % 360}, 100%, 50%)`;
        }
        // Resize matrices
        const oldTypes = gameState.forceMatrix.length;
        gameState.forceMatrix = gameState.forceMatrix.slice(0, newTypes).map(row => row.slice(0, newTypes).concat(Array(newTypes - row.length).fill(0)));
        for (let i = gameState.forceMatrix.length; i < newTypes; i++) {
            gameState.forceMatrix.push(Array(newTypes).fill(0));
            gameState.forceMatrix[i][i] = 1;
        }
        gameState.distanceMatrix = gameState.distanceMatrix.slice(0, newTypes).map(row => row.slice(0, newTypes).concat(Array(newTypes - row.length).fill(300)));
        for (let i = gameState.distanceMatrix.length; i < newTypes; i++) {
            gameState.distanceMatrix.push(Array(newTypes).fill(300));
        }
        generateParticleSettings();
        generateInteractionMatrix();
        saveConfigBackup();
        initParticles();  // Re-init particles
    });

    // Mouse
    let mouseX = webglCanvas.width / 2;
    let mouseY = webglCanvas.height / 2;
    let isMouseActive = false;
    let isMouseLocked = false;
    let lockedMouseX = 0;
    let lockedMouseY = 0;

    gameState.mouse.locked = false;

    webglCanvas.addEventListener('mousemove', (e) => {
        const rect = webglCanvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        if (!gameState.mouse.locked) {
            gameState.mouse.x = mouseX;
            gameState.mouse.y = mouseY;
        }
        gameState.mouse.active = isMouseActive;
    });
    webglCanvas.addEventListener('mousedown', (e) => {
        isMouseActive = true;
        gameState.mouse.active = true;
    });
    webglCanvas.addEventListener('mouseup', () => {
        isMouseActive = false;
        gameState.mouse.active = false;
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
        switch (e.key.toLowerCase()) {
            case 'r':
                e.preventDefault();
                // Randomize all values: counts, matrix
                gameState.particleCounts = gameState.particleCounts.map(() => Math.random() * 500 | 0);
                gameState.forceMatrix = gameState.forceMatrix.map(row => row.map(() => Math.random() * 2 - 1));
                gameState.distanceMatrix = gameState.distanceMatrix.map(row => row.map(() => Math.random() * 300 + 50 | 0));
                generateParticleSettings();
                generateInteractionMatrix();
                saveConfigBackup();
                initParticles();
                break;
            case 's':
                e.preventDefault();
                initParticles();  // Restart: reinitialize positions/velocities
                break;
            case 'f':
                e.preventDefault();
                // Randomize and restart
                // ... (same as r then s)
                gameState.particleCounts = gameState.particleCounts.map(() => Math.random() * 500 | 0);
                gameState.forceMatrix = gameState.forceMatrix.map(row => row.map(() => Math.random() * 2 - 1));
                gameState.distanceMatrix = gameState.distanceMatrix.map(row => row.map(() => Math.random() * 300 + 50 | 0));
                generateParticleSettings();
                generateInteractionMatrix();
                saveConfigBackup();
                initParticles();
                break;
            case 'x':
                e.preventDefault();
                gameState.mouse.active = true;  // Continuous attract
                break;
            case 'z':
                e.preventDefault();
                if (gameState.mouse.locked) {
                    gameState.mouse.locked = false;
                    gameState.mouse.x = mouseX;
                    gameState.mouse.y = mouseY;
                } else {
                    gameState.mouse.locked = true;
                    lockedMouseX = mouseX;
                    lockedMouseY = mouseY;
                    gameState.mouse.x = lockedMouseX;
                    gameState.mouse.y = lockedMouseY;
                }
                break;
            case 'm':
                e.preventDefault();
                const threadSelect = document.getElementById('threadMode');
                if (threadSelect.value === 'webgl') {
                    threadSelect.value = 'cpu';
                    // Fallback to CPU if implemented
                    initCPUMode();
                } else {
                    threadSelect.value = 'webgl';
                    // Re-init GPU if possible
                    initGame();
                }
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key.toLowerCase() === 'x') {
            gameState.mouse.active = false;
        }
    });

    // Resize
    window.addEventListener('resize', updateCanvasSize);

    // Boundary mode
    const boundarySelect = document.getElementById('boundaryMode');
    boundarySelect.addEventListener('change', (e) => {
        gameState.boundary.mode = e.target.value;
        saveConfigBackup();
    });

    // Collision toggle
    const collisionCheckbox = document.getElementById('enableCollision');
    collisionCheckbox.addEventListener('change', (e) => {
        gameState.collision.enableCollision = e.target.checked;
        saveConfigBackup();
    });

    // Collision iterations
    const collisionIterSlider = document.getElementById('collisionIterations');
    collisionIterSlider.addEventListener('input', (e) => {
        gameState.collision.collisionIterations = parseInt(e.target.value);
        saveConfigBackup();
    });

    // Min size
    const minWidthInput = document.getElementById('minWidth');
    minWidthInput.addEventListener('input', (e) => {
        gameState.simulation.minWidth = parseInt(e.target.value);
        saveConfigBackup();
    });
    const minHeightInput = document.getElementById('minHeight');
    minHeightInput.addEventListener('input', (e) => {
        gameState.simulation.minHeight = parseInt(e.target.value);
        saveConfigBackup();
    });

    // Mouse force
    const mouseForceSlider = document.getElementById('mouse-force');
    mouseForceSlider.addEventListener('input', (e) => {
        gameState.mouse.force = parseFloat(e.target.value);
        saveConfigBackup();
    });

    // tHalf
    const tHalfSlider = document.getElementById('t-half');
    tHalfSlider.addEventListener('input', (e) => {
        gameState.physics.tHalf = parseFloat(e.target.value);
        saveConfigBackup();
    });

    // Import/Export
    document.getElementById('export-rules').addEventListener('click', async () => {
        const rulesData = {
            particleTypes: gameState.particleTypes,
            particleCounts: gameState.particleCounts,
            particleColors: gameState.particleColors,
            forceMatrix: gameState.forceMatrix,
            distanceMatrix: gameState.distanceMatrix
        };
        const blob = new Blob([JSON.stringify(rulesData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rules.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    // Import file handling (simplified, from file input, merge to gameState)
    document.getElementById('import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const rules = JSON.parse(event.target.result);
                    // Merge
                    gameState.particleTypes = rules.particleTypes || gameState.particleTypes;
                    gameState.particleCounts = rules.particleCounts || gameState.particleCounts;
                    gameState.particleColors = rules.particleColors || gameState.particleColors;
                    gameState.forceMatrix = rules.forceMatrix || gameState.forceMatrix;
                    gameState.distanceMatrix = rules.distanceMatrix || gameState.distanceMatrix;
                    await initGame();  // Re-init with new rules
                } catch (err) {
                    console.error('Invalid JSON');
                }
            };
            reader.readAsText(file);
        }
    });

    // Dynamic particle settings generation
    function generateParticleSettings() {
        const container = document.getElementById('particle-settings');
        if (!container) return;
        container.innerHTML = '';
        for (let type = 0; type < gameState.particleTypes; type++) {
            const div = document.createElement('div');
            div.className = 'particle-type';
            div.innerHTML = `
                <h4>粒子類型 ${type + 1}</h4>
                <label for="count-${type}">數量:</label>
                <input type="range" id="count-${type}-slider" min="0" max="1000" step="10" value="${gameState.particleCounts[type] || 250}" data-type="${type}">
                <input type="number" id="count-${type}-number" min="0" max="1000" step="10" value="${gameState.particleCounts[type] || 250}" data-type="${type}">
                <label for="color-${type}">顏色:</label>
                <input type="color" id="color-${type}" value="${rgbToHex(parseHSL(gameState.particleColors[type] || `hsl(${(type * 120) % 360}, 100%, 50%)`))}" data-type="${type}">
                <div class="circle" style="background-color: ${gameState.particleColors[type] || `hsl(${(type * 120) % 360}, 100%, 50%)`}"></div>
            `;
            container.appendChild(div);

            // Event listeners for count
            const slider = div.querySelector('[data-type="' + type + '"]');
            const number = div.querySelector('input[type="number"]');
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                number.value = val;
                gameState.particleCounts[type] = val;
                saveConfigBackup();
                initParticles();
            });
            number.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                slider.value = val;
                gameState.particleCounts[type] = val;
                saveConfigBackup();
                initParticles();
            });

            // Event listener for color
            const colorInput = div.querySelector('input[type="color"]');
            colorInput.addEventListener('change', (e) => {
                gameState.particleColors[type] = hexToHSL(e.target.value);
                saveConfigBackup();
            });
        }
    }

    // Dynamic interaction matrix generation
    function generateInteractionMatrix() {
        const container = document.getElementById('interaction-matrix');
        if (!container) return;
        container.innerHTML = '<h3>交互矩陣</h3>';

        // Force matrix section
        const forceDiv = document.createElement('div');
        forceDiv.innerHTML = '<h4>力矩陣</h4>';
        const forceTable = document.createElement('table');
        forceTable.className = 'matrix-table';
        let header = '<tr><th></th>';
        for (let i = 0; i < gameState.particleTypes; i++) {
            header += `<th>到類型 ${i+1}</th>`;
        }
        header += '</tr>';
        forceTable.innerHTML = header;

        for (let i = 0; i < gameState.particleTypes; i++) {
            let row = `<tr><td>從類型 ${i+1}</td>`;
            for (let j = 0; j < gameState.particleTypes; j++) {
                row += `<td><input type="number" step="0.01" min="-1" max="1" value="${gameState.forceMatrix[i][j] || 0}" data-type-i="${i}" data-type-j="${j}" data-matrix="force"></td>`;
            }
            row += '</tr>';
            forceTable.innerHTML += row;
        }
        forceDiv.appendChild(forceTable);
        container.appendChild(forceDiv);

        // Distance matrix section
        const distDiv = document.createElement('div');
        distDiv.innerHTML = '<h4>距離矩陣</h4>';
        const distTable = document.createElement('table');
        distTable.className = 'matrix-table';
        distTable.innerHTML = header;  // Reuse header

        for (let i = 0; i < gameState.particleTypes; i++) {
            let row = `<tr><td>從類型 ${i+1}</td>`;
            for (let j = 0; j < gameState.particleTypes; j++) {
                row += `<td><input type="number" min="0" max="500" value="${gameState.distanceMatrix[i][j] || 300}" data-type-i="${i}" data-type-j="${j}" data-matrix="distance"></td>`;
            }
            row += '</tr>';
            distTable.innerHTML += row;
        }
        distDiv.appendChild(distTable);
        container.appendChild(distDiv);

        // Add event listeners for all inputs in matrices
        container.querySelectorAll('input[data-matrix]').forEach(input => {
            input.addEventListener('input', (e) => {
                const i = parseInt(e.target.dataset.typeI);
                const j = parseInt(e.target.dataset.typeJ);
                const val = parseFloat(e.target.value);
                if (e.target.dataset.matrix === 'force') {
                    gameState.forceMatrix[i][j] = val;
                } else {
                    gameState.distanceMatrix[i][j] = val;
                }
                saveConfigBackup();
                // No re-init needed for matrices
            });
        });
    }

    // Color conversion helpers
    function parseHSL(hslString) {
        const match = hslString.match(/hsl\((\d+), (\d+)%?, (\d+)%?\)/i);
        if (!match) return { r: 1, g: 1, b: 1 };

        let h = parseFloat(match[1]) / 360;
        let s = parseFloat(match[2]) / 100;
        let l = parseFloat(match[3]) / 100;

        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;

        let r = hue2rgb(p, q, h + 1 / 3);
        let g = hue2rgb(p, q, h);
        let b = hue2rgb(p, q, h - 1 / 3);

        return { r, g, b };
    }

    function rgbToHex({ r, g, b }) {
        return `#${[r, g, b].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 1, g: 1, b: 1 };
    }

    function hexToHSL(hex) {
        const rgb = hexToRgb(hex);
        let { r, g, b } = rgb;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    }

    // Particle types change event - moved here for order

    // Other original UI (particle types, matrix inputs, etc.) - stub for now, adapt from original
    // For full implementation, copy and adapt the setup functions from original main.js

    // Canvas size update
    function updateCanvasSize() {
        const isPanelVisible = document.getElementById('controls').classList.contains('visible');
        const width = window.innerWidth - (isPanelVisible ? 300 : 0);
        const height = window.innerHeight;

        webglCanvas.width = width;
        webglCanvas.height = height;
        gl.viewport(0, 0, width, height);

        // Check min size
        if (width < gameState.simulation.minWidth || height < gameState.simulation.minHeight) {
            gameState.isPaused = true;
            overlay.style.display = 'flex';
            document.getElementById('small-canvas-overlay').innerHTML = `
                <h2>視窗過小</h2>
                <p>請放大視窗以繼續模擬</p>
            `;
            return;
        } else if (gameState.isPaused) {
            gameState.isPaused = false;
            overlay.style.display = 'none';
        }

        // Update distMax
        gameState.distMax = Math.floor(Math.min(width, height) / 20) * 10;

        // Reload particles if needed (randomize within new size)
        randomizePositions();
    }

    // Helper to randomize positions in bounds
    function randomizePositions() {
        for (let i = 0; i < totalParticles; i++) {
            particleData.x[i] = Math.random() * (webglCanvas.width - 100) + 50;
            particleData.y[i] = Math.random() * (webglCanvas.height - 100) + 50;
        }
    }

    // Overlay element (create in HTML, but for completeness)
    // Assume added in HTML

    // Initialize
    await initGame();
    updateCanvasSize();
    initParticles();  // Initialize particles now that canvas is sized
    // Add keyboard events, etc. from original

    // Fallback CPU (stub)
    function initCPUMode() {
        console.warn('Using CPU fallback - not implemented for demo');
        // Implement original worker logic here
    }
});
