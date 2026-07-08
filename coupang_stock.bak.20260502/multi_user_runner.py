#!/usr/bin/env python3
"""
쿠팡 실재고 멀티유저 일괄 조회 → 각 유저 시트 기록

동작:
  1. users_config 시트에서 active=TRUE + 유효기간 내 유저 로드
  2. 각 유저 시트 D열에서 URL 수집
  3. 전체 vendorItemId 한 번에 get_stock_batch() 호출
  4. 결과를 각 유저 시트 J열 이후 새 열(날짜)에 기록

사용법:
  python3 multi_user_runner.py
"""

import sys
import os
import re
from datetime import date, datetime

sys.path.append(os.path.expanduser('~/Documents/claude_skills/sheet_manager'))
sys.path.append(os.path.expanduser('~/Documents/claude_skills/coupang_stock'))
sys.path.append(os.path.expanduser('~/Documents/github_cloud/module_auth'))

import auth
import sheet_manager as sm
from stock_checker import parse_vendor_item_id, get_stock_batch
from googleapiclient.discovery import build

# Sheets API 클라이언트 (색상 포맷용)
_sheets_svc = None

def get_sheets_svc():
    global _sheets_svc
    if _sheets_svc is None:
        creds = auth.get_credentials()
        _sheets_svc = build('sheets', 'v4', credentials=creds)
    return _sheets_svc


def get_sheet_gid(sheet_id: str, tab: str) -> int | None:
    """탭 이름 → sheetId(gid) 반환"""
    svc = get_sheets_svc()
    meta = svc.spreadsheets().get(spreadsheetId=sheet_id).execute()
    for s in meta.get('sheets', []):
        if s['properties']['title'] == tab:
            return s['properties']['sheetId']
    return None


def apply_stock_colors(sheet_id: str, tab: str, col_letter: str, row_value_pairs: list[tuple[int, str]]):
    """증감 결과에 따라 셀 텍스트 색상 적용
    - (+N) 빨간색 (경쟁사 재고 증가 = 위험)
    - (-N) 파란색 (경쟁사 재고 감소 = 유리)
    - (-)  회색 (변화 없음 or 첫 기록)
    """
    gid = get_sheet_gid(sheet_id, tab)
    if gid is None:
        return

    col_idx = 0
    c = col_letter.upper()
    for ch in c:
        col_idx = col_idx * 26 + (ord(ch) - ord('A') + 1)
    col_idx -= 1  # 0-based

    COLOR_PLUS  = {'red': 0.85, 'green': 0.11, 'blue': 0.11}  # 빨강
    COLOR_MINUS = {'red': 0.13, 'green': 0.38, 'blue': 0.78}  # 파랑
    COLOR_NONE  = {'red': 0.0, 'green': 0.0, 'blue': 0.0}  # 검정

    requests = []
    for row_num, value in row_value_pairs:
        if '(+' in value:
            color = COLOR_PLUS
        elif re.search(r'\(-\d', value):
            color = COLOR_MINUS
        else:
            color = COLOR_NONE

        requests.append({'repeatCell': {
            'range': {
                'sheetId': gid,
                'startRowIndex': row_num - 1,
                'endRowIndex': row_num,
                'startColumnIndex': col_idx,
                'endColumnIndex': col_idx + 1,
            },
            'cell': {'userEnteredFormat': {'textFormat': {'foregroundColor': color}}},
            'fields': 'userEnteredFormat.textFormat.foregroundColor'
        }})

    if requests:
        get_sheets_svc().spreadsheets().batchUpdate(
            spreadsheetId=sheet_id,
            body={'requests': requests}
        ).execute()

# users_config 시트 ID
USERS_CONFIG_SHEET_ID = '1JGMlXKpP5dPU2fOILO5m1D-XC7sF9FB6qGa8r5BWPqc'
USERS_CONFIG_TAB = 'config'

