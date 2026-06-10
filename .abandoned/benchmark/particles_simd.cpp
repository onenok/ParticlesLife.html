#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <wasm_simd128.h>
#include <vector>
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

using namespace emscripten;

// 確保啟用 SIMD
#ifndef __wasm_simd128__
#error "WebAssembly SIMD support is required"
#endif

// 常數定義
constexpr float BETA = 0.3f;
constexpr float INV_BETA = 1.0f / BETA;
constexpr float ONE_MINUS_BETA = 1.0f - BETA;
constexpr float INV_ONE_MINUS_BETA = 1.0f / ONE_MINUS_BETA;
constexpr float FORCE_SCALE = 10.0f;

// SIMD 優化的力場計算
class ParticleSimulation {
private:
    // 內部記憶體管理
    std::vector<float> positions;
    std::vector<uint8_t> types;
    std::vector<float> forceMatrix;
    std::vector<float> forces;
    float maxDistance;

    // SIMD 優化的向量操作
    v128_t calculate_force_simd(const v128_t& pos1, const v128_t& pos2, 
                               float type1, float type2) {
        // 計算距離向量
        v128_t diff = wasm_f32x4_sub(pos2, pos1);
        v128_t distSq = wasm_f32x4_mul(diff, diff);
        
        // 水平加法得到距離平方
        float dist2 = wasm_f32x4_extract_lane(
            wasm_f32x4_add(
                wasm_v128_load32_splat(&distSq),
                wasm_v128_load32_splat((float*)&distSq + 1)
            ), 0
        );
        
        // 如果距離大於最大距離，返回零向量
        if (dist2 >= maxDistance * maxDistance) {
            return wasm_f32x4_const(0.0f, 0.0f, 0.0f, 0.0f);
        }
        
        float dist = std::sqrt(dist2);
        float normalizedDist = dist / maxDistance;
        float forceMagnitude = 0.0f;
        
        // 計算力大小
        if (normalizedDist < BETA) {
            forceMagnitude = normalizedDist * INV_BETA - 1.0f;
        } else if (normalizedDist < 1.0f) {
            float force = forceMatrix[type1 * 4 + type2];
            float distFromCenter = std::abs(2.0f * normalizedDist - 1.0f - BETA);
            forceMagnitude = force * (1.0f - distFromCenter * INV_ONE_MINUS_BETA);
        }
        
        // 計算最終力向量
        v128_t scale = wasm_f32x4_splat((forceMagnitude * FORCE_SCALE * maxDistance) / dist);
        return wasm_f32x4_mul(diff, scale);
    }

public:
    // 初始化
    void init(emscripten::val pos, emscripten::val t, emscripten::val fm, float md) {
        positions = pos.as<std::vector<float>>();
        types = t.as<std::vector<uint8_t>>();
        forceMatrix = fm.as<std::vector<float>>();
        maxDistance = md;
        forces.resize(positions.size(), 0.0f);
    }
    
    // 主要計算函數
    void calculate() {
        const size_t particleCount = positions.size() / 2;
        
        // 使用 SIMD 計算所有粒子對之間的力
        for (size_t i = 0; i < particleCount; i++) {
            float pos1_data[4] = {positions[i*2], positions[i*2 + 1], 0.0f, 0.0f};
            v128_t pos1 = wasm_v128_load(pos1_data);
            float type1 = types[i];
            
            v128_t totalForce = wasm_f32x4_const(0.0f, 0.0f, 0.0f, 0.0f);
            
            // 每次處理 2 個粒子
            for (size_t j = 0; j < particleCount; j += 2) {
                if (i == j) continue;
                
                // 載入兩個粒子的位置
                float pos2_data[4] = {
                    positions[j*2], positions[j*2 + 1],
                    j+1 < particleCount ? positions[j*2 + 2] : 0.0f,
                    j+1 < particleCount ? positions[j*2 + 3] : 0.0f
                };
                v128_t pos2 = wasm_v128_load(pos2_data);
                
                // 計算力並累加
                v128_t force = calculate_force_simd(pos1, pos2, type1, types[j]);
                totalForce = wasm_f32x4_add(totalForce, force);
                
                // 處理第二個粒子（如果存在）
                if (j + 1 < particleCount && i != j + 1) {
                    float pos2b_data[4] = {
                        positions[j*2 + 2], positions[j*2 + 3],
                        0.0f, 0.0f
                    };
                    v128_t pos2b = wasm_v128_load(pos2b_data);
                    force = calculate_force_simd(pos1, pos2b, type1, types[j+1]);
                    totalForce = wasm_f32x4_add(totalForce, force);
                }
            }
            
            // 儲存結果
            forces[i*2] = wasm_f32x4_extract_lane(totalForce, 0);
            forces[i*2 + 1] = wasm_f32x4_extract_lane(totalForce, 1);
        }
    }
    
    // 獲取結果
    emscripten::val getForces() const {
        return emscripten::val(forces);
    }
};

// Emscripten 綁定
EMSCRIPTEN_BINDINGS(particle_simulation) {
    class_<ParticleSimulation>("ParticleSimulation")
        .constructor<>()
        .function("init", select_overload<void(emscripten::val, emscripten::val, emscripten::val, float)>(&ParticleSimulation::init))
        .function("calculate", &ParticleSimulation::calculate)
        .function("getForces", &ParticleSimulation::getForces);
}
