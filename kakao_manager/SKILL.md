---
name: kakao_manager
description: 카카오톡 Mac 앱을 Claude Code 터미널에서 직접 조작하는 매니저 스킬. team-attention/kakaotalk 플러그인을 래핑해서 채팅방 검색/목록/메시지 읽기/날짜필터/요약/메시지 전송/이미지 전송/(나) 자기채팅 식별/자동 로그인을 일관된 방식으로 처리한다. 사용자가 "카톡 매니저", "/kakao_manager", "카톡 봐줘", "단톡방 요약해줘", "카톡 보내줘", "카톡 자동화" 등을 말할 때 실행해.
---

# kakao_manager 스킬

> **🚀 처음 설치하는 경우**: 같은 폴더의 `heyclaude.md`를 따라 자동 환경 세팅 진행. 사용자가 "kakao_manager 세팅", "카톡 스킬 처음 사용", "환경 세팅해줘" 등을 말하거나 아래 사전 점검에서 빠진 게 있으면 그 안내문 따라가.

## 1. 환경 사전 점검 (실행 전 항상 검사)

```bash
# 1) 카카오톡 Mac 앱 실행 여부
osascript -e 'tell application "System Events" to (name of processes) contains "KakaoTalk"'
# false 면: open -a KakaoTalk

# 2) 카카오톡 로그인 여부 (창 이름이 '로그인'이면 아직 로그인 안 됨)
osascript -e 'tell application "System Events" to tell process "KakaoTalk" to get name of every window'
# '로그인' 포함 시 → 자동 로그인 시퀀스 실행 (아래 2.1)

# 3) uv 설치
test -x $HOME/.local/bin/uv && echo OK || curl -LsSf https://astral.sh/uv/install.sh | sh

# 4) 플러그인 레포 클론
test -d $HOME/github/plugins-for-claude-natives || \
  (mkdir -p $HOME/github && cd $HOME/github && git clone https://github.com/team-attention/plugins-for-claude-natives.git)

# 5) 접근성 권한 (atomacos가 카톡 enumerate 가능한지 한 줄 테스트)
source $HOME/.local/bin/env && uv run --with atomacos --python 3.12 python -c "
import atomacos
app = atomacos.getAppRefByBundleId('com.kakao.KakaoTalkMac')
print('OK' if app else 'PERM_NEEDED')
"
# PERM_NEEDED 또는 ValueError 발생 시:
# open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
# → 사용자에게 터미널 앱(또는 Claude Code) 토글 ON 요청
```

## 2. 자동 셋업

### 2.1 카카오톡 자동 로그인 (`.env` 기반)

- 자격증명 위치: `$HOME/Documents/github_cloud/module_api_key/.env`
  - 본인 환경 변수 명세 (직접 채워야 함):
    - `KAKAO_ID=<본인 카카오 ID — 보통 전화번호 또는 이메일>`
    - `KAKAO_PW=<본인 카카오 비밀번호>`
- 보안 텍스트필드는 `set value` 거부 → keystroke + Tab 우회 필수

```bash
set -a; source $HOME/Documents/github_cloud/module_api_key/.env; set +a
osascript <<EOF
tell application "KakaoTalk" to activate
delay 0.6
tell application "System Events"
  tell process "KakaoTalk"
    set frontmost to true
    delay 0.3
    click text field 1 of window 1
    delay 0.3
    key code 0 using {command down}  -- Cmd+A
    delay 0.15
    key code 51                       -- Delete
    delay 0.15
    keystroke "$KAKAO_ID"
    delay 0.3
    key code 48                       -- Tab
    delay 0.3
    key code 0 using {command down}
    delay 0.15
    key code 51
    delay 0.15
    keystroke "$KAKAO_PW"
    delay 0.4
    key code 36                       -- Enter
  end tell
end tell
EOF
```

> ⚠️ 첫 로그인 시 본인 휴대폰으로 인증번호 푸시가 갈 수 있음 — 직접 입력 필요. 자동화 한계.

### 2.2 채팅 탭 활성화 (목록 조회 전 필수)

카톡 메인창이 친구 탭에 있으면 `--list`가 0개 반환. 항상 채팅 탭부터:

```bash
osascript -e 'tell application "KakaoTalk" to activate' && \
osascript -e 'tell application "System Events" to tell process "KakaoTalk" to key code 19 using {command down}'
# Cmd+1=친구, Cmd+2=채팅, Cmd+3=더보기
```

## 3. 핵심 명령어 (플러그인 호출)

플러그인 경로: `$HOME/github/plugins-for-claude-natives/plugins/kakaotalk/scripts/`

```bash
ALIAS_RUN='source $HOME/.local/bin/env && cd $HOME/github/plugins-for-claude-natives/plugins/kakaotalk/scripts && uv run --with atomacos --python 3.12 python'
```

### 채팅방 검색
```bash
$ALIAS_RUN kakao_read.py --search "키워드" --json
```

