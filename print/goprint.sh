#!/usr/bin/env bash
# goprint.sh — 파일 또는 URL/HTML을 실제 프린터로 출력하는 헬퍼
#
# 지원 대상:
#   - PDF / 이미지(png,jpg,jpeg,gif,bmp,tiff) / 텍스트 → lp 직접 출력
#   - 문서(doc,docx,rtf,odt,wordml) → textutil로 HTML 변환 → Chrome로 PDF 렌더 → 출력
#   - URL(http/https) / HTML 파일(.html,.htm) → Chrome 헤드리스 print-to-pdf → 출력
#
# 사용법:
#   goprint.sh [옵션] <파일경로|URL>
#
# 옵션:
#   -p, --printer NAME   프린터 지정 (기본: 시스템 기본 프린터)
#   -n, --copies N       매수 (기본 1)
#   -c, --color          컬러 출력 (ColorModel=RGB)
#   -g, --gray           흑백 출력 (ColorModel=Gray)
#   -r, --range 1-3,5    페이지 범위
#   -m, --media A4       용지 (A4/Letter/A5/A6/B5/Legal 등, 기본 A4)
#   -2, --duplex         양면 (two-sided-long-edge)
#       --landscape      가로 방향 (HTML/URL 변환 시에만 적용)
#       --dry-run        실제 출력 없이 명령만 표시
#   -h, --help           도움말
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PRINTER=""
COPIES=1
COLOR=""
RANGE=""
MEDIA="A4"
SIDES=""
LANDSCAPE=0
DRYRUN=0
TARGET=""

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }
die() { echo "❌ $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--printer) PRINTER="$2"; shift 2 ;;
    -n|--copies)  COPIES="$2"; shift 2 ;;
    -c|--color)   COLOR="RGB"; shift ;;
    -g|--gray)    COLOR="Gray"; shift ;;
    -r|--range)   RANGE="$2"; shift 2 ;;
    -m|--media)   MEDIA="$2"; shift 2 ;;
    -2|--duplex)  SIDES="two-sided-long-edge"; shift ;;
    --landscape)  LANDSCAPE=1; shift ;;
    --dry-run)    DRYRUN=1; shift ;;
    -h|--help)    usage ;;
    -*)           die "알 수 없는 옵션: $1" ;;
    *)            TARGET="$1"; shift ;;
  esac
done

[[ -n "$TARGET" ]] || die "출력 대상(파일경로 또는 URL)이 필요합니다. -h 로 도움말 확인."

# lp 공통 옵션 조립
LP_OPTS=()
[[ -n "$PRINTER" ]] && LP_OPTS+=(-d "$PRINTER")
[[ "$COPIES" -gt 1 ]] && LP_OPTS+=(-n "$COPIES")
[[ -n "$COLOR" ]] && LP_OPTS+=(-o "ColorModel=$COLOR")
[[ -n "$RANGE" ]] && LP_OPTS+=(-o "page-ranges=$RANGE")
[[ -n "$MEDIA" ]] && LP_OPTS+=(-o "media=$MEDIA")
[[ -n "$SIDES" ]] && LP_OPTS+=(-o "sides=$SIDES")

run_lp() {
  local f="$1"
  if [[ "$DRYRUN" -eq 1 ]]; then
    echo "🔎 [dry-run] lp ${LP_OPTS[*]} \"$f\""
    return 0
  fi
  echo "🖨  출력: lp ${LP_OPTS[*]} \"$f\""
  lp "${LP_OPTS[@]}" "$f"
}

# Chrome로 HTML/URL → PDF 렌더
render_pdf() {
  local src="$1" out="$2"
  [[ -x "$CHROME" ]] || die "Chrome을 찾을 수 없습니다: $CHROME"
  local args=(--headless=new --disable-gpu --no-pdf-header-footer
              --no-margins --print-to-pdf="$out")
  [[ "$LANDSCAPE" -eq 1 ]] && args+=(--landscape)
  "$CHROME" "${args[@]}" "$src" >/dev/null 2>&1 || die "Chrome PDF 렌더 실패: $src"
  [[ -s "$out" ]] || die "PDF가 생성되지 않았습니다: $src"
}

TMPDIR_PRINT="$(mktemp -d /tmp/goprint.XXXXXX)"
trap 'rm -rf "$TMPDIR_PRINT"' EXIT

# 1) URL
if [[ "$TARGET" =~ ^https?:// ]]; then
  echo "🌐 웹페이지 렌더링: $TARGET"
  pdf="$TMPDIR_PRINT/page.pdf"
  render_pdf "$TARGET" "$pdf"
  run_lp "$pdf"
  echo "✅ 완료"
  exit 0
fi

# 2) 파일
[[ -f "$TARGET" ]] || die "파일이 없습니다: $TARGET"
ext="${TARGET##*.}"
ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"

case "$ext" in
  pdf|png|jpg|jpeg|gif|bmp|tiff|tif|txt)
    run_lp "$TARGET"
    ;;
  html|htm)
    echo "📄 HTML 렌더링: $TARGET"
    pdf="$TMPDIR_PRINT/doc.pdf"
    render_pdf "file://$(cd "$(dirname "$TARGET")" && pwd)/$(basename "$TARGET")" "$pdf"
    run_lp "$pdf"
    ;;
  doc|docx|rtf|odt|wordml|webarchive)
    echo "📝 문서 변환(textutil→HTML→PDF): $TARGET"
    html="$TMPDIR_PRINT/doc.html"
    textutil -convert html -output "$html" "$TARGET" || die "textutil 변환 실패"
    pdf="$TMPDIR_PRINT/doc.pdf"
    render_pdf "file://$html" "$pdf"
    run_lp "$pdf"
    ;;
  *)
    # 알 수 없는 확장자는 lp에 직접 시도 (CUPS가 처리할 수도 있음)
    echo "⚠️  알 수 없는 형식($ext) — lp에 직접 전달 시도"
    run_lp "$TARGET"
    ;;
esac

echo "✅ 완료"
