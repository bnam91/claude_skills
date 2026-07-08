#!/usr/bin/env python3
"""
stephow annotate.py
스크린샷에 번호 라벨, 화살표, 하이라이트 박스를 그려주는 어노테이션 툴.

사용법:
  python3 annotate.py input.png output.png '[{"type":"circle","x":300,"y":200,"label":"1","text":"여기 클릭"},...]'

annotation 스펙 (JSON 배열):
  {
    "type": "circle" | "box" | "arrow",
    "x": 숫자,
    "y": 숫자,
    "label": "1",
    "text": "설명",
    "x2": 숫자,        # box/arrow 끝점
    "y2": 숫자,
    "color": "red",    # 기본: red
    "side": "right" | "left" | "above" | "below"
               # above/below → 원을 여백에 띄우고 화살표로 연결
  }
"""

import sys
import json
import math
from PIL import Image, ImageDraw, ImageFont

COLORS = {
    "red":    "#FF3B30",
    "blue":   "#007AFF",
    "green":  "#34C759",
    "orange": "#FF9500",
    "purple": "#AF52DE",
    "yellow": "#FFD60A",
}

# 텍스트 배경 형광 하이라이트 색
HIGHLIGHT = {
    "red":    (255, 59,  48,  230),
    "blue":   (0,   122, 255, 230),
    "green":  (52,  199, 89,  230),
    "orange": (255, 149, 0,   230),
    "purple": (175, 82,  222, 230),
    "yellow": (255, 214, 10,  230),
}

def get_color(name):
    return COLORS.get(name, name if name.startswith("#") else "#FF3B30")

def get_highlight(name):
    return HIGHLIGHT.get(name, HIGHLIGHT["red"])

