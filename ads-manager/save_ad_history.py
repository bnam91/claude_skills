#!/usr/bin/env python3
"""
쿠팡 광고 일일 히스토리 저장 스크립트
사용법: python3 save_ad_history.py [--date YYYY-MM-DD] [--note "메모"]
기본 날짜: 어제
"""

import json, websocket, time, urllib.request, urllib.parse, sys, os, re
from datetime import datetime, timedelta

# ── 설정 ──────────────────────────────────────────────
HISTORY_DIR = "/Users/a1/Documents/claude_skills/ads-manager/history"
TARGET_URL   = "https://advertising.coupang.com/marketing/dashboard/sales/campaign"
ENV_PATH     = "/Users/a1/Documents/claude_skills/.env"
CDP_PORT     = 9341

# ── 인자 파싱 ─────────────────────────────────────────
args = sys.argv[1:]
target_date = None
note_arg    = ""
i = 0
while i < len(args):
    if args[i] == "--date" and i + 1 < len(args):
        target_date = args[i+1]; i += 2
    elif args[i] == "--note" and i + 1 < len(args):
        note_arg = args[i+1]; i += 2
    else:
        i += 1

if not target_date:
    target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

print(f"📅 기록 날짜: {target_date}")

# ── 유틸 ──────────────────────────────────────────────
def load_env():
    env = {}
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

def cdp_eval(ws_url, expr):
    ws = websocket.WebSocket()
    ws.connect(ws_url)
    ws.send(json.dumps({"id":1,"method":"Runtime.evaluate","params":{"expression":expr,"returnByValue":True}}))
    r = json.loads(ws.recv()); ws.close()
    return r.get('result',{}).get('result',{}).get('value')

def cdp_send(ws_url, method, params={}):
    ws = websocket.WebSocket()
    ws.connect(ws_url)
    ws.send(json.dumps({"id":1,"method":method,"params":params}))
    ws.recv(); ws.close()

def parse_number(s):
    """'29,600원' → 29600"""
    if not s:
        return 0
    cleaned = re.sub(r'[^\d.]', '', str(s).replace(',', ''))
    try:
        return int(float(cleaned)) if cleaned else 0
    except:
        return 0

def parse_percent(s):
    """'5,660%' → 5660"""
    if not s:
        return 0
    cleaned = re.sub(r'[^\d.]', '', str(s).replace(',', ''))
    try:
        return round(float(cleaned), 2) if cleaned else 0
    except:
        return 0


# ── CDP 탭 준비 ───────────────────────────────────────
print("🔗 CDP 연결 중...")
with urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json', timeout=5) as r:
    tabs = json.loads(r.read())

tab = next((t for t in tabs if 'advertising.coupang.com' in t.get('url', '')), None)
if not tab:
    req = urllib.request.Request(
        f'http://localhost:{CDP_PORT}/json/new?{urllib.parse.quote(TARGET_URL)}', method='PUT')
    with urllib.request.urlopen(req) as r:
        tab = json.loads(r.read())

WS = f"ws://localhost:{CDP_PORT}/devtools/page/{tab['id']}"

# ── 대시보드 이동 ──────────────────────────────────────
print("🌐 캠페인 목록 페이지 이동...")
cdp_send(WS, "Page.navigate", {"url": TARGET_URL})
time.sleep(5)

