---
name: chat-claude
description: 두 Claude Code 세션이 Notion 페이지를 매개체로 비동기 대화하는 채널을 만들고 운영하는 스킬. 사용자가 "/chat-claude", "다른 클로드한테 시켜", "저쪽 맥북 클로드한테 물어봐", "저쪽이랑 채널 열어줘" 등을 말할 때 실행해. 양방향(양쪽 다 질문/답변 가능). 제목 비콘 기반 경량 폴링.
---

# /chat-claude — 두 Claude Code 간 비동기 대화 채널

두 Claude Code 세션이 Notion 페이지를 매개로 비동기 대화. 양쪽이 cron 폴링으로 페이지 변화를 감지하고 응답한다.

## ⚡ 핵심 설계 — 제목 비콘(wait 토큰)으로 폴링 경량화

채널이 길어지면 Q&A 본문이 수만 자로 불어난다. 폴링 때마다 그 큰 본문을 통째로 `fetch`하면 **변화가 없어도 매 틱 토큰을 크게 먹는다**(노션 MCP `fetch`는 페이지 전체를 반환하기 때문).

그래서 **페이지 제목(title)에 "대기 토큰" `⟨wait:X⟩`을 박아 신호등으로 쓴다**:
- 제목 = `🔁 [채널] {임무50자} ⟨wait:B⟩`
- 폴링은 **`notion_manager get-title`(REST, 본문 0)**로 제목 한 줄만 읽어 내 차례인지 판단
- **내 차례(wait:내쪽)일 때만** 본문을 `notion-fetch`(MCP)로 읽고 답한다
- 그 외(wait:none / wait:상대)는 본문을 **안 읽고 즉시 종료** → 평소 토큰 ≈ 제목 한 줄

> wait 토큰 의미 = **"누가 읽고 행동해야 할 새 내용이 있는가"** (핑퐁 공)
> - A가 B에게 질문/임무 → `⟨wait:B⟩`
> - B가 답함(A가 확인해야 함) → `⟨wait:A⟩`
> - 받은 쪽이 더 할 게 없음 → `⟨wait:none⟩` (공 내려놓음, 양쪽 조용)
> - 임무 완료 → `⟨wait:done⟩`

본문 읽기·편집은 기존 MCP(`notion-fetch` / `notion-update-page`)를 그대로 쓴다. **제목 비콘은 "폴링 게이트"로만** 쓰는 하이브리드다.

### 사전 조건 (양쪽 맥 모두)
- `notion_manager` 설정됨: `~/Documents/claude_skills/notion_manager/config.json`에 `api_key`
- 채널 페이지(또는 부모 CHARIZARD)에 **Notion Integration 연결**돼 있어야 REST(get-title/set-title) 접근 가능. (MCP connector와는 별개 — 부모에 연결하면 자식 상속)
- 미설정 맥이면 폴링 게이트는 기존 방식(전체 fetch)으로 폴백해도 동작은 함 — 단 토큰 절약 효과는 없음.

---

## 호출 분기 (자동)

| 입력 패턴 | 모드 |
|---|---|
| 자연어 임무 (URL 없음) | **start** — 새 채널 생성 |
| `join <노션URL>` 또는 노션 URL만 | **join** — 기존 채널 합류 |
| `end <URL>` 또는 "끝났어 채널 닫아" | **end** — 채널 종료 |
| `ask <URL> <질문>` 또는 URL + 자연어 질문 | **ask** — 기존 채널에 질문 추가 |
| 인자 없음 | **status** — 현재 활성 cron 목록 + 최근 채널 |

## start 모드 — 새 채널 생성

1. **노션 페이지 생성** (CHARIZARD 부모: `2ca111a5778880c99435efef0cbf7707`)
   - title: `🔁 [채널] {임무 첫 50자} ⟨wait:B⟩` ← **wait 토큰 포함**(합류자 B가 임무 시작할 차례)
   - 본문은 아래 "페이지 템플릿" 그대로

2. **사용자 환경 자동 수집**
   ```bash
   uname -m; hostname; date -Iseconds
   ```

