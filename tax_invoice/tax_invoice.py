#!/usr/bin/env python3
"""
세금계산서(발행) 시트 CRUD 스크립트

시트 열 구조 (A~S):
  A: 공급자 상호 (고야앤드미디어 - 수식 자동)
  B: 별칭(공급받는자/거래처) ← 입력
  C: 상호명        - B 기준 수식 자동
  D: 사업자등록번호  - B 기준 수식 자동
  E: 이메일        - B 기준 수식 자동
  F: 작성일자(공급 연월일) ← 입력 (YY-MM-DD)
  G: 월           ← 입력 (작성일의 월)
  H: 일           ← 입력 (실제 공급일 - 작성일과 다를 수 있음)
  I: 합계금액(VAT포함) - 수식 자동 (N+O)
  J: 품목명        ← 입력
  K: 규격          ← 입력 (선택)
  L: 수량          ← 입력 (기본 1)
  M: 단가          ← 입력 (공급가액 ÷ 수량)
  N: 공급가액       ← 입력
  O: 세액          ← 입력 (공급가액 × 10% 또는 직접 지정)
  P: 비고          ← 입력 (선택)
  Q: 청구/영수      ← 입력 (기본 영수)
  R: 발급하기(y)   ← 발급 처리 시 사용
  S: 비고2         ← 취소완료 등 추가 메모

Usage:
  python3 tax_invoice.py --alias "팔도2팀-유호경" --item "이천비락식혜 선물세트" --amount 4018676
  python3 tax_invoice.py --alias "팔도" --item "품목" --amount 4018676 --billing 청구 --supply-day 22
  python3 tax_invoice.py --edit --row 7 --item "수정 품목명"
  python3 tax_invoice.py --delete --row 7
  python3 tax_invoice.py --list
  python3 tax_invoice.py --list-aliases
"""

import os, sys, argparse
from datetime import date

SUPPLIER = "고야앤드미디어"  # A열 공급자 상호 (고정값)

sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

SPREADSHEET_ID = "1mFlHEtlYZXUWTLIpJ2jUKCuvIzHyP4jxvzT1HXpPkzg"
SHEET_INVOICE  = "세금계산서(발행)"
SHEET_VENDOR   = "거래처"
HEADER_ROWS    = 2

# 열 인덱스 (A=0 기준) — C,D,E,K,P,R,S는 쓰지 않음
COL_A = 0   # 공급자 상호 (고야앤드미디어)
COL_B = 1   # 별칭(공급받는자/거래처)
COL_F = 5   # 작성일자
COL_G = 6   # 월
COL_H = 7   # 일 (실제 공급일)
COL_I = 8   # 합계금액(VAT포함) = N + O
COL_J = 9   # 품목명
COL_L = 11  # 수량
COL_M = 12  # 단가
COL_N = 13  # 공급가액
COL_O = 14  # 세액
COL_Q = 16  # 청구/영수


# ── Google Sheets ─────────────────────────────────────────────────

def get_service():
    creds = auth.get_credentials()
    return build("sheets", "v4", credentials=creds)


def read_range(service, sheet, range_str):
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet}!{range_str}",
        majorDimension="ROWS"
    ).execute()
    return result.get("values", [])


def get_cell(row, col_idx):
    if len(row) > col_idx:
        return str(row[col_idx]).strip()
    return ""


# ── 거래처 조회 ────────────────────────────────────────────────────

def get_aliases(service):
    rows = read_range(service, SHEET_VENDOR, "A1:A100")
    return [row[0].strip() for row in rows[1:] if row and row[0].strip()]


