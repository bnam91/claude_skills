#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
app_notes_control.py — 맥 노트 앱 제어 스크립트
AppleScript 기반. 노트 조회/생성/수정/삭제 지원.

사용법:
  목록:  python3 app_notes_control.py --list [--folder "폴더명"] [--limit 20]
  읽기:  python3 app_notes_control.py --read --title "제목" [--folder "폴더명"]
  생성:  python3 app_notes_control.py --create --title "제목" --body "내용" [--folder "폴더명"]
  추가:  python3 app_notes_control.py --append --title "제목" --body "추가내용"
  삭제:  python3 app_notes_control.py --delete --title "제목"
  검색:  python3 app_notes_control.py --search "키워드"
  폴더:  python3 app_notes_control.py --list-folders
"""

import sys
import subprocess
import argparse


def run_applescript(script):
    result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return result.stdout.strip(), None


def list_folders():
    script = '''
tell application "Notes"
    set output to ""
    repeat with f in every folder
        set output to output & name of f & return
    end repeat
    return output
end tell'''
    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}"); return
    folders = [f for f in out.split('\n') if f.strip()]
    print(f"=== 폴더 목록 ({len(folders)}개) ===")
    for f in folders:
        print(f"  - {f}")


def list_notes(folder=None, limit=20):
    if folder:
        script = f'''
tell application "Notes"
    set output to ""
    set cnt to 0
    tell folder "{folder}"
        set nts to every note
        repeat with n in nts
            if cnt < {limit} then
                set output to output & name of n & "||" & (modification date of n as string) & return
                set cnt to cnt + 1
            end if
        end repeat
    end tell
    if output is "" then return "NO_NOTES"
    return output
end tell'''
    else:
        script = f'''
tell application "Notes"
    set output to ""
    set cnt to 0
    set nts to every note
    repeat with n in nts
        if cnt < {limit} then
            set output to output & name of n & "||" & (modification date of n as string) & return
            set cnt to cnt + 1
        end if
    end repeat
    if output is "" then return "NO_NOTES"
    return output
end tell'''

    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}"); return
    if out == "NO_NOTES":
        print("노트 없음"); return

    notes = [l for l in out.split('\n') if '||' in l]
    label = f"[{folder}] " if folder else ""
    print(f"=== {label}노트 목록 ({len(notes)}개) ===")
    for n in notes:
        parts = n.split('||')
        print(f"  - {parts[0]}  ({parts[1] if len(parts) > 1 else ''})")


def read_note(title, folder=None):
    if folder:
        script = f'''
tell application "Notes"
    tell folder "{folder}"
        set nts to every note whose name is "{title}"
        if length of nts is 0 then return "NOT_FOUND"
        set n to item 1 of nts
        return name of n & "\\n---\\n" & plaintext of n
    end tell
end tell'''
    else:
        script = f'''
tell application "Notes"
    set nts to every note whose name is "{title}"
    if length of nts is 0 then return "NOT_FOUND"
    set n to item 1 of nts
    return name of n & "\\n---\\n" & plaintext of n
end tell'''

    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}"); return
    if out == "NOT_FOUND":
        print(f"[오류] '{title}' 노트를 찾을 수 없음"); return
    print(out)


def create_note(title, body, folder=None):
    # \n을 <div>로 변환해야 Notes 앱에서 줄바꿈이 적용됨
    lines = body.replace('"', '\\"').split('\n')
    body_escaped = ''.join(f'<div>{line if line.strip() else "<br>"}</div>' for line in lines)
    if folder:
        script = f'''
tell application "Notes"
    tell folder "{folder}"
        make new note with properties {{name:"{title}", body:"{body_escaped}"}}
    end tell
    return "OK"
end tell'''
    else:
        script = f'''
tell application "Notes"
    make new note with properties {{name:"{title}", body:"{body_escaped}"}}
    return "OK"
end tell'''

    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}"); return
    folder_str = f" [{folder}]" if folder else ""
    print(f"✅ 생성 완료{folder_str}: {title}")


def append_note(title, body):
    body_escaped = body.replace('"', '\\"')
    script = f'''
tell application "Notes"
    set nts to every note whose name is "{title}"
    if length of nts is 0 then return "NOT_FOUND"
    set n to item 1 of nts
    set existing to plaintext of n
    set body of n to existing & return & "{body_escaped}"
    return "OK"
end tell'''

    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}"); return
    if out == "NOT_FOUND":
        print(f"[오류] '{title}' 노트를 찾을 수 없음"); return
    print(f"✅ 추가 완료: {title}")


def delete_note(title):
    script = f'''
tell application "Notes"
    set nts to every note whose name is "{title}"
    if length of nts is 0 then return "NOT_FOUND"
    set cnt to count of nts
    repeat with n in nts
        delete n
    end repeat
    return cnt as string
end tell'''

    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}"); return
    if out == "NOT_FOUND":
        print(f"[오류] '{title}' 노트를 찾을 수 없음"); return
    print(f"🗑️ 삭제 완료: {title} ({out}개)")


def search_notes(keyword):
    script = f'''
tell application "Notes"
    set output to ""
    set nts to every note whose name contains "{keyword}" or plaintext contains "{keyword}"
    repeat with n in nts
        set output to output & name of n & "||" & (modification date of n as string) & return
    end repeat
    if output is "" then return "NO_RESULTS"
    return output
end tell'''

    out, err = run_applescript(script)
    if err:
        print(f"[오류] {err}"); return
    if out == "NO_RESULTS":
        print(f"'{keyword}' 검색 결과 없음"); return

    notes = [l for l in out.split('\n') if '||' in l]
    print(f"=== '{keyword}' 검색 결과 ({len(notes)}개) ===")
    for n in notes:
        parts = n.split('||')
        print(f"  - {parts[0]}  ({parts[1] if len(parts) > 1 else ''})")


def main():
    parser = argparse.ArgumentParser(description='맥 노트 앱 제어')
    parser.add_argument('--list', action='store_true', help='노트 목록 조회')
    parser.add_argument('--list-folders', action='store_true', help='폴더 목록 조회')
    parser.add_argument('--read', action='store_true', help='노트 읽기')
    parser.add_argument('--create', action='store_true', help='노트 생성')
    parser.add_argument('--append', action='store_true', help='노트에 내용 추가')
    parser.add_argument('--delete', action='store_true', help='노트 삭제')
    parser.add_argument('--search', type=str, help='키워드 검색')
    parser.add_argument('--title', type=str, help='노트 제목')
    parser.add_argument('--body', type=str, help='노트 내용')
    parser.add_argument('--folder', type=str, help='폴더 이름')
    parser.add_argument('--limit', type=int, default=20, help='조회 개수 (기본 20)')

    args = parser.parse_args()

    if args.list_folders:
        list_folders()
    elif args.list:
        list_notes(folder=args.folder, limit=args.limit)
    elif args.read:
        if not args.title:
            print("오류: --title 필수"); sys.exit(1)
        read_note(args.title, folder=args.folder)
    elif args.create:
        if not args.title or not args.body:
            print("오류: --title, --body 필수"); sys.exit(1)
        create_note(args.title, args.body, folder=args.folder)
    elif args.append:
        if not args.title or not args.body:
            print("오류: --title, --body 필수"); sys.exit(1)
        append_note(args.title, args.body)
    elif args.delete:
        if not args.title:
            print("오류: --title 필수"); sys.exit(1)
        delete_note(args.title)
    elif args.search:
        search_notes(args.search)
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
