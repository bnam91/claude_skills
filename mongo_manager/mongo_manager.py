#!/usr/bin/env python3
"""MongoDB Manager - Claude 스킬용 MongoDB Atlas 제어 스크립트"""

import json
import argparse
import sys
from datetime import datetime
from pathlib import Path
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.server_api import ServerApi
from bson import ObjectId
from bson.json_util import dumps as bson_dumps

AUTH_PATH = Path.home() / "Documents/github_cloud/module_auth"
sys.path.insert(0, str(AUTH_PATH))

# ── 설정 ──────────────────────────────────────────────
CONFIG_FILE = Path(__file__).parent / "config.json"

def load_config():
    with open(CONFIG_FILE) as f:
        return json.load(f)

def get_client():
    cfg = load_config()
    uri = cfg["uri"]
    client = MongoClient(uri, server_api=ServerApi('1'), tlsAllowInvalidCertificates=True)
    client.admin.command('ping')
    return client

def to_json(docs):
    """ObjectId 포함 도큐 JSON 직렬화"""
    return json.loads(bson_dumps(docs, ensure_ascii=False))

# ── 명령어 핸들러 ──────────────────────────────────────

def cmd_list_dbs(args):
    """DB 목록 조회"""
    client = get_client()
    dbs = client.list_database_names()
    client.close()
    result = [db for db in dbs if db not in ("admin", "local", "config")]
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_list_cols(args):
    """컬렉션 목록 조회"""
    client = get_client()
    db = client[args.db]
    cols = db.list_collection_names()
    client.close()
    print(json.dumps(sorted(cols), ensure_ascii=False, indent=2))


def cmd_read(args):
    """컬렉션 읽기 (필터/정렬/제한)"""
    client = get_client()
    col = client[args.db][args.col]

    query = json.loads(args.filter) if args.filter else {}
    total = col.count_documents(query)

    cursor = col.find(query)

    if args.sort:
        direction = DESCENDING if args.sort.startswith("-") else ASCENDING
        field = args.sort.lstrip("-")
        cursor = cursor.sort(field, direction)

    if args.limit:
        cursor = cursor.limit(args.limit)

    docs = to_json(list(cursor))
    client.close()

    print(f"[총 {total}개 중 {len(docs)}개 반환]")
    print(json.dumps(docs, ensure_ascii=False, indent=2))


def cmd_search(args):
    """필드 텍스트 검색"""
    client = get_client()
    col = client[args.db][args.col]

    query = {args.field: {"$regex": args.query, "$options": "i"}}
    total = col.count_documents(query)

    limit = args.limit or 20
    docs = to_json(list(col.find(query).limit(limit)))
    client.close()

    print(f"['{args.query}' 검색 결과: 총 {total}개 중 {len(docs)}개]")
    print(json.dumps(docs, ensure_ascii=False, indent=2))


def cmd_insert(args):
    """도큐먼트 추가"""
    client = get_client()
    col = client[args.db][args.col]

    data = json.loads(args.data)
    if isinstance(data, list):
        result = col.insert_many(data)
        ids = [str(i) for i in result.inserted_ids]
        print(json.dumps({"inserted": len(ids), "ids": ids}, ensure_ascii=False, indent=2))
    else:
        result = col.insert_one(data)
        print(json.dumps({"inserted": 1, "id": str(result.inserted_id)}, ensure_ascii=False, indent=2))
    client.close()


def cmd_update(args):
    """도큐먼트 수정"""
    client = get_client()
    col = client[args.db][args.col]

    query = json.loads(args.filter)
    update_data = {"$set": json.loads(args.set)}

    if args.many:
        result = col.update_many(query, update_data)
    else:
        result = col.update_one(query, update_data)

    client.close()
    print(json.dumps({
        "matched": result.matched_count,
        "modified": result.modified_count
    }, ensure_ascii=False, indent=2))


def cmd_delete(args):
    """도큐먼트 삭제"""
    client = get_client()
    col = client[args.db][args.col]

    # ID로 삭제 지원
    if args.id:
        query = {"_id": ObjectId(args.id)}
    else:
        query = json.loads(args.filter)

    count = col.count_documents(query)
    if count == 0:
        print(json.dumps({"deleted": 0, "message": "조건에 맞는 도큐 없음"}))
        client.close()
        return

    if args.many:
        result = col.delete_many(query)
    else:
        result = col.delete_one(query)

    client.close()
    print(json.dumps({"deleted": result.deleted_count}, ensure_ascii=False, indent=2))