def find_alias(aliases, keyword):
    """정확 일치 → 부분 일치 순. 반환: str | list | None"""
    kw = keyword.strip().lower()
    for a in aliases:
        if a.lower() == kw:
            return a
    matches = [a for a in aliases if kw in a.lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return matches
    return None


# ── 행 탐색 ────────────────────────────────────────────────────────

def find_next_row(rows):
    """B열(별칭)이 비어있는 첫 번째 데이터 행 번호 반환"""
    for i, row in enumerate(rows):
        row_num = i + 1
        if row_num <= HEADER_ROWS:
            continue
        if not get_cell(row, COL_B):
            return row_num
    return len(rows) + 1


# ── 입력 ──────────────────────────────────────────────────────────

def write_invoice(service, row_num, alias, supply, tax,
                  item, qty, billing, inv_date, supply_day):
    unit_price = supply // qty if qty else supply
    total      = supply + tax
    date_str   = inv_date.strftime("%y-%m-%d")  # 예: 26-03-03
    s_day      = supply_day if supply_day else inv_date.day

    col_map = {
        "A": SUPPLIER,
        "B": alias,
        "F": date_str,
        "G": inv_date.month,
        "H": s_day,
        "I": total,
        "J": item,
        "L": qty,
        "M": unit_price,
        "N": supply,
        "O": tax,
        "Q": billing,
    }
    data = [
        {"range": f"{SHEET_INVOICE}!{col}{row_num}", "values": [[val]]}
        for col, val in col_map.items()
    ]
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"valueInputOption": "USER_ENTERED", "data": data}
    ).execute()


# ── 수정 ──────────────────────────────────────────────────────────

def edit_invoice(service, row_num, **kwargs):
    field_map = {
        "supplier"   : "A",
        "alias"      : "B",
        "date"       : "F",
        "month"      : "G",
        "supply_day" : "H",
        "total"      : "I",
        "item"       : "J",
        "qty"        : "L",
        "unit"       : "M",
        "supply"     : "N",
        "tax"        : "O",
        "billing"    : "Q",
    }
    data = [
        {"range": f"{SHEET_INVOICE}!{field_map[k]}{row_num}", "values": [[v]]}
        for k, v in kwargs.items()
        if v is not None and k in field_map
    ]
    if not data:
        print("변경할 항목이 없습니다.")
        return
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"valueInputOption": "USER_ENTERED", "data": data}
    ).execute()
    print(f"✅ {row_num}행 수정 완료!")


# ── 삭제 ──────────────────────────────────────────────────────────

def delete_invoice(service, row_num):
    """A~Q열 clear (입력 가능한 전체 범위)"""
    service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_INVOICE}!A{row_num}:Q{row_num}"
    ).execute()
    print(f"✅ {row_num}행 삭제 완료!")


# ── 목록 조회 ─────────────────────────────────────────────────────

def list_invoices(rows):
    items = []
    for i, row in enumerate(rows):
        row_num = i + 1
        if row_num <= HEADER_ROWS:
            continue
        alias = get_cell(row, COL_B)
        if not alias:
            continue
        items.append({
            "row"    : row_num,
            "date"   : get_cell(row, COL_F),
            "alias"  : alias,
            "item"   : get_cell(row, COL_J),
            "total"  : get_cell(row, COL_I),
            "supply" : get_cell(row, COL_N),
            "tax"    : get_cell(row, COL_O),
            "billing": get_cell(row, COL_Q),
        })
    if not items:
        print("등록된 세금계산서가 없습니다.")
        return
    print(f"📋 세금계산서(발행) 목록 ({len(items)}건):")
    print("-" * 100)
    for inv in items:
        total_str = inv['total'] if inv['total'] else "(미입력)"
        print(f"  행{inv['row']:3d} | {inv['date']:8s} | {inv['alias']:22s} | {inv['item'][:20]:20s} | {total_str:>14s} | {inv['billing']:4s}")


