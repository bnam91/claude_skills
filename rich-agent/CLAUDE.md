# 1000억보드 — 프로젝트 가이드

신현빈의 개인 운영 대시보드. **1000억 자산가 (2036.03.04 마감) 목표 관리용**.

> 사용자가 매일 들여다보고, rich-agent / task_today / pm 스킬들이 참조하는 단일 진실 (Single Source of Truth).

---

## 파일 구조

```
~/Documents/claude_skills/rich-agent/
├── dashboard.html      ← 진입점 (브라우저에서 더블클릭)
├── state.js            ← 모든 데이터 (이 파일만 편집)
├── roadmap.md          ← 10년 장기 로드맵 (변경 적음)
├── profile_신현빈.md   ← 프로파일
├── insights_신현빈.md  ← 특이점 누적 (큰 거만)
└── CLAUDE.md           ← 이 파일
```

**진입 URL**: `file:///Users/a1/Documents/claude_skills/rich-agent/dashboard.html`

---

## 작업 규칙 (수정할 때 반드시 지킬 것)

### 1. 데이터 수정은 무조건 `state.js`만

- HTML 안에 데이터 박지 X
- HTML은 렌더링 로직만
- 새 섹션 추가 시 → state.js에 데이터 추가 → HTML에 렌더 코드 추가

### 2. 단위 일관성

| 단위 | 사용 위치 | 표시 함수 |
|---|---|---|
| **원** (정수) | `meta.target`, `meta.capital`, `pricingPlans.price` 등 | `fmt(n)` |
| **백만원** (정수) | `revenueMix.target`, `monthlyRamp.t` 등 | `fmtKR(n)` |

- `fmt(140000000)` → "1.4억"
- `fmtKR(600)` → "6억"
- `fmtKR(50)` → "5천만"

새 데이터 박을 때 두 단위 중 어느 거 쓰는지 명확히. 헷갈리면 원 단위로 통일.

### 3. 갱신 시 `lastUpdated` 같이 수정

`state.meta.lastUpdated` 를 오늘 날짜로 갱신.

### 4. 디자인 톤 (젠 스타일)

| 요소 | 스타일 |
|---|---|
| 배경 | 흰색 (`#ffffff`) |
| 텍스트 | 진회색 (`#1a1a1a`) |
| 라인 | 1px hairline (`#e5e7eb`), 그림자 없음 |
| 강조 색 | 잉크 블루 (`#1e3a8a`), 단일 색 |
| 폰트 | `-apple-system`, Pretendard, Inter |
| 여백 | 충분히 (24~32px) |
| 카드 | border 1px + radius 4px, 그림자 X |

**금지**: 과도한 컬러, 그라데이션 (원씽 카드 제외), 그림자, 둥글둥글한 모서리

### 5. 탭 구조 (현재)

| 탭 | 역할 |
|---|---|
| 메인 | 원씽 + 필수 미션 + 영입 + 작전(월간/연간 토글) + KPI + 다음 마일스톤 + 현재 Phase + 이번주 |
| 주간/월간 | 이번주 풀 체크리스트 + 이번달 디테일 |
| 만다라트 | Phase 1 9×9 만다라트 (수익 클릭 시 도넛 차트) |
| 커머스 | 20 SKU 트래커 + 사이클 디테일 + KPI |
| 유튜브 | 채널 전략 + GO 신호 + 페이즈 (소문의섬→역전야매 확장) |
| 상페마법사 | 페이즈 + 가격 플랜 + 시장 분석 + 경쟁사 비교 + 시나리오 + 전환표 |
| 로드맵 | 월간/연간/10년 뷰 토글 |
| 데이터 | 참조 데이터 일람 |

새 탭 추가 시: `tabs` 영역 + `<div class="panel">` + JS 렌더 함수.

### 6. 변수 네이밍 충돌 주의

JS 전역 스코프에서 `const` 충돌하면 전체 멈춤. (예전에 `target` 두 번 선언 → 탭 토글 깨짐)

