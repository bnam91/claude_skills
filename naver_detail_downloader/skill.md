# naver_detail_downloader

네이버 스마트스토어 상품 상세페이지 이미지를 CDP로 다운로드하는 스킬이야.

## 실행 조건

사용자가 아래와 같은 요청을 할 때 실행해:
- "상세페이지 다운로드해줘"
- "네이버 상세페이지 저장해줘"
- "상품 상세 이미지 받아줘"
- 네이버 상품 URL과 함께 "다운로드", "저장" 요청

## 실행 순서

### 1단계: CDP 확인 및 실행

```bash
# 포트 9333 확인
curl -s http://localhost:9333/json/version > /dev/null 2>&1
```

안 열려 있으면 실행:
```bash
pkill -u a1 -f "remote-debugging-port=9333" 2>/dev/null; sleep 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 \
  --remote-allow-origins='*' \
  --user-data-dir="/tmp/chrome-debug" \
  --no-first-run --no-default-browser-check \
  --hide-crash-restore-bubble \
  > /tmp/chrome_cdp.log 2>&1 &
```

### 2단계: MCP chrome-devtools로 페이지 이동

```python
mcp__chrome-devtools__new_page(url="<상품URL>")
# 로드 대기 후
mcp__chrome-devtools__evaluate_script(function="""() => {
  const imgs = document.querySelectorAll('img.se-image-resource');
  if (imgs.length > 0) return Array.from(imgs).map(img => img.getAttribute('data-src') || img.src).filter(Boolean);
  const detail = document.querySelector('#INTRODUCE, .se-viewer, [class*="detail"], [class*="Detail"]');
  if (detail) return Array.from(detail.querySelectorAll('img')).map(img => img.src).filter(s => s.startsWith('http'));
  return [];
}""")
```

### 3단계: 이미지 다운로드

```python
import urllib.request, ssl, os

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

for i, url in enumerate(urls, 1):
    ext = "gif" if ".gif" in url.lower() else ("png" if ".png" in url.lower() else "jpg")
    fname = os.path.join(out_dir, f"{i:02d}.{ext}")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        with open(fname, "wb") as f:
            f.write(r.read())
```

## 저장 위치

- 기본: `~/Downloads/detail_<상품명 또는 타임스탬프>/`
- 사용자가 경로 지정 시 해당 경로 사용

## 주의사항

- SSL 인증서 검증 무시 필요 (`pstatic.net` 도메인)
- `img.se-image-resource` 셀렉터로 상세페이지 이미지만 추출
- GIF 포함 그대로 저장

## 출력

- 다운로드 완료 후 저장 경로 및 파일 수 안내
- 실패 파일 있으면 개수 및 이유 안내