### 채팅방 목록 (채팅 탭일 때만)
```bash
$ALIAS_RUN kakao_read.py --list --limit 50 --json
```

### 메시지 읽기 (오늘만, 정확 날짜)
```bash
# --date YYYY-MM-DD, --scroll-up/down N, --limit N
$ALIAS_RUN kakao_read.py "채팅방" --scroll-down 5 --date 2026-06-01 --json --limit 200
```

### 메시지 보내기 (텍스트)

> ⚠️ **권장 = `send_safe.py`만 사용**. 외부 플러그인 `kakao_send.py`는 검색 silent 실패 시 `after_windows[0]` 폴백 → 잘못된 채팅방으로 발송되는 알려진 버그가 있다 (2026-06-01 실측). `send_safe.py`는 fingerprint 가드(요청 chat_name과 실제 열린 창의 AXTitle 일치 검증)가 있어 잘못 발송을 차단한다.

**권장**:
```bash
python3 $HOME/.claude/skills/kakao_manager/scripts/send_safe.py "채팅방" --text "메시지"
# 옵션:
#   --verify-me      (나) 본인 채팅인지 'badge me' AXImage로 검증
#   --strict-name    채팅방 이름 정규화 토큰 단어 단위 정확 일치 강제 (안전 ↑↑)
#   --no-signature   서명 제외
#   --json           JSON 출력
```

**비권장 (직접 사용 X)**:
```bash
$ALIAS_RUN kakao_send.py "채팅방" "메시지"  # ← 잘못 발송 위험. 검증 후에만 한정 사용.
```

### 이미지 전송 (PNG 클립보드 paste 방식)
```bash
TARGET="채팅방명"   # 본인 환경 alias로 변경
IMG="/path/to.png"

osascript -e "set the clipboard to (read POSIX file \"$IMG\" as «class PNGf»)"
osascript <<EOF
tell application "KakaoTalk" to activate
delay 0.3
tell application "System Events"
  tell process "KakaoTalk"
    repeat with w in windows
      if (name of w) is "$TARGET" then
        perform action "AXRaise" of w
        exit repeat
      end if
    end repeat
    delay 0.4
    click at {911, 763}  -- 입력란 좌표 (창 크기 따라 조정)
    delay 0.3
    key code 9 using {command down}   -- Cmd+V
    delay 1.5
    key code 36                        -- Enter
  end tell
end tell
EOF
```

### 파일 전송 (⚠️ 현재 미동작 — 6번 한계 참조)
신뢰성 있는 파일 전송은 카톡 입력란 옆의 첨부 버튼(클립 아이콘) 직접 클릭이 필요. 향후 구현 예정.

## 4. (나) 본인 채팅 식별 (필수 안전장치)

송신 전 반드시 검증해야 함. 동명이인이 있을 수 있어서.

### 식별자: AXImage description = 'badge me'
```python
# 메인 윈도우 채팅 목록의 각 row 안에 AXImage AXDescription='badge me' 가 있으면 (나) 본인
import atomacos
app = atomacos.getAppRefByBundleId('com.kakao.KakaoTalkMac')
main = next(w for w in app.windows() if w.AXTitle == '카카오톡')
# walk rows, find AXImage with description 'badge me'
```

### 본인 카톡 표시명 환경설정

본인 카톡 표시명(예: 자기 이름)을 `.env`에 등록해두면 send 가드/식별이 자동:

```
KAKAO_SELF_NAME=<본인 카톡 표시명>
```

`send_safe.py --verify-me` 가 'badge me' 마커 + 표시명 일치 두 가지로 (나) 채팅을 안전 식별.

## 5. 채팅방 alias (사용자별 설정)

자주 쓰는 채팅방을 자기 환경에 맞춰 별도 alias 파일로 관리하면 편함.

**저장 위치 권장**: `$HOME/.claude/skills/kakao_manager/aliases.json`

```json
{
  "self": "<본인 카톡 표시명>",
  "wife": "<배우자 채팅방명>",
  "boss": "<상사 채팅방명>"
}
```

호출 예: `kakao_send.py "$(jq -r .wife $HOME/.claude/skills/kakao_manager/aliases.json)" "메시지"`

> 본 스킬 자체엔 사용자별 데이터를 포함하지 않음. 직접 등록해서 사용.

## 6. 알려진 한계 / 우회

| 한계 | 영향 | 우회 |
|---|---|---|
| 화면에 마운트된 메시지만 추출 | 과거 메시지 누락 가능 | `--scroll-up N` / `--scroll-down N` |
| 사진/첨부 안 텍스트 안 잡힘 | OCR 필요 | 별도 OCR 파이프라인 (todo) |
| 답글 인용 원본 누락 가능성 | 컨텍스트 일부 손실 | AXImage 'badge me'·답글 마커 추가 walk (todo) |
| 파일/영상 클립보드 paste 안 됨 | 텍스트/이미지만 가능 | 첨부 버튼 자동화 (todo) |
| 그룹 채팅 발신자별 통계 없음 | 수동 집계 | 후속 헬퍼 스크립트 (todo) |
| 화면 미마운트 과거 메시지 전부 추출 | 한계 | **kakaocli** (silver-flight-group) 폴백 검토 — Full Disk Access + SQLCipher DB 읽기 |
| AppleScript "모든 앱 hide" 사용 금지 | Claude Code 터미널까지 hide되어 작업 불가 | hide 절대 X. 카톡만 raise |

