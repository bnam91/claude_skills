#!/bin/bash
# 매일 23:58 launchd 발동 → 네이버재고 백업/자가치유 (2026-07-29 신설, 쿠팡 backup_self_healing.sh 이식)
# 배경: 네이버는 23:53 tmux 디스패치 지시문 하나뿐 = 세션 없으면 exit1, 백업·재시도·자가치유 전무(5일 공백 사고).
# ★핵심(현빈/srv 지시): "에이전트 비의존 직접 실행 경로" — wrapper가 node stock_api.js를 ★직접 실행한다.
#   정상 99%는 claude/세션 없이 이 wrapper가 끝낸다. 실패(1%)일 때만 claude CLI를 깨워 R2 재로그인 사다리로 자가복구.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
LOG_DIR="$HOME/claude_skills/coupang_stock/launchd_logs"
LOG="$LOG_DIR/naver_backup_$(date +%Y-%m-%d).log"
mkdir -p "$LOG_DIR"
NAVER_DIR="$HOME/github/naver_sell"
CONFIG_SHEET="1JbF5GASqvX7ImJj8epmAmwFDhg1TG7kKHKickIJz74o"
TG_ENV="$HOME/.claude/channels/telegram/.env"
CHAT_ID="6942656480"
NOTES="$HOME/.claude/skills/김민재/notes/imac.md"
TODAY=$(date +%Y-%m-%d)
log(){ echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
send_tg(){
  local tok; tok=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$TG_ENV" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'"' | xargs)
  [ -z "$tok" ] && return 1
  curl -s -o /dev/null -X POST "https://api.telegram.org/bot${tok}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" --data-urlencode "text=$1"
}

log "▶ naver_backup_self_healing 시작"

# 0) active 계정 조회 (config시트 active=TRUE)
ACTIVE=$(cd "$HOME/claude_skills/sheet_manager" && python3 -c "
import socket; _g=socket.getaddrinfo; socket.getaddrinfo=lambda *a,**k:[x for x in _g(*a,**k) if x[0]==socket.AF_INET]
import sheet_manager as SM
for r in SM.read('$CONFIG_SHEET','config')[1:]:
    if len(r)>=2 and r[0].strip().upper()=='TRUE': print(r[1].strip()); break
" 2>/dev/null | tail -1)
[ -z "$ACTIVE" ] && { log "❌ active 계정 조회 실패"; send_tg "⚠️ 네이버 백업 실패 — config active 계정 조회 불가"; exit 1; }
log "active 계정: $ACTIVE"

# 1) ★멱등 가드 — 23:53 정규분이 이미 오늘 기록했으면 백업 불필요(중복열 방지).
# __SHEETGUARD_PATCH_20260729__ ★판정을 notes→★시트 실물로 교체 (srv-김민재)
#   기존: notes 의 "### <오늘> 네이버재고 … 성공" ★한 줄로 판정.
#   문제: 2026-07-24·25 는 launchd 발화도 에이전트 실행도 됐지만 ★시트 기록은 실패했다.
#         그런 날 에이전트가 노트에 성공표식만 남기면 백업이 ★스킵된다 — 백업이 있어야 할
#         바로 그날 안 도는 것이다(가드가 사고를 덮는다).
#   → check_stock_col.js 로 ★시트 슬롯 열을 직접 읽어 개수(418)까지 확인해서 판정한다.
#     OK  = 진짜 기록됨 → 스킵 / MISSING·SHORT = 미기록·부분기록 → ★백업 진행
#     ERR(검사 자체 실패) = 판정 불가 → ★보수적으로 백업 진행(쿠팡 backup_guard 와 동일 원칙)
STOCKCHK="$HOME/.claude/skills/김민재/scripts/check_stock_col.js"
GUARD_OUT=""
if [ -f "$STOCKCHK" ]; then
  GUARD_OUT=$(cd "$NAVER_DIR" && /usr/local/bin/node "$STOCKCHK" "$TODAY" 2>/dev/null | tail -1)
fi
case "$GUARD_OUT" in
  OK*)
    log "⏭️ 오늘 네이버재고 ★시트 확인됨 → 백업 스킵 ($GUARD_OUT)"; exit 0 ;;
  MISSING*|SHORT*)
    log "오늘 ★시트 미기록/부분기록 판정 → 백업 직접 실행 ($GUARD_OUT)" ;;
  *)
    # 검사기 부재·인증실패 등 → 판정 불가. 덮지 말고 백업 진행(보수적).
    log "시트 판정 불가(${GUARD_OUT:-검사기 없음}) → 보수적으로 백업 진행" ;;
esac

