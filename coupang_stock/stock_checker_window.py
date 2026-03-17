#!/usr/bin/env python3
"""
쿠팡 경쟁사 실재고 조회 (IDOR) — Chrome CDP 방식
Chrome이 --remote-debugging-port=9222 로 실행 중이어야 함.

사용법:
  python3 stock_checker.py "https://www.coupang.com/vp/products/7732995852?vendorItemId=87774589466"
  python3 stock_checker.py "URL1" "URL2" "URL3"
  python3 stock_checker.py --ids 87774589466 91002023030
"""

import sys
import re
import json
import time
import threading
import requests
import argparse
from urllib.parse import urlparse, parse_qs


# ── 1. URL에서 vendorItemId 추출 ─────────────────────────────────────────────

def parse_vendor_item_id(url: str) -> int | None:
    url = url.strip()
    if url.isdigit():
        return int(url)
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    if 'vendorItemId' in qs:
        return int(qs['vendorItemId'][0])
    if 'itemId' in qs:
        return int(qs['itemId'][0])
    # URL 경로에 숫자만 있는 경우
    m = re.search(r'vendorItemId[=/](\d+)', url)
    if m:
        return int(m.group(1))
    return None


# ── 2. Chrome CDP 연결 헬퍼 ───────────────────────────────────────────────────

class CDP:
    def __init__(self, tab_id: str):
        import websocket
        self.ws = websocket.create_connection(
            f'ws://localhost:9223/devtools/page/{tab_id}',
            origin='http://localhost:9223',
            timeout=30
        )
        self.counter = [0]
        self.pending = {}
        self.events = []
        self._lock = threading.Lock()
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self):
        while True:
            try:
                msg = json.loads(self.ws.recv())
                mid = msg.get('id')
                if mid and mid in self.pending:
                    self.pending[mid] = msg
                elif 'method' in msg:
                    with self._lock:
                        self.events.append(msg)
            except:
                break

    def send(self, method, params={}):
        self.counter[0] += 1
        cid = self.counter[0]
        self.pending[cid] = None
        self.ws.send(json.dumps({'id': cid, 'method': method, 'params': params}))
        for _ in range(200):
            time.sleep(0.1)
            if self.pending[cid] is not None:
                return self.pending.pop(cid)
        return {}

    def close(self):
        try:
            self.ws.close()
        except:
            pass


CHROME_BIN = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
CHROME_USER_DATA = r'C:\Users\darli\Documents\github_cloud\user_data\coupangWing_bnam91'


