cmake_minimum_required(VERSION 3.13)
project(particles_simd)

# 設置編譯器標誌
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Emscripten 特定選項
if(EMSCRIPTEN)
    # 添加 Emscripten 系統包含路徑
    include_directories(SYSTEM
        ${CMAKE_CURRENT_SOURCE_DIR}
        ${EMSDK}/upstream/emscripten/cache/sysroot/include
        ${EMSDK}/upstream/emscripten/system/include
        ${EMSDK}/upstream/lib/clang/22/include
    )
    
    # 啟用 WebAssembly SIMD
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -msimd128 -msse -msse2 -msse3")
    
    # 優化標誌
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")
    
    # 允許內聯函數和連結時優化
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -flto")
    
    # 啟用快速數學運算
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -ffast-math")
    
    # 啟用例外與 RTTI
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -frtti -fexceptions")
    
    # 設定預處理器定義
    add_definitions(-D__EMSCRIPTEN__ -D__wasm_simd128__ -DEMSCRIPTEN_HAS_UNBOUND_TYPE_NAMES=1)
    
    # 設置 WASM 特定選項
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    # 基本編譯標誌
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} --bind")  # 啟用 Embind
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s WASM=1")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ENVIRONMENT=web")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s NO_EXIT_RUNTIME=1")
    
    # ES6 模組支援
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORT_NAME=createModule")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s MODULARIZE=1")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s USE_ES6_IMPORT_META=1")
    
    # 記憶體與安全
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s TOTAL_STACK=5MB")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s INITIAL_MEMORY=64MB")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s MAXIMUM_MEMORY=512MB")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s SAFE_HEAP=1")
    
    # 除錯選項
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ASSERTIONS=2")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ERROR_ON_UNDEFINED_SYMBOLS=1")
    
    # 匯出函數與方法
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_FUNCTIONS=['_malloc','_free']")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']")
endif()

# 添加源文件
add_executable(particles_simd particles_simd.cpp)