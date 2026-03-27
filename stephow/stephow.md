# stephow — 스크린샷 기반 노션 스텝하우 가이드 생성

**스킬 호출**: `/stephow`
**스킬 경로**: `~/.claude/skills/stephow/SKILL.md`

---

## 개요

브라우저(CDP)에서 스크린샷을 찍고, imgbb에 업로드한 뒤, 노션 CHARIZARD 페이지에 스텝바이스텝 가이드를 자동 생성하는 워크플로우.

---

## 사용 도구

| 도구 | 역할 |
|------|------|
| `mcp__chrome-devtools-9222__take_screenshot` | 브라우저 현재 화면 캡처 |
| `utils_imgbb/scripts/imgbb-upload_many.js` | 이미지 → imgbb 공개 URL 변환 |
| Notion API (https 모듈 직접 호출) | 노션 페이지 + 이미지 블록 생성 |

---

## 전체 흐름

```
브라우저 화면 → /tmp/xxx.png → imgbb URL → Notion 이미지 블록
```

### 1단계: 스크린샷 촬영

```
mcp__chrome-devtools-9222__take_screenshot
  filePath: "/tmp/{주제}_{번호}.png"
```

### 2단계: imgbb 업로드

```bash
cd ~/Documents/github_cloud/utils_mac/utils_imgbb
node scripts/imgbb-upload_many.js /tmp/파일1.png /tmp/파일2.png
# → URL 목록 출력
```

### 3단계: Notion 페이지 생성 (Node.js 스크립트)

```javascript
// /tmp/create_{주제}.js 로 작성 후 실행
import https from 'https';

const API_KEY = "ntn_...";  // ~/Documents/claude_skills/notion_manager/config.json
const PARENT_PAGE_ID = "2ca111a5778880c99435efef0cbf7707";  // CHARIZARD
```

---

## 노션 블록 구조 (stephow 스타일)

```
📌 callout — 한 줄 요약
────────────
heading_1 "01. 단계명"
paragraph  — 설명 텍스트
image      — 스크린샷 URL (imgbb)
────────────
heading_1 "02. 단계명"
...
────────────
✅ callout — 최종 요약
```

---

## 실제 생성 예시

| 페이지 | URL |
|--------|-----|
| Slack 사용 가이드 | https://www.notion.so/330111a5778881e8a911f9646421a6a9 |
| Slack 워크플로우 전체 구조 | https://www.notion.so/330111a57788819aa9c1d09289a7e670 |

---

## 핵심 주의사항

- **Python urllib 사용 불가** → SSL 인증서 오류 발생. Node.js `https` 모듈만 사용
- **node-fetch 불필요** → Node 18+ 내장 fetch 있지만 `https` 모듈이 더 안정적
- **블록 50개 제한** → Notion API 한 번에 최대 100개, 안전하게 50개씩 chunk
- **이미지 URL** → 반드시 공개 접근 가능한 URL (imgbb.com 사용)
- **Notion API 키 위치** → `~/Documents/claude_skills/notion_manager/config.json`

---

## 생성일

2026-03-27 — Slack 가이드 제작 과정에서 패턴 정립
