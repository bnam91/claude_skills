#!/usr/bin/env python3
"""
네이버 스마트스토어 문의/답변 전체 수집 → Google Sheets 저장
"""

import sys, os, json, time, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
import requests
requests.packages.urllib3.disable_warnings()

sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

# ─── 설정 ─────────────────────────────────────────────────────────────────
SPREADSHEET_ID = "1nO9_zyJtTPl05kX9z1IbBZX7jWjARsMXZw4qL1Hauow"
SHEET_NAME = "시트1"
# CDP에서 실시간으로 쿠키를 가져옴
CDP_PORT = 9222
# 수집 시작일 (스토어 오픈일보다 이전 날짜로 설정)
START_DATE = datetime(2020, 1, 1, tzinfo=timezone(timedelta(hours=9)))
CHUNK_DAYS = 90   # 3개월 단위로 API 호출
PAGE_SIZE = 100   # 한 번에 최대 100개
API_BASE = "https://sell.smartstore.naver.com"

KST = timezone(timedelta(hours=9))

# ─── CDP 쿠키 추출 ─────────────────────────────────────────────────────────
def get_cookies_from_cdp():
    """CDP WebSocket을 통해 현재 smartstore 탭의 쿠키를 가져옴"""
    import websocket

    with urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json") as r:
        tabs = json.loads(r.read())

    target = next((t for t in tabs if "sell.smartstore.naver.com" in t.get("url", "")), None)
    if not target:
        raise RuntimeError("스마트스토어 탭을 찾을 수 없습니다. CDP 브라우저에서 탭을 열어주세요.")

    ws_url = target["webSocketDebuggerUrl"]
    ws = websocket.create_connection(ws_url, timeout=10)
    ws.send(json.dumps({"id": 1, "method": "Network.getCookies", "params": {"urls": [API_BASE]}}))
    resp = json.loads(ws.recv())
    ws.close()

    cookies = resp.get("result", {}).get("cookies", [])
    return "; ".join(f"{c['name']}={c['value']}" for c in cookies)


# ─── API 호출 헬퍼 ─────────────────────────────────────────────────────────
HEADERS = {
    "referer": "https://sell.smartstore.naver.com/",
    "x-current-statename": "main.contents.comment",
    "x-current-state": "https://sell.smartstore.naver.com/#/comment/",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "accept": "*/*",
}

def api_get(path, cookie_str):
    url = API_BASE + path
    headers = {**HEADERS, "cookie": cookie_str}
    r = requests.get(url, headers=headers, verify=False, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_comments_page(start_dt, end_dt, page, cookie_str):
    start_str = urllib.parse.quote(start_dt.strftime("%Y-%m-%dT00:00:00.000+09:00"))
    end_str   = urllib.parse.quote(end_dt.strftime("%Y-%m-%dT23:59:59.999+09:00"))
    path = (f"/api/v3/contents/comments/pages"
            f"?commentType=&endDate={end_str}&keyword=&page={page}"
            f"&searchKeywordType=PRODUCT_NAME&sellerAnswer=&size={PAGE_SIZE}"
            f"&startDate={start_str}&totalCount=0")
    return api_get(path, cookie_str)


def fetch_replies(comment_id, cookie_str):
    try:
        return api_get(f"/api/v3/contents/comments/{comment_id}/replies", cookie_str)
    except Exception:
        return []


# ─── 전체 수집 ─────────────────────────────────────────────────────────────
def collect_all_comments(cookie_str):
    all_rows = []
    today = datetime.now(KST)
    chunk_start = START_DATE

    while chunk_start <= today:
        chunk_end = min(chunk_start + timedelta(days=CHUNK_DAYS - 1), today)
        print(f"  📅 {chunk_start.strftime('%Y-%m-%d')} ~ {chunk_end.strftime('%Y-%m-%d')} 수집 중...")

        page = 0
        while True:
            data = fetch_comments_page(chunk_start, chunk_end, page, cookie_str)
            contents = data if isinstance(data, list) else data.get("contents", [])

            if not contents:
                break

            for c in contents:
                # 답변 내용 가져오기
                reply_text = ""
                reply_date = ""
                if c.get("sellerAnswer") and c.get("replyCount", 0) > 0:
                    replies = fetch_replies(c["id"], cookie_str)
                    if replies:
                        reply_text = replies[0].get("commentContent", "")
                        reply_date_raw = replies[0].get("regDate", "")
                        if reply_date_raw:
                            try:
                                dt = datetime.fromisoformat(reply_date_raw.replace("Z", "+00:00"))
                                reply_date = dt.astimezone(KST).strftime("%Y-%m-%d %H:%M")
                            except Exception:
                                reply_date = reply_date_raw
                    time.sleep(0.1)  # API 부하 방지

                # 문의일 포맷
                reg_date_raw = c.get("regDate", "")
                try:
                    dt = datetime.fromisoformat(reg_date_raw.replace("Z", "+00:00"))
                    reg_date = dt.astimezone(KST).strftime("%Y-%m-%d %H:%M")
                except Exception:
                    reg_date = reg_date_raw

                row = [
                    reg_date,
                    str(c.get("channelProductNo", c.get("contentsObjectId", ""))),
                    c.get("productName") or c.get("contentsName", ""),
                    c.get("maskedWriterId", ""),
                    c.get("commentContent", ""),
                    "답변완료" if c.get("sellerAnswer") else "미답변",
                    reply_date,
                    reply_text,
                ]
                all_rows.append(row)

            print(f"    page {page}: {len(contents)}건 수집 (누적 {len(all_rows)}건)")

            # 다음 페이지 여부
            if isinstance(data, dict):
                total = data.get("totalElements", data.get("totalCount", len(contents)))
                if (page + 1) * PAGE_SIZE >= total or len(contents) < PAGE_SIZE:
                    break
            elif len(contents) < PAGE_SIZE:
                break

            page += 1
            time.sleep(0.2)

        chunk_start = chunk_end + timedelta(days=1)

    return all_rows


# ─── Google Sheets 저장 ────────────────────────────────────────────────────
def save_to_sheets(rows):
    creds = auth.get_credentials()
    service = build("sheets", "v4", credentials=creds)

    headers = [["문의일", "상품번호", "상품명", "고객ID", "질문내용", "답변여부", "답변일", "답변내용"]]
    all_data = headers + rows

    # 기존 데이터 초기화 후 쓰기
    service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A:H"
    ).execute()

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A1",
        valueInputOption="RAW",
        body={"values": all_data}
    ).execute()

    print(f"\n✅ Google Sheets에 {len(rows)}건 저장 완료!")
    print(f"   https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}")


# ─── 메인 ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🔑 CDP에서 쿠키 추출 중...")
    try:
        cookie_str = get_cookies_from_cdp()
        print(f"  쿠키 {len(cookie_str.split(';'))}개 확인")
    except Exception as e:
        print(f"  CDP 쿠키 추출 실패: {e}")
        print("  → network 요청에서 추출한 쿠키 사용")
        # fallback: 마지막으로 캡처된 쿠키 (CDP가 안될 경우)
        cookie_str = ""
        if not cookie_str:
            print("❌ 쿠키가 없어 실행 불가. CDP 브라우저에서 스마트스토어 탭을 열어주세요.")
            sys.exit(1)

    print("\n📦 문의/답변 수집 시작...")
    rows = collect_all_comments(cookie_str)
    print(f"\n총 {len(rows)}건 수집 완료")

    if not rows:
        print("수집된 데이터가 없습니다.")
        sys.exit(0)

    print("\n📊 Google Sheets에 저장 중...")
    save_to_sheets(rows)
