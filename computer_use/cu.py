#!/usr/bin/env python3
"""
Claude Code Computer Use Helper
사용법: python3 cu.py <명령> [인수...]

명령:
  shot              - 스크린샷 찍어 /tmp/cu_screen.png 저장
  shot <path>       - 지정 경로에 저장
  click <x> <y>     - 클릭 (스크린샷 이미지 좌표 그대로 입력 — 자동 스케일 변환)
  dclick <x> <y>    - 더블클릭
  rclick <x> <y>    - 우클릭
  move <x> <y>      - 마우스 이동
  type <text>       - 텍스트 입력 (한국어 지원)
  key <key>         - 키 입력 (enter, esc, tab, command+v 등)
  scroll <x> <y> <amount>  - 스크롤 (+위 -아래)
  pos               - 현재 마우스 위치
  size              - 화면 해상도
  app <name>        - 앱 활성화 (예: app KakaoTalk)

※ Retina 디스플레이: 스크린샷은 2x 해상도로 저장됨.
   click/dclick 등의 좌표는 스크린샷 이미지 기준으로 입력하면 자동 변환됨.
"""

import sys
import subprocess
import time

import pyautogui

def _scale():
    """스크린샷 이미지 해상도 vs PyAutoGUI 논리 해상도 비율"""
    logical_w, _ = pyautogui.size()
    result = subprocess.run(['screencapture', '-x', '/tmp/_cu_scale_test.png'], capture_output=True)
    from PIL import Image
    img = Image.open('/tmp/_cu_scale_test.png')
    return img.size[0] / logical_w  # 보통 Retina=2.0, 일반=1.0

_SCALE = None

def get_scale():
    global _SCALE
    if _SCALE is None:
        _SCALE = _scale()
    return _SCALE

def to_logical(x, y):
    """스크린샷 좌표 → PyAutoGUI 논리 좌표"""
    s = get_scale()
    return int(x / s), int(y / s)

def screenshot(path='/tmp/cu_screen.png'):
    subprocess.run(['screencapture', '-x', path], check=True)
    from PIL import Image
    img = Image.open(path)
    scale = get_scale()
    logical_w = int(img.size[0] / scale)
    logical_h = int(img.size[1] / scale)
    print(f"스크린샷: {path} (이미지 {img.size[0]}x{img.size[1]}, 논리 {logical_w}x{logical_h}, scale={scale}x)")
    print(f"→ 클릭 좌표는 이미지 픽셀 기준으로 입력하면 자동 변환됩니다.")
    return path

def activate_app(name):
    script = f'tell application "{name}" to activate'
    subprocess.run(['osascript', '-e', script])
    time.sleep(0.5)
    print(f"앱 활성화: {name}")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1]

    pyautogui.PAUSE = 0.1
    pyautogui.FAILSAFE = True  # 마우스를 좌상단 코너로 옮기면 중단

    if cmd == 'shot':
        path = sys.argv[2] if len(sys.argv) > 2 else '/tmp/cu_screen.png'
        screenshot(path)

    elif cmd == 'click':
        ix, iy = int(sys.argv[2]), int(sys.argv[3])
        x, y = to_logical(ix, iy)
        pyautogui.click(x, y)
        print(f"클릭: 이미지({ix},{iy}) → 논리({x},{y})")

    elif cmd == 'dclick':
        ix, iy = int(sys.argv[2]), int(sys.argv[3])
        x, y = to_logical(ix, iy)
        pyautogui.doubleClick(x, y)
        print(f"더블클릭: 이미지({ix},{iy}) → 논리({x},{y})")

    elif cmd == 'rclick':
        ix, iy = int(sys.argv[2]), int(sys.argv[3])
        x, y = to_logical(ix, iy)
        pyautogui.rightClick(x, y)
        print(f"우클릭: 이미지({ix},{iy}) → 논리({x},{y})")

    elif cmd == 'move':
        ix, iy = int(sys.argv[2]), int(sys.argv[3])
        x, y = to_logical(ix, iy)
        pyautogui.moveTo(x, y, duration=0.3)
        print(f"이동: 이미지({ix},{iy}) → 논리({x},{y})")

    elif cmd == 'type':
        text = sys.argv[2]
        subprocess.run(['pbcopy'], input=text.encode('utf-8'))
        pyautogui.hotkey('command', 'v')
        print(f"입력: {text}")

    elif cmd == 'key':
        key = sys.argv[2]
        if '+' in key:
            parts = key.split('+')
            pyautogui.hotkey(*parts)
        else:
            pyautogui.press(key)
        print(f"키: {key}")

    elif cmd == 'scroll':
        ix, iy, amount = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
        x, y = to_logical(ix, iy)
        pyautogui.scroll(amount, x=x, y=y)
        print(f"스크롤: 이미지({ix},{iy}) → 논리({x},{y}) amount={amount}")

    elif cmd == 'pos':
        pos = pyautogui.position()
        s = get_scale()
        print(f"현재 위치: 논리({pos.x},{pos.y}) → 이미지({int(pos.x*s)},{int(pos.y*s)})")

    elif cmd == 'size':
        size = pyautogui.size()
        s = get_scale()
        print(f"논리 해상도: {size.width}x{size.height} | 이미지 해상도: {int(size.width*s)}x{int(size.height*s)} | scale={s}x")

    elif cmd == 'app':
        name = ' '.join(sys.argv[2:])
        activate_app(name)

    else:
        print(f"알 수 없는 명령: {cmd}")
        print(__doc__)

if __name__ == '__main__':
    main()
