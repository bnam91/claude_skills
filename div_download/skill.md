# div_download

상품 상세페이지 URL을 받아 플랫폼을 자동 감지하고 이미지를 다운로드하는 라우터 스킬이야.

## 실행 조건

사용자가 URL과 함께 아래 요청을 할 때 실행해:
- "다운로드해줘"
- "상세 이미지 받아줘"
- "저장해줘"
- `/div_download <URL>`

## 실행 순서

### 1단계: 플랫폼 감지

URL을 보고 아래 기준으로 플랫폼 판단:

| URL 패턴 | 플랫폼 | 사용 스킬 |
|----------|--------|-----------|
| `coupang.com` | 쿠팡 | div_download_coupang |
| `smartstore.naver.com` | 네이버 스마트스토어 | div_download_naver |
| `naver.com` (그 외) | 네이버 | div_download_naver |

판단 불가 시: 사용자에게 플랫폼 확인 요청

### 2단계: 해당 스킬 실행

감지된 플랫폼에 맞는 스킬의 실행 순서를 그대로 따라 진행해.

- 쿠팡 → `/Users/a1/Documents/claude_skills/div_download_coupang/skill.md` 참조
- 네이버 → `/Users/a1/Documents/claude_skills/naver_detail_downloader/skill.md` 참조

## 공통 저장 규칙

- 저장 경로: `~/Downloads/div_download/<폴더명>/`
- 파일명: `01.png`, `02.png` ... (Y좌표 정렬 후 2자리 순번 + 확장자)
- 폴더명: 브랜드_핵심키워드 (최대 20자, 공백→`_`, 특수문자 제거)
