#!/usr/bin/env python3
"""
쿠팡 경쟁사 실재고 일괄 조회 → Google Sheets 기록

사용법:
  python3 stock_sheet_batch.py
  python3 stock_sheet_batch.py --sheet-id SPREADSHEET_ID --tab 시트1

동작:
  1. 헤더(1행)에서 가장 오른쪽 빈 열 찾기
  2. 그 열 1행에 오늘 날짜+시각 입력 (예: 2026-02-10 23:32:06)
  3. C열 URL들을 읽어 재고 조회
  4. 조회 결과(stockQuantity)를 해당 열 같은 행에 입력
  5. 조회 실패 시 "ERROR" 입력
"""

import sys
import os
import argparse
from datetime import datetime

# sheet_manager 경로 추가
sys.path.append(os.path.expanduser('~/Documents/claude_skills/sheet_manager'))
sys.path.append(os.path.expanduser('~/Documents/claude_skills/coupang_stock'))
sys.path.append(os.path.expanduser('~/Documents/github_cloud/module_auth'))

import sheet_manager as sm
from stock_checker import parse_vendor_item_id, get_stock_batch

# 기본값
DEFAULT_SHEET_ID = '116Yi20ERELufYWERKc9M7Eh2sgETS-mZ4iAXpSghnsM'
DEFAULT_TAB = '시트1'


def col_index_to_letter(idx: int) -> str:
    """0-based 컬럼 인덱스 → 열 문자 (0→A, 25→Z, 26→AA ...)"""
    result = ''
    idx += 1  # 1-based
    while idx > 0:
        idx, rem = divmod(idx - 1, 26)
        result = chr(65 + rem) + result
    return result


def find_next_empty_col(header_row: list) -> int:
    """헤더 행에서 다음 빈 열의 0-based 인덱스 반환"""
    # 오른쪽 끝에서 연속된 빈 칸 제거 후, 그 다음 인덱스
    last_filled = -1
    for i, cell in enumerate(header_row):
        if str(cell).strip():
            last_filled = i
    return last_filled + 1


def main():
    parser = argparse.ArgumentParser(description='쿠팡 실재고 일괄 조회 → 시트 기록')
    parser.add_argument('--sheet-id', default=DEFAULT_SHEET_ID, help='스프레드시트 ID')
    parser.add_argument('--tab', default=DEFAULT_TAB, help='탭 이름')
    args = parser.parse_args()

    sheet_id = args.sheet_id
    tab = args.tab

    print(f"📊 시트 읽는 중: {sheet_id} / {tab}")

    # ── 1. 헤더 읽기 (넓게) ─────────────────────────────────────────────────
    header_data = sm.read(sheet_id, tab, 'A1:AZ1')
    header_row = header_data[0] if header_data else []

    next_col_idx = find_next_empty_col(header_row)
    next_col_letter = col_index_to_letter(next_col_idx)
    print(f"📝 새 열: {next_col_letter}열 (인덱스 {next_col_idx})")

    # ── 2. 헤더에 날짜+시각 기록 ────────────────────────────────────────────
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    sm.write(sheet_id, tab, f'{next_col_letter}1', [[now_str]])
    print(f"⏰ {next_col_letter}1 에 '{now_str}' 입력 완료")

    # ── 3. C열 URL 읽기 (2행부터) ──────────────────────────────────────────
    c_data = sm.read(sheet_id, tab, 'C2:C1000')
    if not c_data:
        print("⚠️  C열에 URL이 없습니다. 종료.")
        return

    urls = []
    for i, row in enumerate(c_data):
        url = row[0].strip() if row and row[0].strip() else ''
        urls.append((i + 2, url))  # (행 번호, URL)

    valid_urls = [(row_num, url) for row_num, url in urls if url]
    print(f"🔍 조회 대상 URL: {len(valid_urls)}개")

    # ── 4. vendorItemId 추출 ────────────────────────────────────────────────
    id_to_rows = {}  # vendorItemId → [row_num, ...]
    skip_rows = {}   # row_num → 이유

    for row_num, url in valid_urls:
        vid = parse_vendor_item_id(url)
        if vid:
            id_to_rows.setdefault(vid, []).append(row_num)
        else:
            skip_rows[row_num] = 'URL_PARSE_ERROR'
            print(f"  [SKIP] 행 {row_num}: vendorItemId 추출 실패 → {url[:60]}")

    vendor_ids = list(id_to_rows.keys())
    if not vendor_ids:
        print("⚠️  유효한 vendorItemId가 없습니다.")
        return

    # ── 5. 재고 일괄 조회 ────────────────────────────────────────────────────
    print(f"\n📡 Chrome CDP 통해 {len(vendor_ids)}개 재고 조회 중...\n")
    try:
        results = get_stock_batch(vendor_ids)
    except Exception as e:
        print(f"[ERROR] 재고 조회 실패: {e}")
        sys.exit(1)

    # ── 6. 시트에 결과 기록 ──────────────────────────────────────────────────
    print(f"\n📥 시트에 결과 기록 중...\n")
    write_count = 0

    for vid, row_nums in id_to_rows.items():
        if vid in results:
            stock = results[vid]['stockQuantity']
            value = stock if stock is not None else 0
        else:
            value = 'ERROR'

        for row_num in row_nums:
            cell = f'{next_col_letter}{row_num}'
            sm.write(sheet_id, tab, cell, [[value]])
            status = results.get(vid, {}).get('displayStatus', '-') if vid in results else 'NOT_FOUND'
            print(f"  행 {row_num:>3} | {next_col_letter}{row_num} = {value:>6}  (상태: {status})")
            write_count += 1

    # 파싱 실패 행 → ERROR 기록
    for row_num, reason in skip_rows.items():
        cell = f'{next_col_letter}{row_num}'
        sm.write(sheet_id, tab, cell, [['PARSE_ERR']])
        print(f"  행 {row_num:>3} | {next_col_letter}{row_num} = PARSE_ERR")
        write_count += 1

    print(f"\n✅ 완료: {write_count}개 셀 기록 (열: {next_col_letter}, 시각: {now_str})\n")


if __name__ == '__main__':
    main()
