#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
task_timer.py — 백그라운드 작업 리마인더
시트 E열(완료시간) 폴링 → 채워지면 자동 종료

컬럼: A:날짜 B:시작시간 C:작업 D:상태 E:완료시간 F:소요시간 G:코멘트

사용법:
  시작: python3 task_timer.py start "작업명" 행번호 [알람간격분=5]
  종료: python3 task_timer.py done  행번호 "코멘트"
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

SHEET_ID = '1SHWP0U72-bTzK__nnTnmB3UOqCbWDG__E7WwN-l22J0'
PID_FILE = '/tmp/task_timer.pid'
META_FILE = '/tmp/task_timer_meta.json'
POLL_SEC = 60  # 시트 폴링 간격 (초)


# ── 알림 ──────────────────────────────────────────────
def notify(title, message, sound='Glass'):
    subprocess.run([
        'osascript', '-e',
        f'display notification "{message}" with title "{title}" sound name "{sound}"'
    ], capture_output=True)


# ── 시트 연동 ──────────────────────────────────────────
def get_today_tab():
    return datetime.now().strftime('%Y-%m-%d')


def get_sheets():
    from auth import get_credentials
    from googleapiclient.discovery import build
    creds = get_credentials()
    return build('sheets', 'v4', credentials=creds)


def ensure_tab(sheets, tab_name):
    """탭이 없으면 생성"""
    meta = sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
    existing = [s['properties']['title'] for s in meta.get('sheets', [])]
    if tab_name not in existing:
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={'requests': [{'addSheet': {'properties': {'title': tab_name}}}]}
        ).execute()
        print(f'[시트] 탭 생성: {tab_name}')


def sheet_check_done(row_num):
    """E열(완료시간) 채워져 있으면 True"""
    try:
        tab = get_today_tab()
        sheets = get_sheets()
        result = sheets.spreadsheets().values().get(
            spreadsheetId=SHEET_ID,
            range=f'{tab}!E{row_num}'
        ).execute()
        values = result.get('values', [])
        return bool(values and values[0] and values[0][0].strip())
    except Exception as e:
        print(f'[시트 오류] {e}')
        return False


def sheet_mark_done(row_num, done_time, elapsed_str, comment=''):
    """D:완료 E:완료시간 F:소요시간 G:코멘트 입력"""
    try:
        tab = get_today_tab()
        sheets = get_sheets()
        sheets.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f'{tab}!D{row_num}:G{row_num}',
            valueInputOption='USER_ENTERED',
            body={'values': [['완료', done_time, elapsed_str, comment]]}
        ).execute()
        return True
    except Exception as e:
        print(f'[시트 오류] {e}')
        return False


def sheet_add_task(task_name):
    """오늘 탭에 작업 추가 → 행 번호 반환"""
    try:
        tab = get_today_tab()
        sheets = get_sheets()
        ensure_tab(sheets, tab)
        result = sheets.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=f'{tab}!A:A'
        ).execute()
        next_row = len(result.get('values', [])) + 1
        now = datetime.now()
        sheets.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f'{tab}!A{next_row}',
            valueInputOption='USER_ENTERED',
            body={'values': [[
                now.strftime('%Y-%m-%d'),
                now.strftime('%H:%M'),
                task_name,
                '진행중',
                '', '', ''
            ]]}
        ).execute()
        return next_row
    except Exception as e:
        print(f'[시트 오류] {e}')
        return None


# ── PID / 메타 관리 ────────────────────────────────────
def save_meta(task_name, row_num, interval_min, start_ts):
    with open(META_FILE, 'w') as f:
        json.dump({
            'task_name': task_name,
            'row_num': row_num,
            'interval_min': interval_min,
            'start_ts': start_ts,
            'start_time': datetime.fromtimestamp(start_ts).strftime('%H:%M'),
            'pid': os.getpid()
        }, f, ensure_ascii=False)


def load_meta():
    try:
        with open(META_FILE) as f:
            return json.load(f)
    except Exception:
        return None


def calc_elapsed(start_ts):
    """경과 시간 → (총 초, 표시 문자열)"""
    elapsed_sec = int(time.time() - start_ts)
    m, s = divmod(elapsed_sec, 60)
    h, m = divmod(m, 60)
    if h:
        return elapsed_sec, f'{h}시간 {m}분 {s}초'
    elif m:
        return elapsed_sec, f'{m}분 {s}초'
    else:
        return elapsed_sec, f'{s}초'