# 2) ★에이전트 비의존 직접 실행 (perl alarm 300 = hang 안전망; 600→300 단축 2026-08-06: hang을 10분→5분에 감지, 8시간 방치 방지)
RUNOUT=$(mktemp)
( cd "$NAVER_DIR" && /usr/bin/perl -e "alarm shift; exec @ARGV" 300 node stock_api.js "naver_$ACTIVE" ) 2>&1 | tee "$RUNOUT" >> "$LOG"
PRC=${PIPESTATUS[0]}
# ★hang 감지: perl alarm 타임아웃은 SIGALRM(14)→exit 142. 명시 로깅해 실패로 즉시 판정(RECOVER/알림에 hang 원인 드러남).
if [ "$PRC" = "142" ] || grep -qiE "Alarm clock" "$RUNOUT"; then
  log "★perl 300초 타임아웃(hang) — stock_api.js 300s 무응답. 실패로 처리(exit $PRC)."
  echo "[백업] perl 300s 타임아웃 hang (exit $PRC)" >> "$RUNOUT"
  # ★고아 정리(2026-08-06, srv kill_tree 방식): perl alarm은 부모(perl)만 죽여 node/크롬 자식이 고아로 남아 다음 슬롯 프로필을 오염시킨다(08-05 교훈). 이 계정 stock_api 트리 전체 KILL.
  for op in $(pgrep -f "node stock_api.js naver_$ACTIVE" 2>/dev/null); do
    for ch in $(pgrep -P "$op" 2>/dev/null); do kill -KILL "$ch" 2>/dev/null; done
    kill -KILL "$op" 2>/dev/null
  done
  log "고아 정리 완료(node stock_api.js naver_$ACTIVE 트리 + 자식)"
fi

# 3) 성공 판정 (총 N개 옵션 조회 완료 & X열 기록)
if grep -qE "옵션 조회 완료" "$RUNOUT" && grep -qE "열에 [0-9]+개 기록|열에.*기록" "$RUNOUT"; then
  N=$(grep -oE "총 [0-9]+개" "$RUNOUT" | grep -oE "[0-9]+" | tail -1)
  COL=$(grep -oE "[A-Z]+열" "$RUNOUT" | tail -1)
  log "✅ 백업 성공 — ${COL} 총 ${N:-?}옵션"
  send_tg "✅ 네이버 재고 백업 성공 ($TODAY · $ACTIVE) — ${COL} 총 ${N:-?}옵션"
  printf '\n### %s 네이버재고(23:58백업) ✅성공 %s %s옵션 (직접실행 자가복구)\n' "$TODAY" "$COL" "${N:-?}" >> "$NOTES"
  rm -f "$RUNOUT"; exit 0
fi

# 4) ★실패 → claude CLI 깨워 R2 재로그인 사다리로 자가복구 (에이전트는 실패 케이스에서만 개입)
FAILTAIL=$(tail -4 "$RUNOUT" | tr '\n' ' ')
log "❌ 직접 실행 실패 → claude 자가복구 위임. 로그끝: $FAILTAIL"
rm -f "$RUNOUT"
SESSION="imac-김민재"; TMUX=/usr/local/bin/tmux
RECOVER="[네이버재고 백업 자가복구 · 23:58] 23:53 정규분 실패로 백업도 직접실행했으나 실패($FAILTAIL). config active=$ACTIVE. ★R2 재로그인 사다리로 복구하라(naver_2353_dispatch.sh 지시문 절차와 동일): NID_AUT부재+cart리다이렉트로 만료판정 → 프로필크롬 로그인(로그인상태유지 ON, 캡차/SMS 자동, 앱푸시만 현빈호출, 재시도2회) → stock 재실행. 성공/실패 모두 현빈 텔레그램+notes 1줄. 무인=질문금지."
if LC_ALL=ko_KR.UTF-8 env -u TMUX "$TMUX" has-session -t "$SESSION" 2>/dev/null; then
  printf '%s' "$RECOVER" > /tmp/naver_recover_msg.txt
  LC_ALL=ko_KR.UTF-8 env -u TMUX "$TMUX" load-buffer -b nvrec /tmp/naver_recover_msg.txt
  LC_ALL=ko_KR.UTF-8 env -u TMUX "$TMUX" paste-buffer -b nvrec -t "$SESSION"
  LC_ALL=ko_KR.UTF-8 env -u TMUX "$TMUX" delete-buffer -b nvrec 2>/dev/null
  sleep 1; LC_ALL=ko_KR.UTF-8 env -u TMUX "$TMUX" send-keys -t "$SESSION" Enter
  log "→ claude 세션에 R2 자가복구 위임 완료"
else
  # 세션도 없으면 경보만(claude 없이 bash가 재로그인은 못 함 = R3 사람개입 신호)
  send_tg "⚠️ 네이버 재고 백업 실패 — $ACTIVE 직접실행 실패 + imac-김민재 세션 부재. 로그: $FAILTAIL"
  log "세션 부재 → 텔레그램 경보만"
fi
# ★실패 경로는 비0 종료(2026-08-06 srv): 직접실행 실패를 모니터링이 exit코드로 신뢰(위임/경보했어도 백업의 직접실행 자체는 실패 = launchctl list 거짓성공 방지).
exit 1
