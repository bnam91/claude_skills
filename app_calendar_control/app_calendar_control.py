#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
app_calendar_control.py — 맥 캘린더 앱 제어 스크립트
AppleScript 기반. 일정 조회/추가/삭제 지원.

사용법:
  조회: python3 app_calendar_control.py --query [today|week|next-week|YYYY-MM-DD|YYYY-MM-DD~YYYY-MM-DD]
  추가: python3 app_calendar_control.py --add --cal "캘린더명" --title "제목" --start "YYYY-MM-DD HH:MM" --end "YYYY-MM-DD HH:MM" [--notes "메모"]
  삭제: python3 app_calendar_control.py --delete --cal "캘린더명" --title "제목" --date "YYYY-MM-DD"
  목록: python3 app_calendar_control.py --list-cals
"""

import sys
import subprocess
import argparse
from datetime import datetime, timedelta

# 조회 대상 캘린더 (기본값)
DEFAULT_CALS = ["집", "직장", "소문의섬", "27호", "유튜브_잘사는김대리", "coq3820@gmail.com", "jisu170714@gmail.com"]

WEEKDAY_KR = ["월", "화", "수", "목", "금", "토", "일"]


def run_applescript(script):
    result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return result.stdout.strip(), None


def list_calendars():
    script = '''
tell application "Calendar"
    set calList to name of every calendar
    set output to ""
    repeat with c in calList
        set output to output & c & return
    end repeat
    return output
end tell'''
    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}")
        return
    cals = [c for c in out.split('\n') if c.strip()]
    print(f"=== 캘린더 목록 ({len(cals)}개) ===")
    for c in cals:
        print(f"  - {c}")


def query_events(start_date, end_date, cals=None):
    if cals is None:
        cals = DEFAULT_CALS

    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d 23:59:59')

    cal_list_as = '{' + ', '.join([f'"{c}"' for c in cals]) + '}'

    script = f'''
tell application "Calendar"
    set startDate to date "{start_str}"
    set endDate to date "{end_str}"
    set output to ""
    set targetCals to {cal_list_as}
    repeat with calName in targetCals
        try
            set cal to calendar calName
            set evts to (every event of cal whose start date ≥ startDate and start date ≤ endDate)
            repeat with ev in evts
                set output to output & calName & "||" & (start date of ev as string) & "||" & (end date of ev as string) & "||" & summary of ev & "||" & (allday event of ev as string) & return
            end repeat
        end try
    end repeat
    if output is "" then return "NO_EVENTS"
    return output
end tell'''

    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}")
        return

    if out == "NO_EVENTS" or not out:
        print(f"[{start_str} ~ {end_date.strftime('%Y-%m-%d')}] 일정 없음")
        return

    events = []
    for line in out.split('\n'):
        if not line.strip():
            continue
        parts = line.split('||')
        if len(parts) < 5:
            continue
        cal_name, start_raw, end_raw, title, allday = parts[0], parts[1], parts[2], parts[3], parts[4]
        try:
            # AppleScript 날짜 파싱
            for fmt in ['%Y년 %m월 %d일 %A %p %I:%M:%S', '%Y년 %m월 %d일 %A %오전 %I:%M:%S']:
                try:
                    start_dt = datetime.strptime(start_raw.strip(), '%Y년 %m월 %d일 %A %p %I:%M:%S')
                    break
                except:
                    pass
            else:
                # fallback: 그냥 raw 출력
                start_dt = None
        except:
            start_dt = None

        events.append({
            'cal': cal_name,
            'start_raw': start_raw.strip(),
            'end_raw': end_raw.strip(),
            'title': title,
            'allday': allday.strip() == 'true',
            'start_dt': start_dt
        })

    # 날짜순 정렬 (raw string 기준)
    events.sort(key=lambda x: x['start_raw'])

    print(f"=== {start_str} ~ {end_date.strftime('%Y-%m-%d')} 일정 ({len(events)}개) ===\n")
    cur_date = ""
    for ev in events:
        # 날짜 헤더
        date_part = ev['start_raw'][:12] if len(ev['start_raw']) > 12 else ev['start_raw']
        if date_part != cur_date:
            cur_date = date_part
            print(f"[{date_part}]")

        if ev['allday']:
            print(f"  (종일) [{ev['cal']}] {ev['title']}")
        else:
            # 시간 추출
            time_part = ev['start_raw'].split(' ')[-1] if ' ' in ev['start_raw'] else ''
            end_time = ev['end_raw'].split(' ')[-1] if ' ' in ev['end_raw'] else ''
            ampm_start = ev['start_raw']
            print(f"  {ampm_start} → {end_time} [{ev['cal']}] {ev['title']}")
        print()


def add_event(cal_name, title, start_str, end_str, notes=""):
    notes_script = f'set description of newEvent to "{notes}"' if notes else ''
    script = f'''
tell application "Calendar"
    tell calendar "{cal_name}"
        set startDate to date "{start_str}"
        set endDate to date "{end_str}"
        set newEvent to make new event with properties {{summary:"{title}", start date:startDate, end date:endDate}}
        {notes_script}
    end tell
end tell
return "OK"'''
    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}")
        return
    print(f"✅ 추가 완료: [{cal_name}] {title} ({start_str} ~ {end_str})")


def delete_event(cal_name, title, date_str):
    script = f'''
tell application "Calendar"
    set targetDate to date "{date_str}"
    set nextDate to targetDate + (1 * days)
    tell calendar "{cal_name}"
        set evts to (every event whose summary is "{title}" and start date ≥ targetDate and start date < nextDate)
        set cnt to count of evts
        repeat with ev in evts
            delete ev
        end repeat
        return cnt as string
    end tell
end tell'''
    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}")
        return
    print(f"🗑️ 삭제 완료: [{cal_name}] {title} ({date_str}) — {out}개 삭제")


def parse_date_range(query):
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    if query == 'today':
        return today, today
    elif query == 'week':
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    elif query == 'next-week':
        days_until_monday = (7 - today.weekday()) % 7 or 7
        start = today + timedelta(days=days_until_monday)
        return start, start + timedelta(days=6)
    elif '~' in query:
        parts = query.split('~')
        return datetime.strptime(parts[0].strip(), '%Y-%m-%d'), datetime.strptime(parts[1].strip(), '%Y-%m-%d')
    else:
        d = datetime.strptime(query, '%Y-%m-%d')
        return d, d


def main():
    parser = argparse.ArgumentParser(description='맥 캘린더 제어')
    parser.add_argument('--list-cals', action='store_true', help='캘린더 목록 조회')
    parser.add_argument('--query', type=str, help='일정 조회: today | week | next-week | YYYY-MM-DD | YYYY-MM-DD~YYYY-MM-DD')
    parser.add_argument('--add', action='store_true', help='일정 추가')
    parser.add_argument('--delete', action='store_true', help='일정 삭제')
    parser.add_argument('--cal', type=str, help='캘린더 이름')
    parser.add_argument('--title', type=str, help='일정 제목')
    parser.add_argument('--start', type=str, help='시작 시간 (YYYY-MM-DD HH:MM)')
    parser.add_argument('--end', type=str, help='종료 시간 (YYYY-MM-DD HH:MM)')
    parser.add_argument('--date', type=str, help='삭제할 일정 날짜 (YYYY-MM-DD)')
    parser.add_argument('--notes', type=str, default='', help='메모')
    parser.add_argument('--cals', type=str, help='조회할 캘린더 (쉼표 구분)')

    args = parser.parse_args()

    if args.list_cals:
        list_calendars()
    elif args.query:
        cals = args.cals.split(',') if args.cals else None
        start, end = parse_date_range(args.query)
        query_events(start, end, cals)
    elif args.add:
        if not all([args.cal, args.title, args.start, args.end]):
            print("오류: --cal, --title, --start, --end 필수")
            sys.exit(1)
        add_event(args.cal, args.title, args.start, args.end, args.notes)
    elif args.delete:
        if not all([args.cal, args.title, args.date]):
            print("오류: --cal, --title, --date 필수")
            sys.exit(1)
        delete_event(args.cal, args.title, args.date)
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