# 재고 기록 고정값
URL_COL = 'D'
STOCK_START_COL = 'J'  # J=9 (0-based)
STOCK_START_IDX = 9


def extract_sheet_id(url: str) -> str:
    """Google Sheets URL에서 spreadsheetId 추출"""
    m = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', url)
    return m.group(1) if m else url.strip()


def col_index_to_letter(idx: int) -> str:
    """0-based 컬럼 인덱스 → 열 문자 (0→A, 25→Z, 26→AA ...)"""
    result = ''
    idx += 1
    while idx > 0:
        idx, rem = divmod(idx - 1, 26)
        result = chr(65 + rem) + result
    return result


def find_next_stock_col(sheet_id: str, tab: str) -> tuple[str, str | None]:
    """J열부터 헤더 스캔해서 (다음 빈 열 문자, 직전 열 문자 or None) 반환"""
    header_data = sm.read(sheet_id, tab, 'J1:AZ1')
    header_row = header_data[0] if header_data else []
    last_filled = -1
    for i, cell in enumerate(header_row):
        if str(cell).strip():
            last_filled = i
    next_idx = STOCK_START_IDX + last_filled + 1
    next_col = col_index_to_letter(next_idx)
    prev_col = col_index_to_letter(next_idx - 1) if last_filled >= 0 else None
    return next_col, prev_col


def read_prev_stock(sheet_id: str, tab: str, prev_col: str, row_nums: list[int]) -> dict[int, int | None]:
    """직전 열에서 행별 재고 숫자 읽기. 포맷: '117 (+11)' → 117"""
    if not prev_col:
        return {}
    min_row = min(row_nums)
    max_row = max(row_nums)
    data = sm.read(sheet_id, tab, f'{prev_col}{min_row}:{prev_col}{max_row}')
    result = {}
    for i, row in enumerate(data or []):
        row_num = min_row + i
        if row_num not in row_nums:
            continue
        raw = str(row[0]).strip() if row and row[0] else ''
        # "117 (+11)" or "117 (-3)" or "117 (-)" → 117
        m = re.match(r'^(\d+)', raw)
        result[row_num] = int(m.group(1)) if m else None
    return result


def format_stock_value(current: int, prev: int | None) -> str:
    """naver-stock 방식 포맷: '117 (+11)', '62 (-3)', '50 (-)'"""
    if prev is None:
        return f"{current} (-)"
    diff = current - prev
    if diff > 0:
        return f"{current} (+{diff})"
    elif diff < 0:
        return f"{current} ({diff})"
    else:
        return f"{current} (-)"


def load_users() -> list[dict]:
    """users_config 시트에서 활성 유저 목록 반환"""
    rows = sm.read(USERS_CONFIG_SHEET_ID, USERS_CONFIG_TAB, 'A1:G100')
    if not rows or len(rows) < 2:
        return []

    headers = [h.strip().lower() for h in rows[0]]
    today = date.today()
    users = []

    for row in rows[1:]:
        if not any(row):
            continue
        d = {headers[i]: row[i] if i < len(row) else '' for i in range(len(headers))}

        if d.get('active', '').upper() != 'TRUE':
            continue

        try:
            start = date.fromisoformat(d.get('start_date', '2000-01-01'))
            end   = date.fromisoformat(d.get('end_date',   '2099-12-31'))
        except ValueError:
            continue

        if not (start <= today <= end):
            continue

        sheet_id = extract_sheet_id(d.get('sheet_url', ''))
        if not sheet_id:
            continue

        users.append({
            'user_name': d.get('user_name', ''),
            'sheet_id':  sheet_id,
            'tab':       d.get('tab', '시트1'),
            'notes':     d.get('notes', ''),
        })

    return users


def collect_urls(user: dict) -> list[tuple[int, str]]:
    """D열에서 (행번호, URL) 목록 반환"""
    data = sm.read(user['sheet_id'], user['tab'], 'D2:D2000')
    if not data:
        return []
    result = []
    for i, row in enumerate(data):
        url = row[0].strip() if row and row[0].strip() else ''
        if url:
            result.append((i + 2, url))
    return result