def get_font(size):
    font_paths = [
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in font_paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

def draw_circle_label(draw, x, y, label, color, radius=52):
    r = radius
    draw.ellipse([x-r+5, y-r+5, x+r+5, y+r+5], fill=(0, 0, 0, 100))
    draw.ellipse([x-r, y-r, x+r, y+r], fill=color, outline="white", width=5)
    font = get_font(r + 10)
    bbox = draw.textbbox((0, 0), str(label), font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    draw.text((x - tw//2, y - th//2 - 1), str(label), fill="white", font=font)

def draw_text_label(draw, tx, ty, text, color_name):
    """형광 하이라이트 배경 텍스트"""
    font = get_font(52)
    padding = 22
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    bg = get_highlight(color_name)
    draw.rectangle(
        [tx - padding, ty - padding//2, tx + tw + padding, ty + th + padding//2],
        fill=bg
    )
    draw.text((tx, ty), text, fill="white", font=font)
    return tw, th, padding

def draw_dashed_line(draw, x1, y1, x2, y2, color, width=4, dash=20):
    """점선"""
    dist = math.sqrt((x2-x1)**2 + (y2-y1)**2)
    steps = max(1, int(dist / dash))
    for s in range(steps):
        if s % 2 == 0:
            t1, t2 = s/steps, min((s+1)/steps, 1.0)
            draw.line([
                int(x1+(x2-x1)*t1), int(y1+(y2-y1)*t1),
                int(x1+(x2-x1)*t2), int(y1+(y2-y1)*t2)
            ], fill=color, width=width)

def draw_arrowhead(draw, x, y, direction, color, size=24):
    """화살촉 (direction: 'up'|'down'|'left'|'right')"""
    if direction == "down":
        pts = [x, y, x-size//2, y-size, x+size//2, y-size]
    elif direction == "up":
        pts = [x, y, x-size//2, y+size, x+size//2, y+size]
    elif direction == "right":
        pts = [x, y, x-size, y-size//2, x-size, y+size//2]
    else:
        pts = [x, y, x+size, y-size//2, x+size, y+size//2]
    draw.polygon(pts, fill=color)

def draw_side_label(draw, x, y, label, text, color_name, side="right"):
    """
    side = right/left  : 원은 (x,y)에, 텍스트는 옆에
    side = above/below : 원+텍스트를 (x,y)에서 위/아래 여백에 띄우고 점선+화살표 연결
    """
    color = get_color(color_name)
    radius = 52
    offset = 160  # above/below 시 여백 거리

    if side in ("above", "below"):
        cy = y - offset - radius if side == "above" else y + offset + radius
        # 점선 연결
        line_y1 = cy + radius if side == "above" else cy - radius
        line_y2 = y - 10 if side == "above" else y + 10
        draw_dashed_line(draw, x, line_y1, x, line_y2, color)
        draw_arrowhead(draw, x, y - 10 if side == "above" else y + 10,
                       "down" if side == "above" else "up", color)
        # 원
        draw_circle_label(draw, x, cy, label, color, radius)
        # 텍스트 (원 오른쪽)
        if text:
            draw_text_label(draw, x + radius + 20, cy - 26, text, color_name)
    else:
        draw_circle_label(draw, x, y, label, color, radius)
        if text:
            if side == "right":
                draw_text_label(draw, x + radius + 20, y - 26, text, color_name)
            else:
                font = get_font(52)
                bbox = draw.textbbox((0, 0), text, font=font)
                tw = bbox[2]-bbox[0]
                draw_text_label(draw, x - radius - 20 - tw - 44, y - 26, text, color_name)

def draw_box(draw, x1, y1, x2, y2, color_name, label=None, text=None):
    """
    하이라이트 박스 — 번호와 텍스트는 박스 위쪽 바깥에 배치
    """
    c = get_color(color_name)
    draw.rectangle([x1, y1, x2, y2], outline=c, width=6)
    cs = 24
    for px, py in [(x1, y1), (x2, y1), (x1, y2), (x2, y2)]:
        dx = 1 if px == x1 else -1
        dy = 1 if py == y1 else -1
        draw.line([px, py, px + dx * cs, py], fill=c, width=8)
        draw.line([px, py, px, py + dy * cs], fill=c, width=8)

    if label:
        # 원은 박스 상단 모서리 바깥 (위쪽)
        cx = x1 + 52
        cy = y1 - 52 - 16
        draw_circle_label(draw, cx, cy, label, c, radius=52)
        if text:
            draw_text_label(draw, cx + 52 + 20, cy - 26, text, color_name)

def draw_arrow(draw, x1, y1, x2, y2, color_name, label=None):
    c = get_color(color_name)
    draw.line([x1, y1, x2, y2], fill=c, width=6)
    angle = math.atan2(y2 - y1, x2 - x1)
    arrow_len = 30
    arrow_angle = math.pi / 6
    for a in [angle + math.pi - arrow_angle, angle + math.pi + arrow_angle]:
        draw.line([x2, y2,
                   x2 + arrow_len * math.cos(a),
                   y2 + arrow_len * math.sin(a)], fill=c, width=6)
    if label:
        draw_circle_label(draw, x1, y1, label, c)

def draw_step_connector(draw, annotations, color="#FF3B30"):
    circles = [a for a in annotations if a.get("type") == "circle"]
    if len(circles) < 2:
        return
    for i in range(len(circles) - 1):
        x1, y1 = circles[i]["x"], circles[i]["y"]
        x2, y2 = circles[i+1]["x"], circles[i+1]["y"]
        draw_dashed_line(draw, x1, y1, x2, y2, color, width=3)

def annotate(input_path, output_path, annotations, connect_steps=False):
    img = Image.open(input_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if connect_steps:
        draw_step_connector(draw, annotations)

    for ann in annotations:
        t = ann.get("type", "circle")
        x = ann.get("x", 0)
        y = ann.get("y", 0)
        label = ann.get("label", "")
        text = ann.get("text", "")
        color = ann.get("color", "red")
        side = ann.get("side", "right")

        if t == "circle":
            draw_side_label(draw, x, y, label, text, color, side)
        elif t == "box":
            x2 = ann.get("x2", x + 100)
            y2 = ann.get("y2", y + 50)
            draw_box(draw, x, y, x2, y2, color,
                     label if label else None,
                     text if text else None)
        elif t == "arrow":
            x2 = ann.get("x2", x + 50)
            y2 = ann.get("y2", y + 50)
            draw_arrow(draw, x, y, x2, y2, color, label if label else None)

    result = Image.alpha_composite(img, overlay).convert("RGB")
    result.save(output_path, "PNG")
    print(f"✅ 저장: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 annotate.py input.png output.png '[{...}]' [--connect]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    specs = json.loads(sys.argv[3])
    connect = "--connect" in sys.argv

    annotate(input_path, output_path, specs, connect_steps=connect)
