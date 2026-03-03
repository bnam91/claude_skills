#!/usr/bin/env python3
"""
입금요청 등록 스크립트
Usage:
  python3 payment_request.py --lookup --recipient 아이플
  python3 payment_request.py --recipient 아이플 --item 관리비 --amount 381,430
  python3 payment_request.py --list
  python3 payment_request.py --add-favorite --alias 아이플 --item "아이플726호" --recipient 김성모 --account "농협 301-0192-8356-11 김성모"
  python3 payment_request.py --show-favorites
"""

import os, sys, json, argparse
from datetime import date
sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

SPREADSHEET_ID = "1CK2UXTy7HKjBe2T0ovm5hfzAAKZxZAR_ev3cbTPOMPs"
SHEET_NAME = "고야내부용"
FAVORITES_PATH = os.path.join(os.path.dirname(__file__), "favorites.json")

# 절대 열 인덱스 (A=0 기준)
COL_C = 2   # 날짜 (MMDD)
COL_E = 4   # 항목/제품
COL_F = 5   # 이름/받는사람
COL_I = 8   # 계좌번호
COL_J = 9   # 주민번호/사업자번호
COL_K = 10  # 금액
COL_P = 15  # 비고/상태


# ── Favorites (자주쓰는 곳) ──────────────────────────────────────

def load_favorites():
    if os.path.exists(FAVORITES_PATH):
        with open(FAVORITES_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_favorites(data):
    with open(FAVORITES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def lookup_from_favorites(alias):
    """별칭으로 favorites에서 조회. 결과: (item_template, recipient, account, business_id) or None"""
    favs = load_favorites()
    alias_lower = alias.strip().lower()
    for key, info in favs.items():
        if key.lower() == alias_lower:
            return (
                info.get("item", ""),
                info.get("recipient", ""),
                info.get("account", ""),
                info.get("business_id", ""),
            )
    return None


# ── Google Sheets ────────────────────────────────────────────────

def get_service():
    creds = auth.get_credentials()
    return build("sheets", "v4", credentials=creds)


def read_sheet(service):
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_NAME + "!A1:P500",
        majorDimension="ROWS"
    ).execute()
    return result.get("values", [])


def get_cell(row, col_idx):
    if len(row) > col_idx:
        return row[col_idx].strip()
    return ""


def lookup_from_sheet(rows, alias):
    """E열 부분일치 → F열 정확일치 순으로 조회.
    반환: (item_template, recipient, account, business_id) or (None, None, None, None)
    """
    alias_lower = alias.strip().lower()

    # 1순위: E열 부분일치 (아이플 → 아이플726호)
    for row in reversed(rows):
        item = get_cell(row, COL_E)
        if alias_lower in item.lower() and item:
            account = get_cell(row, COL_I)
            if account:
                return (
                    item,
                    get_cell(row, COL_F),
                    account,
                    get_cell(row, COL_J),
                )

    # 2순위: F열 정확일치
    for row in reversed(rows):
        name = get_cell(row, COL_F)
        if name.lower() == alias_lower:
            account = get_cell(row, COL_I)
            if account:
                return (
                    get_cell(row, COL_E),
                    name,
                    account,
                    get_cell(row, COL_J),
                )

    return None, None, None, None


def find_next_empty_row(rows):
    HEADER_ROW = 8
    last_data_row = HEADER_ROW
    for i, row in enumerate(rows):
        row_num = i + 1
        if row_num <= HEADER_ROW:
            continue
        if get_cell(row, COL_E) or get_cell(row, COL_F) or get_cell(row, COL_K):
            last_data_row = row_num
    return last_data_row + 1


def write_payment_request(service, row_num, item, recipient, account, business_id, amount):
    today = date.today().strftime("%y%m%d")  # YYMMDD 형식
    col_map = {
        "C": today,
        "E": item,
        "F": recipient,
        "I": account,
        "J": business_id,
        "K": amount,
        "P": "입금요청",
    }
    data = [
        {"range": f"{SHEET_NAME}!{col}{row_num}", "values": [[val]]}
        for col, val in col_map.items()
    ]
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"valueInputOption": "USER_ENTERED", "data": data}
    ).execute()