# ── Main ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="세금계산서(발행) 시트 CRUD 스크립트")

    # 입력 인자
    parser.add_argument("--alias",       help="거래처 별칭 (부분 입력 가능, 예: 팔도2팀)")
    parser.add_argument("--item",        help="품목명")
    parser.add_argument("--amount",      help="공급가액 (부가세 제외, 예: 4018676)")
    parser.add_argument("--vat",         help="세액 직접 지정 (생략 시 amount×10% 자동)")
    parser.add_argument("--qty",         type=int, default=1, help="수량 (기본: 1)")
    parser.add_argument("--billing",     default="영수", choices=["영수", "청구"], help="청구/영수 (기본: 영수)")
    parser.add_argument("--date",        help="작성일자 YYYY-MM-DD (기본: 오늘)")
    parser.add_argument("--supply-day",  type=int, help="실제 공급일(일) - 작성일과 다를 경우 지정")

    # 수정/삭제
    parser.add_argument("--edit",        action="store_true", help="행 수정 (--row 필수)")
    parser.add_argument("--delete",      action="store_true", help="행 삭제 (--row 필수)")
    parser.add_argument("--row",         type=int, help="수정/삭제 대상 행 번호")

    # 조회
    parser.add_argument("--list",         action="store_true", help="발행 목록 조회")
    parser.add_argument("--list-aliases", action="store_true", help="거래처 별칭 목록 조회")

    args = parser.parse_args()

    service = get_service()

    # ── 별칭 목록 조회
    if args.list_aliases:
        aliases = get_aliases(service)
        print(f"📋 거래처 별칭 목록 ({len(aliases)}건):")
        for a in aliases:
            print(f"  - {a}")
        return

    rows = read_range(service, SHEET_INVOICE, "A1:S200")

    # ── 수정
    if args.edit:
        if not args.row:
            print("ERROR: --row 필수")
            sys.exit(1)
        supply = int(str(args.amount).replace(",", "")) if args.amount else None
        tax    = int(str(args.vat).replace(",", ""))    if args.vat    else None
        # 수정 시 supply/tax 둘 다 주어지면 total도 재계산
        total = (supply + tax) if (supply is not None and tax is not None) else None
        edit_invoice(
            service, args.row,
            alias      = args.alias      or None,
            item       = args.item       or None,
            supply     = supply,
            tax        = tax,
            total      = total,
            qty        = args.qty        if args.qty != 1 else None,
            billing    = args.billing    if args.billing != "영수" else None,
            date       = args.date       or None,
            supply_day = args.supply_day or None,
        )
        return

    # ── 삭제
    if args.delete:
        if not args.row:
            print("ERROR: --row 필수")
            sys.exit(1)
        delete_invoice(service, args.row)
        return

    # ── 목록 조회
    if args.list:
        list_invoices(rows)
        return

    # ── 입력 (필수 인자 확인)
    if not args.alias or not args.item or not args.amount:
        print("ERROR: --alias, --item, --amount 는 필수입니다.")
        parser.print_help()
        sys.exit(1)

    # 별칭 매칭
    aliases = get_aliases(service)
    matched = find_alias(aliases, args.alias)
    if matched is None:
        print(f"❌ '{args.alias}'에 해당하는 거래처가 없습니다.")
        print(f"   사용 가능: {', '.join(aliases)}")
        sys.exit(1)
    if isinstance(matched, list):
        print(f"⚠️  여러 거래처가 매칭됩니다. 정확한 별칭을 입력해주세요:")
        for m in matched:
            print(f"   - {m}")
        sys.exit(1)

    # 금액
    supply = int(str(args.amount).replace(",", ""))
    tax    = int(str(args.vat).replace(",", "")) if args.vat else round(supply * 0.1)

    # 날짜
    inv_date = date.fromisoformat(args.date) if args.date else date.today()

    # 다음 빈 행
    next_row = find_next_row(rows)

    # 입력
    write_invoice(
        service, next_row,
        matched, supply, tax,
        args.item, args.qty,
        args.billing, inv_date,
        args.supply_day
    )

    s_day = args.supply_day if args.supply_day else inv_date.day
    print(f"✅ {next_row}행 입력 완료!")
    print(f"   거래처   : {matched}")
    print(f"   작성일자 : {inv_date.strftime('%Y-%m-%d')} (공급월: {inv_date.month}월 {s_day}일)")
    print(f"   품목명   : {args.item}")
    print(f"   수량     : {args.qty}")
    print(f"   공급가액 : {supply:,}원")
    print(f"   세액     : {tax:,}원")
    print(f"   합계     : {supply + tax:,}원")
    print(f"   청구/영수: {args.billing}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ 오류: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
