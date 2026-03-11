#!/usr/bin/env python3
"""
맥OS 미리알림(Reminders) 앱의 모든 목록과 미리알림을 읽는 스크립트
EventKit(PyObjC) 사용 - AppleScript보다 빠름
섹션(section) 출력: SQLite DB에서 ZREMCDBASESECTION, ZMEMBERSHIPSOFREMINDERSINSECTIONSASDATA 사용
"""

import sys
import time
import json
import sqlite3
import os
from pathlib import Path

try:
    from EventKit import EKEventStore
    from Foundation import NSDate, NSRunLoop, NSDefaultRunLoopMode
except ImportError:
    print("pyobjc가 필요합니다. 다음 명령어로 설치하세요:")
    print("  pip install pyobjc-framework-EventKit")
    sys.exit(1)

_REMINDERS_DB_DIR = Path.home() / "Library/Group Containers/group.com.apple.reminders/Container_v1/Stores"


def _find_reminders_db_for_list(list_name):
    """list_name이 있는 Reminders SQLite DB 경로 반환. 없으면 None."""
    if not _REMINDERS_DB_DIR.exists():
        return None
    for f in _REMINDERS_DB_DIR.glob("Data-*.sqlite"):
        if "-local" in f.name or f.name.endswith("-shm") or f.name.endswith("-wal"):
            continue
        try:
            conn = sqlite3.connect(str(f))
            cur = conn.execute(
                "SELECT Z_PK FROM ZREMCDBASELIST WHERE ZNAME = ? AND ZMARKEDFORDELETION = 0",
                (list_name,),
            )
            if cur.fetchone():
                conn.close()
                return str(f)
            conn.close()
        except (sqlite3.OperationalError, sqlite3.DatabaseError):
            continue
    return None


