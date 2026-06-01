# heyclaude.md — kakao_manager 환경 세팅

> 이 파일은 Claude Code가 읽고 따라하는 안내문이야. 사람이 직접 보지 않아도 OK.

## 트리거 조건

사용자가 "kakao_manager 세팅", "카톡 매니저 처음 사용", "카톡 자동화 환경 세팅" 같은 말을 하거나, 아래 사전 요구사항 중 하나라도 빠져있으면 이 단계를 진행해. 모든 단계는 **idempotent** — 이미 있으면 skip.

## 사전 요구사항 체크

```bash
echo "=== kakao_manager 환경 점검 ==="
[ -d "/Applications/KakaoTalk.app" ] && echo "✓ KakaoTalk 앱 설치됨" || echo "❌ KakaoTalk 앱 없음 — Mac App Store 또는 https://www.kakaocorp.com/page/service/service/KakaoTalk 에서 설치"
[ -x "$HOME/.local/bin/uv" ] && echo "✓ uv" || echo "❌ uv 없음 — Step 2 진행"
[ -d "$HOME/github/plugins-for-claude-natives" ] && echo "✓ plugins-for-claude-natives" || echo "❌ 플러그인 없음 — Step 3 진행"
[ -f "$HOME/Documents/github_cloud/module_api_key/.env" ] && grep -q "KAKAO_ID" "$HOME/Documents/github_cloud/module_api_key/.env" 2>/dev/null && echo "✓ .env 카카오 자격증명" || echo "❌ .env 또는 KAKAO_ID 누락 — Step 5 진행"
osascript -e 'tell application "System Events" to (name of processes) contains "KakaoTalk"' 2>/dev/null | grep -q true && echo "✓ KakaoTalk 실행 중" || echo "❌ KakaoTalk 실행 중 아님 — Step 4 진행"
```

빠진 게 있으면 아래 단계로 보충.

---

## Step 1. (필수, 사람 손) KakaoTalk Mac 앱 설치 + 로그인

자동화 불가. 사용자에게 안내:

1. Mac App Store에서 "카카오톡" 검색해서 설치 (또는 https://www.kakaocorp.com 에서 다운로드)
2. 앱 실행 → 자기 카카오 계정으로 로그인
3. 첫 로그인 시 본인 휴대폰으로 인증번호 푸시가 갈 수 있음 → 직접 입력
4. **로그인 완료까지 진행**한 뒤 다음 단계로

> 처음 한 번만. 다음부턴 자동 로그인 가능.

---

## Step 2. (자동) uv 설치

```bash
if [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
```

확인: `$HOME/.local/bin/uv --version`

> ⚠️ **PATH 주입 주의**: 일부 uv 버전(0.11+)은 `$HOME/.local/bin/env` 파일을 생성하지 않음.
> 그래서 `source $HOME/.local/bin/env`가 No such file 에러를 낼 수 있다.
> 대신 다음을 사용:
> ```bash
> export PATH="$HOME/.local/bin:$PATH"
> ```
> 또는 이후 명령에서 uv를 `$HOME/.local/bin/uv ...` 풀 경로로 직접 호출.

---

## Step 3. (자동) plugins-for-claude-natives 클론

team-attention 팀의 카카오톡 자동화 플러그인. 본 스킬이 이걸 래핑함.

```bash
if [ ! -d "$HOME/github/plugins-for-claude-natives" ]; then
  mkdir -p "$HOME/github"
  cd "$HOME/github"
  git clone https://github.com/team-attention/plugins-for-claude-natives.git
fi
ls "$HOME/github/plugins-for-claude-natives/plugins/kakaotalk/scripts/"
```

확인: `kakao_read.py`, `kakao_send.py` 등이 보여야 함.

---

## Step 4. (사람 손) 접근성 권한 부여

`atomacos`가 카카오톡 UI에 접근하려면 macOS 접근성 권한 필요. 자동화 불가, 사용자 수동 조작.

### 자동 점검

```bash
export PATH="$HOME/.local/bin:$PATH"
uv run --with atomacos --python 3.12 python -c "
import atomacos
app = atomacos.getAppRefByBundleId('com.kakao.KakaoTalkMac')
try:
    print('OK' if app.windows() else 'NO_WINDOW')
except Exception as e:
    print('PERM_NEEDED:', e)
"
```

결과별 처치:

| 출력 | 의미 | 처치 |
|---|---|---|
| `OK` | 접근성 권한 + 카톡 창 모두 정상 | Step 5로 |
| `NO_WINDOW` | **권한은 OK인데 카톡 주창이 최소화/Dock에 들어가 있음** | 카톡 주창을 띄워야 함 (아래 NO_WINDOW 처치) |
| `PERM_NEEDED: ...` | macOS 접근성 권한 없음 | 사용자 수동 토글 (아래 PERM_NEEDED 처치) |
| 다른 에러 | atomacos 설치 안 됐거나 카톡 안 떠있음 | 메시지 따라 처치 |

### NO_WINDOW 처치 (자동)

카톡 주창을 띄워서 atomacos가 보이게 만든다.

```bash
osascript -e 'tell application "KakaoTalk" to activate'
sleep 0.5
osascript -e 'tell application "System Events" to tell process "KakaoTalk" to key code 18 using {command down}'  # Cmd+1 = 친구 탭 (주창 등장)
sleep 0.7
# 재점검
export PATH="$HOME/.local/bin:$PATH"
uv run --with atomacos --python 3.12 python -c "
import atomacos
app = atomacos.getAppRefByBundleId('com.kakao.KakaoTalkMac')
print('OK' if app.windows() else 'STILL_NO_WINDOW')
"
```

`OK` 나오면 Step 5로. `STILL_NO_WINDOW`면 사용자에게 "카톡 창을 한 번 클릭해서 띄워주세요" 안내 후 재점검.

### PERM_NEEDED 처치

### 사용자에게 안내

```bash
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
```

말로 안내:
> "시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용 (접근성)에서, 지금 사용 중인 터미널 앱(또는 Claude Code, Cursor 등)을 추가하고 토글을 켜주세요. 추가/토글 후 다시 명령을 실행하면 작동합니다."

→ 사용자 확인 후 위 자동 점검 재실행.

---

## Step 5. (사람 손 + 자동) `.env` 자격증명 설정

자동 로그인 + 일부 안전 가드(KAKAO_SELF_NAME)에 사용. 사용자가 직접 입력.

### 5.1 디렉토리 + 파일 보장

```bash
mkdir -p "$HOME/Documents/github_cloud/module_api_key"
ENV_FILE="$HOME/Documents/github_cloud/module_api_key/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
```

### 5.2 사용자에게 안내 (수동 입력 필요)

사용자에게 다음 항목을 묻고 `.env`에 추가:

| 키 | 설명 | 예시 |
|---|---|---|
| `KAKAO_ID` | 카카오 로그인 ID (전화번호 또는 이메일) | `01012345678` |
| `KAKAO_PW` | 카카오 비밀번호 | `MyPass!2026` |
| `KAKAO_SELF_NAME` | 본인 카톡 표시명 (보낼 때 self-chat 식별용) | `홍길동` |

```bash
# 예시 추가 (사용자 입력값으로 교체)
cat >> "$HOME/Documents/github_cloud/module_api_key/.env" <<EOF

# kakao_manager
KAKAO_ID=
KAKAO_PW=
KAKAO_SELF_NAME=
EOF
```

→ 사용자가 값 채우면 OK. 채워졌는지 확인:

```bash
set -a; source "$HOME/Documents/github_cloud/module_api_key/.env"; set +a
[ -n "$KAKAO_ID" ] && [ -n "$KAKAO_PW" ] && echo "✓ 자격증명 설정 완료" || echo "❌ 값 비어있음 — 사용자에게 다시 확인"
```

---

## Step 6. (검증) 카톡 채팅 탭 활성화 + 채팅방 목록 1회 조회

여기까지 통과하면 송신/수신 기능이 작동 가능한 상태.

```bash
# 카톡 활성 + 채팅 탭 전환
osascript -e 'tell application "KakaoTalk" to activate'
sleep 1
osascript -e 'tell application "System Events" to tell process "KakaoTalk" to key code 19 using {command down}'  # Cmd+2 = 채팅 탭
sleep 1

# 채팅방 목록 5개만 가져오기
source $HOME/.local/bin/env && cd $HOME/github/plugins-for-claude-natives/plugins/kakaotalk/scripts && \
  uv run --with atomacos --python 3.12 python kakao_read.py --list --limit 5 --json
```

- JSON 목록 나오면 ✅ 통과
- 빈 배열이면 → 채팅 탭에 활성 채팅방이 없거나 권한 문제. Step 4 재확인
- 에러 나면 → atomacos import 오류 등. 메시지 따라 처치

---

## Step 7. (옵션) 보낼 대상 검색 테스트 (송신은 X)

```bash
TARGET="홍길동"   # 사용자가 보낼 사람 이름 (실제 카톡 친구 표시명)
source $HOME/.local/bin/env && cd $HOME/github/plugins-for-claude-natives/plugins/kakaotalk/scripts && \
  uv run --with atomacos --python 3.12 python kakao_read.py --search "$TARGET" --json
```

후보 JSON 1개 이상 나오면 송신 준비 완료. 0개면:
- 친구로 등록 안 됐을 수 있음 → 카톡 앱에서 친구 추가 먼저
- 표시명이 다를 수 있음 → `--list`로 전체 목록 보고 정확 표시명 확인

---

## 셋업 완료 ✅

이 시점부터:
- `/kakao_manager` 또는 자연어("X에게 카톡 보내줘", "단톡방 요약해줘") 호출 가능
- `~/.claude/skills/kakao_manager/scripts/send_safe.py`로 가드 강화 송신
- 본 스킬의 SKILL.md 7번 "표준 운영 절차" 참고

---

## 트러블슈팅 빠른 표

| 증상 | 처치 |
|---|---|
| `--list` 결과 0개 | Cmd+2로 채팅 탭 활성 후 재시도 |
| `PERM_NEEDED` / `ValueError` | Step 4 접근성 권한 다시 |
| 자동 로그인 텍스트필드 못 찾음 | 카톡 창이 로그인 상태인지 사람 눈으로 확인. 이미 로그인돼 있으면 자동 로그인 시퀀스 skip |
| 송신 후 메시지 안 들어감 | `send_safe.py --verify-me`로 self-chat 식별 가드 확인. 동명이인 충돌 가능 |
| iCloud `.env`에 EDEADLK | `brctl download "$ENV_FILE"` 후 재시도 |
