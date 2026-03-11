#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
task_timer.py — rich-agent 작업 타이머 v2
새 시트 구조: A:시작 B:예상종료 C:실제종료 D:한 일 E:상태 F:소요 G:코멘트(효율/우선순위 평가) H:평가

사용법:
  시작: python3 task_timer.py start "작업명" [알람간격분=15]
        → 시트에 시작시간/작업명/예상종료/예상소요 자동 기록
  종료: python3 task_timer.py done 행번호 "한 일" ["메모"]
        → 종료시간 + 소요시간 자동 계산 기록
  확인: python3 task_timer.py status
"""

import sys
import os
import time
import subprocess
import json
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path.home() / 'Documents/github_cloud/module_auth'))


# ── GPT-4o mini 메시지 생성 (종료 이후 이벤트만) ──────────
def generate_message_gpt(event, task_name, elapsed_str='', interval_min=15):
    """GPT-4o mini로 알림 메시지 동적 생성. end/renag 전용. 실패 시 기본 메시지 반환."""
    import urllib.request

    fallbacks = {
        'end':   f'{elapsed_str} 지났어. 다했으면 말해줘!',
        'renag': f'아직 미기록 — {elapsed_str} 경과. 다했으면 말해줘!',
    }

    # 환경변수 우선, 없으면 .env 파일에서 로드
    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        env_path = Path.home() / 'Documents/github_cloud/module_api_key/.env'
        try:
            for line in env_path.read_text().splitlines():
                if line.startswith('OPENAI_API_KEY='):
                    api_key = line.split('=', 1)[1].strip()
                    break
        except Exception:
            pass
    if not api_key:
        return fallbacks.get(event, '타이머 알림')

    ctx = {
        'end':   f'작업 "{task_name}" 예상 {interval_min}분 지났는데 아직 완료 미기록.',
        'renag': f'작업 "{task_name}" {elapsed_str} 경과. 계속 미기록 상태.',
    }

    prompt = (
        f"맥OS 알림 메시지를 한국어로 1문장(30자 이내)으로 만들어줘. "
        f"상황: {ctx.get(event, '')} "
        f"톤: 간결하고 직접적. 느슨해지지 않게 긴장감 유지. "
        f"메시지만 출력해. 따옴표 없이."
    )

    try:
        payload = json.dumps({
            'model': 'gpt-4o-mini',
            'max_tokens': 60,
            'messages': [{'role': 'user', 'content': prompt}]
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/chat/completions',
            data=payload,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }
        )
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result['choices'][0]['message']['content'].strip()
    except Exception:
        return fallbacks.get(event, '타이머 알림')

SHEET_ID = '1SHWP0U72-bTzK__nnTnmB3UOqCbWDG__E7WwN-l22J0'
PID_FILE  = '/tmp/task_timer.pid'
META_FILE = '/tmp/task_timer_meta.json'
POLL_SEC      = 30   # 시트 폴링 간격
RENAG_SEC     = 300  # 초기 알림 이후 재알림 간격 (5분)
PRE_WARN_SEC  = 300  # 종료 예정 X초 전 사전 알림 (5분 전)

# 하루 시작 기준 시간 (이 시간 이전은 전날로 간주)
# 새벽 6시 이전은 전날 탭에 기록
DAY_START_HOUR = 6

def get_tab(ts=None):
    """타임스탬프 기준 탭 날짜 반환. 새벽 DAY_START_HOUR 이전은 전날로 처리."""
    from datetime import timedelta
    dt = datetime.fromtimestamp(ts) if ts else datetime.now()
    if dt.hour < DAY_START_HOUR:
        dt = dt - timedelta(days=1)
    return dt.strftime('%Y-%m-%d')


# ── 알림 ────────────────────────────────────────────────
def notify(title, message, sound='Glass'):
    subprocess.run([
        'osascript', '-e',
        f'display notification "{message}" with title "{title}" sound name "{sound}"'
    ], capture_output=True)


# ── 시트 연동 ────────────────────────────────────────────
def get_sheets():
    from auth import get_credentials
    from googleapiclient.discovery import build
    creds = get_credentials()
    return build('sheets', 'v4', credentials=creds)


HEADER = ['시작', '예상종료', '실제종료', '한 일', '상태', '소요', '코멘트', '평가']

def ensure_tab(sheets, tab):
    meta = sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
    existing = [s['properties']['title'] for s in meta.get('sheets', [])]
    if tab not in existing:
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={'requests': [{'addSheet': {'properties': {'title': tab}}}]}
        ).execute()
        # 새 탭 생성 시 헤더 자동 입력
        sheets.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f'{tab}!A1',
            valueInputOption='USER_ENTERED',
            body={'values': [HEADER]}
        ).execute()
        # D열(index 3), G열(index 6) 너비 400 설정
        new_sheet_id = next(
            s['properties']['sheetId']
            for s in sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()['sheets']
            if s['properties']['title'] == tab
        )
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={'requests': [
                {'updateDimensionProperties': {
                    'range': {'sheetId': new_sheet_id, 'dimension': 'COLUMNS', 'startIndex': 3, 'endIndex': 4},
                    'properties': {'pixelSize': 400}, 'fields': 'pixelSize'
                }},
                {'updateDimensionProperties': {
                    'range': {'sheetId': new_sheet_id, 'dimension': 'COLUMNS', 'startIndex': 6, 'endIndex': 7},
                    'properties': {'pixelSize': 400}, 'fields': 'pixelSize'
                }}
            ]}
        ).execute()


def sheet_add_start(start_time, tab, task_name='', interval_min=15):
    """A:시작 B:예상종료 C:작업명 D:예상소요 기록 → 행 번호 반환"""
    try:
        from datetime import timedelta
        s = get_sheets()
        ensure_tab(s, tab)
        result = s.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=f'{tab}!A:A'
        ).execute()
        next_row = len(result.get('values', [])) + 1

        start_dt = datetime.strptime(start_time, '%H:%M')
        expected_end = (start_dt + timedelta(minutes=interval_min)).strftime('%H:%M')
        expected_soyo = f'{interval_min}분' if interval_min < 60 else f'{interval_min // 60}시간 {interval_min % 60}분'.replace(' 0분', '')

        s.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f'{tab}!A{next_row}',
            valueInputOption='USER_ENTERED',
            body={'values': [[start_time, expected_end, '', task_name, '진행중', expected_soyo]]}
        ).execute()
        return next_row
    except Exception as e:
        print(f'[시트 오류] {e}')
        return None


def sheet_get_last_end(tab):
    """마지막 행의 종료시간(B열) 반환. 없으면 None"""
    try:
        s = get_sheets()
        result = s.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=f'{tab}!A:B'
        ).execute()
        rows = result.get('values', [])
        # 헤더(1행) 제외, 역순으로 B열 값 찾기
        for row in reversed(rows[1:]):
            if len(row) >= 2 and row[1].strip():
                return row[1].strip()
        return None
    except Exception:
        return None


def sheet_check_done(row_num, tab):
    """E열(상태)가 '완료'면 True"""
    try:
        s = get_sheets()
        result = s.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=f'{tab}!E{row_num}'
        ).execute()
        values = result.get('values', [])
        return bool(values and values[0] and values[0][0].strip() == '완료')
    except Exception:
        return False


def sheet_check_overtime(row_num, tab):
    """B열(예상종료) 지났고 C열(실제종료) 비어있으면 True. 초과 분도 반환."""
    try:
        s = get_sheets()
        result = s.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=f'{tab}!B{row_num}:C{row_num}'
        ).execute()
        values = result.get('values', [])
        if not values or not values[0]:
            return False, 0
        row = values[0]
        expected_end_str = row[0].strip() if len(row) > 0 else ''
        actual_end_str   = row[1].strip() if len(row) > 1 else ''
        if not expected_end_str or actual_end_str:
            return False, 0
        now = datetime.now()
        expected_dt = datetime.strptime(expected_end_str, '%H:%M').replace(
            year=now.year, month=now.month, day=now.day
        )
        over_sec = (now - expected_dt).total_seconds()
        return over_sec > 0, int(over_sec // 60)
    except Exception:
        return False, 0


def sheet_mark_done(row_num, end_time, han_il, status, soyo, memo, tab, eval_text=''):
    """C:실제종료 D:한 일 E:상태 F:소요 G:코멘트 H:평가 기록"""
    try:
        s = get_sheets()
        s.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f'{tab}!C{row_num}:H{row_num}',
            valueInputOption='USER_ENTERED',
            body={'values': [[end_time, han_il, status, soyo, memo, eval_text]]}
        ).execute()
        return True
    except Exception as e:
        print(f'[시트 오류] {e}')
        return False


def sheet_write_eval(row_num, eval_text, tab):
    """H:평가 기록"""
    try:
        s = get_sheets()
        s.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f'{tab}!H{row_num}',
            valueInputOption='USER_ENTERED',
            body={'values': [[eval_text]]}
        ).execute()
        return True
    except Exception as e:
        print(f'[시트 오류] {e}')
        return False


# ── 메타 관리 ────────────────────────────────────────────
def save_meta(row_num, interval_min, start_ts, tab, task_name=''):
    with open(META_FILE, 'w') as f:
        json.dump({
            'row_num': row_num,
            'interval_min': interval_min,
            'start_ts': start_ts,
            'start_time': datetime.fromtimestamp(start_ts).strftime('%H:%M'),
            'tab': tab,
            'task_name': task_name,
            'pid': os.getpid()
        }, f, ensure_ascii=False)


def load_meta():
    try:
        with open(META_FILE) as f:
            return json.load(f)
    except Exception:
        return None


def clear_meta():
    for fp in [PID_FILE, META_FILE]:
        try:
            os.remove(fp)
        except Exception:
            pass


def calc_elapsed(start_ts):
    elapsed_sec = int(time.time() - start_ts)
    m, s = divmod(elapsed_sec, 60)
    h, m = divmod(m, 60)
    if h:
        return elapsed_sec, f'{h}시간 {m}분'
    elif m:
        return elapsed_sec, f'{m}분'
    else:
        return elapsed_sec, f'{s}초'


# ── 커맨드: start ────────────────────────────────────────
def cmd_start(task_name, interval_min):
    # ── 중복 실행 방지 ──────────────────────────────────────
    existing = load_meta()
    if existing:
        try:
            os.kill(existing['pid'], 0)
            print(f'[중복 방지] 이미 실행 중인 타이머 있음 — {existing["task_name"]} (PID={existing["pid"]}, {existing["row_num"]}행)')
            print(f'ALREADY_RUNNING=true')
            sys.exit(0)
        except (ProcessLookupError, OSError):
            pass  # 프로세스 죽어있으면 계속 진행

    start_ts = time.time()
    start_time = datetime.fromtimestamp(start_ts).strftime('%H:%M')
    tab = get_tab(start_ts)

    # 갭 감지: 마지막 종료시간 ~ 현재 사이 30분 이상 공백이면 알림
    last_end = sheet_get_last_end(tab)
    if last_end:
        try:
            last_end_dt = datetime.strptime(last_end, '%H:%M').replace(
                year=datetime.now().year, month=datetime.now().month, day=datetime.now().day
            )
            gap_sec = (datetime.now() - last_end_dt).total_seconds()
            if gap_sec >= 900:  # 15분 이상
                gap_m = int(gap_sec // 60)
                gap_h, gap_min = divmod(gap_m, 60)
                gap_str = f'{gap_h}시간 {gap_min}분' if gap_h else f'{gap_m}분'
                print(f'[GAP_DETECTED] {last_end} → {start_time} ({gap_str} 공백)')
        except Exception:
            pass

    row_num = sheet_add_start(start_time, tab, task_name, interval_min)
    if not row_num:
        print('[오류] 시트 기록 실패')
        sys.exit(1)

    # ── 시트 검수: 실제로 기록됐는지 확인 ──────────────────
    try:
        s = get_sheets()
        verify = s.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=f'{tab}!A{row_num}:D{row_num}'
        ).execute().get('values', [])
        if verify and verify[0] and verify[0][0] == start_time:
            print(f'[검수 OK] {tab} {row_num}행 확인 — {verify[0]}')
        else:
            print(f'[검수 경고] {row_num}행 내용 불일치 — {verify}')
    except Exception as e:
        print(f'[검수 오류] {e}')

    save_meta(row_num, interval_min, start_ts, tab, task_name)
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

    notify('rich-agent', f'▶ 타이머 시작 {start_time} — {interval_min}분 후 알림')
    print(f'[시작] {start_time} | {tab} {row_num}행 | {interval_min}분 후 알림 | PID={os.getpid()}')

    interval_sec = interval_min * 60
    elapsed_poll = 0
    half_warned  = False  # 절반 경과 알림 여부
    pre_warned5  = False  # 5분 전 알림 여부
    pre_warned2  = False  # 2분 전 알림 여부
    alerted      = False  # 최초 오버타임 알림 여부
    last_renag   = 0      # 마지막 재알림 시각 (unix ts)

    try:
        while True:
            time.sleep(POLL_SEC)
            elapsed_poll += POLL_SEC

            # 완료 감지 (E열 = '완료')
            if sheet_check_done(row_num, tab):
                notify('rich-agent', '✅ 종료시간 확인됨. 타이머 종료.')
                print('[완료 감지] 종료')
                break

            now = time.time()

            # 절반 경과 알림 (고정)
            if not half_warned and elapsed_poll >= interval_sec / 2:
                remaining_min = int((interval_sec - elapsed_poll) // 60)
                notify('rich-agent', f'🕐 절반 지났어! 약 {remaining_min}분 남았어.', sound='Tink')
                half_warned = True

            # 사전 알림 — 5분 전 (고정, 총 시간 10분 이상일 때만)
            elif not pre_warned5 and not alerted and interval_sec > 600 and (interval_sec - elapsed_poll) <= 300:
                notify('rich-agent', f'⏳ {task_name} — 5분 후 예상 종료. 마무리해줘!', sound='Tink')
                pre_warned5 = True

            # 사전 알림 — 2분 전 (고정, 총 시간 5분 이상일 때만)
            elif not pre_warned2 and not alerted and interval_sec > 300 and (interval_sec - elapsed_poll) <= 120:
                notify('rich-agent', f'⏳ {task_name} — 2분 후 예상 종료!', sound='Tink')
                pre_warned2 = True

            else:
                # 오버타임 감지: B열(예상종료) 지났고 C열(실제종료) 비어있으면
                is_over, over_min = sheet_check_overtime(row_num, tab)
                if is_over:
                    if not alerted:
                        # 최초 오버타임 알림 (GPT)
                        _, elapsed_str = calc_elapsed(start_ts)
                        msg = generate_message_gpt('end', task_name, elapsed_str=elapsed_str, interval_min=interval_min)
                        notify('rich-agent', f'⏰ {msg}', sound='Glass')
                        alerted = True
                        last_renag = now
                    elif (now - last_renag) >= RENAG_SEC:
                        # 재알림 — 5분마다 (GPT)
                        _, elapsed_str = calc_elapsed(start_ts)
                        msg = generate_message_gpt('renag', task_name, elapsed_str=elapsed_str, interval_min=interval_min)
                        notify('rich-agent', f'⏰ {msg} (+{over_min}분 초과)', sound='Basso')
                        last_renag = now

    except KeyboardInterrupt:
        notify('rich-agent', '⏹ 타이머 중지')
        print('[중지]')
    finally:
        clear_meta()


# ── 커맨드: done ─────────────────────────────────────────
def cmd_done(row_num, payload, status='완료'):
    """
    payload: JSON 문자열 또는 일반 문자열(한 일)
    JSON 형식: {"han_il":"...", "comment":"...", "eval":"..."}
    """
    meta = load_meta()
    end_time = datetime.now().strftime('%H:%M')

    if meta and meta.get('start_ts'):
        _, soyo = calc_elapsed(meta['start_ts'])
        tab = meta.get('tab', get_tab())
        start_time = meta.get('start_time', '')
    else:
        soyo = '알 수 없음'
        tab = get_tab()
        start_time = ''

    # JSON 파싱 시도
    try:
        data = json.loads(payload)
        han_il    = data.get('han_il', '')
        memo      = data.get('comment', '')
        eval_text = data.get('eval', '')
        status    = data.get('status', status)
    except (json.JSONDecodeError, TypeError):
        han_il    = payload
        memo      = ''
        eval_text = ''

    ok = sheet_mark_done(row_num, end_time, han_il, status, soyo, memo, tab, eval_text)
    if ok:
        print(f'[완료] {tab} {row_num}행 | {start_time}→{end_time} | 소요: {soyo}')
        print(f'TAB={tab}')
        print(f'ROW={row_num}')
        print(f'SOYO={soyo}')
        print(f'HAN_IL={han_il}')
        if memo:      print(f'COMMENT={memo}')
        if eval_text: print(f'EVAL={eval_text}')
    else:
        print('[오류] 시트 업데이트 실패')


# ── 커맨드: eval ─────────────────────────────────────────
def cmd_eval(row_num, eval_text, tab=None):
    if not tab:
        tab = get_tab()
    ok = sheet_write_eval(row_num, eval_text, tab)
    if ok:
        print(f'[평가] {tab} {row_num}행 F열 기록 완료')
    else:
        print('[오류] 평가 기록 실패')


# ── 커맨드: status ───────────────────────────────────────
def cmd_status():
    meta = load_meta()
    if not meta:
        print('TIMER_RUNNING=false')
        print('[타이머] 실행 중인 타이머 없음')
        return

    try:
        pid = meta.get('pid')
        os.kill(pid, 0)
        alive = True
    except Exception:
        alive = False

    _, elapsed_str = calc_elapsed(meta.get('start_ts', time.time()))
    status = '실행 중' if alive else '종료됨'

    print(f"TIMER_RUNNING={'true' if alive else 'false'}")
    print(f"ROW_NUM={meta.get('row_num')}")
    print(f"TAB={meta.get('tab')}")
    print(f"ELAPSED={elapsed_str}")
    print(f"INTERVAL_MIN={meta.get('interval_min')}")
    print(f"START_TIME={meta.get('start_time')}")
    print(f"PID={pid}")
    print()
    print(f'[{status}] {meta.get("tab")} {meta.get("row_num")}행 | '
          f'시작: {meta.get("start_time")} | 경과: {elapsed_str}')


# ── 진입점 ──────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'start':
        if len(sys.argv) < 3:
            print('사용법: python3 task_timer.py start "작업명" [알람간격분=15]')
            sys.exit(1)
        task_name    = sys.argv[2]
        interval_min = int(sys.argv[3]) if len(sys.argv) > 3 else 15
        cmd_start(task_name, interval_min)

    elif cmd == 'done':
        if len(sys.argv) < 4:
            print('사용법: python3 task_timer.py done 행번호 \'{"han_il":"...", "comment":"...", "eval":"..."}\'')
            sys.exit(1)
        row_num = int(sys.argv[2])
        payload = sys.argv[3]
        status  = sys.argv[4] if len(sys.argv) > 4 else '완료'
        cmd_done(row_num, payload, status)

    elif cmd == 'eval':
        if len(sys.argv) < 4:
            print('사용법: python3 task_timer.py eval 행번호 "평가" [탭날짜]')
            sys.exit(1)
        row_num   = int(sys.argv[2])
        eval_text = sys.argv[3]
        tab       = sys.argv[4] if len(sys.argv) > 4 else None
        cmd_eval(row_num, eval_text, tab)

    elif cmd == 'status':
        cmd_status()

    else:
        print(f'알 수 없는 커맨드: {cmd}')
        sys.exit(1)


if __name__ == '__main__':
    main()
