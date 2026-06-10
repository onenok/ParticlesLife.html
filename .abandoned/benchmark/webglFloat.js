// WebGL 浮點數版本
export class WebGLFloatImplementation {
    constructor() {
        this.gl = null;
        this.program = null;
        this.buffers = {};
    }

    async init(data) {
        // 創建WebGL上下文
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
        
        // 編譯著色器
        const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
        this.gl.shaderSource(vertexShader, `#version 300 es
            in vec2 a_position;
            in float a_type;
            out float v_type;
            void main() {
                gl_Position = vec4(a_position, 0, 1);
                v_type = a_type;
            }
        `);
        this.gl.compileShader(vertexShader);

        const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        this.gl.shaderSource(fragmentShader, `#version 300 es
            precision highp float;
            uniform sampler2D u_positions;
            uniform sampler2D u_types;
            uniform mat4 u_forceMatrix;
            uniform float u_maxDistance;
            in float v_type;
            out vec2 outForce;

            void main() {
                vec2 force = vec2(0.0);
                ivec2 texSize = textureSize(u_positions, 0);
                int particleCount = texSize.x * texSize.y;
                vec2 myPos = gl_FragCoord.xy;
                float myType = v_type;

                for (int i = 0; i < particleCount; i++) {
                    vec2 otherPos = texelFetch(u_positions, ivec2(i % texSize.x, i / texSize.x), 0).xy;
                    float otherType = texelFetch(u_types, ivec2(i % texSize.x, i / texSize.x), 0).x;
                    
                    vec2 diff = otherPos - myPos;
                    float distSq = dot(diff, diff);
                    float maxDistSq = u_maxDistance * u_maxDistance;
                    
                    if (distSq > 0.0 && distSq < maxDistSq) {
                        float dist = sqrt(distSq);
                        float normalizedDist = dist / u_maxDistance;
                        
                        const float BETA = 0.3;
                        float forceMagnitude = 0.0;
                        
                        if (normalizedDist < BETA) {
                            forceMagnitude = normalizedDist / BETA - 1.0;
                        } 
                        else if (normalizedDist < 1.0) {
                            float forceCoef = u_forceMatrix[int(myType)][int(otherType)];
                            forceMagnitude = forceCoef * (1.0 - abs(2.0 * normalizedDist - 1.0 - BETA) / (1.0 - BETA));
                        }
                        
                        force += forceMagnitude * diff / dist;
                    }
                }
                
                outForce = force * 10.0 * u_maxDistance;
            }
        `);
        this.gl.compileShader(fragmentShader);

        // 創建程序
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
        
        // 創建緩衝區
        this.buffers.position = this.gl.createBuffer();
        this.buffers.type = this.gl.createBuffer();
        this.buffers.force = this.gl.createBuffer();
        
        // 創建和設置紋理
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
        }
    }

    async run(data) {
        const { positions, types, forceMatrix, maxDistance } = data;
        
        // 更新緩衝區
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.type);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, types, this.gl.STATIC_DRAW);
        
        // 設置紋理
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.positions);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RG32F, 
            Math.ceil(Math.sqrt(positions.length/2)), Math.ceil(Math.sqrt(positions.length/2)),
            0, this.gl.RG, this.gl.FLOAT, positions);
            
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.types);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R8, 
            Math.ceil(Math.sqrt(types.length)), Math.ceil(Math.sqrt(types.length)),
            0, this.gl.RED, this.gl.UNSIGNED_BYTE, types);
        
        // 設置uniform
        this.gl.useProgram(this.program);
        const maxDistLoc = this.gl.getUniformLocation(this.program, "u_maxDistance");
        const forceMatrixLoc = this.gl.getUniformLocation(this.program, "u_forceMatrix");
        this.gl.uniform1f(maxDistLoc, maxDistance);
        this.gl.uniformMatrix4fv(forceMatrixLoc, false, forceMatrix);
        
        // 渲染
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, positions.length/2, 1);
        this.gl.drawArrays(this.gl.POINTS, 0, positions.length/2);
        
        // 讀取結果
        const results = new Float32Array(positions.length);
        this.gl.readPixels(0, 0, positions.length/2, 1, this.gl.RG, this.gl.FLOAT, results);
        
        return results;
    }

    cleanup() {
        if (this.gl) {
            this.gl.deleteProgram(this.program);
            Object.values(this.buffers).forEach(buffer => this.gl.deleteBuffer(buffer));
            Object.values(this.textures).forEach(texture => this.gl.deleteTexture(texture));
        }
    }
}
