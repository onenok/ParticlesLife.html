#!/bin/bash

# 打開 VS Code 下載頁面
open "https://code.visualstudio.com/docs/?dv=win64user"

# 打開 Cursor 網站
open "https://www.cursor.com"

# 等待 5 秒
sleep 5

# 模擬按下 Tab 鍵 10 次，然後按下 Enter 鍵
# 注意：這部分在 Shell 腳本中無法直接實現，因為 Shell 沒有內建的模擬鍵盤輸入功能
# 我們可以使用 AppleScript（在 macOS 上）或 xdotool（在 Linux 上）來實現類似功能
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    osascript -e 'tell application "System Events"
        repeat 10 times
            key code 48 # Tab 鍵的鍵碼
        end repeat
        key code 36 # Enter 鍵的鍵碼
    end tell'
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux（需要安裝 xdotool）
    if command -v xdotool &> /dev/null; then
        xdotool key --repeat 10 Tab
        xdotool key Return
    else
        echo "請安裝 xdotool 以模擬鍵盤輸入"
    fi
else
    echo "不支持的操作系統"
fi