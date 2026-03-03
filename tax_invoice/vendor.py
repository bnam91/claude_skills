#!/usr/bin/env python3
"""
거래처 시트 CRUD 스크립트

Usage:
  python3 vendor.py --list
  python3 vendor.py --add --alias "팔도3팀-홍길동" --company "주식회사 팔도" --biz-num 308-81-03161 --rep "권성규" --contact "홍길동" --email "hong@paldo.co.kr"
  python3 vendor.py --edit --alias "팔도3팀-홍길동" --email "new@paldo.co.kr"
  python3 vendor.py --delete --alias "팔도3팀-홍길동"
"""

import os, sys, argparse

sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

SPREADSHEET_ID = "1mFlHEtlYZXUWTLIpJ2jUKCuvIzHyP4jxvzT1HXpPkzg"
SHEET_NAME     = "거래처"
HEADER_ROWS    = 1

# 열 인덱스 (A=0 기준)
COL_A = 0  # 별칭(구분)
COL_B = 1  # 상호
COL_C = 2  # 사업자등록번호
COL_D = 3  # 공급자_성명(대표자)
COL_E = 4  # 담당자명
COL_F = 5  # 담당자메일
COL_G = 6  # 사업장소재지
COL_H = 7  # 업태
COL_I = 8  # 종목

COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]


# ── Google Sheets ─────────────────────────────────────────────────

def get_service():
    creds = auth.get_credentials()
    return build("sheets", "v4", credentials=creds)


def read_all(service):
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A1:I200",
        majorDimension="ROWS"
    ).execute()
    return result.get("values", [])


def get_cell(row, col_idx):
    if len(row) > col_idx:
        return str(row[col_idx]).strip()
    return ""


# ── 별칭 검색 ─────────────────────────────────────────────────────

def find_row(rows, alias):
    """별칭으로 행 탐색. 반환: (row_number, row_data) or (None, None)"""
    alias_lower = alias.strip().lower()
    for i, row in enumerate(rows):
        row_num = i + 1
        if row_num <= HEADER_ROWS:
            continue
        if get_cell(row, COL_A).lower() == alias_lower:
            return row_num, row
    return None, None


def find_next_empty_row(rows):
    for i, row in enumerate(rows):
        row_num = i + 1
        if row_num <= HEADER_ROWS:
            continue
        if not get_cell(row, COL_A):
            return row_num
    return len(rows) + 1


# ── CRUD ─────────────────────────────────────────────────────────

def list_vendors(rows):
    vendors = []
    for i, row in enumerate(rows):
        row_num = i + 1
        if row_num <= HEADER_ROWS:
            continue
        alias = get_cell(row, COL_A)
        if alias:
            vendors.append({
                "row"    : row_num,
                "alias"  : alias,
                "company": get_cell(row, COL_B),
                "biz_num": get_cell(row, COL_C),
                "rep"    : get_cell(row, COL_D),
                "contact": get_cell(row, COL_E),
                "email"  : get_cell(row, COL_F),
            })
    if not vendors:
        print("등록된 거래처가 없습니다.")
        return
    print(f"📋 거래처 목록 ({len(vendors)}건):")
    print("-" * 90)
    for v in vendors:
        print(f"  행{v['row']:3d} | {v['alias']:22s} | {v['company']:16s} | {v['biz_num']:14s} | {v['contact']:8s} | {v['email']}")


def add_vendor(service, rows, alias, company, biz_num, rep, contact, email, address, biz_type, biz_item):
    # 중복 확인
    row_num, _ = find_row(rows, alias)
    if row_num:
        print(f"❌ '{alias}' 별칭이 이미 {row_num}행에 존재합니다.")
        sys.exit(1)

    next_row = find_next_empty_row(rows)
    col_map = {
        "A": alias,
        "B": company,
        "C": biz_num,
        "D": rep,
        "E": contact,
        "F": email,
        "G": address,
        "H": biz_type,
        "I": biz_item,
    }
    data = [
        {"range": f"{SHEET_NAME}!{col}{next_row}", "values": [[val]]}
        for col, val in col_map.items() if val
    ]
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"valueInputOption": "USER_ENTERED", "data": data}
    ).execute()

    print(f"✅ {next_row}행에 거래처 추가 완료!")
    print(f"   별칭      : {alias}")
    print(f"   상호      : {company}")
    print(f"   사업자번호: {biz_num}")
    print(f"   대표자    : {rep}")
    print(f"   담당자    : {contact}")
    print(f"   이메일    : {email}")