def write_results(user: dict, col: str, prev_col: str | None, row_vid_map: dict[int, int], stock_results: dict, now_str: str):
    """날짜 헤더 기록 + 각 행에 증감량 포함 재고 기록 (batchUpdate로 1회 호출)"""
    # 직전 열 재고 읽기
    prev_stocks = read_prev_stock(user['sheet_id'], user['tab'], prev_col, list(row_vid_map.keys())) if prev_col else {}

    color_targets = []  # [(row_num, value), ...]

    # 헤더 + 전체 데이터 한 번에 batchUpdate
    data = [{'range': f"{user['tab']}!{col}1", 'values': [[now_str]]}]
    for row_num, vid in row_vid_map.items():
        if vid in stock_results:
            qty = stock_results[vid]['stockQuantity']
            value = format_stock_value(qty, prev_stocks.get(row_num)) if qty is not None else '0 (-)'
        else:
            value = 'ERROR'
        data.append({'range': f"{user['tab']}!{col}{row_num}", 'values': [[value]]})
        color_targets.append((row_num, value))

    get_sheets_svc().spreadsheets().values().batchUpdate(
        spreadsheetId=user['sheet_id'],
        body={'valueInputOption': 'RAW', 'data': data}
    ).execute()

    # 색상 일괄 적용
    apply_stock_colors(user['sheet_id'], user['tab'], col, color_targets)
    print(f"  ✅ {user['user_name']} | {col}열 | {len(color_targets)}개 기록 완료 (배치+색상 적용)")


def main():
    print(f"\n{'='*60}")
    print(f"🚀 쿠팡 실재고 멀티유저 조회 시작 — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # ── 1. 유저 로드 ────────────────────────────────────────────
    users = load_users()
    if not users:
        print("⚠️  활성 유저가 없습니다. 종료.")
        return
    print(f"👥 활성 유저: {len(users)}명 — {[u['user_name'] for u in users]}\n")

    # ── 2. 전체 URL 수집 ────────────────────────────────────────
    # user → {row_num: vendorItemId}
    user_row_vid: dict[str, dict[int, int]] = {}
    all_vids: set[int] = set()

    for user in users:
        url_rows = collect_urls(user)
        row_vid = {}
        for row_num, url in url_rows:
            vid = parse_vendor_item_id(url)
            if vid:
                row_vid[row_num] = vid
                all_vids.add(vid)
            else:
                print(f"  [SKIP] {user['user_name']} 행{row_num}: vendorItemId 추출 실패")
        user_row_vid[user['user_name']] = row_vid
        print(f"  📋 {user['user_name']}: {len(row_vid)}개 URL 수집")

    if not all_vids:
        print("\n⚠️  유효한 vendorItemId가 없습니다. 종료.")
        return

    print(f"\n📡 총 {len(all_vids)}개 vendorItemId 재고 조회 중...\n")

    # ── 3. 재고 일괄 조회 (1회) ─────────────────────────────────
    try:
        stock_results = get_stock_batch(list(all_vids))
    except Exception as e:
        print(f"[ERROR] 재고 조회 실패: {e}")
        sys.exit(1)

    print(f"✅ {len(stock_results)}/{len(all_vids)}개 조회 완료\n")

    # ── 4. 각 유저 시트에 기록 ──────────────────────────────────
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for user in users:
        row_vid = user_row_vid.get(user['user_name'], {})
        if not row_vid:
            print(f"  ⚠️  {user['user_name']}: 기록할 데이터 없음")
            continue
        col, prev_col = find_next_stock_col(user['sheet_id'], user['tab'])
        write_results(user, col, prev_col, row_vid, stock_results, now_str)

    print(f"\n{'='*60}")
    print(f"🏁 완료 — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
