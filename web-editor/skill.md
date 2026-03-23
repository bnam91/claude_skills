# 상페마법사 웹에디터 — Claude 작업 가이드

**앱 이름**: sangpe-editor
**파일 위치**: `/Users/a1/web-editor/`
**실행**: `npm run dev` (Electron, 핫리로드)
**README**: `/Users/a1/web-editor/README.md` (상세 구조 참고)

---

## 프로젝트 개요

상세페이지를 블록 단위로 쌓아 만드는 Electron 인라인 에디터.
Figma 플러그인 WebSocket 연동으로 디자인 자동 업로드 지원.

---

## 레이아웃 구조

```
┌─────────────────────────────────────────────┐
│  Top Bar  (로고 / 모드 / 줌 / Publish)       │
├──────────┬──────────────────────┬────────────┤
│  Layers  │      Canvas          │ Properties │
│  패널    │   (860px 고정)        │   패널     │
└──────────┴──────────────────────┴────────────┘
하단: Floating Action Panel (Section / Text / Row / Asset / Gap / Circle / Table)
```

---

## 블록 계층 구조

```
Canvas
└── Section (id: sec_xxxxx)
    └── section-inner
        ├── Gap Block      (id: gb_xxxxx)   ← 여백
        ├── Row
        │   └── Col
        │       ├── Text Block  (id: tb_xxxxx)  ← heading/subheading/body/caption/label
        │       └── Asset Block (id: ab_xxxxx)  ← 이미지
        ├── Icon Circle Block   (id: icb_xxxxx)
        └── Table Block         (id: tbl_xxxxx)
```

---

## 핵심 파일 맵

| 파일 | 역할 |
|------|------|
| `js/drag-drop.js` | 블록 생성 (make*), 섹션 추가 (addSection), DnD, genId() |
| `js/save-load.js` | 직렬화·로드·rebindAll (ID 보정 포함) |
| `js/export.js` | Figma 업로드용 JSON 빌드 (buildFigmaExportJSON) |
| `js/editor.js` | 선택·줌·키보드·프리셋 로직 |
| `js/layer-panel.js` | 레이어 패널 트리 |
| `figma-renderer/sangpe_to_figma.mjs` | Figma 업로드 메인 스크립트 |
| `figma-renderer/figma_cmd.mjs` | Figma WebSocket 커맨드 러너 |

---

## Figma 연동

```
앱 → figma:upload IPC → sangpe_to_figma.mjs
  → figma_cmd.mjs → ws://localhost:3055 (MCP 서버)
    → Figma 플러그인 → Figma Plugin API
```

- **플러그인**: `/Users/a1/Desktop/figma-plugin2/Claude Talk to Figma/`
- **소스**: `~/github/macro_hometax/claude-talk-to-figma-mcp/src/claude_mcp_plugin/`
- **채널**: Figma 플러그인 실행 후 표시되는 코드 (변경될 수 있음)
- **지원 커맨드**: set_font_name / set_letter_spacing / set_line_height / load_font_async 등 90개+

---

## 블록 ID 체계

모든 블록은 생성 시 `genId(prefix)`로 고유 ID 할당 (`drag-drop.js`).
로드 시 ID 없는 기존 블록 → `rebindAll()`에서 자동 부여 (하위 호환).

```
sec_a3f7k2b  tb_x9m4p1q  ab_8n2j5rc  gb_k1w7z4e  icb_m3p9x2n  tbl_q5r8y1c
```

---

## 데이터 직렬화

- **저장 방식**: Canvas innerHTML → JSON (`{ version, currentPageId, pages }`)
- **Figma 포맷**: `sangpe-design-v1` JSON (export.js의 `buildFigmaExportJSON()`)
- **Label 블록**: `labelBox: { bg, radius, paddingH, paddingV }` 포함 → Figma에서 Frame+Text로 렌더링

---

## 프리셋 CSS 변수

섹션 element 인라인 style에 저장됨 (직렬화 시 보존):

| 변수 | 기본값 | 역할 |
|------|--------|------|
| `--preset-label-bg` | `#111111` | Label 배경색 |
| `--preset-label-color` | `#ffffff` | Label 텍스트 색상 |
| `--preset-label-radius` | `8px` | Label border-radius |
| `--preset-h1-color` | `#111111` | H1 색상 |
| `--preset-body-color` | `#555555` | Body 색상 |

---

## 현재 구현 상태

- [x] 3단 레이아웃 + 줌 컨트롤러
- [x] 섹션 추가/삭제/순서변경
- [x] 텍스트 블록 (H1/H2/Body/Caption/Label) 인라인 편집
- [x] 에셋 블록 이미지 업로드
- [x] Gap / Row / Icon Circle / Table 블록
- [x] 레이어 패널 + Properties 패널
- [x] 프리셋 시스템 (default / dark / brand / minimal)
- [x] 멀티페이지 + Branch 시스템
- [x] Figma 업로드 (폰트·자간·행간·정렬 포함)
- [x] 블록 고유 ID 체계 (sec_ / tb_ / ab_ / gb_ / icb_ / tbl_)
- [x] Label Figma 업로드 시 배경 박스(Frame) 생성
- [ ] Auto Layout 기반 Figma 업로드
- [ ] 블록 부분 업데이트 (ID 기반 Figma 동기화)
- [ ] Circle / Table Figma 업로드 미구현

---

## 주의사항

- `selectSection()` 내부에서 `deselectAll()` 호출 → 블록 선택 후엔 `syncSection()` 사용
- CSS 변수는 섹션 인라인 스타일로 저장됨 → DOMParser에서 `style.getPropertyValue()` 로 읽어야 함
- Figma 노드 ID(`39:4`)와 앱 블록 ID(`tb_xxx`)는 별개 — 현재 매핑 없음