def list_pending_requests(rows):
    pending = [
        {
            "row": i + 1,
            "item": get_cell(row, COL_E),
            "recipient": get_cell(row, COL_F),
            "account": get_cell(row, COL_I),
            "amount": get_cell(row, COL_K),
        }
        for i, row in enumerate(rows)
        if i + 1 > 8 and get_cell(row, COL_P) == "입금요청"
    ]
    if not pending:
        print("입금요청 상태인 항목이 없습니다.")
        return
    print(f"📋 입금요청 목록 ({len(pending)}건):")
    print("-" * 70)
    for p in pending:
        print(f"  행 {p['row']:3d} | {p['recipient'] or '(없음)':12s} | {p['item'] or '(없음)':18s} | {p['amount']:>12s}")


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="입금요청 시트 등록 스크립트")
    parser.add_argument("--recipient", help="받는사람 또는 별칭 (아이플, 김성모 등)")
    parser.add_argument("--item", help="항목/제품명 (E열에 표시될 값)")
    parser.add_argument("--amount", help="금액 (예: 381,430)")
    parser.add_argument("--account", default="", help="계좌번호")
    parser.add_argument("--business-id", default="", help="주민번호 또는 사업자번호")
    parser.add_argument("--lookup", action="store_true", help="기존 수취인 정보 조회만")
    parser.add_argument("--list", action="store_true", help="입금요청 목록 조회")
    parser.add_argument("--add-favorite", action="store_true", help="자주쓰는 곳 등록")
    parser.add_argument("--alias", help="자주쓰는 곳 별칭")
    parser.add_argument("--show-favorites", action="store_true", help="자주쓰는 곳 목록 출력")
    args = parser.parse_args()

    # ── 자주쓰는 곳 목록 출력
    if args.show_favorites:
        favs = load_favorites()
        if not favs:
            print("등록된 자주쓰는 곳이 없습니다.")
            return
        print(f"⭐ 자주쓰는 곳 ({len(favs)}건):")
        print("-" * 60)
        for alias, info in favs.items():
            print(f"  [{alias}] {info.get('item','')} / {info.get('recipient','')} / {info.get('account','')}")
        return

    # ── 자주쓰는 곳 등록
    if args.add_favorite:
        if not args.alias or not args.recipient or not args.account:
            print("ERROR: --alias, --recipient, --account 필요")
            sys.exit(1)
        favs = load_favorites()
        favs[args.alias] = {
            "item": args.item or args.alias,
            "recipient": args.recipient,
            "account": args.account,
            "business_id": args.business_id or "",
        }
        save_favorites(favs)
        print(f"⭐ '{args.alias}' 자주쓰는 곳 등록 완료!")
        print(f"   항목     : {args.item or args.alias}")
        print(f"   받는사람 : {args.recipient}")
        print(f"   계좌번호 : {args.account}")
        return

    # ── 이하 시트 연결 필요
    service = get_service()
    rows = read_sheet(service)

    # ── 목록 조회
    if args.list:
        list_pending_requests(rows)
        return

    # ── 조회 모드
    if args.lookup:
        if not args.recipient:
            print("ERROR: --recipient 필요")
            sys.exit(1)

        # favorites 우선 조회
        fav = lookup_from_favorites(args.recipient)
        if fav:
            item_t, recip, account, biz_id = fav
            print(f"FOUND|{account}|{biz_id}|{item_t}|{recip}|favorites")
            return

        # 시트 조회
        item_t, recip, account, biz_id = lookup_from_sheet(rows, args.recipient)
        if account:
            print(f"FOUND|{account}|{biz_id}|{item_t}|{recip}|sheet")
        else:
            print("NOT_FOUND")
        return

    # ── 등록 모드
    if not args.recipient or not args.amount:
        print("ERROR: --recipient, --amount 필요합니다.")
        parser.print_help()
        sys.exit(1)

    # 계좌정보 조회 (favorites → 시트 순)
    account = args.account
    business_id = args.business_id
    recipient_final = args.recipient
    item_template = ""  # favorites/시트 템플릿이 항상 우선
    source = "수동입력"

    if not account:
        fav = lookup_from_favorites(args.recipient)
        if fav:
            item_t, recip, account, business_id = fav
            item_template = item_t  # 템플릿 항상 사용 (--item 무시)
            recipient_final = recip
            source = "favorites"
        else:
            item_t, recip, account, biz_id = lookup_from_sheet(rows, args.recipient)
            if account:
                if not item_template:
                    item_template = item_t
                recipient_final = recip
                business_id = biz_id
                source = "시트조회"

    # E열 항목 결정: 템플릿 우선, 없으면 --item 사용
    final_item = item_template or args.item or args.recipient

    next_row = find_next_empty_row(rows)
    write_payment_request(
        service, next_row,
        final_item, recipient_final,
        account or "", business_id or "",
        args.amount
    )

    print(f"✅ {next_row}행에 입금요청 등록 완료! (정보출처: {source})")
    print(f"   날짜     : {date.today().strftime('%y%m%d')}")
    print(f"   항목     : {final_item}")
    print(f"   받는사람 : {recipient_final}")
    print(f"   계좌번호 : {account or '(미입력)'}")
    print(f"   주민/사업자번호: {business_id or '(미입력)'}")
    print(f"   금액     : {args.amount}")
    print(f"   상태     : 입금요청")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ 오류: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
