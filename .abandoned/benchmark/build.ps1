# Verify EMSDK environment variable
if (-not $env:EMSDK) {
    Write-Error "Please set EMSDK environment variable to point to Emscripten SDK directory"
    exit 1
}

# Initialize Emscripten SDK
$emsdkBat = Join-Path $env:EMSDK "emsdk.bat"
if (-not (Test-Path $emsdkBat)) {
    Write-Error "emsdk.bat not found at: $emsdkBat"
    Write-Error "Please verify your Emscripten installation"
    exit 1
}

Write-Host "Initializing Emscripten SDK..."
Write-Host "Running: $emsdkBat install latest"
& $emsdkBat install latest
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install latest Emscripten SDK"
    exit 1
}

Write-Host "Running: $emsdkBat activate latest"
& $emsdkBat activate latest
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to activate latest Emscripten SDK"
    exit 1
}

# Source the environment
Write-Host "Sourcing Emscripten environment..."
$envCmd = Join-Path $env:EMSDK "emsdk_env.bat"
if (Test-Path $envCmd) {
    $envOutput = cmd /c "`"$envCmd`" && set"
    foreach ($line in $envOutput) {
        if ($line -match '^([^=]+)=(.*)$') {
            $varName = $matches[1]
            $varValue = $matches[2]
            [System.Environment]::SetEnvironmentVariable($varName, $varValue, [System.EnvironmentVariableTarget]::Process)
        }
    }
}

# Clean and recreate build directory
if (Test-Path "build") {
    Write-Host "Cleaning build directory..."
    Remove-Item -Path "build" -Recurse -Force
}
Write-Host "Creating build directory..."
New-Item -ItemType Directory -Force -Path "build"
Set-Location "build"

# Verify CMake installation
$cmakePath = (Get-Command cmake -ErrorAction SilentlyContinue).Path
if (-not $cmakePath) {
    Write-Error "CMake not found. Please install CMake from https://cmake.org/download/"
    exit 1
}

# Use full paths for Emscripten tools
$emcmakePath = Join-Path $env:EMSDK "upstream\emscripten\emcmake.bat"
$emmakePath = Join-Path $env:EMSDK "upstream\emscripten\emmake.bat"

if (-not (Test-Path $emcmakePath)) {
    Write-Error "emcmake not found at: $emcmakePath"
    Write-Error "Please verify your Emscripten installation"
    exit 1
}

Write-Host "Generating CMake project..."
& $emcmakePath cmake ..
if ($LASTEXITCODE -ne 0) {
    Write-Error "CMake generation failed"
    exit 1
}

Write-Host "Building..."
& $emmakePath make
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}

# Move build results
if (Test-Path "particles_simd.wasm") {
    Copy-Item "particles_simd.wasm" ".." -Force
}
if (Test-Path "particles_simd.js") {
    Copy-Item "particles_simd.js" ".." -Force
}

Write-Host "Build completed!"