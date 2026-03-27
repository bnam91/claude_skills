#!/usr/bin/env python3
"""미리알림 완료 처리. 사용법: python3 complete_reminder.py "목록명" "제목" """
import sys, time
from app_reminders_control import _get_event_store, fetch_reminders_sync

if len(sys.argv) < 3:
    print("사용법: python3 complete_reminder.py '목록명' '제목'")
    sys.exit(1)

list_name = sys.argv[1]
title = sys.argv[2]

es = _get_event_store()
cals = es.calendarsForEntityType_(1)
cal = next((c for c in cals if c.title() == list_name), None)
if not cal:
    print(f"목록 '{list_name}' 없음")
    sys.exit(1)

pred = es.predicateForRemindersInCalendars_([cal])
rems = fetch_reminders_sync(es, pred)
for r in rems:
    if r.title() == title and not r.isCompleted():
        r.setCompleted_(True)
        es.saveReminder_commit_error_(r, True, None)
        print(f"completed: {title}")
        sys.exit(0)

print(f"항목 '{title}' 못 찾음")
sys.exit(1)
