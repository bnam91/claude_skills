#!/bin/zsh
# downloads_cleanup.sh
# - Downloads 루트 파일 → legacy/expired_2w/날짜/ 로 이동
# - 2주 지난 폴더 삭제
# cron: 0 7,19 * * *

DOWNLOADS="/Users/a1/Downloads"
ARCHIVE="$DOWNLOADS/legacy/expired_2w"
TODAY=$(date +%Y-%m-%d)
LOG="$DOWNLOADS/legacy/cleanup.log"

echo "[$TODAY $(date +%H:%M:%S)] cleanup start" >> "$LOG"

# ── 1. Downloads 루트 파일 이동 ──────────────────────────────────────────────
for filepath in "$DOWNLOADS"/*(D.); do
  filename=$(basename "$filepath")

  # 파일명에서 YYYY-MM-DD 추출
  if [[ "$filename" =~ ([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
    date_dir="${match[1]}"
  else
    date_dir="$TODAY"
  fi

  dest="$ARCHIVE/$date_dir"
  mkdir -p "$dest"
  mv "$filepath" "$dest/"
  echo "  moved: $filename → $date_dir/" >> "$LOG"
done

# ── 2. 2주 지난 폴더 삭제 ────────────────────────────────────────────────────
cutoff=$(date -v-14d +%Y-%m-%d)

for dir in "$ARCHIVE"/*/; do
  dir_name=$(basename "$dir")
  if [[ "$dir_name" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [[ "$dir_name" < "$cutoff" ]]; then
    rm -rf "$dir"
    echo "  deleted: $dir_name (older than $cutoff)" >> "$LOG"
  fi
done

echo "[$TODAY $(date +%H:%M:%S)] cleanup done" >> "$LOG"