def cmd_stats(args):
    """컬렉션 통계"""
    client = get_client()
    col = client[args.db][args.col]

    total = col.count_documents({})
    sample = to_json(list(col.find().limit(1)))
    fields = list(sample[0].keys()) if sample else []

    client.close()
    print(json.dumps({
        "database": args.db,
        "collection": args.col,
        "total_documents": total,
        "fields": fields
    }, ensure_ascii=False, indent=2))


def _fetch_docs(args):
    """read/search 공통 도큐 조회 (export-sheet 재사용)"""
    client = get_client()
    col = client[args.db][args.col]
    query = json.loads(args.filter) if getattr(args, "filter", None) else {}
    cursor = col.find(query)
    if getattr(args, "sort", None):
        direction = DESCENDING if args.sort.startswith("-") else ASCENDING
        cursor = cursor.sort(args.sort.lstrip("-"), direction)
    if getattr(args, "limit", None):
        cursor = cursor.limit(args.limit)
    docs = to_json(list(cursor))
    total = col.count_documents(query)
    client.close()
    return docs, total


def cmd_export_sheet(args):
    """MongoDB 조회 결과를 Google Sheet로 저장"""
    from auth import get_credentials
    from googleapiclient.discovery import build

    DEFAULT_FOLDER = "1386T_3BfE5XpD0a2EHKf_Vvm9kYmcitj"

    # 도큐 조회
    docs, total = _fetch_docs(args)
    if not docs:
        print(json.dumps({"error": "저장할 도큐먼트가 없습니다."}, ensure_ascii=False))
        return

    # 헤더 및 행 구성
    headers = list(docs[0].keys())
    rows = [headers]
    for doc in docs:
        row = [str(doc.get(h, "")) for h in headers]
        rows.append(row)

    creds = get_credentials()
    drive_svc = build("drive", "v3", credentials=creds)
    sheets_svc = build("sheets", "v4", credentials=creds)

    if args.sheet_id:
        sheet_id = args.sheet_id
        tab_name = args.tab or f"{args.col}_{datetime.now().strftime('%m%d_%H%M')}"

        # 탭 존재 여부 확인 후 없으면 생성
        meta = sheets_svc.spreadsheets().get(spreadsheetId=sheet_id).execute()
        existing_tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]

        if tab_name not in existing_tabs:
            sheets_svc.spreadsheets().batchUpdate(
                spreadsheetId=sheet_id,
                body={"requests": [{"addSheet": {"properties": {"title": tab_name}}}]}
            ).execute()

        # 기존 내용 클리어 후 쓰기
        sheets_svc.spreadsheets().values().clear(
            spreadsheetId=sheet_id,
            range=f"{tab_name}"
        ).execute()

        sheets_svc.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=f"{tab_name}!A1",
            valueInputOption="RAW",
            body={"values": rows}
        ).execute()

        sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}"
    else:
        # 새 시트 생성
        folder_id = args.folder_id or DEFAULT_FOLDER
        title = args.title or f"{args.db}_{args.col}_{datetime.now().strftime('%Y%m%d_%H%M')}"

        sheet = sheets_svc.spreadsheets().create(
            body={"properties": {"title": title}},
            fields="spreadsheetId"
        ).execute()
        sheet_id = sheet["spreadsheetId"]

        # 지정 폴더로 이동
        file = drive_svc.files().get(fileId=sheet_id, fields="parents").execute()
        drive_svc.files().update(
            fileId=sheet_id,
            addParents=folder_id,
            removeParents=",".join(file.get("parents", [])),
            fields="id,parents"
        ).execute()

        # 데이터 쓰기
        sheets_svc.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range="Sheet1!A1",
            valueInputOption="RAW",
            body={"values": rows}
        ).execute()

        sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}"

    print(json.dumps({
        "saved": len(docs),
        "total": total,
        "sheet_url": sheet_url,
        "title": title if not args.sheet_id else f"{args.col} 탭 추가"
    }, ensure_ascii=False, indent=2))


def cmd_ttl_create(args):
    """TTL 인덱스 생성"""
    client = get_client()
    col = client[args.db][args.col]

    col.create_index([(args.field, ASCENDING)], expireAfterSeconds=args.seconds)
    client.close()

    days = args.seconds // 86400
    hours = (args.seconds % 86400) // 3600
    print(json.dumps({
        "created": True,
        "field": args.field,
        "expireAfterSeconds": args.seconds,
        "expires_in": f"{days}일 {hours}시간 후 자동 삭제" if days else f"{hours}시간 후 자동 삭제"
    }, ensure_ascii=False, indent=2))


