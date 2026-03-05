import os
import sys
import re
import random

sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth

from googleapiclient.discovery import build

SPREADSHEET_ID = "1x7cj51TufSmJq-2iJjKdMIL8y-SnD0yJH-0KQxS-X74"

# 허용 색상 (랜덤 선택)
NOTE_COLORS = ["rgb(0, 123, 217)", "#555"]

# 스타일 상수
DEFAULT_FONT_FAMILY = "'Noto Sans KR', 'sans-serif'"
DEFAULT_FONT_SIZE = "14px"
DEFAULT_DIV_STYLE = f"font-family: {DEFAULT_FONT_FAMILY}; font-size: {DEFAULT_FONT_SIZE};"

# 입력 → 출력 셀 매핑 (input, output, 끝에 <br>x3 여부)
CELL_MAPPINGS = [
    # 인사 및 소개 파트 (끝에 <br>x3)
    ("B2", "C2", True),
    ("D2", "E2", True),
    ("F2", "G2", True),
    # 제안내용 파트 (끝에 <br>x3 — 붙여쓸 때 문단 간격용)
    ("B3", "C3", True),
    ("D3", "E3", True),
    ("F3", "G3", True),
    # 종결 및 CTA 파트 (끝에 <br>x3)
    ("B4", "C4", True),
    ("D4", "E4", True),
    ("F4", "G4", True),
]

# 변수 소스 셀 (url셀, 너비셀)
VAR_CELLS = {
    "판매처링크": ("B6", None),
    "제품이미지": ("B7", "C7"),
    "명함이미지": ("B8", "C8"),
}
DEFAULT_IMAGE_WIDTH = 400


def get_service():
    creds = auth.get_credentials()
    return build("sheets", "v4", credentials=creds)


def get_first_sheet_name(service):
    meta = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
    return meta["sheets"][0]["properties"]["title"]


def read_cell(service, sheet_name, cell):
    range_ = f"{sheet_name}!{cell}"
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=range_
    ).execute()
    values = result.get("values", [])
    return values[0][0] if values and values[0] else ""


def write_cell(service, sheet_name, cell, value):
    range_ = f"{sheet_name}!{cell}"
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=range_,
        valueInputOption="RAW",
        body={"values": [[value]]},
    ).execute()


def make_link_html(url):
    """판매처링크 → <a href="..." target="_blank">url</a>"""
    if not url:
        return ""
    return f'<a href="{url}" target="_blank">{url}</a>'


def make_image_html(url, width=None):
    """이미지 URL → <img class="NAVER_MAIL_IMAGE" ...><br> (비율 유지: width만 지정)"""
    if not url:
        return ""
    w = int(width) if width else DEFAULT_IMAGE_WIDTH
    return f'<img class="NAVER_MAIL_IMAGE" src="{url}" width="{w}" style="max-width:{w}px; height:auto;"><br>'


def replace_variables(text, vars_map):
    """텍스트 내 변수 치환"""
    # {이름}은 그대로 유지
    text = text.replace(
        "{판매처링크}", make_link_html(vars_map.get("판매처링크", ""))
    )
    text = text.replace(
        "{제품이미지}", make_image_html(
            vars_map.get("제품이미지", ""),
            vars_map.get("제품이미지_width")
        )
    )
    text = text.replace(
        "{명함이미지}", make_image_html(
            vars_map.get("명함이미지", ""),
            vars_map.get("명함이미지_width")
        )
    )
    return text