3. **CronCreate** — cron `*/5 * * * *`, recurring true, prompt = 아래 "폴링 프롬프트"({A쪽|B쪽}=A쪽, {page_id} 치환)

4. **사용자에게 출력**
   ```
   ✅ 채널 생성됨
   페이지: <URL>   페이지 ID: <ID>
   폴링 cron: <ID> (5분, 제목 비콘 게이트)

   📋 저쪽에 던질 첫 프롬프트:
   ─────
   /chat-claude join <URL>
   임무 시작해. ⚠️ 로컬에서 나한테 메뉴/질문(AskUserQuestion) 띄우지 마 — 나는 이 터미널을 안 본다.
   되돌릴 수 있는 결정은 합리적 기본값으로 끝까지 진행하고,
   진짜 막히는 것만 ## ❓ Q&A 에 적은 뒤 set-title로 ⟨wait:A⟩ 넘기고 대기.
   ─────
   ```

5. **(매니저 모드일 때만)** 매니저 DB row 등록.

## join 모드 — 기존 채널 합류

1. URL/ID로 페이지 fetch, `## 🎯 임무` 읽고 작업 시작
2. **CronCreate** 동일 등록 ({A쪽|B쪽}=B쪽)
3. **로컬 인터랙티브 질문 절대 금지** — 합류자 세션은 사람이 안 본다. 되돌릴 수 있으면 자율 진행, 막히면 `## ❓ Q&A`에 Q블록 추가 + `set-title ⟨wait:A⟩`로 공 넘기고 대기.
4. 단계 끝날 때마다 `## 📝 작업 로그` 갱신
5. 임무 완료 시 `## ✅ 종료 마커`에 `✅ 임무 완료` + `set-title ⟨wait:done⟩`

## ask 모드 — 진행 중 채널에 질문/답변 추가

1. URL/ID로 페이지 fetch
2. 마지막 Q번호 확인 → 새 `### Q(n+1).` 블록 + 빈 슬롯 추가(update-page)
3. **반드시 `set-title`로 wait 토큰을 상대 쪽으로** 갱신 (질문 받을 쪽). 안 그러면 상대 폴링이 게이트에서 막혀 못 봄.

## end 모드 — 채널 종료

1. 본문에 `✅ 임무 완료` 박기 + `set-title ⟨wait:done⟩`
2. **CronList**로 자기 cron 찾아 **CronDelete**
3. 매니저 DB row 있으면 상태=완료
4. 사용자에게 종료 알림

## status 모드

1. **CronList** — 활성 폴링 cron
2. `get-title`로 최근 채널 wait 상태 + 필요시 본문 요약

---

## 🔑 비콘 도구 사용법 (REST, 경량)

```bash
# 제목만 읽기 (본문 0 — 폴링 게이트용)
node ~/Documents/claude_skills/notion_manager/notion_manager.js get-title <page_id>

# 제목 갱신 (wait 토큰 변경) — 기존 제목 + 바뀐 ⟨wait:X⟩ 전체 문자열로
node ~/Documents/claude_skills/notion_manager/notion_manager.js set-title <page_id> "🔁 [채널] 임무요약 ⟨wait:A⟩"
```

> ⚠️ `set-title`은 제목을 **통째로 교체**한다. 앞부분(`🔁 [채널] …`)은 유지하고 끝의 `⟨wait:X⟩`만 바꿔서 전체를 넘길 것.

---

## 폴링 프롬프트 (CronCreate prompt 인자에 박는 내용)

```
1) `node ~/Documents/claude_skills/notion_manager/notion_manager.js get-title {page_id}` 실행 → 제목의 ⟨wait:X⟩ 토큰 확인.
2) ⟨wait:done⟩ 이면 → 본문 notion-fetch로 종료 확인 후 CronList→CronDelete로 내 cron 삭제 + 사용자에게 한 줄 알림.
3) ⟨wait:{A쪽|B쪽}=내쪽⟩ 이면 → 그때만 본문 notion-fetch해서 ## ❓ Q&A 내 빈 슬롯 채움(notion-update-page → update_content). 답한 뒤 set-title로 끝 토큰을 ⟨wait:상대⟩(추가질문 던졌으면 상대) 또는 ⟨wait:none⟩(더 답할 것 없으면)으로 갱신.
4) ⟨wait:none⟩ 또는 ⟨wait:상대⟩ 이면 → 본문 안 읽고 즉시 종료(조용히 대기). 사용자 보고 X.
5) get-title 실패(REST 미설정/integration 미연결)면 → 폴백: 기존처럼 본문 전체 notion-fetch로 확인.
```

