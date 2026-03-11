# app_reminders_control 사용법

맥OS 미리알림(Reminders) 앱 목록 조회 및 항목 추가 CLI

## 요구사항

```bash
pip install pyobjc-framework-EventKit
```

## 목록 조회

```bash
# 대화형 선택
python app_reminders_control.py

# 번호로 선택 (4번 목록)
python app_reminders_control.py 4

# 목록 이름으로 선택 (부분 일치)
python app_reminders_control.py GG_timeline
```

## 미리알림 추가

지정한 목록의 **섹션**에 미리알림 추가:

```bash
python app_reminders_control.py 4 "1주차, 명함만들기"
# → GG_timeline(4번) 목록의 1주차 섹션에 "명함만들기" 추가

python app_reminders_control.py GG_timeline "런칭 이후, 3PL 계약"
# → GG_timeline 목록의 런칭 이후 섹션에 "3PL 계약" 추가
```

**형식:** `"섹션, 제목"` (쉼표로 구분)