def _get_sections_and_membership(db_path, list_name):
    """
    DB에서 섹션 목록과 reminder ID -> section name 매핑 반환.
    JSON의 groupID = ZREMCDBASESECTION.ZCKIDENTIFIER
    반환: (sections: [(ckid, name)], reminder_to_section: {member_id: section_ckid})
    """
    if not db_path:
        return [], {}
    try:
        conn = sqlite3.connect(str(db_path))
        # list PK 조회
        cur = conn.execute(
            "SELECT Z_PK FROM ZREMCDBASELIST WHERE ZNAME = ? AND ZMARKEDFORDELETION = 0",
            (list_name,),
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return [], {}
        list_pk = row[0]

        # 섹션 목록 (ZCREATIONDATE 순). groupID 매칭용으로 ZCKIDENTIFIER 사용
        cur = conn.execute(
            """SELECT ZCKIDENTIFIER, ZDISPLAYNAME FROM ZREMCDBASESECTION
               WHERE ZLIST = ? AND ZMARKEDFORDELETION = 0
               ORDER BY ZCREATIONDATE""",
            (list_pk,),
        )
        sections = [(r[0] or "", r[1] or "") for r in cur.fetchall()]

        # reminder-section 매핑 (JSON: memberID=reminder, groupID=section ZCKIDENTIFIER)
        cur = conn.execute(
            "SELECT ZMEMBERSHIPSOFREMINDERSINSECTIONSASDATA FROM ZREMCDBASELIST WHERE Z_PK = ?",
            (list_pk,),
        )
        row = cur.fetchone()
        conn.close()

        if not row or not row[0]:
            return sections, {}

        data = row[0]
        if isinstance(data, bytes):
            data = data.decode("utf-8", errors="ignore")
        try:
            obj = json.loads(data)
        except json.JSONDecodeError:
            return sections, {}

        reminder_to_section = {}
        for m in obj.get("memberships", []):
            mid = m.get("memberID")
            gid = m.get("groupID")  # section의 ZCKIDENTIFIER
            if mid and gid:
                reminder_to_section[mid.upper()] = gid.upper()

        return sections, reminder_to_section
    except Exception:
        return [], {}


def _get_event_store():
    """EventStore 생성 및 권한 요청"""
    event_store = EKEventStore()
    event_store.requestAccessToEntityType_completion_(1, None)  # 1 = EKEntityTypeReminder
    time.sleep(0.3)
    return event_store


def fetch_reminders_sync(event_store, predicate, timeout=5.0):
    """미리알림을 동기적으로 가져오는 헬퍼 함수"""
    reminders_result = []
    done = [False]

    def completion_block(reminders):
        if reminders:
            reminders_result.extend(list(reminders) if reminders else [])
        done[0] = True

    event_store.fetchRemindersMatchingPredicate_completion_(predicate, completion_block)

    run_loop = NSRunLoop.currentRunLoop()
    start_time = time.time()
    while not done[0]:
        current_timeout = NSDate.dateWithTimeIntervalSinceNow_(0.1)
        run_loop.runMode_beforeDate_(NSDefaultRunLoopMode, current_timeout)
        if time.time() - start_time > timeout:
            break

    return reminders_result


def get_list_names():
    """목록(캘린더) 이름만 빠르게 가져옵니다."""
    try:
        event_store = _get_event_store()
        calendars = event_store.calendarsForEntityType_(1)  # EKEntityTypeReminder
        return [cal.title() for cal in calendars]
    except Exception:
        return None


def _reminder_to_dict(reminder):
    """EKReminder를 dict로 변환 (calendarItemIdentifier 포함)"""
    title = reminder.title() or "(제목 없음)"
    completed = reminder.isCompleted()

    flagged = False
    if reminder.hasAlarms() and reminder.alarms() and len(reminder.alarms()) > 0:
        flagged = True

    notes = reminder.notes() or ""
    due_date = ""
    if reminder.dueDateComponents():
        dc = reminder.dueDateComponents()
        if dc:
            due_date = f"{dc.year()}-{dc.month():02d}-{dc.day():02d}"
            if dc.hour() != -1 and dc.minute() != -1:
                due_date += f" {dc.hour():02d}:{dc.minute():02d}"

    priority = reminder.priority() if reminder.priority() is not None else 0

    # calendarItemIdentifier: 섹션 매핑용
    identifier = ""
    if hasattr(reminder, "calendarItemIdentifier") and reminder.calendarItemIdentifier():
        identifier = str(reminder.calendarItemIdentifier()).upper()

    return {
        "title": title,
        "completed": completed,
        "flagged": flagged,
        "notes": notes,
        "due_date": due_date,
        "priority": int(priority) if priority is not None else 0,
        "calendarItemIdentifier": identifier,
    }


def _get_reminders_for_list(event_store, calendar):
    """특정 목록(캘린더)의 미리알림을 EventKit으로 가져옵니다."""
    predicate = event_store.predicateForRemindersInCalendars_([calendar])
    reminders = fetch_reminders_sync(event_store, predicate)
    return [_reminder_to_dict(r) for r in reminders]


def get_all_lists_and_reminders():
    """
    모든 목록과 각 목록의 미리알림을 가져옵니다.
    반환: [{'list_name': str, 'reminders': [dict, ...]}, ...]
    """
    try:
        event_store = _get_event_store()
        calendars = event_store.calendarsForEntityType_(1)
        if not calendars:
            print("  목록을 가져올 수 없습니다.")
            return []

        result = []
        for i, cal in enumerate(calendars):
            list_name = cal.title()
            print(f"  [{i + 1}/{len(calendars)}] {list_name} 읽는 중...", flush=True)
            reminders = _get_reminders_for_list(event_store, cal)
            result.append({"list_name": list_name, "reminders": reminders})

        return result

    except Exception as e:
        print(f"  예외 발생: {e}")
        import traceback

        traceback.print_exc()
        return None


def get_priority_text(priority):
    """우선순위를 텍스트로 변환 (EventKit: 1=높음, 5=중간, 9=낮음)"""
    priority_map = {0: "없음", 1: "높음", 5: "중간", 9: "낮음"}
    return priority_map.get(priority, f"알 수 없음({priority})")


def get_priority_icon(priority):
    """우선순위 아이콘 반환 (EventKit: 1=높음🔴, 5=중간🟡, 9=낮음🟢)"""
    if priority == 1:
        return "🔴"
    elif priority == 5:
        return "🟡"
    elif priority == 9:
        return "🟢"
    return ""


def _group_reminders_by_section(reminders, sections, reminder_to_section):
    """
    reminders를 섹션별로 그룹화. sections: [(ckid, name)], reminder_to_section: {id: section_ckid}
    반환: [(section_name, [reminders]), ...] (섹션 없는 항목은 "" 섹션으로)
    """
    # section_ckid (upper) -> [reminders]
    by_section = {(ckid or "").upper(): [] for ckid, _ in sections}
    by_section[None] = []  # 섹션 없는 항목

    for r in reminders:
        rid = (r.get("calendarItemIdentifier") or "").upper()
        section_ckid = reminder_to_section.get(rid) if rid else None
        if section_ckid and section_ckid in by_section:
            by_section[section_ckid].append(r)
        else:
            by_section[None].append(r)

    # 순서: sections 순서 + 섹션 없는 항목
    result = []
    for ckid, name in sections:
        key = (ckid or "").upper()
        if by_section.get(key):
            result.append((name, by_section[key]))
    if by_section.get(None):
        result.append(("", by_section[None]))
    return result


def print_reminders(reminders, list_name, sections=None, reminder_to_section=None):
    """미리알림 목록 출력. sections가 있으면 섹션별로 그룹화하여 출력."""
    if not reminders:
        print(f"\n📋 {list_name}에 미리알림이 없습니다.")
        return

    if sections and reminder_to_section is not None:
        grouped = _group_reminders_by_section(reminders, sections, reminder_to_section)
        print(f"\n=== {list_name} ({len(reminders)}개) ===\n")
        for section_name, section_reminders in grouped:
            if section_name:
                print(f"📌 {section_name}\n")
            for i, r in enumerate(section_reminders, 1):
                _print_one_reminder(i, r)
            if section_name:
                print()
    else:
        print(f"\n=== {list_name} ({len(reminders)}개) ===\n")
        for i, r in enumerate(reminders, 1):
            _print_one_reminder(i, r)


def _print_one_reminder(i, r):
    """단일 미리알림 출력"""
    print(f"{i}. 📌 {r['title']}")
    status_text = "✅ 완료" if r["completed"] else "⏳ 미완료"
    print(f"   상태: {status_text}")
    if r["due_date"]:
        print(f"   마감일: {r['due_date']}")
    priority_text = get_priority_text(r["priority"])
    priority_icon = get_priority_icon(r["priority"])
    print(f"   우선순위: {priority_icon} {priority_text}")
    flag_text = "🚩 있음" if r["flagged"] else "없음"
    print(f"   깃발: {flag_text}")
    if r["notes"]:
        print(f"   메모: {r['notes']}")
    print()


def main():
    print("미리알림 앱에서 목록을 읽는 중...\n")

    try:
        event_store = _get_event_store()
        calendars = event_store.calendarsForEntityType_(1)
    except Exception as e:
        print(f"목록을 가져올 수 없습니다: {e}")
        sys.exit(1)

    if not calendars:
        print("목록을 가져올 수 없습니다.")
        sys.exit(1)

    list_names = [cal.title() for cal in calendars]

    print("=== 목록 선택 ===\n")
    for i, name in enumerate(list_names, 1):
        print(f"  {i}. {name}")

    try:
        choice = input(f"\n목록 번호를 입력하세요 (1-{len(list_names)}): ").strip()
        idx = int(choice)
        if idx < 1 or idx > len(list_names):
            print("잘못된 번호입니다.")
            sys.exit(1)
    except (ValueError, EOFError):
        print("입력이 취소되었습니다.")
        sys.exit(1)

    selected_calendar = calendars[idx - 1]
    list_name = list_names[idx - 1]
    print(f"\n{list_name} 읽는 중...", flush=True)
    reminders = _get_reminders_for_list(event_store, selected_calendar)

    # 섹션 데이터 로드 (SQLite)
    db_path = _find_reminders_db_for_list(list_name)
    sections, reminder_to_section = _get_sections_and_membership(db_path, list_name)

    print_reminders(reminders, list_name, sections=sections, reminder_to_section=reminder_to_section)


if __name__ == "__main__":
    main()
