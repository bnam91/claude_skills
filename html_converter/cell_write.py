"""cell_write.py <CELL> — stdin으로 받은 내용을 셀에 기록"""
import os, sys
sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

SPREADSHEET_ID = "1x7cj51TufSmJq-2iJjKdMIL8y-SnD0yJH-0KQxS-X74"

cell = sys.argv[1]
value = sys.stdin.read()
creds = auth.get_credentials()
svc = build("sheets", "v4", credentials=creds)
meta = svc.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
sheet = meta["sheets"][0]["properties"]["title"]
svc.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range=f"{sheet}!{cell}",
    valueInputOption="RAW",
    body={"values": [[value]]},
).execute()
print(f"{cell} 저장 완료")