새 변수 선언 시 기존 변수명 grep으로 확인 후 진입.

### 7. 한국어 단위 표시

- "600M" 같은 영문 단위 X → 항상 `fmtKR()` 통해서 한글 표시
- "6억", "5천만" 식

---

## 자주 하는 작업 패턴

### A. 새 SKU 추가
```js
// state.js → commerceTracker.skus 배열에 추가
{ name: "신규상품", category: "신규소싱", stage: "시장조사",
  expectedMonthlyProfit: 2000000, launchDate: null, monthlyRevenue: null,
  note: "메모" }
```

### B. SKU 단계 진행
```js
// stage 필드만 변경
stage: "시장조사" → "샘플발주" → "샘플검증" → "본품발주" → "입고" → "등록" → "광고" → "안정"
```

### C. 이번주 목표 갱신
```js
// state.weekly.goals 배열 통째로 교체 (월요일에)
{ task: "할 일", done: false, priority: "🔴", project: "커머스" }
```

### D. 월간 작전 갱신
```js
// state.strategy.monthly 통째로 교체 (매월 1일)
{ month: "2026-MM", title: "...", summary: "...", pillars: [...], keyMissions: [...] }
```

### E. 만다라트 액션 채우기
```js
// state.mandalart.categories[].actions 배열 안 빈 문자열을 실제 액션으로 교체
```

---

## 사용자(신현빈) 컨텍스트 핵심

| 항목 | 값 |
|---|---|
| 자본 | 5천만 (사업 운영) |
| 마진율 (커머스) | 20% |
| SKU 페이스 | 6월부터 2주에 1개 (올해 20개 신규소싱) |
| 발주 단가 | 500만/SKU |
| 안정 SKU | 월 200만 매출/순익 도달 |
| 마케팅 대행 | 신규 X (팔도만 유지) |
| 펭귄날다 | 자체 브랜드 중 하나 (커머스 ≠ 펭귄날다) |
| 콘텐츠 시간 | 사수 (오전 2시간 블록) |
| 영입 우선순위 | 1. 영상편집자 / 2. 디자이너 |

자세한 건 `state.js` 또는 `roadmap.md` 참조.

---

## 자주 묻는 질문 / 패턴

### "분기 목표 어떻게 잡혀있어?"
→ `state.year2026.quarters` 참조. Q1 지남 / Q2 준비 / Q3 수확 / Q4 피크.

### "이번주 뭐 했어?"
→ `state.weekly.goals` 의 done 필드 + 사용자 답변 기반.

### "다음 마일스톤?"
→ `state.nextMilestone`.

### "원씽이 뭐였더라?"
→ `state.oneThing.goal` (현재: 소문의섬 구독자 10만).

### 사용자가 단순 숫자 정정 요청 시
- state.js 한 줄만 바꾸고 끝. 전체 시뮬 다시 돌리지 말 것.
- 추측·시나리오 추가 금지. 사용자 명시 숫자 그대로 받기.

---

## 하지 말 것

- 사용자 명시 데이터에 가정·시나리오 덧붙이기 (예: "마진 30%로 가정하면..." 같은 추측)
- 매번 새로운 표 / 시뮬레이션 / 시나리오 생성 (산만함 야기)
- HTML에 데이터 직접 박기 (state.js 우회)
- 단위 일관성 무시 (원/백만원 혼용)
- 한 번에 너무 많은 섹션 추가 (점진적으로)

---

## 1000억보드는 "신현빈의 단일 진실"

이 보드의 데이터가 곧 사업 의사결정의 기준점.
- rich-agent: 매 답변 전 state.js 읽기
- task_today: 추가/조회 시 weekly.goals 참조
- pm 스킬들: 각 프로젝트 상태를 commerceTracker / saasRoadmap 등에 반영

**state.js 갱신 = 사용자가 새로고침해야 dashboard.html에 반영됨.**

---

마지막 업데이트: 2026-04-30