def launch_chrome() -> bool:
    """Chrome CDP 인스턴스 실행. 성공 시 True."""
    import subprocess
    print("🚀 Chrome 자동 실행 중...")
    subprocess.Popen(
        [
            CHROME_BIN,
            '--remote-debugging-port=9223',
            '--remote-allow-origins=http://localhost:9223',
            f'--user-data-dir={CHROME_USER_DATA}',
            '--no-first-run',
            '--no-default-browser-check',
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(15):
        time.sleep(1)
        try:
            requests.get('http://localhost:9223/json', timeout=2).json()
            return True
        except:
            pass
    return False


def _load_wing_credentials() -> tuple[str, str]:
    """wingid/wingpw를 .env에서 읽어 반환."""
    import os
    env_path = os.path.expanduser('~/Documents/github_cloud/module_api_key/.env')
    wing_id, wing_pw = '', ''
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('wingid'):
                wing_id = line.split('=', 1)[1].strip().strip('"\'')
            elif line.startswith('wingpw'):
                wing_pw = line.split('=', 1)[1].strip().strip('"\'')
    return wing_id, wing_pw


def _login_if_needed(ws) -> bool:
    """현재 탭 URL 확인 → xauth면 자동 로그인. 이미 로그인 True, 로그인 성공 True, 실패 False."""
    import websocket as _ws_mod
    ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate',
                        'params': {'expression': 'window.location.href'}}))
    ws.settimeout(3)
    current_url = ''
    for _ in range(10):
        try:
            m = json.loads(ws.recv())
            if m.get('id') == 2:
                current_url = m['result']['result']['value']
                break
        except:
            break

    if 'xauth.coupang.com' not in current_url:
        return True  # 이미 로그인된 상태

    print("🔑 로그인 페이지 감지 → 자동 로그인 중...")
    wing_id, wing_pw = _load_wing_credentials()

    # 아이디 한 글자씩 천천히 입력
    ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate', 'params': {
        'expression': "document.getElementById('username').value = ''; document.getElementById('username').focus();"
    }}))
    time.sleep(0.3)
    for i, ch in enumerate(wing_id):
        ws.send(json.dumps({'id': 100 + i, 'method': 'Runtime.evaluate', 'params': {
            'expression': f"document.getElementById('username').value += {json.dumps(ch)};"
        }}))
        time.sleep(0.08 + (hash(ch) % 7) * 0.01)

    time.sleep(0.4)

    # 비번 한 글자씩 천천히 입력
    ws.send(json.dumps({'id': 200, 'method': 'Runtime.evaluate', 'params': {
        'expression': "document.getElementById('password').value = ''; document.getElementById('password').focus();"
    }}))
    time.sleep(0.3)
    for i, ch in enumerate(wing_pw):
        ws.send(json.dumps({'id': 201 + i, 'method': 'Runtime.evaluate', 'params': {
            'expression': f"document.getElementById('password').value += {json.dumps(ch)};"
        }}))
        time.sleep(0.1 + (hash(ch) % 8) * 0.01)

    time.sleep(0.5)

    # 로그인 버튼 클릭
    ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate',
                        'params': {'expression': "document.getElementById('kc-login').click()"}}))
    # 리다이렉트 완료까지 대기
    for _ in range(15):
        time.sleep(1)
        ws.send(json.dumps({'id': 4, 'method': 'Runtime.evaluate',
                            'params': {'expression': 'window.location.href'}}))
        ws.settimeout(2)
        try:
            for __ in range(5):
                m = json.loads(ws.recv())
                if m.get('id') == 4:
                    url = m['result']['result']['value']
                    if 'wing.coupang.com' in url and 'xauth' not in url:
                        print("✅ 로그인 완료")
                        return True
                    break
        except:
            pass
    print("[WARN] 로그인 완료 확인 실패 — 계속 진행")
    return False


def get_wing_tab() -> str | None:
    """Wing 탭 ID 반환. CDP 없으면 Chrome 자동 실행. 세션 만료 시 자동 로그인."""
    import websocket

    # CDP 접근 안 되면 Chrome 실행
    try:
        requests.get('http://localhost:9223/json', timeout=2).json()
    except:
        if not launch_chrome():
            print("[ERROR] Chrome 실행 실패")
            return None

    try:
        tabs = requests.get('http://localhost:9223/json', timeout=5).json()

        # 기존 Wing 탭 있으면 세션 상태 확인
        for t in tabs:
            if 'wing.coupang.com' in t.get('url', '') and t.get('type') == 'page':
                tab_id = t['id']
                ws = websocket.create_connection(
                    f'ws://localhost:9223/devtools/page/{tab_id}',
                    origin='http://localhost:9223', timeout=10
                )
                _login_if_needed(ws)
                ws.close()
                return tab_id

        # Wing 탭 없으면 새 탭 열고 이동
        print("📂 Wing 탭 없음 → 자동 생성 중...")
        r = requests.put('http://localhost:9223/json/new', timeout=5)
        tab_id = r.json()['id']
        ws = websocket.create_connection(
            f'ws://localhost:9223/devtools/page/{tab_id}',
            origin='http://localhost:9223', timeout=10
        )
        ws.send(json.dumps({'id': 1, 'method': 'Page.navigate',
                            'params': {'url': 'https://wing.coupang.com/'}}))
        time.sleep(5)
        _login_if_needed(ws)
        ws.close()
        return tab_id

    except Exception as e:
        print(f"[ERROR] {e}")
    return None


def close_wing_tab(tab_id: str):
    """Wing 탭 종료."""
    try:
        requests.get(f'http://localhost:9223/json/close/{tab_id}', timeout=5)
        print("🔒 Wing 탭 종료 완료")
    except:
        pass


# ── 3. Chrome 브라우저에서 직접 fetch (봇 방어 우회) ─────────────────────────

