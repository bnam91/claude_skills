#!/usr/bin/env python3
"""
mail_auto_cleaner.py
매일 5시에 실행되어 bnam91, 현빈개인메일 두 계정의 메일을 분류하고
🔴 삭제 대상을 자동으로 휴지통으로 이동하는 스크립트
"""

import os
import json
import subprocess
import sys
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
import anthropic

SCRIPT_DIR = Path(__file__).parent
LOG_DIR = SCRIPT_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

KST = timezone(timedelta(hours=9))
PYTHON_CMD = "python" if sys.platform == "win32" else "python3"
GMAIL_SCRIPT = str(SCRIPT_DIR / "gmail_manager.py")

ENV_PATH = Path.home() / "Documents/github_cloud/module_auth/config/.env"
load_dotenv(ENV_PATH)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

ACCOUNTS = ["bnam91", "현빈개인메일"]

MAIL_ORGANIZER_RULES = """
## 분류 기준

### 🔴 삭제 대상
- 광고/홍보 메일 (쇼핑몰, 뉴스레터, 마케팅)
- 자동발송 알림 (SNS 알림, 앱 알림)
- 스팸성 메일
- 하루 이상 지난 권한/공유 요청 메일 (Figma 시트 요청, Google Sheets 공유, 접근 요청 등)
- 하루 이상 지난 서비스 경고/알림 (MongoDB, Google 보안 경고 등)

### 🟡 보류 (사용자 확인 필요)
- 발신자가 불명확한 메일
- 제목만으로 판단 어려운 메일

### 🟢 보존
- 사람이 직접 보낸 메일 (개인 이메일 주소)
- 업무 관련 메일 (계약, 견적, 협업 등)
- 금융/공공기관 메일 (국세청, 은행, 쿠팡 정산 등)
- 영수증/결제 확인 메일 (receipt, invoice, 구독 결제 등)
- Google 보안 알림 (당일 수신 것만, 하루 지난 것은 삭제)

## 계정별 특이사항

### bnam91 (고야앤드미디어)
- 팔도, 쿠팡, 홈택스 관련 → 보존
- 고야앤드미디어 발신 메일 → 보존 (업무용)
- 로켓그로스 알림 → 삭제 대상
- 멘토리 관련 메일 (이혜진, 박가람 등) → 삭제 대상

### 현빈개인메일 (coq3820)
- KAPITAL 등 쇼핑 뉴스레터 → 삭제 대상
- Instagram, Postman, Claude 알림 → 삭제 대상
- Google 보안 알림 → 보존
"""


def run_gmail_cmd(args: list[str]) -> str:
    cmd = ["python" if sys.platform == "win32" else "python3", GMAIL_SCRIPT] + args
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        cwd=str(SCRIPT_DIR),
    )
    return result.stdout + result.stderr


def list_mails(account: str, max_count: int = 50) -> str:
    return run_gmail_cmd(["--list-mails", "--account", account, "--max", str(max_count)])


def trash_mails(account: str, ids: list[str]) -> str:
    if not ids:
        return ""
    ids_str = ",".join(ids)
    return run_gmail_cmd(["--trash-mail", "--account", account, "--ids", ids_str])


def parse_mail_list(output: str) -> list[dict]:
    """메일 목록 출력에서 ID, 발신, 제목 파싱 (3줄 블록 형식)"""
    mails = []
    lines = output.strip().split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        match = re.search(r'\[([a-f0-9]{16,})\]', line)
        if match:
            mail_id = match.group(1)
            sender = ""
            subject = ""
            # 다음 줄들에서 발신/제목 추출
            if i + 1 < len(lines) and '발신:' in lines[i + 1]:
                sender = lines[i + 1].strip().replace('발신:', '').strip()
                i += 1
            if i + 1 < len(lines) and '제목:' in lines[i + 1]:
                subject = lines[i + 1].strip().replace('제목:', '').strip()
                i += 1
            summary = f"[{mail_id}] 발신: {sender} | 제목: {subject}"
            mails.append({
                "id": mail_id,
                "line": summary,
            })
        i += 1
    return mails