# ── 로그인 확인 및 자동 로그인 ────────────────────────────
current_url = cdp_eval(WS, "location.href") or ""
if 'login' in current_url or 'signin' in current_url or 'xauth' in current_url:
    print("🔑 자동 로그인 중...")
    env = load_env()

    # 단계 1: advertising.coupang.com/user/login → "로그인하기" 클릭
    if 'advertising.coupang.com' in current_url:
        cdp_eval(WS, "[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()==='로그인하기')?.click()")

    # 단계 2: xauth 탭이 열릴 때까지 전체 탭 목록을 폴링 (최대 10초)
    xauth_ws = None
    for _ in range(10):
        time.sleep(1)
        with urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json', timeout=5) as r:
            all_tabs = json.loads(r.read())
        xauth_tab = next((t for t in all_tabs if 'xauth.coupang.com' in t.get('url', '')), None)
        if xauth_tab:
            xauth_ws = f"ws://localhost:{CDP_PORT}/devtools/page/{xauth_tab['id']}"
            break

    if xauth_ws:
        time.sleep(1)  # 폼 렌더링 대기
        cdp_eval(xauth_ws, f"document.getElementById('username').value = '{env['COUPANG_ADS_REDCOMBO_ID']}'")
        cdp_eval(xauth_ws, f"document.getElementById('password').value = '{env['COUPANG_ADS_REDCOMBO_PW']}'")
        cdp_eval(xauth_ws, "document.getElementById('kc-login').click()")

        # OAuth 콜백 완료 대기 — 탭이 marketing 페이지로 자동 이동할 때까지
        WS = xauth_ws  # 이후 작업은 이 탭에서 계속됨
        logged_in = False
        for _ in range(15):
            time.sleep(1)
            u = cdp_eval(WS, "location.href") or ""
            if 'advertising.coupang.com/marketing' in u:
                logged_in = True
                break

        if logged_in:
            print("✅ 로그인 성공")
            # 캠페인 목록 페이지로 이동 (콜백 후 다른 페이지일 수 있음)
            if TARGET_URL not in (cdp_eval(WS, "location.href") or ""):
                cdp_send(WS, "Page.navigate", {"url": TARGET_URL})
                time.sleep(5)
        else:
            print(f"⚠️ 로그인 실패 — URL: {cdp_eval(WS, 'location.href')}")
    else:
        print("⚠️ xauth 탭을 찾지 못함")

# ── 날짜 필터 "어제" 클릭 ──────────────────────────────
print("📆 날짜 필터 '어제' 클릭...")
cdp_eval(WS, "([...document.querySelectorAll('button,span')].find(el => el.textContent.trim()==='어제'))?.click()")
time.sleep(4)

# ── 전체 텍스트 파싱 (캠페인 목록) ───────────────────────
print("📊 캠페인 목록 파싱...")
body = cdp_eval(WS, "document.body.innerText") or ""
lines = [l.strip() for l in body.split('\n') if l.strip()]

# 캠페인 행 파싱: 캠페인명 ON/OFF 이후 숫자들
# 구조: 캠페인명 | ON/OFF | 상태 | 예산 | 집행광고비 | 광고전환매출 | 전환율 | 클릭률 | 노출수 | 클릭수
campaigns_raw = []
for i, line in enumerate(lines):
    if re.search(r'_\d{6}', line) and i + 1 < len(lines):  # 캠페인명 패턴 (날짜 포함)
        campaigns_raw.append((i, line))

print(f"  발견된 캠페인: {[c[1] for c in campaigns_raw]}")

# ── 각 캠페인별 처리 ───────────────────────────────────
results = []

