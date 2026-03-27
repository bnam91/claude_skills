#!/usr/bin/env python3
"""미리알림 우선순위 설정. 사용법: python3 set_priority.py "목록명" "제목" 우선순위(1/5/9)"""
import sys, time
from app_reminders_control import _get_event_store, fetch_reminders_sync

if len(sys.argv) < 4:
    print("사용법: python3 set_priority.py '목록명' '제목' 우선순위")
    sys.exit(1)

list_name = sys.argv[1]
title = sys.argv[2]
priority = int(sys.argv[3])

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
        r.setPriority_(priority)
        es.saveReminder_commit_error_(r, True, None)
        print(f"OK: {title} → 우선순위 {priority}")
        sys.exit(0)

print(f"항목 '{title}' 못 찾음")
sys.exit(1)