def get_stock_via_cdp(vendor_item_ids: list[int], tab_id: str) -> dict[int, dict]:
    """
    Chrome CDP를 통해 브라우저 컨텍스트에서 직접 fetch.
    봇 방어(Akamai)를 브라우저 핑거프린트로 우회.
    """
    if not tab_id:
        raise RuntimeError("Chrome에서 coupang.com 탭을 찾을 수 없습니다. Chrome을 열고 wing.coupang.com에 로그인하세요.")

    cdp = CDP(tab_id)
    cdp.send('Runtime.enable')

    ids_json = json.dumps(vendor_item_ids)
    script = f"""
    (async () => {{
      const ids = {ids_json};
      const url = 'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventories/exposure/query-status-new';
      const body = {{ inventoryRequests: [{{ vendorItemIds: ids }}] }};

      const r = await fetch(url, {{
        method: 'POST',
        credentials: 'include',
        headers: {{
          'Content-Type': 'application/json',
          'Referer': 'https://wing.coupang.com/vendor-inventory/list',
        }},
        body: JSON.stringify(body)
      }});

      if (!r.ok) return JSON.stringify({{error: r.status, text: await r.text()}});
      return await r.text();
    }})()
    """

    result = cdp.send('Runtime.evaluate', {
        'expression': script,
        'awaitPromise': True,
        'timeout': 20000
    })
    cdp.close()

    raw = result.get('result', {}).get('result', {}).get('value', '')
    if not raw:
        raise RuntimeError("빈 응답")

    data = json.loads(raw)
    if 'error' in data:
        raise RuntimeError(f"API 오류 {data['error']}: {data.get('text', '')[:200]}")

    items = data.get('body', {}).get('null', {}).get('items', [])
    return {
        item['vendorItemId']: {
            'stockQuantity':    item.get('stockQuantity'),
            'displayStatus':    item.get('displayStatus'),
            'buyboxWinner':     item.get('buyboxWinner'),
            'registrationType': item.get('registrationType'),
            'valid':            item.get('valid'),
        }
        for item in items
    }


# ── 4. 배치 처리 ─────────────────────────────────────────────────────────────

def get_stock_batch(vendor_item_ids: list[int], chunk_size: int = 200) -> dict:
    tab_id = get_wing_tab()
    if not tab_id:
        raise RuntimeError("Wing 탭 준비 실패")
    results = {}
    try:
        for i in range(0, len(vendor_item_ids), chunk_size):
            chunk = vendor_item_ids[i:i + chunk_size]
            results.update(get_stock_via_cdp(chunk, tab_id))
            if i + chunk_size < len(vendor_item_ids):
                time.sleep(0.5)
    finally:
        close_wing_tab(tab_id)
    return results


# ── 5. 메인 ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='쿠팡 경쟁사 실재고 조회')
    parser.add_argument('urls', nargs='*', help='쿠팡 상품 URL (여러 개 가능)')
    parser.add_argument('--ids', nargs='+', type=int, help='vendorItemId 직접 입력')
    parser.add_argument('--json', action='store_true', help='JSON 형식으로 출력')
    args = parser.parse_args()

    vendor_item_ids = list(args.ids or [])
    url_map = {}

    for url in (args.urls or []):
        vid = parse_vendor_item_id(url)
        if vid:
            vendor_item_ids.append(vid)
            url_map[vid] = url
        else:
            print(f"[SKIP] vendorItemId 추출 실패: {url}")

    if not vendor_item_ids:
        parser.print_help()
        sys.exit(1)

    vendor_item_ids = list(dict.fromkeys(vendor_item_ids))  # 중복 제거 (순서 유지)
    print(f"\n🔍 조회 대상: {len(vendor_item_ids)}개")
    print("📡 Chrome 브라우저를 통해 재고 조회 중...\n")

    try:
        results = get_stock_batch(vendor_item_ids)
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return results

    # 테이블 출력
    print("━" * 70)
    print(f"{'vendorItemId':<16} {'실재고':>8}  {'노출상태':<20} {'BuyBox':<8} {'타입'}")
    print("━" * 70)

    for vid in vendor_item_ids:
        if vid in results:
            r = results[vid]
            stock = r['stockQuantity']
            status = r['displayStatus'] or '-'
            buybox = '✅ WIN' if r['buyboxWinner'] else '❌ LOSE'
            rtype = r['registrationType'] or '-'
            print(f"{vid:<16} {stock:>8}개  {status:<20} {buybox:<8} {rtype}")
            if vid in url_map:
                print(f"{'':>16}  └ {url_map[vid][:55]}")
        else:
            print(f"{vid:<16}  ⚠️  조회 실패 (비공개 또는 미존재)")

    print("━" * 70)
    print(f"\n✅ {len(results)}/{len(vendor_item_ids)}개 조회 완료\n")

    return results


if __name__ == '__main__':
    main()
