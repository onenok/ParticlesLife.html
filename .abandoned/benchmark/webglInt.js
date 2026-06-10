// WebGL 整數版本
export class WebGLIntImplementation {
    constructor() {
        this.gl = null;
        this.program = null;
        this.buffers = {};
        this.FIXED_POINT_FACTOR = 1024; // 2^10，用於定點數轉換
    }

    async init(data) {
        const canvas = document.createElement('canvas');
        const particleCount = data.positions.length / 2;
        const texSize = Math.ceil(Math.sqrt(particleCount));
        canvas.width = texSize;
        canvas.height = texSize;
        
        this.gl = canvas.getContext('webgl2', { 
            antialias: false,
            depth: false,
            stencil: false,
            alpha: false,
            preserveDrawingBuffer: true
        });
        
        if (!this.gl) {
            throw new Error('WebGL2 不可用');
        }
        
        const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
        this.gl.shaderSource(vertexShader, `#version 300 es
            in ivec2 a_position;  // 使用整數位置
            in int a_type;
            flat out int v_type;
            void main() {
                gl_Position = vec4(vec2(a_position) / ${this.FIXED_POINT_FACTOR}.0, 0, 1);
                v_type = a_type;
            }
        `);
        this.gl.compileShader(vertexShader);

        const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        this.gl.shaderSource(fragmentShader, `#version 300 es
            precision highp float;
            precision highp int;
            uniform isampler2D u_positions;  // 使用整數紋理
            uniform isampler2D u_types;
            uniform imat4 u_forceMatrix;     // 整數力矩陣
            uniform int u_maxDistance;        // 整數最大距離
            flat in int v_type;
            out ivec2 outForce;              // 輸出整數力

            void main() {
                ivec2 force = ivec2(0);
                ivec2 texSize = textureSize(u_positions, 0);
                int particleCount = texSize.x * texSize.y;
                ivec2 myPos = ivec2(gl_FragCoord.xy * ${this.FIXED_POINT_FACTOR}.0);
                int myType = v_type;

                for (int i = 0; i < particleCount; i++) {
                    ivec2 otherPos = texelFetch(u_positions, ivec2(i % texSize.x, i / texSize.x), 0).xy;
                    int otherType = texelFetch(u_types, ivec2(i % texSize.x, i / texSize.x), 0).x;
                    
                    ivec2 diff = otherPos - myPos;
                    int distSq = (diff.x * diff.x + diff.y * diff.y) / ${this.FIXED_POINT_FACTOR};
                    int maxDistSq = u_maxDistance * u_maxDistance;
                    
                    if (distSq > 0 && distSq < maxDistSq) {
                        int dist = int(sqrt(float(distSq)) * ${this.FIXED_POINT_FACTOR}.0);
                        int normalizedDist = (dist * ${this.FIXED_POINT_FACTOR}) / u_maxDistance;
                        
                        const int BETA = int(0.3 * ${this.FIXED_POINT_FACTOR}.0);
                        int forceMagnitude = 0;
                        
                        if (normalizedDist < BETA) {
                            forceMagnitude = (normalizedDist * ${this.FIXED_POINT_FACTOR} / BETA) - ${this.FIXED_POINT_FACTOR};
                        } 
                        else if (normalizedDist < ${this.FIXED_POINT_FACTOR}) {
                            int forceCoef = u_forceMatrix[myType][otherType];
                            int temp = 2 * normalizedDist - ${this.FIXED_POINT_FACTOR} - BETA;
                            if (temp < 0) temp = -temp;
                            forceMagnitude = (forceCoef * (${this.FIXED_POINT_FACTOR} - temp)) / (${this.FIXED_POINT_FACTOR} - BETA);
                        }
                        
                        // 將力向量歸一化並應用力度
                        force += ivec2((diff * forceMagnitude * 10) / dist);
                    }
                }
                
                outForce = force;
            }
        `);
        this.gl.compileShader(fragmentShader);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
        
        this.buffers.position = this.gl.createBuffer();
        this.buffers.type = this.gl.createBuffer();
        this.buffers.force = this.gl.createBuffer();
        
        this.textures = {
            positions: this.gl.createTexture(),
            types: this.gl.createTexture()
        };
        
        // 設置紋理參數
        for (const texture of Object.values(this.textures)) {
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        };
    }

    // 浮點數轉定點數
    toFixed(floatArray) {
        const intArray = new Int32Array(floatArray.length);
        for (let i = 0; i < floatArray.length; i++) {
            intArray[i] = Math.round(floatArray[i] * this.FIXED_POINT_FACTOR);
        }
        return intArray;
    }

    // 定點數轉浮點數
    toFloat(intArray) {
        const floatArray = new Float32Array(intArray.length);
        for (let i = 0; i < intArray.length; i++) {
            floatArray[i] = intArray[i] / this.FIXED_POINT_FACTOR;
        }
        return floatArray;
    }

    async run(data) {
        const { positions, types, forceMatrix, maxDistance } = data;
        
        // 轉換輸入數據為定點數
        const fixedPositions = this.toFixed(positions);
        const fixedForceMatrix = this.toFixed(new Float32Array(forceMatrix));
        const fixedMaxDistance = Math.round(maxDistance * this.FIXED_POINT_FACTOR);
        
        // 更新緩衝區
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, fixedPositions, this.gl.STATIC_DRAW);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.type);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, types, this.gl.STATIC_DRAW);
        
        // 設置紋理
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.positions);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RG32I, 
            Math.ceil(Math.sqrt(positions.length/2)), Math.ceil(Math.sqrt(positions.length/2)),
            0, this.gl.RG_INTEGER, this.gl.INT, fixedPositions);
            
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.types);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R8I, 
            Math.ceil(Math.sqrt(types.length)), Math.ceil(Math.sqrt(types.length)),
            0, this.gl.RED_INTEGER, this.gl.BYTE, types);
        
        // 設置uniform
        this.gl.useProgram(this.program);
        const maxDistLoc = this.gl.getUniformLocation(this.program, "u_maxDistance");
        const forceMatrixLoc = this.gl.getUniformLocation(this.program, "u_forceMatrix");
        this.gl.uniform1i(maxDistLoc, fixedMaxDistance);
        // 使用替代方法設置整數矩陣
        const matrixArray = new Int32Array(16);
        for (let i = 0; i < 16; i++) {
            matrixArray[i] = fixedForceMatrix[i];
        }
        this.gl.uniform4iv(forceMatrixLoc, matrixArray);
        
        // 渲染
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, positions.length/2, 1);
        this.gl.drawArrays(this.gl.POINTS, 0, positions.length/2);
        
        // 讀取結果並轉回浮點數
        const fixedResults = new Int32Array(positions.length);
        this.gl.readPixels(0, 0, positions.length/2, 1, this.gl.RG_INTEGER, this.gl.INT, fixedResults);
        
        return this.toFloat(fixedResults);
    }

    cleanup() {
        if (this.gl) {
            this.gl.deleteProgram(this.program);
            Object.values(this.buffers).forEach(buffer => this.gl.deleteBuffer(buffer));
            Object.values(this.textures).forEach(texture => this.gl.deleteTexture(texture));
        }
    }
}
