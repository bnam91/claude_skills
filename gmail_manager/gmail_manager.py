#!/usr/bin/env python3
"""Gmail Manager - 다중 계정 Gmail 관리 스크립트"""

import os
import json
import argparse
import base64
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

KST = timezone(timedelta(hours=9))

def kst_today_utc_query():
    """한국 시간 기준 오늘 00:00 ~ 내일 00:00 을 UTC epoch로 변환해 Gmail after/before 쿼리 반환"""
    now_kst = datetime.now(KST)
    today_kst = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_kst = today_kst + timedelta(days=1)
    after_ts = int(today_kst.timestamp())
    before_ts = int(tomorrow_kst.timestamp())
    return f"after:{after_ts} before:{before_ts}"

SCRIPT_DIR = Path(__file__).parent
CONFIG_FILE = SCRIPT_DIR / "config.json"
TOKENS_DIR = SCRIPT_DIR / "tokens"

# module_auth의 .env에서 Google 인증 정보 로드
ENV_PATH = Path.home() / "Documents/github_cloud/module_auth/config/.env"
load_dotenv(ENV_PATH)

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]


def load_config():
    with open(CONFIG_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def get_token_path(email):
    return TOKENS_DIR / f"{email}.json"


def get_service(email):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    if not CLIENT_ID or not CLIENT_SECRET:
        print(f"[오류] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경 변수가 없어요.")
        print(f"  확인 경로: {ENV_PATH}")
        exit(1)

    token_path = get_token_path(email)
    creds = None

    if token_path.exists():
        try:
            with open(token_path) as f:
                token_data = json.load(f)
            if "client_id" not in token_data:
                token_data["client_id"] = CLIENT_ID
            if "client_secret" not in token_data:
                token_data["client_secret"] = CLIENT_SECRET
            creds = Credentials.from_authorized_user_info(token_data, SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None

        if not creds or not creds.valid:
            print("[인증 시작] 브라우저가 열립니다. Google 로그인을 완료해주세요.")
            flow = InstalledAppFlow.from_client_config(
                {
                    "installed": {
                        "client_id": CLIENT_ID,
                        "client_secret": CLIENT_SECRET,
                        "redirect_uris": ["http://localhost"],
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                    }
                },
                SCOPES,
            )
            creds = flow.run_local_server(
                port=0,
                authorization_prompt_message="[인증] 브라우저에서 {email} 계정으로 로그인해주세요.".format(email=email),
                login_hint=email,
                prompt="select_account",
            )
            print("[인증 완료]")

        TOKENS_DIR.mkdir(exist_ok=True)
        with open(token_path, "w") as f:
            f.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)


def cmd_list_accounts(args):
    config = load_config()
    accounts = config.get("accounts", [])

    if not accounts:
        print("등록된 계정이 없어요.")
        print("계정 추가: python gmail_manager.py --add-account --alias 별칭 --email 이메일")
        return

    print(f"[계정 목록] 총 {len(accounts)}개")
    for i, acc in enumerate(accounts, 1):
        token_exists = get_token_path(acc["email"]).exists()
        status = "인증됨" if token_exists else "미인증"
        print(f"  {i}. [{acc['alias']}] {acc['email']} ({status})")


def cmd_add_account(args):
    if not args.alias or not args.email:
        print("[오류] --alias 와 --email 이 필요해요.")
        exit(1)

    config = load_config()
    accounts = config.get("accounts", [])

    for acc in accounts:
        if acc["alias"] == args.alias:
            print(f"[오류] '{args.alias}' 별칭이 이미 존재해요.")
            exit(1)
        if acc["email"] == args.email:
            print(f"[오류] '{args.email}' 이메일이 이미 등록되어 있어요.")
            exit(1)

    print(f"계정 추가 중: {args.email}")
    print("브라우저에서 Google 로그인을 진행해주세요...")

    get_service(args.email)

    accounts.append({"alias": args.alias, "email": args.email})
    config["accounts"] = accounts
    save_config(config)

    print(f"[완료] '{args.alias}' ({args.email}) 계정이 추가됐어요.")


def cmd_remove_account(args):
    if not args.alias:
        print("[오류] --alias 가 필요해요.")
        exit(1)

    config = load_config()
    accounts = config.get("accounts", [])

    target = next((a for a in accounts if a["alias"] == args.alias), None)
    if not target:
        print(f"[오류] '{args.alias}' 계정을 찾을 수 없어요.")
        exit(1)

    accounts.remove(target)
    config["accounts"] = accounts
    save_config(config)

    token_path = get_token_path(target["email"])
    if token_path.exists():
        token_path.unlink()

    print(f"[완료] '{args.alias}' ({target['email']}) 계정이 제거됐어요.")


def resolve_account(alias_or_email):
    config = load_config()
    accounts = config.get("accounts", [])

    for acc in accounts:
        if acc["alias"] == alias_or_email or acc["email"] == alias_or_email:
            return acc["email"]

    print(f"[오류] '{alias_or_email}' 계정을 찾을 수 없어요.")
    print("등록된 계정 확인: python gmail_manager.py --list-accounts")
    exit(1)


def decode_body(payload):
    """메일 본문 디코딩"""
    if "parts" in payload:
        for part in payload["parts"]:
            if part["mimeType"] == "text/plain":
                data = part["body"].get("data", "")
                if data:
                    return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
        # plain 없으면 html
        for part in payload["parts"]:
            if part["mimeType"] == "text/html":
                data = part["body"].get("data", "")
                if data:
                    html = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                    return re.sub(r"<[^>]+>", "", html).strip()
    else:
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    return "(본문 없음)"


def cmd_list_mails(args):
    if not args.account:
        print("[오류] --account 가 필요해요.")
        exit(1)

    email = resolve_account(args.account)
    service = get_service(email)

    if args.today:
        today_q = kst_today_utc_query()
        query = f"{args.query} {today_q}".strip() if args.query else today_q
    else:
        query = args.query or "is:inbox"
    max_results = args.max or 20

    result = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results
    ).execute()

    messages = result.get("messages", [])

    if not messages:
        print(f"[{args.account}] 메일이 없어요. (검색: {query})")
        return

    print(f"[{args.account}] {email} - {len(messages)}개 메일 (검색: {query})")
    print("-" * 60)

    for msg in messages:
        detail = service.users().messages().get(
            userId="me",
            id=msg["id"],
            format="metadata",
            metadataHeaders=["From", "Subject", "Date"]
        ).execute()

        headers = {h["name"]: h["value"] for h in detail["payload"]["headers"]}
        labels = detail.get("labelIds", [])
        unread = "●" if "UNREAD" in labels else " "
        subject = headers.get("Subject", "(제목 없음)")[:50]
        sender = headers.get("From", "")[:30]
        date = headers.get("Date", "")[:20]

        print(f"{unread} [{msg['id']}] {date}")
        print(f"    발신: {sender}")
        print(f"    제목: {subject}")
        print()