`{A쪽|B쪽}` = 자기 식별자(start=A쪽, join=B쪽). `{page_id}` = 실제 페이지 ID.

---

## 페이지 템플릿 (start 모드)

````markdown
> **상대 Claude Code에게 보내는 비동기 채널 페이지**
> 폴링은 제목 ⟨wait:X⟩ 토큰으로 게이트. 내 차례일 때만 이 본문을 읽는다.
> 사용자(현빈)에게 직접 물어보지 말고 ## ❓ Q&A 로 우회.

---

## 🎯 임무
{사용자가 자연어로 던진 임무 그대로}

---

## 📋 컨텍스트
- 시작자 호스트: {hostname} ({uname -m})
- 시작 시각: {ISO 시간}
- 폴링: 제목 비콘 게이트(5분), A쪽=시작자 / B쪽=합류자

---

## 🚦 비콘 규약 (양쪽 필수)
- 제목 끝 `⟨wait:X⟩` = 다음에 행동할 쪽. 폴링은 `get-title`로 이것만 보고 내 차례면 본문 읽음.
- **답·질문·종료할 때마다 반드시 `set-title`로 토큰 갱신** (안 하면 상대가 영영 못 봄):
  - 상대에게 질문/임무 던짐 → `⟨wait:상대⟩`
  - 답변 완료(상대가 확인) → `⟨wait:상대⟩`, 더 줄 것 없으면 받은 쪽이 `⟨wait:none⟩`
  - 임무 완료 → `⟨wait:done⟩`

---

## ❓ Q&A (비동기 대화)
> 본문 편집은 MCP `notion-update-page`(update_content). 편집 후 `set-title`로 wait 갱신 필수.

### Q1. _(질문 추가하면 채워줘)_
**A쪽:** 
**B쪽:** 

---

## 📝 작업 로그
- [ ] (첫 단계 채워나갈 것)

---

## ✅ 종료 마커
> 완료 시 체크 + 한 줄 + `set-title ⟨wait:done⟩`.

- [ ] **✅ 임무 완료**

---

## 🔗 메타
- 페이지 ID: `{page_id}`
- 시작자: A쪽 ({hostname})
- 매니저 DB row: {URL 또는 "없음"}
````

---

## 종료 자동 감지

폴링 게이트에서 `⟨wait:done⟩` 감지 → 본문 fetch로 `✅ 임무 완료` 확인 → CronDelete → (매니저 DB 있으면 상태=완료) → 사용자에게 `✅ 채널 종료됨 — {URL}` 한 줄.

---

## 보안
- 토큰/비밀번호 등 민감정보는 임무 완료 후 마스킹(update_content). 채널은 CHARIZARD 비공개 트리.

## 주의
- cron은 **session-only** — 세션 닫으면 소멸. 장기 운용은 `/schedule` 또는 launchd.
- 본문 편집·읽기는 노션 MCP connector(`/mcp`), 비콘 게이트는 notion_manager REST(config.json + integration). **둘 다 준비돼야 경량 폴링 작동** — REST 없으면 5)번 폴백.
- 첫 프롬프트는 사용자가 직접 저쪽 창에 붙여넣어야 함.
- 제목이 길어지는 게 싫으면 임무요약을 더 짧게(20자) + `⟨wait:X⟩`만 유지.

---

## 사용자 호출 예시
```
/chat-claude 새 맥북에 도커 설치하고 docker-compose up까지 띄워줘   # start
/chat-claude join https://www.notion.so/xxxxxxx                      # join
/chat-claude ask https://www.notion.so/xxxxxxx 진행률 어디까지?      # ask (→ set-title wait:상대)
/chat-claude end https://www.notion.so/xxxxxxx                       # end
/chat-claude                                                          # status
```
