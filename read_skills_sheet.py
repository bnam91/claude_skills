import os
import sys

sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth

from googleapiclient.discovery import build

SPREADSHEET_ID = "1XR180b4rX4xHDoYU3nCZaM4c2KGYOWZp-5oGemzY8E8"
SHEET_NAME = "통합"

def fetch_sheet():
    creds = auth.get_credentials()
    service = build('sheets', 'v4', credentials=creds)
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A1:Z1000",
        majorDimension="ROWS"
    ).execute()
    return result.get('values', [])

def format_output(rows):
    if not rows:
        print("데이터가 없습니다.")
        return

    headers = rows[0]
    data = rows[1:]

    col_widths = [len(str(h)) for h in headers]
    for row in data:
        for i, cell in enumerate(row):
            if i < len(col_widths):
                col_widths[i] = max(col_widths[i], len(str(cell)))

    def fmt_row(cells, widths):
        padded = []
        for i, w in enumerate(widths):
            cell = str(cells[i]) if i < len(cells) else ""
            padded.append(cell.ljust(w))
        return "  |  ".join(padded)

    separator = "-" * (sum(col_widths) + 5 * (len(col_widths) - 1))

    print(fmt_row(headers, col_widths))
    print(separator)
    for row in data:
        print(fmt_row(row, col_widths))

if __name__ == "__main__":
    try:
        rows = fetch_sheet()
        format_output(rows)
    except Exception as e:
        print(f"오류: {e}")
        sys.exit(1)
