"""cell_read.py <CELL> — 셀 내용을 stdout으로 출력"""
import os, sys
sys.path.append(os.path.expanduser("~/Documents/github_cloud/module_auth"))
import auth
from googleapiclient.discovery import build

SPREADSHEET_ID = "1x7cj51TufSmJq-2iJjKdMIL8y-SnD0yJH-0KQxS-X74"

cell = sys.argv[1]
sheet_arg = sys.argv[2] if len(sys.argv) > 2 else None
creds = auth.get_credentials()
svc = build("sheets", "v4", credentials=creds)
meta = svc.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
sheet = sheet_arg if sheet_arg else meta["sheets"][0]["properties"]["title"]
res = svc.spreadsheets().values().get(
    spreadsheetId=SPREADSHEET_ID, range=f"{sheet}!{cell}"
).execute()
vals = res.get("values", [])
print(vals[0][0] if vals and vals[0] else "", end="")
