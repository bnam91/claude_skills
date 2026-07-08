# div_download_coupang

쿠팡 상품 상세페이지 이미지를 CDP로 다운로드하는 스킬이야.

## 실행 조건

사용자가 아래와 같은 요청을 할 때 실행해:
- "쿠팡 상세페이지 다운로드해줘"
- "쿠팡 상세 이미지 받아줘"
- 쿠팡 상품 URL과 함께 "다운로드", "저장" 요청

## 실행 순서

### 1단계: MCP chrome-devtools-9222로 페이지 이동

포트 9222 (기존 Chrome 사용):
```python
mcp__chrome-devtools-9222__new_page(url="<상품URL>")
```

### 2단계: 상품 타이틀 추출 → 폴더명 결정

```javascript
() => document.querySelector('h1.prod-buy-header__title, .prod-title, h2')?.innerText?.trim() || document.title
```

타이틀을 읽은 뒤 MCP가 아래 기준으로 폴더명 직접 판단:

1. **브랜드명이 있으면** → `브랜드_핵심키워드` (예: `세이프본_무릎보호대`)
2. **브랜드명이 없으면** → 핵심 명사 1~2개 (예: `무릎보호대`)
3. **판단 불가 시** → URL의 상품 ID (예: `8461675977`)

**규칙:** 최대 20자 / 공백 → `_` / 특수문자·모델번호·수식어 제거 / 파일시스템 안전 문자만

### 3단계: 이미지 추출 (Y좌표 기준 정렬)

```javascript
() => {
  const imgs = document.querySelectorAll('[class*="detail"] img, #pdp-detail-contents img, .prod-description-content img');
  return Array.from(imgs)
    .map(img => ({
      url: img.src || img.getAttribute('data-src'),
      top: img.getBoundingClientRect().top + window.scrollY
    }))
    .filter(item => item.url && item.url.startsWith('http'))
    .sort((a, b) => a.top - b.top)
    .map(item => item.url);
}
```

### 4단계: 이미지 다운로드

```python
import urllib.request, ssl, os

out_dir = os.path.expanduser(f"~/Downloads/div_download/<폴더명>")
os.makedirs(out_dir, exist_ok=True)

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

- 기본: `~/Downloads/div_download/<폴더명>/`
- 사용자가 경로 지정 시 해당 경로 사용

## 파일명 규칙

- 형식: `01.png`, `02.png` ... (2자리 순번 + 실제 확장자)
- GIF → `.gif` / PNG → `.png` / 나머지 → `.jpg`
- Y좌표(`getBoundingClientRect().top + scrollY`) 기준 정렬 후 순번 부여

## 주의사항

- CDP 포트: 9222 (기존 Chrome, 별도 실행 불필요)
- 이미지 도메인: `coupangcdn.com` (SSL 검증 무시)
- 리뷰 영역 이미지가 섞이지 않도록 셀렉터 확인

## 출력

- 다운로드 완료 후 저장 경로 및 파일 수 안내
- 실패 파일 있으면 개수 및 이유 안내