def text_to_html(text):
    """
    텍스트를 HTML로 변환. 줄 시작 문자로 스타일 결정:

    ■ 제목     → <div><strong>■ 제목</strong><br>이후 내용...</div> (섹션 그룹)
      - 항목   →   일반 텍스트 + <br> (■ 섹션 내부)
      * 주석   →   <span style="color:#555;">* ...</span> + <br> (■ 섹션 내부)
    * 주석     → 연속 * 줄을 하나의 <div><span style="color:#555;">...</span></div>로 묶음
    빈 줄      → <div><br></div>
    일반 줄    → <div><span>text</span></div>
    """
    if not text:
        return ""

    lines = text.splitlines()
    parts = []
    i = 0

    while i < len(lines):
        stripped = lines[i].strip()

        if stripped == "":
            # 빈 줄 → 섹션 구분선
            parts.append("<div><br></div>")
            i += 1

        elif stripped.startswith("■"):
            # ■ 섹션: 헤더 + 이후 비어있지 않은 줄들을 하나의 div로 묶음
            section_lines = [f"<strong>{stripped}</strong>"]
            i += 1
            while i < len(lines) and lines[i].strip() != "":
                content = lines[i].strip()
                if content.startswith("*"):
                    color = random.choice(NOTE_COLORS)
                    section_lines.append(f'<span style="color:{color};">{content}</span>')
                else:
                    section_lines.append(content)
                i += 1
            inner = "<br>\n  ".join(section_lines)
            parts.append(f"<div>\n  {inner}\n</div>")

        elif stripped.startswith("*"):
            # 연속된 * 줄들을 하나의 span으로 묶음 (색상 랜덤)
            note_lines = []
            while i < len(lines) and lines[i].strip().startswith("*"):
                note_lines.append(lines[i].strip())
                i += 1
            color = random.choice(NOTE_COLORS)
            if len(note_lines) == 1:
                parts.append(f'<div><span style="color:{color};">{note_lines[0]}</span></div>')
            else:
                inner = "<br>\n    ".join(note_lines)
                parts.append(f'<div>\n  <span style="color:{color};">\n    {inner}\n  </span>\n</div>')

        else:
            # 일반 줄 (**text** → bold+underline 인라인 치환 후 감쌈)
            parts.append(f"<div><span>{apply_inline_styles(stripped)}</span></div>")
            i += 1

    return "\n".join(parts)


def apply_inline_styles(text):
    """
    인라인 스타일 치환:
    **text** → <span style="font-weight:bold; text-decoration:underline;">text</span>
    """
    return re.sub(
        r"\*\*(.+?)\*\*",
        r'<span style="font-weight:bold; text-decoration:underline;">\1</span>',
        text,
    )


def convert_all():
    service = get_service()
    sheet_name = sys.argv[1] if len(sys.argv) > 1 else get_first_sheet_name(service)
    print(f"시트 이름: {sheet_name}\n")

    # 변수 값 읽기
    vars_map = {}
    for var_name, (url_cell, width_cell) in VAR_CELLS.items():
        val = read_cell(service, sheet_name, url_cell)
        vars_map[var_name] = val
        if width_cell:
            raw_w = read_cell(service, sheet_name, width_cell)
            width = raw_w.strip() if raw_w.strip().isdigit() else None
            vars_map[f"{var_name}_width"] = width
            w_display = f"{width}px" if width else f"{DEFAULT_IMAGE_WIDTH}px (기본값)"
            print(f"  {{{var_name}}} ({url_cell}): {val or '(비어있음)'}  |  너비({width_cell}): {w_display}")
        else:
            print(f"  {{{var_name}}} ({url_cell}): {val or '(비어있음)'}")
    print()

    # 셀 변환
    converted = 0
    for input_cell, output_cell, trailing_br in CELL_MAPPINGS:
        text = read_cell(service, sheet_name, input_cell)
        if not text:
            print(f"[건너뜀] {input_cell}: 내용 없음")
            continue

        text_with_vars = replace_variables(text, vars_map)
        html = text_to_html(text_with_vars)
        if trailing_br:
            html += "<br><br>"
        write_cell(service, sheet_name, output_cell, html)

        preview = html[:80] + "..." if len(html) > 80 else html
        print(f"[완료] {input_cell} → {output_cell}: {preview}")
        converted += 1

    print(f"\n총 {converted}개 셀 변환 완료.")


if __name__ == "__main__":
    try:
        convert_all()
    except Exception as e:
        print(f"오류: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
