#!/usr/bin/env python3
"""
macOS Reminders 앱의 모든 목록과 Inbox 목록의 내용을 표시하는 스크립트
"""

import sys
from datetime import datetime
import time

try:
    from EventKit import EKEventStore, EKReminder
    from Foundation import NSDate, NSRunLoop, NSDefaultRunLoopMode
    from AppKit import NSApplication
except ImportError:
    print("pyobjc가 필요합니다. 다음 명령어로 설치하세요:")
    print("pip install pyobjc")
    sys.exit(1)


def format_date(date):
    """날짜를 읽기 쉬운 형식으로 변환"""
    if date is None:
        return "없음"
    return datetime.fromtimestamp(date.timeIntervalSince1970()).strftime("%Y-%m-%d %H:%M:%S")


def show_reminder_details(reminder, indent=0):
    """미리알림 항목의 상세 정보를 출력"""
    prefix = "  " * indent
    print(f"{prefix}📌 {reminder.title()}")
    
    # 상태 및 완료일
    if reminder.isCompleted():
        status_icon = "✅"
        status_text = "완료"
        if reminder.completionDate():
            print(f"{prefix}   상태: {status_icon} {status_text} (완료일: {format_date(reminder.completionDate())})")
        else:
            print(f"{prefix}   상태: {status_icon} {status_text}")
    else:
        print(f"{prefix}   상태: ⏳ 미완료")
        if reminder.completionDate():
            print(f"{prefix}   완료일: {format_date(reminder.completionDate())}")
    
    # 마감일
    if reminder.dueDateComponents():
        due = reminder.dueDateComponents()
        if due:
            print(f"{prefix}   마감일: {due.year()}-{due.month():02d}-{due.day():02d}")
    
    # 우선순위 (항상 표시)
    priority = reminder.priority()
    priority_map = {0: "없음", 1: "낮음", 5: "중간", 9: "높음"}
    priority_text = priority_map.get(priority, f"알 수 없음({priority})")
    priority_icon = ""
    if priority == 9:
        priority_icon = "🔴"
    elif priority == 5:
        priority_icon = "🟡"
    elif priority == 1:
        priority_icon = "🟢"
    print(f"{prefix}   우선순위: {priority_icon} {priority_text}")
    
    # 깃발 여부 확인
    # EventKit API에서는 깃발 정보를 직접 제공하지 않을 수 있음
    # 알람이 있는 경우와 알람의 타입을 확인
    has_flag = False
    if reminder.hasAlarms():
        alarms = reminder.alarms()
        if alarms and len(alarms) > 0:
            # 알람이 있으면 깃발로 간주 (실제로는 알람일 수 있음)
            has_flag = True
            # 알람 상세 정보 확인
            alarm_types = []
            for alarm in alarms:
                try:
                    # EKAlarm의 타입 확인
                    if hasattr(alarm, 'type'):
                        alarm_type = alarm.type()
                        alarm_types.append(str(alarm_type))
                except:
                    pass
    
    flag_icon = "🚩" if has_flag else ""
    flag_text = "있음" if has_flag else "없음"
    if has_flag and alarm_types:
        flag_text += f" (알람: {', '.join(alarm_types)})"
    print(f"{prefix}   깃발: {flag_icon} {flag_text}")
    
    # 메모
    if reminder.notes():
        print(f"{prefix}   메모: {reminder.notes()}")


def fetch_reminders_sync(event_store, predicate):
    """미리알림을 동기적으로 가져오는 헬퍼 함수"""
    reminders_result = []
    done = [False]
    
    def completion_block(reminders):
        if reminders:
            reminders_result.extend(list(reminders) if reminders else [])
        done[0] = True
    
    # completion 핸들러를 직접 전달
    event_store.fetchRemindersMatchingPredicate_completion_(predicate, completion_block)
    
    # RunLoop를 사용하여 완료될 때까지 대기 (타임아웃을 3초로 단축)
    run_loop = NSRunLoop.currentRunLoop()
    timeout_date = NSDate.dateWithTimeIntervalSinceNow_(3.0)  # 3초 타임아웃
    
    start_time = time.time()
    while not done[0]:
        current_timeout = NSDate.dateWithTimeIntervalSinceNow_(0.1)
        run_loop.runMode_beforeDate_(NSDefaultRunLoopMode, current_timeout)
        # 타임아웃 체크 (3초)
        if time.time() - start_time > 3.0:
            break
    
    return reminders_result


def main():
    # EventStore 생성 및 권한 요청
    event_store = EKEventStore()
    
    print("Reminders 앱 접근 권한을 요청합니다...")
    # 권한 요청도 비동기이므로 잠시 대기
    event_store.requestAccessToEntityType_completion_(1, None)  # 1 = EKEntityTypeReminder
    time.sleep(0.5)  # 권한 요청이 완료될 때까지 대기 (0.5초로 단축)
    
    # 모든 미리알림 목록 가져오기
    calendars = event_store.calendarsForEntityType_(1)  # 1 = EKEntityTypeReminder
    
    print("\n" + "="*60)
    print("📋 모든 미리알림 목록")
    print("="*60)
    
    type_names = {
        0: "로컬",
        1: "CalDAV",
        2: "Exchange",
        3: "구독",
        4: "생일",
        5: "Mail"
    }
    
    for i, calendar in enumerate(calendars, 1):
        calendar_type = calendar.type()
        type_name = type_names.get(calendar_type, f"알 수 없음({calendar_type})")
        
        print(f"\n{i}. {calendar.title()}")
        print(f"   타입: {type_name}")
        print(f"   색상: {calendar.color()}")
        print(f"   읽기 전용: {'예' if calendar.isImmutable() else '아니오'}")
    
    # Inbox 목록 찾기
    print("\n" + "="*60)
    print("📥 Inbox 목록 내용")
    print("="*60)
    
    inbox_calendar = None
    for calendar in calendars:
        if calendar.title().lower() == "inbox" or calendar.title() == "받은편지함":
            inbox_calendar = calendar
            break
    
    if inbox_calendar is None:
        # Inbox를 찾지 못한 경우, 기본적으로 첫 번째 목록을 사용하거나
        # "inbox"라는 이름의 목록을 찾아봅니다
        print("\n⚠️  'Inbox'라는 이름의 목록을 찾을 수 없습니다.")
        print("사용 가능한 목록:")
        for calendar in calendars:
            print(f"  - {calendar.title()}")
    else:
        print(f"\n목록 이름: {inbox_calendar.title()}")
        print(f"타입: {type_names.get(inbox_calendar.type(), '알 수 없음')}")
        
        # Inbox의 모든 미리알림 가져오기
        predicate = event_store.predicateForRemindersInCalendars_([inbox_calendar])
        reminders = fetch_reminders_sync(event_store, predicate)
        
        if reminders:
            print(f"\n총 {len(reminders)}개의 미리알림 항목:\n")
            for i, reminder in enumerate(reminders, 1):
                print(f"{i}. ", end="")
                show_reminder_details(reminder, indent=0)
                print()
        else:
            print("\nInbox에 미리알림 항목이 없습니다.")


if __name__ == "__main__":
    main()

