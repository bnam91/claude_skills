"""
html_colorizer.py
Python 1차 변환 이후, C3 / E3 / G3 셀에 각기 다른 색상 테마를 적용한다.

색상 테마:
  C3 (테마 A): ■ 헤더 → 배경색(연파랑), * 주석 → 글자색(파랑)
  E3 (테마 B): ■ 헤더 → 글자색(파랑)+bold,  * 주석 → 배경색(연파랑)
  G3 (테마 C): ■ 헤더 → 배경색+글자색+bold, * 주석 → 글자색(파랑)+bold
"""

import os
import sys
import re

sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth

from googleapiclient.discovery import build

SPREADSHEET_ID = "1x7cj51TufSmJq-2iJjKdMIL8y-SnD0yJH-0KQxS-X74"

BLUE      = "rgb(0, 123, 217)"
LIGHT_BG  = "rgb(161, 208, 255)"

# (셀, 헤더 strong 스타일, 주석 span 스타일)
COLOR_THEMES = {
    "C3": (
        f"background-color:{LIGHT_BG};",
        f"color:{BLUE};",
    ),
    "E3": (
        f"color:{BLUE}; font-weight:bold;",
        f"background-color:{LIGHT_BG};",
    ),
    "G3": (
        f"background-color:{LIGHT_BG}; color:{BLUE}; font-weight:bold;",
        f"color:{BLUE}; font-weight:bold;",
    ),
}


def get_service():
    creds = auth.get_credentials()
    return build("sheets", "v4", credentials=creds)


def get_first_sheet_name(service):
    meta = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
    return meta["sheets"][0]["properties"]["title"]


def read_cell(service, sheet_name, cell):
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!{cell}",
    ).execute()
    values = result.get("values", [])
    return values[0][0] if values and values[0] else ""


def write_cell(service, sheet_name, cell, value):
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!{cell}",
        valueInputOption="RAW",
        body={"values": [[value]]},
    ).execute()


def apply_theme(html, header_style, note_style):
    """
    <strong>■ ...</strong> → <strong style="...">■ ...</strong>
    <span style="color:...">* ...</span> → <span style="color:...; 추가스타일">* ...</span>
    (이미 style 속성이 있는 * span의 스타일을 교체)
    """
    # ■ 헤더: <strong> 에 style 추가
    html = re.sub(
        r"<strong>(■[^<]*)</strong>",
        lambda m: f'<strong style="{header_style}">{m.group(1)}</strong>',
        html,
    )

    # * 주석: color 스타일이 있는 <span>의 style을 교체
    html = re.sub(
        r'<span style="color:[^"]+;">(\*[^<]*)</span>',
        lambda m: f'<span style="{note_style}">{m.group(1)}</span>',
        html,
    )

    return html


def colorize_all():
    service = get_service()
    sheet_name = get_first_sheet_name(service)
    print(f"시트 이름: {sheet_name}\n")

    for cell, (header_style, note_style) in COLOR_THEMES.items():
        html = read_cell(service, sheet_name, cell)
        if not html:
            print(f"[건너뜀] {cell}: 내용 없음")
            continue

        colored = apply_theme(html, header_style, note_style)
        write_cell(service, sheet_name, cell, colored)
        print(f"[완료] {cell} 색상 테마 적용")
        print(f"       ■ 헤더 → {header_style}")
        print(f"       * 주석 → {note_style}\n")

    print("색상 적용 완료.")


if __name__ == "__main__":
    try:
        colorize_all()
    except Exception as e:
        print(f"오류: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