for camp_idx, camp_name in campaigns_raw:
    print(f"\n📌 캠페인 처리: {camp_name}")

    # 캠페인 클릭 → 상세 페이지
    cdp_eval(WS, f"[...document.querySelectorAll('a')].find(a => a.textContent.includes('{camp_name}'))?.click()")
    time.sleep(3)

    detail_url = cdp_eval(WS, "location.href") or ""
    # campaign ID, group ID 추출
    m = re.search(r'/campaign/(\d+)/group/(\d+)', detail_url)
    campaign_id = m.group(1) if m else ""
    group_id    = m.group(2) if m else ""

    # "어제" 다시 클릭 (상세 페이지에서도 필요할 수 있음)
    cdp_eval(WS, "([...document.querySelectorAll('button,span')].find(el => el.textContent.trim()==='어제'))?.click()")
    time.sleep(4)

    detail_body  = cdp_eval(WS, "document.body.innerText") or ""
    detail_lines = [l.strip() for l in detail_body.split('\n') if l.strip()]

    # 성과 수치 추출
    def find_after(keyword, lines):
        for i, l in enumerate(lines):
            if keyword in l:
                for j in range(1, 5):
                    if i+j < len(lines) and lines[i+j]:
                        return lines[i+j]
        return ""

    ad_spend     = parse_number(find_after('집행 광고비', detail_lines))
    ad_revenue   = parse_number(find_after('광고 전환 매출', detail_lines))
    clicks       = parse_number(find_after('클릭수', detail_lines))
    impressions  = parse_number(find_after('노출수', detail_lines))
    ctr          = parse_percent(find_after('클릭률', detail_lines))
    actual_roas  = parse_percent(find_after('광고 수익률', detail_lines))
    conv_rate    = parse_percent(find_after('전환율', detail_lines))
    conv_sales   = parse_number(find_after('광고 전환 판매수', detail_lines))
    conv_orders  = parse_number(find_after('광고 전환 주문수', detail_lines))

    # ── "상품 추가 및 수정" 버튼 → settings 읽기 ──────────
    print("  ⚙️  설정값 읽는 중...")
    cdp_eval(WS, "[...document.querySelectorAll('button')].find(btn => btn.textContent.trim() === '상품 추가 및 수정')?.click()")
    time.sleep(2)

    inputs = cdp_eval(WS, """
[...document.querySelectorAll('input')].map(el => ({
  placeholder: el.placeholder || '',
  value: el.value
}))
""") or []

    daily_budget  = 0
    target_roas_v = 0
    for inp in inputs:
        if '30,000' in inp.get('placeholder', '') or '예)' in inp.get('placeholder', ''):
            daily_budget = parse_number(inp.get('value', ''))
        elif inp.get('placeholder', '') and re.search(r'^\d+$', inp.get('placeholder', '')):
            target_roas_v = parse_number(inp.get('value', ''))

    # ON/OFF 상태 — 토글 버튼 aria-checked 또는 텍스트에서 판단
    toggle_status = cdp_eval(WS, """
(function(){
  var btn = [...document.querySelectorAll('button[role="switch"], button[aria-checked]')][0];
  if(btn) return btn.getAttribute('aria-checked') === 'true' ? 'ON' : 'OFF';
  var spans = [...document.querySelectorAll('.ant-switch')];
  if(spans.length) return spans[0].classList.contains('ant-switch-checked') ? 'ON' : 'OFF';
  return null;
})()
""")
    status = toggle_status if toggle_status else ("ON" if re.search(r'\bON\b', detail_body[:1000]) else "OFF")

    # 모달 닫기 (ESC)
    cdp_eval(WS, "document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))")
    time.sleep(1)

    record = {
        "date": target_date,
        "settings": {
            "daily_budget": daily_budget,
            "target_roas": target_roas_v,
            "status": status
        },
        "performance": {
            "ad_spend":       ad_spend,
            "ad_revenue":     ad_revenue,
            "actual_roas":    actual_roas,
            "impressions":    impressions,
            "clicks":         clicks,
            "ctr":            ctr,
            "conversion_rate": conv_rate,
            "conv_sales":     conv_sales,
            "conv_orders":    conv_orders
        },
        "note": note_arg
    }

    results.append({
        "campaign_id":   campaign_id,
        "campaign_name": camp_name,
        "group_id":      group_id,
        "record":        record
    })

    print(f"  ✅ 광고비: {ad_spend:,}원 | 매출: {ad_revenue:,}원 | ROAS: {actual_roas}% | 노출: {impressions:,} | 클릭: {clicks} | CTR: {ctr}% | 전환: {conv_sales}건")
    print(f"     일예산: {daily_budget:,}원 | 목표ROAS: {target_roas_v}%")

    # 목록으로 돌아가기
    cdp_send(WS, "Page.navigate", {"url": TARGET_URL})
    time.sleep(3)
    cdp_eval(WS, "([...document.querySelectorAll('button,span')].find(el => el.textContent.trim()==='어제'))?.click()")
    time.sleep(2)

# ── JSON 파일 저장 ─────────────────────────────────────
os.makedirs(HISTORY_DIR, exist_ok=True)

for item in results:
    fname = os.path.join(HISTORY_DIR, f"{item['campaign_name']}.json")

    if os.path.exists(fname):
        with open(fname) as f:
            data = json.load(f)
    else:
        data = {
            "campaign_id":   item["campaign_id"],
            "campaign_name": item["campaign_name"],
            "group_id":      item["group_id"],
            "records":       []
        }

    # 날짜 중복이면 덮어쓰기
    data["records"] = [r for r in data["records"] if r["date"] != target_date]
    data["records"].append(item["record"])
    data["records"].sort(key=lambda r: r["date"])

    with open(fname, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n💾 저장 완료: {fname}")

print(f"\n✅ 총 {len(results)}개 캠페인 기록 완료 ({target_date})")