def edit_vendor(service, rows, alias, **kwargs):
    row_num, row_data = find_row(rows, alias)
    if not row_num:
        print(f"❌ '{alias}' 거래처를 찾을 수 없습니다.")
        sys.exit(1)

    field_map = {
        "alias"   : "A",
        "company" : "B",
        "biz_num" : "C",
        "rep"     : "D",
        "contact" : "E",
        "email"   : "F",
        "address" : "G",
        "biz_type": "H",
        "biz_item": "I",
    }
    data = []
    for key, val in kwargs.items():
        if val is not None and key in field_map:
            col = field_map[key]
            data.append({"range": f"{SHEET_NAME}!{col}{row_num}", "values": [[val]]})

    if not data:
        print("변경할 항목이 없습니다.")
        return

    service.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"valueInputOption": "USER_ENTERED", "data": data}
    ).execute()

    print(f"✅ {row_num}행 '{alias}' 거래처 수정 완료!")
    for d in data:
        col_letter = d["range"].split("!")[1][0]
        col_name = {"A":"별칭","B":"상호","C":"사업자번호","D":"대표자","E":"담당자","F":"이메일","G":"주소","H":"업태","I":"종목"}.get(col_letter, col_letter)
        print(f"   {col_name}: {d['values'][0][0]}")


def delete_vendor(service, rows, alias):
    row_num, _ = find_row(rows, alias)
    if not row_num:
        print(f"❌ '{alias}' 거래처를 찾을 수 없습니다.")
        sys.exit(1)

    # 해당 행 전체 지우기
    clear_range = f"{SHEET_NAME}!A{row_num}:I{row_num}"
    service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=clear_range
    ).execute()

    print(f"✅ {row_num}행 '{alias}' 거래처 삭제 완료!")


# ── Main ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="거래처 시트 CRUD 스크립트")
    parser.add_argument("--list",   action="store_true", help="거래처 목록 조회")
    parser.add_argument("--add",    action="store_true", help="거래처 추가")
    parser.add_argument("--edit",   action="store_true", help="거래처 수정")
    parser.add_argument("--delete", action="store_true", help="거래처 삭제")

    parser.add_argument("--alias",    help="별칭(구분) — 필수")
    parser.add_argument("--company",  default="", help="상호")
    parser.add_argument("--biz-num",  default="", help="사업자등록번호")
    parser.add_argument("--rep",      default="", help="공급자_성명(대표자)")
    parser.add_argument("--contact",  default="", help="담당자명")
    parser.add_argument("--email",    default="", help="담당자메일")
    parser.add_argument("--address",  default="", help="사업장소재지")
    parser.add_argument("--biz-type", default="", help="업태")
    parser.add_argument("--biz-item", default="", help="종목")
    args = parser.parse_args()

    service = get_service()
    rows    = read_all(service)

    if args.list:
        list_vendors(rows)

    elif args.add:
        if not args.alias:
            print("ERROR: --alias 필수")
            sys.exit(1)
        add_vendor(
            service, rows,
            args.alias, args.company, args.biz_num,
            args.rep, args.contact, args.email,
            args.address, args.biz_type, args.biz_item
        )

    elif args.edit:
        if not args.alias:
            print("ERROR: --alias 필수")
            sys.exit(1)
        edit_vendor(
            service, rows, args.alias,
            company  = args.company   or None,
            biz_num  = args.biz_num   or None,
            rep      = args.rep       or None,
            contact  = args.contact   or None,
            email    = args.email     or None,
            address  = args.address   or None,
            biz_type = args.biz_type  or None,
            biz_item = args.biz_item  or None,
        )

    elif args.delete:
        if not args.alias:
            print("ERROR: --alias 필수")
            sys.exit(1)
        delete_vendor(service, rows, args.alias)

    else:
        parser.print_help()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ 오류: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
