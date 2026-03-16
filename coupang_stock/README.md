# coupang_stock

쿠팡 Wing API를 통해 경쟁사 실재고를 조회하고 Google Sheets에 기록하는 스크립트 모음.

---

## 파일 구조

| 파일 | 설명 |
|------|------|
| `stock_checker.py` | Chrome CDP로 재고 조회 — **Mac용** |
| `stock_checker_window.py` | Chrome CDP로 재고 조회 — **Windows용** (포트 9223) |
| `multi_user_runner.py` | 멀티유저 일괄 조회 → 시트 기록 — **Mac용** |
| `multi_user_runner_window.py` | 멀티유저 일괄 조회 → 시트 기록 — **Windows용** |
| `stock_sheet_batch.py` | 단일 시트 조회 기록 (구버전, Mac용) |

---

## 환경 설정

### 공통
- Python 3.10+
- 필수 패키지: `requests`, `websocket-client`
  ```bash
  pip install requests websocket-client
  ```
- `~/Documents/github_cloud/module_api_key/.env` 에 Wing 계정 정보 필요:
  ```
  wingid=your_wing_id
  wingpw=your_wing_password
  ```
- Google Sheets 인증: `~/Documents/github_cloud/module_auth/auth.py`

### Mac
- Chrome 경로: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Chrome 프로필: `~/Documents/github_cloud/user_data/coupangWing_bnam91`
- CDP 포트: **9222**

### Windows
- Chrome 경로: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Chrome 프로필: `C:\Users\darli\Documents\github_cloud\user_data\coupangWing_bnam91`
- CDP 포트: **9223** (9222는 naver용이 점유)

---

## 실행 방법

### Mac
```bash
python3 multi_user_runner.py
```

### Windows
```bash
python multi_user_runner_window.py
```
> Windows 콘솔에서 직접 실행 시 UTF-8 깨짐 방지:
> ```bash
> python -X utf8 multi_user_runner_window.py
> ```
> (스크립트 내부에서도 자동 처리됨)

---

## 동작 흐름

1. `users_config` 시트에서 `active=TRUE` + 유효기간 내 유저 로드
2. 각 유저 시트 D열에서 쿠팡 상품 URL 수집
3. 전체 `vendorItemId` 한 번에 Wing API 배치 조회
4. 결과를 각 유저 시트 J열 이후 새 열에 **배치 write** (API 1회 호출)
5. 증감량 포맷(`117 (+11)`, `62 (-3)`) + 색상 적용

---

## 스케줄러 등록

### Mac (crontab)
```bash
50 23 * * * python3 ~/Documents/claude_skills/coupang_stock/multi_user_runner.py
```

### Windows (Task Scheduler)
- 작업 이름: `CoupangStock_MultiUser_Daily`
- 실행 시각: 매일 **23:50**
- 실행 명령:
  ```
  C:\Users\darli\AppData\Local\Programs\Python\Python310\python.exe
  C:\Users\darli\Documents\claude_skills\coupang_stock\multi_user_runner_window.py
  ```

---

## Chrome 프로필 초기화

첫 실행 시 `coupangWing_bnam91` 프로필이 없으면 자동으로:
1. Chrome 새 프로필로 실행
2. `wing.coupang.com` 접속
3. `.env`의 `wingid` / `wingpw`로 자동 로그인

이후 실행부터는 세션 유지.

---

## users_config 시트 구조

| 컬럼 | 설명 |
|------|------|
| `user_name` | 유저 이름 |
| `active` | TRUE / FALSE |
| `start_date` | 서비스 시작일 (YYYY-MM-DD) |
| `end_date` | 서비스 종료일 (YYYY-MM-DD) |
| `sheet_url` | 유저 Google Sheets URL |
| `tab` | 시트 탭 이름 (기본: 시트1) |
