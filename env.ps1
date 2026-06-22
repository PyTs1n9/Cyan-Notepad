# Cyan Notepad 开发环境配置脚本
# 用法: . .\env.ps1

# 1. Rust 工具链
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# 2. MSVC Build Tools
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:Path"
$env:LIB = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\lib\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\ucrt\x64"
$env:INCLUDE = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\include;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\ucrt;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\shared;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\cppwinrt"
$env:WindowsSdkDir = "C:\Program Files (x86)\Windows Kits\10\"

# 3. Windows SDK Resource Compiler (rc.exe) — Tauri build 需要
$env:Path = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64;$env:Path"

Write-Host "Environment configured: Rust + MSVC + Windows SDK (rc.exe)" -ForegroundColor Green
