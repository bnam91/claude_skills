---
name: print
description: 파일(PDF/이미지/문서)이나 웹페이지(URL/HTML)를 맥에 연결된 실제 프린터로 종이 출력하는 스킬. 사용자가 "프린트 해줘", "인쇄해줘", "출력해줘", "이 PDF 인쇄", "이 페이지 프린트해줘", "/print" 등을 말할 때 실행해.
---

# 프린트 (실제 프린터 종이 출력)

맥에 등록된 프린터로 파일/웹페이지를 **물리 출력**한다. macOS CUPS(`lp`) + Chrome 헤드리스 렌더를 사용한다.

핵심 헬퍼: `~/.claude/skills/print/goprint.sh`

## 동작 원칙

- **실제 종이가 나가는 작업**이다. 출력 직전 반드시 대상·매수·프린터를 1줄로 확인하고 진행한다. (낭비/오출력 방지)
- 사용자가 대상(파일경로/URL)을 안 줬으면 먼저 물어본다.
- 여러 장·여러 부 출력이면 매수를 재확인한다.

## 실행 순서

### 1단계: 프린터 상태 확인

```bash
lpstat -p -d        # 등록 프린터 + 기본 프린터
lpstat -o           # 현재 출력 큐 (비어있어야 정상)
```

프린터가 하나도 없으면 출력 불가 — 사용자에게 "시스템 설정 > 프린터에서 프린터를 먼저 추가해야 한다"고 안내한다.

### 2단계: dry-run으로 명령 미리보기 (권장)

실제 출력 전에 어떤 `lp` 명령이 나갈지 보여주고 승인받는다.

```bash
~/.claude/skills/print/goprint.sh --dry-run <대상>
```

### 3단계: 실제 출력

```bash
~/.claude/skills/print/goprint.sh <대상>
```

## 사용 예시

```bash
# 기존 PDF 1부 (기본 프린터, A4)
~/.claude/skills/print/goprint.sh ~/Documents/계약서.pdf

# 이미지 흑백 2부
~/.claude/skills/print/goprint.sh -g -n 2 ~/Desktop/송장.png

# 웹페이지를 컬러로 출력
~/.claude/skills/print/goprint.sh -c https://example.com/page

# PDF 1~3페이지만, 양면
~/.claude/skills/print/goprint.sh -r 1-3 -2 보고서.pdf

# docx 문서 (textutil로 변환 후 출력)
~/.claude/skills/print/goprint.sh ~/Downloads/제안서.docx

# 가로 방향 웹페이지
~/.claude/skills/print/goprint.sh --landscape https://news.site/article
```

## 옵션 요약

| 옵션 | 의미 |
|------|------|
| `-p, --printer NAME` | 프린터 지정 (기본: 시스템 기본) |
| `-n, --copies N` | 매수 |
| `-c / -g` | 컬러 / 흑백 |
| `-r, --range 1-3,5` | 페이지 범위 |
| `-m, --media A4` | 용지 (A4/Letter/A5/A6/B5/Legal …) |
| `-2, --duplex` | 양면 |
| `--landscape` | 가로 (HTML/URL 변환 시) |
| `--dry-run` | 명령만 표시, 출력 안 함 |

## 지원 대상별 처리 방식

| 대상 | 처리 |
|------|------|
| PDF / 이미지 / txt | `lp` 직접 출력 |
| URL (http/https) | Chrome 헤드리스 `--print-to-pdf` → 출력 |
| HTML 파일 | `file://` 로 Chrome 렌더 → 출력 |
| doc/docx/rtf/odt | `textutil`로 HTML 변환 → Chrome 렌더 → 출력 |

## 출력 후 확인

```bash
lpstat -o                  # 큐에 잡(job)이 올라갔는지
lpstat -W completed -o     # 완료된 잡 확인
```

작업이 끝나면 잡 ID와 "프린터로 전송 완료"를 보고한다. 종이가 실제로 나오는지는 물리 프린터 상태(용지/토너)에 달려있으므로, 큐 전송까지를 스킬의 책임 범위로 본다.

## 트러블슈팅

- **큐에 멈춰있음**: `lpstat -p` 로 프린터가 `disabled`인지 확인 → `cupsenable <프린터명>` 으로 활성화.
- **잡 취소**: `cancel <job-id>` 또는 전체 `cancel -a`.
- **한글 깨짐(텍스트 직접 출력)**: txt는 가급적 HTML/PDF 경유가 안전. 깨지면 대상을 PDF로 변환 후 재시도.
- **Chrome 렌더 실패**: Chrome이 `/Applications/Google Chrome.app` 에 있는지 확인. 다른 경로면 `goprint.sh`의 `CHROME` 변수 수정.