def classify_mails(account: str, mail_lines: list[str], today_str: str) -> dict:
    """Claude API로 메일 분류"""
    if not mail_lines:
        return {"red": [], "yellow": [], "green": []}

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    mail_text = "\n".join(f"{i+1}. {line}" for i, line in enumerate(mail_lines))

    prompt = f"""다음은 {account} 계정의 메일 목록이야. 오늘 날짜는 {today_str}야.

{MAIL_ORGANIZER_RULES}

아래 메일들을 분류해줘. 반드시 아래 형식으로만 응답해 (설명 없이):
번호:분류코드

예시:
1:red
2:green
3:yellow

분류코드는 반드시 red, yellow, green 중 하나.

메일 목록:
{mail_text}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    result = {"red": [], "yellow": [], "green": []}
    for line in text.splitlines():
        line = line.strip()
        if ':' not in line:
            continue
        parts = line.split(':', 1)
        try:
            num = int(parts[0].strip())
            cat = parts[1].strip().lower()
            if cat not in ("red", "yellow", "green"):
                continue
            idx = num - 1
            if 0 <= idx < len(mail_lines):
                result[cat].append({"index": idx, "reason": ""})
        except ValueError:
            continue
    return result


def main():
    now_kst = datetime.now(KST)
    today_str = now_kst.strftime("%Y-%m-%d")
    log_file = LOG_DIR / f"mail_clean_{today_str}.log"

    log_lines = [f"=== 메일 자동 정리 시작: {now_kst.strftime('%Y-%m-%d %H:%M:%S')} KST ===\n"]

    all_yellow = []  # 계정별 보류 메일 모음

    for account in ACCOUNTS:
        log_lines.append(f"\n[{account}] 메일 목록 조회 중...")
        output = list_mails(account, max_count=50)

        mails = parse_mail_list(output)
        if not mails:
            log_lines.append(f"  → 메일 없음 또는 조회 실패")
            continue

        log_lines.append(f"  → 총 {len(mails)}개 메일 조회됨")

        # Claude로 분류
        mail_lines = [m["line"] for m in mails]
        log_lines.append(f"  → Claude 분류 중...")
        classification = classify_mails(account, mail_lines, today_str)

        # 🔴 자동 휴지통 이동
        red_indices = [r["index"] for r in classification["red"]]
        red_ids = [mails[i]["id"] for i in red_indices if i < len(mails)]

        if red_ids:
            log_lines.append(f"  → 🔴 삭제 대상 {len(red_ids)}개 휴지통 이동 중...")
            trash_result = trash_mails(account, red_ids)
            log_lines.append(f"  → 휴지통 이동 완료")
            for r in classification["red"]:
                if r["index"] < len(mails):
                    log_lines.append(f"     삭제: {mails[r['index']]['line']} (사유: {r['reason']})")
        else:
            log_lines.append(f"  → 🔴 삭제 대상 없음")

        # 🟡 보류 목록 수집
        yellow_items = []
        for y in classification["yellow"]:
            if y["index"] < len(mails):
                yellow_items.append({
                    "account": account,
                    "line": mails[y["index"]]["line"],
                    "reason": y["reason"],
                })
        if yellow_items:
            log_lines.append(f"  → 🟡 보류 {len(yellow_items)}개 (확인 필요)")
            for y in yellow_items:
                log_lines.append(f"     보류: {y['line']} (사유: {y['reason']})")
            all_yellow.extend(yellow_items)

        # 🟢 보존
        green_count = len(classification["green"])
        log_lines.append(f"  → 🟢 보존 {green_count}개")

    # 보류 메일 별도 파일로 저장
    if all_yellow:
        yellow_file = LOG_DIR / f"pending_{today_str}.txt"
        with open(yellow_file, "w", encoding="utf-8") as f:
            f.write(f"보류 메일 ({today_str}) - 확인 필요\n\n")
            for y in all_yellow:
                f.write(f"[{y['account']}] {y['line']}\n사유: {y['reason']}\n\n")
        log_lines.append(f"\n🟡 보류 메일 {len(all_yellow)}개 → {yellow_file}")

    log_lines.append(f"\n=== 완료: {datetime.now(KST).strftime('%H:%M:%S')} ===")

    log_text = "\n".join(log_lines)
    with open(log_file, "w", encoding="utf-8") as f:
        f.write(log_text)

    print(log_text)


if __name__ == "__main__":
    main()
