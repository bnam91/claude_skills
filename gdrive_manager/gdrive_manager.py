#!/usr/bin/env python3
"""Google Drive Manager - 인덱스 아키텍처 기반 드라이브 관리"""

import os
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent
DRIVES_FILE = SCRIPT_DIR / "drives.json"
ENV_PATH = Path.home() / "Documents/github_cloud/module_auth/config/.env"
AUTH_PATH = Path.home() / "Documents/github_cloud/module_auth/auth.py"

load_dotenv(ENV_PATH)

INDEX_ARCHITECTURE = {
    "000": "공지 / 로그 / 릴리즈",
    "100": "컨테이너 (개별박스, 히스토리, expired)",
    "200": "모듈 & 유틸 & 에셋",
    "300": "프로젝트 메인",
    "500": "dev",
    "800": "외부 공유",
    "900": "긴급요청",
}


def get_index_label(name):
    """폴더/파일명에서 인덱스 대역 판별"""
    for prefix, label in INDEX_ARCHITECTURE.items():
        if name.startswith(prefix[:1]):
            hundreds = name[:3]
            if hundreds.isdigit() and hundreds[0] == prefix[0]:
                return f"{hundreds}xx → {label}"
    return None


def load_drives():
    with open(DRIVES_FILE) as f:
        return json.load(f)["drives"]


def resolve_drive(alias):
    drives = load_drives()
    for d in drives:
        if d["alias"] == alias:
            return d["folder_id"]
    print(f"[오류] '{alias}' 드라이브를 찾을 수 없어요.")
    print("등록된 드라이브:", [d["alias"] for d in drives])
    exit(1)


def get_service():
    import sys
    sys.path.insert(0, str(AUTH_PATH.parent))
    from auth import get_credentials
    from googleapiclient.discovery import build
    creds = get_credentials()
    return build("drive", "v3", credentials=creds)


def cmd_list_drives(args):
    drives = load_drives()
    print(f"[드라이브 목록] 총 {len(drives)}개")
    for d in drives:
        print(f"  - [{d['alias']}] {d['folder_id']}")


def cmd_list(args):
    service = get_service()

    # 폴더 ID 직접 지정
    if args.folder_id:
        folder_id = args.folder_id
        label = args.drive or folder_id
        print(f"[{label}]")
    elif args.drive:
        folder_id = resolve_drive(args.drive)
    else:
        print("[오류] --drive 또는 --folder-id 가 필요해요.")
        exit(1)

    # 하위 폴더 지정 시
    if not args.folder_id and args.folder:
        results = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="files(id, name, mimeType)",
            pageSize=100
        ).execute()
        folders = results.get("files", [])
        match = next((f for f in folders if args.folder.lower() in f["name"].lower()), None)
        if not match:
            print(f"[오류] '{args.folder}' 폴더를 찾을 수 없어요.")
            exit(1)
        folder_id = match["id"]
        print(f"[{args.drive}] > {match['name']}")
    else:
        print(f"[{args.drive}]")

    results = service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id, name, mimeType, modifiedTime, size)",
        orderBy="name",
        pageSize=100
    ).execute()

    files = results.get("files", [])
    print(f"총 {len(files)}개\n")

    for f in files:
        is_folder = "folder" in f.get("mimeType", "")
        icon = "📁" if is_folder else "📄"
        label = get_index_label(f["name"])
        label_str = f"  [{label}]" if label else ""
        print(f"{icon} {f['name']}{label_str}")
        print(f"   ID: {f['id']} | {f.get('modifiedTime','')[:10]}")


def cmd_search(args):
    if not args.drive or not args.query:
        print("[오류] --drive 와 --query 가 필요해요.")
        exit(1)

    folder_id = resolve_drive(args.drive)
    service = get_service()

    results = service.files().list(
        q=f"'{folder_id}' in parents and name contains '{args.query}' and trashed=false",
        fields="files(id, name, mimeType, modifiedTime)",
        pageSize=50
    ).execute()

    # 하위 폴더까지 재귀 검색
    all_files = list(results.get("files", []))

    # 하위 폴더 가져오기
    folders = service.files().list(
        q=f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id, name)",
        pageSize=100
    ).execute().get("files", [])

    for folder in folders:
        sub = service.files().list(
            q=f"'{folder['id']}' in parents and name contains '{args.query}' and trashed=false",
            fields="files(id, name, mimeType, modifiedTime)",
            pageSize=50
        ).execute()
        for f in sub.get("files", []):
            f["_parent"] = folder["name"]
            all_files.append(f)

    if not all_files:
        print(f"[{args.drive}] '{args.query}' 검색 결과 없음")
        return

    print(f"[{args.drive}] '{args.query}' 검색 결과 {len(all_files)}개\n")
    for f in all_files:
        is_folder = "folder" in f.get("mimeType", "")
        icon = "📁" if is_folder else "📄"
        parent = f.get("_parent", "")
        parent_str = f" ({parent}/)" if parent else ""
        print(f"{icon} {f['name']}{parent_str}")
        print(f"   ID: {f['id']} | {f.get('modifiedTime','')[:10]}")


def cmd_add_drive(args):
    if not args.alias or not args.folder_id:
        print("[오류] --alias 와 --folder-id 가 필요해요.")
        exit(1)

    with open(DRIVES_FILE) as f:
        data = json.load(f)

    for d in data["drives"]:
        if d["alias"] == args.alias:
            print(f"[오류] '{args.alias}' 이미 존재해요.")
            exit(1)

    data["drives"].append({"alias": args.alias, "folder_id": args.folder_id})
    with open(DRIVES_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[완료] '{args.alias}' 드라이브가 추가됐어요.")


def cmd_index(args):
    print("## 인덱스 아키텍처 v1.2\n")
    for prefix, label in INDEX_ARCHITECTURE.items():
        print(f"  {prefix}xx → {label}")


def main():
    parser = argparse.ArgumentParser(description="Google Drive Manager")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list-drives", action="store_true", help="드라이브 목록")
    group.add_argument("--add-drive", action="store_true", help="드라이브 추가")
    group.add_argument("--list", action="store_true", help="폴더 내용 조회")
    group.add_argument("--search", action="store_true", help="파일 검색")
    group.add_argument("--index", action="store_true", help="인덱스 아키텍처 보기")

    parser.add_argument("--drive", help="드라이브 별칭")
    parser.add_argument("--folder", help="하위 폴더명 (부분 일치)")
    parser.add_argument("--folder-id", help="폴더 ID 직접 지정 (URL에서 추출)")
    parser.add_argument("--query", "-q", help="검색어")
    parser.add_argument("--alias", help="드라이브 별칭 (추가 시)")

    args = parser.parse_args()

    if args.list_drives:
        cmd_list_drives(args)
    elif args.add_drive:
        cmd_add_drive(args)
    elif args.list:
        cmd_list(args)
    elif args.search:
        cmd_search(args)
    elif args.index:
        cmd_index(args)


if __name__ == "__main__":
    main()
