# 스마트스토어 문의/답변 수집기

네이버 스마트스토어의 전체 문의/답변을 Google Sheets에 저장하는 스크립트.

## 실행 방법

```bash
python3 ~/Documents/claude_skills/smartstore_qna/smartstore_qna_collector.py
```

## 실행 전 체크리스트

1. **CDP 브라우저 실행** — 스마트스토어 탭이 열려 있어야 쿠키 자동 추출
   ```bash
   # CDP가 꺼져 있으면 먼저 실행
   /chrome-cdp -bnam91
   ```

2. **스마트스토어 탭 열기** — 아래 URL이 CDP 브라우저에 열려 있어야 함
   ```
   https://sell.smartstore.naver.com/#/comment/
   ```

3. **로그인 상태 확인** — bnam91@goyamkt.com 로그인 유지 중인지 확인

## 저장 위치

| 항목 | 내용 |
|------|------|
| Google Sheets ID | `1nO9_zyJtTPl05kX9z1IbBZX7jWjARsMXZw4qL1Hauow` |
| 시트 탭 | `시트1` |
| 컬럼 | 문의일 / 상품번호 / 상품명 / 고객ID / 질문내용 / 답변여부 / 답변일 / 답변내용 |

## 동작 방식

- 2020년부터 오늘까지 **90일 단위**로 API 호출 (UI 최대 3개월 제한 우회)
- 각 문의의 답변 내용은 별도 API로 추가 수집
- 실행할 때마다 시트를 **전체 덮어씀** (중복 없이 최신 상태 유지)

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| `CDP 탭을 찾을 수 없습니다` | CDP 미실행 또는 스마트스토어 탭 없음 | `/chrome-cdp -bnam91` 실행 후 스마트스토어 탭 열기 |
| `401 Unauthorized` | 로그인 세션 만료 | CDP 브라우저에서 스마트스토어 재로그인 |
| `HttpError 400` | 시트 탭 이름 불일치 | 스크립트 내 `SHEET_NAME` 값 확인 |
