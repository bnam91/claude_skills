# 주간 PM 운영 워크플로우

## 전체 순서

```
[일요일]
① PM 면담 (cc → gg → xx 순)
② 주간회의 생성 + PM 브리핑 입력
③ Rich Agent 종합 피드백
④ 다음날 모닝미팅 페이지 준비

[월요일]
⑤ 오전 브리핑 실행 (3단계)
⑥ 업무요청 추가
```

---

## ① PM 면담 (일요일)

각 PM DB 분석 → personal interview DB에 면담 페이지 생성 → 토글+콜아웃 채팅 방식

**프롬프트:**
```
pm-cc 면담
pm-gg 면담
pm-xx 면담
```

---

## ② 주간회의 + PM 브리핑 입력 (일요일)

weekly meeting 페이지가 없으면 먼저 생성 후 각 PM 브리핑 입력

**프롬프트:**
```
/agent_weekly_meet     ← 주간회의 페이지 생성 (없을 때만)

/pm_cc_weekly          ← pm-cc 이번주 목표 입력 (DB 자동조회)
/pm_gg_weekly          ← pm-gg 이번주 목표 입력 (면담 내용 반영)
/pm_xx_weekly          ← pm-xx 이번주 목표 입력 (면담 내용 반영)
```

---

## ③ Rich Agent 종합 피드백 (일요일)

각 PM 브리핑 내용을 읽고 현빈 시간 배분 + 경고 + 프로젝트별 피드백 작성

**프롬프트:**
```
/agent_weekly_meet 각 인원이 입력한 걸로 Rich Agent 종합 피드백 입력해줘
```

---

## ④ 다음날 모닝미팅 준비 (일요일)

내일(월요일) morning meeting 페이지 생성

**프롬프트:**
```
내일 pm-gg, pm-cc 오전 브리핑 준비해줘
```

> 스크립트: `agent_meeting.js --morning --date YYYY-MM-DD`

---

## ⑤ 오전 브리핑 실행 (월요일 아침) — 3단계

### 1단계 — 브리핑 DB 초안 작성
GG DB 자동조회 → 현황 스냅샷 + 현빈02/지혜 배정 업무 자동 생성

**프롬프트:**
```
/pm_gg_morning
```
> 내부 실행: `cd ~/Documents/claude_skills/notion && node _pm_briefing.js`

### 2단계 — 임시 콜아웃 확인
브리핑 초안 검토 (수정 필요 시 현빈이 직접 수정)

### 3단계 — 실제 콜아웃 전송
임시 콜아웃 내용 → 현빈02 / 지혜 실제 콜아웃으로 전달

**프롬프트:**
```
실제 콜아웃 전송해줘
```
> 내부 실행: `cd ~/Documents/claude_skills/notion && node _send_to_real_callout.js`

**CC 오전 브리핑:**
```
/pm_cc_morning         ← DB 자동조회 후 morning meeting 토글에 입력
```

---

## ⑥ 업무요청 추가 (월요일 — 오전 브리핑 후)

각 담당자 업무요청 페이지에 이번주 업무 추가 + 이번주 주요 계획 및 이슈 콜아웃 작성

**프롬프트:**
```
이번주 업무요청 추가해줘
```

| 담당자 | 방식 | 이번주 계획 콜아웃 앵커 |
|-------|------|----------------------|
| 지혜 (GG) | `claude_runner.js --add --who 지혜` | `317111a5-7788-8087-a2be-e88fed159a76` |
| 수지 (CC) | `claude_runner.js --add --who 수지` | `31d111a5-7788-8015-a716-fe2028896c87` |

---

## 빠른 참조

| 단계 | 프롬프트 | 시점 |
|------|---------|------|
| cc 면담 | `pm-cc 면담` | 일요일 |
| gg 면담 | `pm-gg 면담` | 일요일 |
| xx 면담 | `pm-xx 면담` | 일요일 |
| 주간회의 생성 | `/agent_weekly_meet` | 일요일 |
| cc 주간 브리핑 | `/pm_cc_weekly` | 일요일 |
| gg 주간 브리핑 | `/pm_gg_weekly` | 일요일 |
| xx 주간 브리핑 | `/pm_xx_weekly` | 일요일 |
| 종합 피드백 | `/agent_weekly_meet 각 인원이 입력한 걸로 Rich Agent 종합 피드백 입력해줘` | 일요일 |
| 모닝미팅 준비 | `내일 pm-gg, pm-cc 오전 브리핑 준비해줘` | 일요일 |
| gg 오전 브리핑 1단계 | `/pm_gg_morning` | 월요일 아침 |
| gg 오전 브리핑 3단계 | `실제 콜아웃 전송해줘` | 월요일 아침 (검토 후) |
| cc 오전 브리핑 | `/pm_cc_morning` | 월요일 아침 |
| 업무요청 추가 | `이번주 업무요청 추가해줘` | 월요일 — 오전 브리핑 후 |
