#!/usr/bin/env python3
"""
쿠팡 상품 정보 스크래퍼
Chrome CDP (port 9222) 의 쿠팡 세션을 활용해 탭 없이 병렬 fetch.
상품명 / 최종가 / 원가 / 배송타입 / 썸네일 / 옵션명 추출.

사용법:
  python3 coupang_product_scraper.py urls.json [output.json]
  python3 coupang_product_scraper.py urls.json          → coupang_products.json 저장

urls.json 형식:
  ["https://www.coupang.com/vp/products/...", ...]
"""

import sys
import re
import json
import time
import threading
import requests
import websocket

CONCURRENT = 15   # 동시 fetch 수
CDP_PORT   = 9222


# ── CDP 연결 ──────────────────────────────────────────────────────────────────

class CDP:
    def __init__(self, tab_id: str):
        self.ws = websocket.create_connection(
            f'ws://localhost:{CDP_PORT}/devtools/page/{tab_id}',
            origin=f'http://localhost:{CDP_PORT}',
            timeout=30
        )
        self._counter = [0]
        self._pending  = {}
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self):
        while True:
            try:
                msg = json.loads(self.ws.recv())
                mid = msg.get('id')
                if mid and mid in self._pending:
                    self._pending[mid] = msg
            except Exception:
                break

    def send(self, method: str, params: dict = {}) -> dict:
        self._counter[0] += 1
        cid = self._counter[0]
        self._pending[cid] = None
        self.ws.send(json.dumps({'id': cid, 'method': method, 'params': params}))
        for _ in range(800):   # 80s max
            time.sleep(0.1)
            if self._pending[cid] is not None:
                return self._pending.pop(cid)
        return {}

    def close(self):
        try: self.ws.close()
        except Exception: pass


def get_tab_id() -> str:
    tabs = requests.get(f'http://localhost:{CDP_PORT}/json', timeout=5).json()
    # 이미 쿠팡 탭이 있으면 우선 사용
    for t in tabs:
        if 'coupang.com' in t.get('url', '') and t.get('type') == 'page':
            return t['id']
    return next(t for t in tabs if t.get('type') == 'page')['id']


def ensure_coupang(cdp: CDP):
    """쿠팡 메인에 있지 않으면 이동 (세션 쿠키 확인용)"""
    r = cdp.send('Runtime.evaluate', {
        'expression': 'location.hostname',
        'returnByValue': True,
    })
    host = r.get('result', {}).get('result', {}).get('value', '')
    if 'coupang.com' not in host:
        print('  → coupang.com 으로 이동 중...', flush=True)
        cdp.send('Page.navigate', {'url': 'https://www.coupang.com'})
        time.sleep(4)


# ── JS 파서 (HTML → 상품 정보) ─────────────────────────────────────────────────

PARSE_JS = r"""
function parseCoupang(html, url) {
  var result = { url: url };

  // 상품명: JSON-LD의 "name" → h1 태그 순으로 fallback
  var nameM = html.match(/"name"\s*:\s*"([^"]{5,200})"\s*,\s*"image"/);
  if (!nameM) nameM = html.match(/<h1[^>]*>\s*([^<]{5,200}?)\s*<\/h1>/);
  result.productName = nameM ? nameM[1].trim() : null;

  // 최종 판매가
  var finalM = html.match(/final-price-amount[^>]+>([\d,]+)원/);
  result.finalPrice = finalM ? parseInt(finalM[1].replace(/,/g,'')) : null;

  // 원가
  var origM = html.match(/original-price-amount[^>]+>([\d,]+)원/);
  result.originalPrice = origM ? parseInt(origM[1].replace(/,/g,'')) : null;

  // 배송 타입: 판매자로켓 > 로켓배송 > 판매자배송
  var sellerRocket = /판매자\s*로켓/.test(html);
  var rocket       = /로켓배송 상품 [\d,]+원 이상/.test(html) || /"deliveryType"\s*:\s*"ROCKET"/.test(html);
  result.deliveryType = sellerRocket ? '판매자로켓' : (rocket ? '로켓배송' : '판매자배송');

  // 썸네일 (JSON-LD image 첫번째)
  var imgM = html.match(/"image"\s*:\s*\["(https:\/\/[^"]+)"/);
  result.thumbnail = imgM ? imgM[1] : null;

  // 옵션명: vendor-inventory 아이템명 or 옵션 select 텍스트
  var itemM = html.match(/"itemName"\s*:\s*"([^"]+)"/);
  if (!itemM) itemM = html.match(/class="prod-option__value[^"]*"[^>]*>([^<]+)</);
  result.itemName = itemM ? itemM[1].trim() : null;

  return result;
}
"""


# ── 배치 fetch ────────────────────────────────────────────────────────────────

def fetch_batch(cdp: CDP, urls: list) -> list:
    urls_json = json.dumps(urls)
    script = PARSE_JS + f"""
(async function() {{
  var urls = {urls_json};
  var results = await Promise.all(urls.map(async function(url) {{
    try {{
      var r = await fetch(url, {{
        credentials: 'include',
        signal: AbortSignal.timeout(15000)
      }});
      if (!r.ok) return {{ url: url, error: 'HTTP ' + r.status }};
      var html = await r.text();
      return parseCoupang(html, url);
    }} catch(e) {{
      return {{ url: url, error: e.message }};
    }}
  }}));
  return JSON.stringify(results);
}})()
"""
    r = cdp.send('Runtime.evaluate', {
        'expression': script,
        'awaitPromise': True,
        'returnByValue': True,
        'timeout': 90000,
    })
    raw = r.get('result', {}).get('result', {}).get('value', '')
    if not raw:
        return [{'url': u, 'error': 'empty response'} for u in urls]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return [{'url': u, 'error': 'parse error'} for u in urls]


# ── 메인 ─────────────────────────────────────────────────────────────────────

def scrape(urls: list) -> list:
    tab_id = get_tab_id()
    cdp = CDP(tab_id)
    ensure_coupang(cdp)

    results = []
    batches = [urls[i:i + CONCURRENT] for i in range(0, len(urls), CONCURRENT)]
    total = len(batches)

    for i, batch in enumerate(batches, 1):
        print(f'  [{i}/{total}] {len(batch)}개 fetch...', end=' ', flush=True)
        batch_results = fetch_batch(cdp, batch)

        # 실패 항목 1회 재시도
        failed_urls = [r['url'] for r in batch_results if r.get('error')]
        if failed_urls:
            time.sleep(1)
            retry_results = fetch_batch(cdp, failed_urls)
            retry_map = {r['url']: r for r in retry_results}
            batch_results = [retry_map.get(r['url'], r) if r.get('error') else r for r in batch_results]

        ok  = sum(1 for r in batch_results if not r.get('error'))
        err = len(batch_results) - ok
        print(f'✅ {ok}  ❌ {err}', flush=True)
        results.extend(batch_results)

    cdp.close()
    return results


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    with open(sys.argv[1], encoding='utf-8') as f:
        urls = json.load(f)

    print(f'🛒 쿠팡 상품 스크래핑 시작 — {len(urls)}개 URL (동시 {CONCURRENT}개)')
    t0 = time.time()
    results = scrape(urls)
    elapsed = time.time() - t0

    ok  = sum(1 for r in results if not r.get('error'))
    err = len(results) - ok
    print(f'\n✅ {ok}/{len(results)}개 완료  ❌ {err}개 실패  ⏱ {elapsed:.1f}초')

    out = sys.argv[2] if len(sys.argv) > 2 else 'coupang_products.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'📄 결과 → {out}')
