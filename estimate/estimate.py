#!/usr/bin/env python3
"""
견적서 샘플 시트를 복사하고 내용을 채우는 스크립트

Usage:
  # 기본 생성 (내용 없이)
  python3 estimate.py --create --name "팔도"

  # 내용 포함 생성
  python3 estimate.py --create --name "팔도" \
    --date-kr "26년 3월 4일" \
    --recipient "팔도 (윤종혁 선임님)" \
    --manager "신현빈" \
    --product "쿠팡리뷰체험단" \
    --items '[{"name":"상품A","qty":10,"price":50000}]' \
    --comment "기본" \

  # 목록 조회
  python3 estimate.py --list
"""

import sys
import os
import json
import argparse
from datetime import date

sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

FOLDER_ID = "1pka1HP7AO0WWInHB53kLsbETiQcK87o5"
TEMPLATE_ID = "1kGJ9q3pUgsE0XLhLeLgRvdKcVGiOfoT1v8LtwDBrAxw"

DEFAULT_COMMENT = "* 쿠팡정책상 회원등급에 따른 리뷰어 별 상품구매 가격이 상이함으로 상품가액 및 배송비는 작업완료 후 실비정산 되었습니다. (리뷰어별 실결제비 액셀첨부)"

# 아이템 데이터 행 시작 (1-based row number)
ITEM_START_ROW = 11
ITEM_END_ROW = 28  # 최대 18개 품목


def get_services():
    creds = auth.get_credentials()
    drive = build("drive", "v3", credentials=creds)
    sheets = build("sheets", "v4", credentials=creds)
    return drive, sheets


def to_korean_date(date_str: str) -> str:
    """YYYY-MM-DD → 'YY년 M월 D일'"""
    d = date.fromisoformat(date_str)
    return f"{str(d.year)[2:]}년 {d.month}월 {d.day}일"


def to_file_date(date_str: str) -> str:
    """YYYY-MM-DD → 'YYMMDD'"""
    d = date.fromisoformat(date_str)
    return f"{str(d.year)[2:]}{d.month:02d}{d.day:02d}"


def create_estimate(
    client_name: str,
    date_str: str | None = None,
    date_kr: str | None = None,
    recipient: str | None = None,
    manager: str | None = None,
    product: str | None = None,
    items: list | None = None,
    comment: str | None = None,
):
    """샘플 시트 복사 후 내용 채우기"""
    drive, sheets = get_services()

    if date_str is None:
        date_str = date.today().strftime("%Y-%m-%d")

    if date_kr is None:
        date_kr = to_korean_date(date_str)

    file_name = f"Quotation_goya_{to_file_date(date_str)}"

    # 1. 샘플 복사
    copied = drive.files().copy(
        fileId=TEMPLATE_ID,
        body={"name": file_name, "parents": [FOLDER_ID]},
    ).execute()
    file_id = copied["id"]
    url = f"https://docs.google.com/spreadsheets/d/{file_id}/edit"

    # 2. 셀 값 준비
    update_data = []

    # 파트1: 헤더 정보 (C3:C6)
    if recipient or date_kr:
        update_data.append({
            "range": "C3",
            "values": [[f"견적일 : {date_kr}"]],
        })
    if recipient:
        update_data.append({
            "range": "C4",
            "values": [[f"수 신 : {recipient}"]],
        })
    if manager:
        update_data.append({
            "range": "C5",
            "values": [[f"담 당 : {manager}"]],
        })
    if product:
        update_data.append({
            "range": "C6",
            "values": [[f"상 품 : {product}"]],
        })

    # 파트2: 품목 입력 (ROW11~28)
    if items:
        for i, item in enumerate(items[:ITEM_END_ROW - ITEM_START_ROW + 1]):
            row = ITEM_START_ROW + i
            name = item.get("name", "")
            qty = item.get("qty", 0)
            price = item.get("price", 0)

            # 품명 (C열)
            update_data.append({"range": f"C{row}", "values": [[name]]})
            # 수량 (G열)
            update_data.append({"range": f"G{row}", "values": [[qty]]})
            # 단가 (I열)
            update_data.append({"range": f"I{row}", "values": [[price]]})

            # 첫 행(11)은 수식이 없으므로 직접 추가
            if row == 11:
                update_data.append({"range": "K11", "values": [[f"=G11*I11"]]})
                update_data.append({"range": "M11", "values": [[f"=K11*0.1"]]})

    # 파트3: 코멘트 (B32)
    if comment is not None:
        update_data.append({
            "range": "B32",
            "values": [[comment]],
        })

    # 3. batchUpdate 실행
    if update_data:
        sheets.spreadsheets().values().batchUpdate(
            spreadsheetId=file_id,
            body={
                "valueInputOption": "USER_ENTERED",
                "data": update_data,
            },
        ).execute()

    print(f"OK|{file_id}|{file_name}|{url}")


def list_estimates():
    """폴더 안 견적서 목록 조회 (샘플 제외)"""
    drive, _ = get_services()

    results = drive.files().list(
        q=f"'{FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'",
        fields="files(id, name, createdTime)",
        orderBy="createdTime desc",
    ).execute()

    files = [f for f in results.get("files", []) if not f["name"].startswith("견적서")]

    if not files:
        print("견적서 없음")
        return

    for f in files:
        created = f["createdTime"][:10]
        url = f"https://docs.google.com/spreadsheets/d/{f['id']}/edit"
        print(f"{created} | {f['name']} | {url}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--create", action="store_true")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--name", help="거래처명 (파일명 및 기본 recipient)")
    parser.add_argument("--date", dest="date_str", help="날짜 YYYY-MM-DD (기본: 오늘)")
    parser.add_argument("--date-kr", help="한국어 날짜 ex) '26년 3월 4일'")
    parser.add_argument("--recipient", help="수신 ex) '팔도 (윤종혁 선임님)'")
    parser.add_argument("--manager", help="담당자 ex) '신현빈'")
    parser.add_argument("--product", help="상품명 ex) '쿠팡리뷰체험단'")
    parser.add_argument("--items", help='품목 JSON ex: \'[{"name":"A","qty":10,"price":5000}]\'')
    parser.add_argument("--comment", help="코멘트 (\"기본\" 이면 기본 템플릿 사용, 빈 문자열이면 공백)")
    args = parser.parse_args()

    if args.create:
        if not args.name:
            print("ERROR: --name 이 필요합니다.", file=sys.stderr)
            sys.exit(1)

        items = None
        if args.items:
            items = json.loads(args.items)

        comment = None
        if args.comment is not None:
            comment = DEFAULT_COMMENT if args.comment == "기본" else args.comment

        create_estimate(
            client_name=args.name,
            date_str=args.date_str,
            date_kr=args.date_kr,
            recipient=args.recipient,
            manager=args.manager,
            product=args.product,
            items=items,
            comment=comment,
        )
    elif args.list:
        list_estimates()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