## 7. 표준 운영 절차 (사용자 의도별)

### 의도: "오늘 X 단톡 요약"
1. 사전 점검 (1번)
2. 채팅 탭 활성 (2.2)
3. `kakao_read.py "X" --scroll-down 5 --date $(date +%Y-%m-%d) --json --limit 300`
4. 결과 분석 → 액션 거리 추출 → 사용자 보고

### 의도: "Y에게 카톡 보내줘"
1. 사전 점검
2. `kakao_read.py --search "Y" --json` → 후보 확인
3. **본인 채팅이면 (나) 마커 검증** (4번)
4. 동명이인 위험 있으면 사용자에게 확인 1회
5. `kakao_send.py "Y" "메시지"` 또는 `send_safe.py "Y" --text "메시지" --verify-me`
6. 결과 검증 (최신 row 확인)

### 의도: "그룹채팅 내일 미팅 안내 보내고 응답 모아줘"
1. 메시지 전송
2. 일정 시간 후 read로 응답 폴링 (시간 윈도우 + sender 필터)

## 8. 추가/개선 권장 기능 (우선순위 순)

### 우선순위 ★★★ (다음 작업 권장)
1. **--unread 옵션** — 메인창 row의 unread count (오른쪽 숫자 뱃지) 기준 안 읽은 채팅방만 추출
2. **첨부버튼 자동화** — 입력란 옆 클립 아이콘 클릭 → 파일 picker → 파일 경로 입력 → 전송
3. **답장 인용 메시지 마커 감지** — 답글 시 AXImage 또는 AXGroup 별도 구조 walk 보강
4. **send 전 'badge me' 자동 검증 가드** — `--self` 또는 `--verify-me` 플래그로 (나)가 아니면 abort

### 우선순위 ★★
5. **그룹채팅 발신자별 집계** — `--by-sender` 옵션으로 sender Counter 출력
6. **OCR 파이프라인** — 사진 attached rows를 screencapture → OCR(Vision framework) → text 회수
7. **답장 초안 워크플로** — read + Claude로 톤 학습 → draft 생성 → 사용자 승인 → send
8. **카톡 → Notion 자동 백업** — 매일 자정 cron으로 단톡방 어제 내용 Notion DB에 저장

### 우선순위 ★
9. **키워드 알람** — 단톡방에서 특정 키워드 발생 시 Telegram 알림
10. **bulk 검색** — 모든 채팅방에서 키워드 검색 (시간 ↑↑ 주의)
11. **kakocli 폴백** — 화면 안 보이는 과거 메시지 조회 시 silver-flight-group/kakocli 자동 호출
12. **그룹 채팅 멘션** — `@이름` 입력 시 카톡 자동완성 처리

## 9. 보안/주의

- `.env` 파일 권한 0600 권장 (`chmod 600 $HOME/Documents/github_cloud/module_api_key/.env`). iCloud 동기화 폴더면 EDEADLK(errno 11) 발생 시 `brctl download <path>` 즉시 해결
- 자격증명 transcript 노출 주의 — 가능하면 환경변수 export 후 osascript에 변수만 전달
- 카톡 UI 자동 조작 중에는 사용자 키보드/마우스 동시 사용 금지 (충돌)
- 시스템 설정 GUI 권한 부여는 사람이 수동 처리만 가능 (자동화 불가)
- **`hide all apps` 패턴 절대 금지** — Claude Code 터미널까지 hide됨
- 자기 카카오 계정 정보(`.env`)와 본인 표시명은 절대 git 추적 폴더에 두지 말기

## 10. 검증 완료 항목 (원본 스킬 기준 2026-05-29)

- ✅ 자동 로그인 (.env 기반, secure field keystroke 우회)
- ✅ 채팅방 검색/목록 (채팅 탭 활성 상태에서)
- ✅ 메시지 읽기 + 날짜(ISO) 정확 추출 (AXHelp 파싱)
- ✅ `--scroll-up/down`, `--date` 옵션
- ✅ 텍스트 메시지 전송 (서명 자동)
- ✅ 이미지(PNG) 클립보드 paste 전송
- ✅ 본인 (나) 채팅 식별 (badge me)
- ✅ tmux 다른 세션으로 카톡 정보 전달 (tele-code 연계)
- ❌ 파일(.txt/.pdf 등) 클립보드 paste 전송 — 첨부버튼 자동화 필요
- ❌ 영상 전송 — 미테스트, 파일과 동일 한계로 추정
- ❌ "나와의 채팅" 정식 방 자동 생성 (검색에 없으면 미존재)