def cmd_ttl_list(args):
    """인덱스 목록 조회 (TTL 여부 포함)"""
    client = get_client()
    col = client[args.db][args.col]
    indexes = list(col.list_indexes())
    client.close()

    result = []
    for idx in indexes:
        info = {
            "name": idx.get("name"),
            "key": dict(idx.get("key", {})),
        }
        if "expireAfterSeconds" in idx:
            secs = idx["expireAfterSeconds"]
            days = secs // 86400
            info["ttl"] = True
            info["expireAfterSeconds"] = secs
            info["expires_in"] = f"{days}일" if days else f"{secs}초"
        else:
            info["ttl"] = False
        result.append(info)

    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_ttl_drop(args):
    """인덱스 삭제"""
    client = get_client()
    col = client[args.db][args.col]
    col.drop_index(args.name)
    client.close()
    print(json.dumps({"dropped": args.name}, ensure_ascii=False, indent=2))


# ── CLI 파서 ──────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MongoDB Manager")
    sub = parser.add_subparsers(dest="cmd")

    # list-dbs
    sub.add_parser("list-dbs", help="DB 목록 조회")

    # list-cols
    p = sub.add_parser("list-cols", help="컬렉션 목록 조회")
    p.add_argument("--db", required=True)

    # read
    p = sub.add_parser("read", help="데이터 읽기")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--filter", help='JSON 필터 예: \'{"keyword":"라면"}\'')
    p.add_argument("--sort", help="정렬 필드 (- 붙이면 내림차순) 예: -upload_date")
    p.add_argument("--limit", type=int)

    # search
    p = sub.add_parser("search", help="필드 텍스트 검색")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--field", required=True)
    p.add_argument("--query", required=True)
    p.add_argument("--limit", type=int)

    # insert
    p = sub.add_parser("insert", help="도큐먼트 추가")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--data", required=True, help="JSON 도큐 또는 배열")

    # update
    p = sub.add_parser("update", help="도큐먼트 수정")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--filter", required=True, help="조건 JSON")
    p.add_argument("--set", required=True, help="변경 내용 JSON")
    p.add_argument("--many", action="store_true", help="여러 도큐 수정")

    # delete
    p = sub.add_parser("delete", help="도큐먼트 삭제")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--id", help="ObjectId로 삭제")
    p.add_argument("--filter", help="조건 JSON으로 삭제")
    p.add_argument("--many", action="store_true", help="여러 도큐 삭제")

    # stats
    p = sub.add_parser("stats", help="컬렉션 통계")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)

    # export-sheet
    p = sub.add_parser("export-sheet", help="조회 결과를 Google Sheet로 저장")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--filter", help='JSON 필터')
    p.add_argument("--sort", help="정렬 필드 (- 붙이면 내림차순)")
    p.add_argument("--limit", type=int)
    p.add_argument("--title", help="새 시트 제목 (기본: DB_컬렉션_날짜)")
    p.add_argument("--folder-id", help="저장할 Drive 폴더 ID (기본: 디폴트 폴더)")
    p.add_argument("--sheet-id", help="기존 시트 ID (지정 시 탭 추가)")
    p.add_argument("--tab", help="기존 시트에 추가할 탭 이름")

    # ttl-create
    p = sub.add_parser("ttl-create", help="TTL 인덱스 생성")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--field", required=True, help="날짜 타입 필드명")
    p.add_argument("--seconds", type=int, required=True, help="만료 시간(초) 예: 86400=1일, 604800=7일")

    # ttl-list
    p = sub.add_parser("ttl-list", help="인덱스 목록 조회 (TTL 포함)")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)

    # ttl-drop
    p = sub.add_parser("ttl-drop", help="인덱스 삭제")
    p.add_argument("--db", required=True)
    p.add_argument("--col", required=True)
    p.add_argument("--name", required=True, help="인덱스 이름")

    args = parser.parse_args()

    dispatch = {
        "list-dbs": cmd_list_dbs,
        "list-cols": cmd_list_cols,
        "read": cmd_read,
        "search": cmd_search,
        "insert": cmd_insert,
        "update": cmd_update,
        "delete": cmd_delete,
        "stats": cmd_stats,
        "export-sheet": cmd_export_sheet,
        "ttl-create": cmd_ttl_create,
        "ttl-list": cmd_ttl_list,
        "ttl-drop": cmd_ttl_drop,
    }

    if args.cmd in dispatch:
        dispatch[args.cmd](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
