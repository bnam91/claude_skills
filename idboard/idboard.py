#!/usr/bin/env python3
"""
아이디보드 관리 스크립트
Usage:
  python3 idboard.py --list                          # 전체 목록 조회
  python3 idboard.py --search 홈택스                  # 키워드 검색
  python3 idboard.py --add --name 서비스명 --id ID --pw PW [--권한 권한] [--비고 비고] [--비고2 비고2] [--메모 메모]
  python3 idboard.py --update ROW --id 새ID          # 특정 행 업데이트
  python3 idboard.py --update ROW --pw 새PW
"""

import os, sys, json, argparse
from datetime import datetime
sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

SPREADSHEET_ID = "12994vLyfh4jYUp9ysOAmKa60BwNL7zr0YzzhkkYPZp0"
SHEET_NAME = "아이디보드(어드민)"

# 열 인덱스 (A=0)
COL_업데이트날짜 = 0  # A
COL_권한       = 1  # B
COL_선택       = 2  # C
COL_ID         = 3  # D
COL_PW         = 4  # E
COL_비고        = 5  # F
COL_비고2       = 6  # G
COL_메모        = 7  # H
COL_업데이트    = 8  # I

def get_service():
    creds = auth.get_credentials()
    return build("sheets", "v4", credentials=creds)

def get_all_rows(service):
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A:I"
    ).execute()
    return result.get("values", [])

def today():
    return datetime.now().strftime("%Y-%m-%d")

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M")

def cmd_list(service):
    rows = get_all_rows(service)
    if not rows:
        print("데이터 없음")
        return
    header = rows[0]
    print(f"{'행':<4} {'선택(서비스)':<25} {'ID':<20} {'PW':<20} {'비고':<20}")
    print("-" * 95)
    for i, row in enumerate(rows[1:], start=2):
        선택 = row[COL_선택]  if len(row) > COL_선택  else ""
        id_  = row[COL_ID]    if len(row) > COL_ID    else ""
        pw   = row[COL_PW]    if len(row) > COL_PW    else ""
        비고  = row[COL_비고]   if len(row) > COL_비고   else ""
        print(f"{i:<4} {선택:<25} {id_:<20} {pw:<20} {비고:<20}")

def cmd_search(service, keyword):
    rows = get_all_rows(service)
    keyword_lower = keyword.lower()
    print(f"'{keyword}' 검색 결과:")
    print("-" * 95)
    found = False
    for i, row in enumerate(rows[1:], start=2):
        row_str = " ".join(row).lower()
        if keyword_lower in row_str:
            found = True
            선택 = row[COL_선택]  if len(row) > COL_선택  else ""
            id_  = row[COL_ID]    if len(row) > COL_ID    else ""
            pw   = row[COL_PW]    if len(row) > COL_PW    else ""
            비고  = row[COL_비고]   if len(row) > COL_비고   else ""
            비고2 = row[COL_비고2]  if len(row) > COL_비고2  else ""
            메모  = row[COL_메모]   if len(row) > COL_메모   else ""
            권한  = row[COL_권한]   if len(row) > COL_권한   else ""
            print(f"[행 {i}] {선택}")
            if 권한:  print(f"  권한: {권한}")
            if id_:   print(f"  ID:   {id_}")
            if pw:    print(f"  PW:   {pw}")
            if 비고:  print(f"  비고: {비고}")
            if 비고2: print(f"  비고2: {비고2}")
            if 메모:  print(f"  메모: {메모}")
            print()
    if not found:
        print("검색 결과 없음")

def cmd_add(service, name, id_, pw, 권한="", 비고="", 비고2="", 메모=""):
    rows = get_all_rows(service)
    next_row = len(rows) + 1  # 마지막 행 다음

    new_row = [""] * 9
    new_row[COL_업데이트날짜] = today()
    new_row[COL_권한]       = 권한
    new_row[COL_선택]       = name
    new_row[COL_ID]         = id_
    new_row[COL_PW]         = pw
    new_row[COL_비고]        = 비고
    new_row[COL_비고2]       = 비고2
    new_row[COL_메모]        = 메모
    new_row[COL_업데이트]    = now()

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A:I",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [new_row]}
    ).execute()
    print(f"✅ 추가 완료 (행 {next_row}): {name}")

def cmd_update(service, row_num, **kwargs):
    # 해당 행 읽기
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A{row_num}:I{row_num}"
    ).execute()
    row = result.get("values", [[]])[0]
    # 9칸 확보
    while len(row) < 9:
        row.append("")

    field_map = {
        "name": COL_선택, "id": COL_ID, "pw": COL_PW,
        "권한": COL_권한, "비고": COL_비고, "비고2": COL_비고2, "메모": COL_메모
    }
    for key, val in kwargs.items():
        if key in field_map:
            row[field_map[key]] = val

    row[COL_업데이트날짜] = today()
    row[COL_업데이트]    = now()

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A{row_num}:I{row_num}",
        valueInputOption="USER_ENTERED",
        body={"values": [row]}
    ).execute()
    print(f"✅ 행 {row_num} 업데이트 완료")

def main():
    parser = argparse.ArgumentParser(description="아이디보드 관리")
    parser.add_argument("--list",   action="store_true", help="전체 목록")
    parser.add_argument("--search", metavar="키워드",    help="키워드 검색")
    parser.add_argument("--add",    action="store_true", help="신규 추가")
    parser.add_argument("--update", metavar="행번호",    type=int, help="행 업데이트")
    parser.add_argument("--name",   default="")
    parser.add_argument("--id",     default="")
    parser.add_argument("--pw",     default="")
    parser.add_argument("--권한",   default="")
    parser.add_argument("--비고",   default="")
    parser.add_argument("--비고2",  default="")
    parser.add_argument("--메모",   default="")
    args = parser.parse_args()

    service = get_service()

    if args.list:
        cmd_list(service)
    elif args.search:
        cmd_search(service, args.search)
    elif args.add:
        if not args.name:
            print("❌ --name 필수")
            sys.exit(1)
        cmd_add(service, args.name, args.id, args.pw,
                args.권한, args.비고, args.비고2, args.메모)
    elif args.update:
        kwargs = {}
        if args.name:  kwargs["name"]  = args.name
        if args.id:    kwargs["id"]    = args.id
        if args.pw:    kwargs["pw"]    = args.pw
        if args.권한:  kwargs["권한"]  = args.권한
        if args.비고:  kwargs["비고"]  = args.비고
        if args.비고2: kwargs["비고2"] = args.비고2
        if args.메모:  kwargs["메모"]  = args.메모
        if not kwargs:
            print("❌ 업데이트할 필드를 지정해주세요")
            sys.exit(1)
        cmd_update(service, args.update, **kwargs)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
