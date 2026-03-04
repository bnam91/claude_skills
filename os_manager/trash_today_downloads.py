import subprocess
from datetime import date
from pathlib import Path

downloads = Path("~/Downloads").expanduser()
today = date.today().isoformat()

trashed = []
for f in downloads.iterdir():
    if f.name.startswith('.'):
        continue
    created = date.fromtimestamp(f.stat().st_birthtime).isoformat()
    if created == today:
        subprocess.run([
            'osascript', '-e',
            f'tell application "Finder" to delete POSIX file "{f}"'
        ])
        trashed.append(f.name)
        print(f"휴지통으로 이동: {f.name}")

if not trashed:
    print("오늘 생성된 파일이 없습니다.")
else:
    print(f"\n총 {len(trashed)}개 파일 이동 완료")