def cmd_read_mail(args):
    if not args.account or not args.id:
        print("[오류] --account 와 --id 가 필요해요.")
        exit(1)

    email = resolve_account(args.account)
    service = get_service(email)

    msg = service.users().messages().get(
        userId="me",
        id=args.id,
        format="full"
    ).execute()

    headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}

    print("=" * 60)
    print(f"제목: {headers.get('Subject', '(없음)')}")
    print(f"발신: {headers.get('From', '(없음)')}")
    print(f"수신: {headers.get('To', '(없음)')}")
    print(f"날짜: {headers.get('Date', '(없음)')}")
    print("-" * 60)
    body = decode_body(msg["payload"])
    print(body[:3000])
    if len(body) > 3000:
        print(f"\n... (이하 {len(body) - 3000}자 생략)")
    print("=" * 60)

    # 읽음 처리
    service.users().messages().modify(
        userId="me",
        id=args.id,
        body={"removeLabelIds": ["UNREAD"]}
    ).execute()


def cmd_save_draft(args):
    if not args.account or not args.to or not args.subject or not args.body:
        print("[오류] --account, --to, --subject, --body 가 모두 필요해요.")
        exit(1)

    email = resolve_account(args.account)
    service = get_service(email)

    from email.mime.text import MIMEText
    message = MIMEText(args.body, "plain", "utf-8")
    message["to"] = args.to
    message["from"] = email
    message["subject"] = args.subject

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    draft = service.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()

    print(f"[임시저장 완료]")
    print(f"  발신: {email}")
    print(f"  수신: {args.to}")
    print(f"  제목: {args.subject}")
    print(f"  본문: {args.body}")
    print(f"  Draft ID: {draft['id']}")


