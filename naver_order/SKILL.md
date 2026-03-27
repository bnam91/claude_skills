# 네이버 스마트스토어 주문 스킬

## 호출 방법
```
/naver_order
```

사용자가 "~~ 주문해줘" 요청 시 이 스킬을 참고하여 진행한다.

---

## 필수 정보 확인 (시작 전 체크)

| 항목 | 내용 |
|------|------|
| 상품 URL | smartstore.naver.com/... |
| 옵션 | 색상, 사이즈 등 |
| 추가상품 | 포함 여부 명확히 확인 |
| 배송지 | 이름 / 주소 / 전화번호 |
| N페이 비밀번호 | 6자리 (반드시 6자리 확인) |

> **비밀번호는 반드시 6자리 전체를 미리 확인한다.** 4자리만 알고 진행하면 키패드 입력 후 실패한다.

---

## Step 1: Chrome CDP 실행

```bash
# coq3820 프로필로 CDP 실행 (네이버 로그인 세션 유지)
/chrome-cdp -coq3820
```

- CDP가 이미 실행 중이면 현재 프로필 확인 후 재시작 여부 결정
- 포트: 9222 / MCP: `mcp__chrome-devtools-9222__*`

---

## Step 2: 상품 페이지 진입 및 옵션 선택

```javascript
// 페이지 이동
navigate_page(url: "상품URL")

// 페이지 로드 대기 (2~3초)
await setTimeout(2000)

// 스크롤해서 옵션 영역 보이게
window.scrollTo(0, 1200)
```

### 색상/옵션 드롭다운 열기 (핵심)
```javascript
// 드롭다운 A 태그에 MouseEvent 사용 (click()은 작동 안 함)
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
let node;
while (node = walker.nextNode()) {
  if (node.textContent.trim() === '색상') {  // 또는 옵션명
    let el = node.parentElement;
    while (el) {
      if (el.tagName === 'A') {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        break;
      }
      el = el.parentElement;
    }
  }
}
```

### 옵션값 선택 (드롭다운 열린 후)
```javascript
// 옵션 항목도 A 태그 + MouseEvent
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
let node;
while (node = walker.nextNode()) {
  if (node.textContent.trim() === '화이트') {  // 선택할 옵션명
    node.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    break;
  }
}
```

> **주의**: `element.click()` 대신 반드시 `dispatchEvent(new MouseEvent('click', {bubbles: true}))` 사용

### 추가상품 제외 확인
- 추가상품 드롭다운이 기본값(placeholder)으로 표시되면 = 선택 안 된 상태
- 총 상품금액이 본품 가격만 표시되면 OK

---

## Step 3: 구매하기 클릭

```javascript
// 구매하기 버튼은 SPAN.blind > A 구조
const spans = document.querySelectorAll('span.blind');
for (const span of spans) {
  if (span.textContent.includes('구매하기')) {
    let el = span.parentElement;
    while (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 30) {
        el.scrollIntoView({block: 'center'});
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        break;
      }
      el = el.parentElement;
    }
    break;
  }
}
```

- 클릭 후 새 탭으로 `orders.pay.naver.com` 열림
- `list_pages()`로 확인 후 `select_page(1)` (주문/결제 탭)

---

## Step 4: 주문/결제 페이지 - 배송지 변경

```javascript
// 배송지 '변경' 버튼 클릭
const btns = document.querySelectorAll('button');
for (const btn of btns) {
  if (btn.textContent.trim() === '변경') {
    btn.click();
    break;
  }
}
```

- 새 탭(`order/delivery?internal=true`)으로 배송지 목록 열림
- `select_page(2)`로 전환

```javascript
// 이지혜 주소 선택 (전화번호로 식별)
const allDivs = document.querySelectorAll('li, article, section');
for (const div of allDivs) {
  if (div.textContent.includes('4896-1280')) {  // 전화번호 뒷자리로 식별
    const btn = div.querySelector('button');
    if (btn && btn.textContent.trim() === '선택') {
      btn.click();
      break;
    }
  }
}
```

- 선택 후 탭 자동 닫힘 → `select_page(1)` 복귀
- 배송지 이름 확인

---

## Step 5: 결제하기 클릭

```javascript
const btns = document.querySelectorAll('button');
for (const btn of btns) {
  if (btn.textContent.includes('결제하기')) {
    btn.click();
    break;
  }
}
```

- 새 탭(`pay.naver.com/authentication/pw/check`)으로 비밀번호 팝업 열림
- `list_pages()` → `select_page(해당탭)`

---

## Step 6: N페이 비밀번호 입력 (6자리 키패드)

### 핵심: 키패드는 매번 배열이 다름 → 스크린샷 + 스냅샷으로 확인 필수

```
1. take_screenshot()  → 현재 키패드 숫자 배열 확인
2. take_snapshot()    → uid 확인
   - 버튼 순서: uid=X_15 ~ X_26 (숫자9개 + 전체삭제 + 숫자1 + 지우기)
   - 스크린샷 배열과 uid 순서 매핑:
     행1: X_15, X_16, X_17
     행2: X_18, X_19, X_20
     행3: X_21, X_22, X_23
     행4: X_24(전체삭제), X_25, X_26(지우기)

3. 비밀번호 각 자리 → 해당 uid 클릭
```

```javascript
// 예시: 비밀번호 372491 입력
// 스크린샷에서 3=행2중앙(X_19), 7=행3우(X_23), 2=행3좌(X_21)...
click(uid: "X_19")  // 3
click(uid: "X_23")  // 7
click(uid: "X_21")  // 2
click(uid: "X_25")  // 4
click(uid: "X_18")  // 9
click(uid: "X_20")  // 1
```

- 6자리 입력 완료 시 팝업 자동 닫힘

---

## Step 7: 주문완료 확인

- URL이 `orders.pay.naver.com/order/result/seller/...` 로 변경
- 스크린샷에서 **"주문완료 되었습니다"** 텍스트 확인
- 주문번호, 배송지, 상품명 스크린샷으로 사용자에게 보고

---

## 자주 발생하는 오류 및 해결법

| 문제 | 원인 | 해결 |
|------|------|------|
| 드롭다운 안 열림 | `click()` 사용 | `dispatchEvent(MouseEvent)` 사용 |
| SellerLife 팝업 뜸 | 스크롤 전 클릭 | 충분히 스크롤 후 클릭 |
| 구매하기 button 못찾음 | SPAN.blind 구조 | `span.blind` → 부모 A 태그 클릭 |
| 배송지 선택 탭 안 열림 | 변경 버튼 중복 | 배송지 영역의 첫 번째 변경만 클릭 |
| 키패드 숫자 못찾음 | aria 텍스트 없음 | 스냅샷 uid 순서 + 스크린샷 배열로 매핑 |
| Chrome 크래시 | 팝업 탭 닫힘 | CDP 재시작 후 처음부터 |

---

## 계정 정보
- **로그인**: bnam91@naver.com (신현빈) — coq3820 프로필에 유지됨
- **자주 쓰는 배송지**: 이지혜 (010-4896-1280, 군포시 씨티프라자 4층)
