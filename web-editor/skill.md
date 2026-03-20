# Web Editor — Project Skill

**파일 위치**: `/Users/a1/web-editor/` (분리 구조)
- `index.html`
- `css/editor.css`
- `js/editor.js`

**상태**: 개발 중 (인라인 에디터 MVP)

---

## 프로젝트 개요

웹 디자인을 블록 단위로 쌓아가는 인라인 에디터.
파워포인트 장표처럼 섹션을 아래로 스택해서 페이지를 구성하는 방식.

---

## 레이아웃 구조

```
┌─────────────────────────────────────────────┐
│  Top Bar  (로고 / 모드 / 줌 컨트롤러 / Publish) │
├──────────┬──────────────────────┬────────────┤
│  Layers  │      Canvas          │ Properties │
│  패널    │   (860px 고정)        │   패널     │
│  240px   │   기본 줌 70%         │   240px    │
└──────────┴──────────────────────┴────────────┘
```

하단 중앙: Floating Action Panel (Section / Heading / Body / Caption / Asset / Gap 추가 버튼)

---

## 블록 계층 구조

```
Canvas
└── Section Block          — 장표 컨테이너
    └── section-inner
        ├── Gap Block      — 상단 여백 (항상 첫 번째)
        ├── Row            — 레이아웃 컨테이너 [data-layout]
        │   └── Col        — 열 단위 [data-width]
        │       └── Text Block / Asset Block
        └── Gap Block      — 하단 여백 (항상 마지막)
```

### Section Block
- 역할: 장표 단위 컨테이너, 아래로 스택 (gap: 20px)
- hover → 파란 아웃라인 + `Section 0N` 뱃지
- 선택 시 → 우측 상단에 ↑ ↓ ✕ 툴바 표시 (✕ 는 섹션 삭제)
- class: `.section-block`

### Row
- 역할: 레이아웃 컨테이너. Col들의 배치 방식을 결정
- `data-layout="stack"` → flex-direction: column (기본)
- `data-layout="flex"`  → flex-direction: row (좌우 나란히)
- `data-layout="grid"`  → grid (균등 분할)
- class: `.row`

### Col
- 역할: Row 안의 열 단위. 블록 하나를 담는 슬롯
- `data-width="100|75|66|50|33|25"` → flex 비율로 너비 결정
- class: `.col`

### Text Block
- 역할: 텍스트 원자 단위 (독립 블록)
- 타입: `Heading (H1/H2)` / `Body` / `Caption`
- 클릭 → `.selected` (실선 파란 아웃라인 유지) + Properties 패널 열림
- 더블클릭 → contenteditable 활성화 (인라인 편집)
- 패딩: 32px 상하 / 20px 좌우
- class: `.text-block`

### Asset Block
- 역할: 이미지 또는 GIF 자리 표시 (와이어프레임)
- 표준 사이즈: 860 × 780px (풀블리드)
- 파일 타입: PNG · JPG · GIF · WebP
- 클릭 → `.selected` (실선 파란 아웃라인 유지)
- class: `.asset-block`

### Gap Block
- 역할: 섹션 상/하단 또는 블록 사이 여백
- 기본 높이: 60px (Properties 패널에서 슬라이더로 조절)
- 클릭 → `.selected` + Gap Properties 패널 열림
- class: `.gap-block`

---

## 캔버스 스펙

| 항목 | 값 |
|------|-----|
| 캔버스 너비 | 860px (고정) |
| 기본 줌 | 70% |
| 줌 범위 | 25% ~ 150% |
| 줌 단위 | 10% |
| 키보드 단축키 | Cmd +/- (확대/축소), Cmd 0 (100%), Esc (선택 해제), Delete/Backspace (블록·섹션 삭제) |

---

## JS 핵심 함수 구조

| 함수 | 역할 |
|------|------|
| `applyZoom(z)` | 줌 적용 |
| `buildLayerPanel()` | 레이어 패널 DOM 재생성 |
| `selectSection(sec)` | 섹션 선택 (deselectAll 포함) |
| `syncSection(sec)` | 블록 선택 상태 유지하며 섹션 halo만 업데이트 |
| `deselectAll()` | 전체 선택 해제 + Properties 초기화 |
| `highlightBlock(block, layerItem)` | 레이어 패널 항목 하이라이트 |
| `bindBlock(block)` | 블록에 click/dblclick/hover 이벤트 일괄 바인딩 |
| `bindSectionDelete(sec)` | 섹션 ✕ 버튼에 삭제 이벤트 연결 |
| `showTextProperties(tb)` | 텍스트 블록 Properties 패널 렌더링 |
| `showGapProperties(gb)` | Gap 블록 Properties 패널 렌더링 |
| `makeTextBlock(type)` | 텍스트 블록 DOM 생성 |
| `makeAssetBlock()` | 에셋 블록 DOM 생성 |
| `makeGapBlock()` | Gap 블록 DOM 생성 |
| `addSection()` | 새 섹션 추가 |

### 선택 구조 핵심 원칙
- 블록 클릭 시: `deselectAll()` → `block.classList.add('selected')` → `syncSection()` 순서
- `selectSection()`은 내부에서 `deselectAll()`을 호출하므로 블록 선택 후엔 사용 금지
- `syncSection()`을 사용해야 블록 `.selected` 상태가 유지됨

---

## 현재 구현 현황

- [x] 3단 레이아웃 (좌 패널 / 캔버스 / 우 패널)
- [x] 줌 컨트롤러 (+ / - / Fit / 키보드 단축키)
- [x] 섹션 블록 3개 (Section 01 / 02 / 03)
- [x] 텍스트 블록 인라인 편집 (더블클릭)
- [x] 에셋 블록 와이어프레임 (860×780 풀블리드)
- [x] Gap 블록 (섹션 상/하단 고정, 높이 조절)
- [x] Row / Col 레이아웃 컨테이너 구조 설계
- [x] 레이어 패널 — 섹션/블록 트리 표시 + 클릭 선택 연동
- [x] 블록 선택 시 실선 유지 (`.selected` 상태 persistent)
- [x] Floating Action Panel — Section / Heading / Body / Caption / Asset / Gap 추가
- [x] Properties 패널 — Text Block (타입·정렬·폰트·크기·색상·줄간격·패딩)
- [x] Properties 패널 — Gap Block (높이 슬라이더)
- [x] 섹션 삭제 (✕ 버튼 또는 Delete/Backspace 키)
- [x] 블록 삭제 (Delete/Backspace 키, 텍스트 편집 중엔 비활성)
- [ ] Row layout 전환 UI (stack → flex → grid)
- [ ] 섹션/블록 순서 변경 (↑↓ 버튼)
- [ ] Properties 패널 — Asset Block (높이 조절)
- [ ] Properties 패널 — Section Block (배경색 등)
- [ ] 에셋 실제 업로드

---

## 다음 작업 후보

1. **섹션·블록 순서 변경** — ↑↓ 버튼으로 위아래 이동
2. **Asset Properties** — 에셋 블록 높이 조절
3. **Section Properties** — 섹션 배경색, 패딩 설정
4. **에셋 업로드** — 실제 이미지 파일 업로드 및 미리보기