def cmd_trash_mail(args):
    if not args.account:
        print("[오류] --account 가 필요해요.")
        exit(1)

    email = resolve_account(args.account)
    service = get_service(email)

    ids = []
    if args.ids:
        ids = [i.strip() for i in args.ids.split(",")]
    elif args.id:
        ids = [args.id]
    else:
        print("[오류] --id 또는 --ids 가 필요해요.")
        exit(1)

    for msg_id in ids:
        service.users().messages().trash(userId="me", id=msg_id).execute()
        print(f"  [휴지통] {msg_id}")

    print(f"[완료] {len(ids)}개 메일을 휴지통으로 이동했어요.")


def cmd_send_mail(args):
    if not args.account or not args.to or not args.subject or not args.body:
        print("[오류] --account, --to, --subject, --body 가 모두 필요해요.")
        exit(1)

    email = resolve_account(args.account)
    service = get_service(email)

    from email.mime.text import MIMEText
    message = MIMEText(args.body, "plain", "utf-8")
    message["to"] = args.to
    message["from"] = email
    message["subject"] = args.subject

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()

    print(f"[발송 완료]")
    print(f"  발신: {email}")
    print(f"  수신: {args.to}")
    print(f"  제목: {args.subject}")
    print(f"  본문: {args.body}")


def main():
    parser = argparse.ArgumentParser(description="Gmail Manager")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list-accounts", action="store_true", help="계정 목록")
    group.add_argument("--add-account", action="store_true", help="계정 추가")
    group.add_argument("--remove-account", action="store_true", help="계정 제거")
    group.add_argument("--list-mails", action="store_true", help="메일 목록")
    group.add_argument("--read-mail", action="store_true", help="메일 읽기")
    group.add_argument("--send-mail", action="store_true", help="메일 발송")
    group.add_argument("--save-draft", action="store_true", help="임시저장")
    group.add_argument("--trash-mail", action="store_true", help="휴지통 이동")

    parser.add_argument("--alias", help="계정 별칭")
    parser.add_argument("--email", help="이메일 주소")
    parser.add_argument("--account", help="사용할 계정 (별칭 또는 이메일)")
    parser.add_argument("--query", "-q", help='Gmail 검색 쿼리 (기본: "is:inbox")')
    parser.add_argument("--today", action="store_true", help="한국 시간 기준 오늘 메일만")
    parser.add_argument("--max", "-n", type=int, help="최대 메일 수 (기본: 20)")
    parser.add_argument("--id", help="메일 ID")
    parser.add_argument("--ids", help="메일 ID 목록 (쉼표 구분, 예: id1,id2,id3)")
    parser.add_argument("--to", help="수신자 이메일")
    parser.add_argument("--subject", help="메일 제목")
    parser.add_argument("--body", help="메일 본문")

    args = parser.parse_args()

    if args.list_accounts:
        cmd_list_accounts(args)
    elif args.add_account:
        cmd_add_account(args)
    elif args.remove_account:
        cmd_remove_account(args)
    elif args.list_mails:
        cmd_list_mails(args)
    elif args.read_mail:
        cmd_read_mail(args)
    elif args.send_mail:
        cmd_send_mail(args)
    elif args.save_draft:
        cmd_save_draft(args)
    elif args.trash_mail:
        cmd_trash_mail(args)


if __name__ == "__main__":
    main()