# ── 커맨드: start ──────────────────────────────────────
def cmd_start(task_name, row_num, interval_min):
    start_ts = time.time()
    save_meta(task_name, row_num, interval_min, start_ts)

    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

    notify('task-timer', f'▶ {task_name} 시작 — {interval_min}분마다 알림')
    print(f'[타이머 시작] {task_name} | {row_num}행 | {interval_min}분 간격 | PID={os.getpid()}')

    elapsed_poll = 0

    try:
        while True:
            time.sleep(POLL_SEC)
            elapsed_poll += POLL_SEC

            # 시트 완료 여부 확인 (E열 채워졌는지)
            if sheet_check_done(row_num):
                notify('task-timer', f'✅ {task_name} — 완료 감지, 타이머 종료')
                print('[완료 감지] 종료')
                break

            # 알람 간격마다 리마인드
            elapsed_min = elapsed_poll // 60
            if elapsed_poll % (interval_min * 60) == 0:
                notify('task-timer', f'⏰ {task_name} — {elapsed_min}분 경과. 완료됐으면 말해줘!')

    except KeyboardInterrupt:
        notify('task-timer', f'⏹ {task_name} 타이머 중지')
        print('[중지]')

    finally:
        for fp in [PID_FILE, META_FILE]:
            try:
                os.remove(fp)
            except Exception:
                pass


# ── 커맨드: done ───────────────────────────────────────
def cmd_done(row_num, comment=''):
    """완료 처리: E=완료시간, F=소요시간, G=코멘트"""
    meta = load_meta()
    done_time = datetime.now().strftime('%H:%M')

    if meta and meta.get('start_ts'):
        elapsed_sec, elapsed_str = calc_elapsed(meta['start_ts'])
        task_name = meta.get('task_name', '')
        interval_min = meta.get('interval_min', 5)
    else:
        elapsed_str = '알 수 없음'
        task_name = ''

    ok = sheet_mark_done(row_num, done_time, elapsed_str, comment)
    if ok:
        print(f'[완료] {row_num}행 | 완료: {done_time} | 소요: {elapsed_str}')
        if comment:
            print(f'[코멘트] {comment}')
        print('[타이머] 다음 폴링(최대 1분)에 자동 종료')
    else:
        print('[오류] 시트 업데이트 실패')

    # stdout으로 elapsed 정보 출력 (Claude가 읽어서 코멘트 생성용)
    print(f'ELAPSED_SEC={elapsed_sec if meta else 0}')
    print(f'TASK_NAME={task_name}')


# ── 커맨드: status ─────────────────────────────────────
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

    elapsed_sec, elapsed_str = calc_elapsed(meta.get('start_ts', time.time()))

    print(f"TIMER_RUNNING={'true' if alive else 'false'}")
    print(f"TASK_NAME={meta.get('task_name')}")
    print(f"ROW_NUM={meta.get('row_num')}")
    print(f"ELAPSED={elapsed_str}")
    print(f"ELAPSED_SEC={elapsed_sec}")
    print(f"INTERVAL_MIN={meta.get('interval_min')}")
    print(f"START_TIME={meta.get('start_time')}")
    print(f"PID={pid}")
    print()
    status = '실행 중' if alive else '종료됨'
    print(f'[{status}] {meta.get("task_name")} | {meta.get("row_num")}행 | '
          f'경과: {elapsed_str} | {meta.get("interval_min")}분 간격')


# ── 진입점 ────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'start':
        if len(sys.argv) < 4:
            print('사용법: python3 task_timer.py start "작업명" 행번호 [알람간격분=5]')
            sys.exit(1)
        task_name = sys.argv[2]
        row_num = int(sys.argv[3])
        interval_min = int(sys.argv[4]) if len(sys.argv) > 4 else 5
        cmd_start(task_name, row_num, interval_min)

    elif cmd == 'done':
        if len(sys.argv) < 3:
            print('사용법: python3 task_timer.py done 행번호 ["코멘트"]')
            sys.exit(1)
        row_num = int(sys.argv[2])
        comment = sys.argv[3] if len(sys.argv) > 3 else ''
        cmd_done(row_num, comment)

    elif cmd == 'status':
        cmd_status()

    else:
        print(f'알 수 없는 커맨드: {cmd}')
        sys.exit(1)


if __name__ == '__main__':
    main()
