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

---

# [v1.1] 영상 시연 모드 — 실전메모 (2026-08-07 실측, srv-howto-demo)

정지 스크린샷 말고 **마우스·키보드를 움직이며 녹화**해서 조작 시연 영상을 만드는 모드.
상세 플레이북: `~/.claude/skills/stephow/video_demo.md` / 스크립트: 같은 폴더 `scripts/`

## ★핵심 교훈 — 리허설 없이 녹화하지 마라
| 대상 | 리허설 | 결과 |
|---|---|---|
| 네이버 더미 로그인 | 했음 | **1테이크 성공** |
| 네이버 실계정 | 안 함(창 위치만 변경) | **3테이크 중 2개 폐기** |

`시나리오 → 무녹화 리허설 → 녹화 → 프레임 눈으로 검수` 4단계 강제.
창 위치·크기·프로필을 조금이라도 바꿨으면 **리허설 다시**.
★실계정은 실패 테이크 = 진짜 로그인 시도 → 더미로 먼저 완주시키고 실계정은 1테이크로.

## 도구 판정 (실측)
- 마우스 = `cliclick` ✅ (tmux에서 직접 됨, CGEvent라 Apple Events 권한 무관)
- **한글 타이핑 = Quartz `CGEventKeyboardSetUnicodeString` 만 됨** ✅
  - `cliclick t:` 한글 ❌ (`Unable to get key code for 스`)
  - `osascript keystroke` 한글 ❌ (입력기 한글이면 `ㅁㅁㅁㅁ`)
  - ★결과: **클립보드 경유 불필요** → 비번이 클립보드에 안 남는다
- 녹화 = `screencapture -v -R` ✅, **커서는 `-C` 없어도 찍힘**

## 밟은 함정
1. **★클릭 전 창 포커스 필수** — key window 아니면 첫 클릭이 '창 활성화'로 먹힘. `cdp.py focus` + 탭스트립 클릭
2. 포커스 클릭을 페이지 여백에 → **뉴스 링크 밟고 이동**. 브라우저 크롬 영역을 클릭할 것
3. **★macOS 알림 배너가 녹화에 찍힘**(업무정보 유출). 배너는 우상단 y≈25~115 → **창 top을 130 이상**으로
4. 크롬 '비밀번호 저장' 버블 → 프로필 `credentials_enable_service:false`
5. CDP 403 → `suppress_origin=True`
6. 뷰포트 좁으면 요소 잘림(네이버 로그인버튼은 1300px+ 필요)
7. 저장 대화상자는 sheet 아닌 dialog → `⌘D`/`sheet 1` 실패, `close saving no` 사용

## 격리 원칙
- 격리 프로필 + 전용 포트로 새 크롬(로그아웃 상태라 업무정보 안 찍힘). 9222 등 타 세션 미접촉
- ⚠️ `tell application "Google Chrome"` 금지(타 세션 잡음) → CDP `Browser.setWindowBounds`
- 끝나면 내 프로필만 kill + rm, 실계정 썼으면 로그아웃까지

## 권한
손쉬운사용·화면기록·자동화 전부 부여됨(tmux/claude-code/Terminal/node).
⚠️ **권한은 tmux 실행파일 경로에 붙는다** → tmux 업그레이드 시 조용히 전부 실패.

## [추가] 리허설 체크리스트 · 팝업 3중방어 · 녹화표시
- **리허설에서 확정할 것**: 플로우 / 좌표(뷰포트 잘림) / 포커스 / **팝업 목록** / 단계별 소요시간 / 프레임에 업무정보 유입 / 종료상태
- **팝업 3중방어**: A 사전차단(크롬 플래그·프로필 pref·창 top≥130) → B 사전정리(staging에서 닫기, ★reload하면 다시 뜸) → C 실행중 `popup_guard.py`
- **★자동으로 누르면 안 되는 것**: 패스키 등록·2FA·비번변경·결제·삭제·약관동의 → 닫지 말고 **보고 후 중단**
  (실측: 네이버 실계정 로그인 직후 「지금 패스키 설정하기」 브리지 등장 — 눌렀으면 계정에 패스키 등록될 뻔)
- **녹화중 표시** = `scripts/rec_hud.py` (AppKit HUD 알약, 반투명 블러+빨간점 호흡, **포커스 미탈취**).
  ★tkinter 빨간테두리판은 **포커스를 뺏어서 폐기**. macOS 순정 보라점은 뜨지만 너무 작음.
