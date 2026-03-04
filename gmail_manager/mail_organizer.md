# 메일 정리 규칙

## 사용 흐름

사용자가 "메일 정리해줘" 또는 "오늘 메일 정리해줘" 라고 하면:

1. 해당 계정의 오늘 받은 메일 목록 조회
2. 아래 분류 기준에 따라 각 메일을 분류
3. 분류 결과를 표로 보여주고 사용자에게 확인
4. 사용자가 "진행해" 또는 "ㅇㅇ" 하면 삭제 실행

---

## 분류 기준

### 🔴 삭제 대상
- 광고/홍보 메일 (쇼핑몰, 뉴스레터, 마케팅)
- 자동발송 알림 (SNS 알림, 앱 알림)
- 스팸성 메일
- 하루 이상 지난 권한/공유 요청 메일 (Figma 시트 요청, Google Sheets 공유, 접근 요청 등)
- 하루 이상 지난 서비스 경고/알림 (MongoDB, Google 보안 경고 등)

### 🟡 보류 (사용자 확인 필요)
- 발신자가 불명확한 메일
- 제목만으로 판단 어려운 메일

### 🟢 보존
- 사람이 직접 보낸 메일 (개인 이메일 주소)
- 업무 관련 메일 (계약, 견적, 협업 등)
- 금융/공공기관 메일 (국세청, 은행, 쿠팡 정산 등)
- 영수증/결제 확인 메일 (receipt, invoice, 구독 결제 등)
- Google 보안 알림 (당일 수신 것만, 하루 지난 것은 삭제)

---

## 삭제 명령어

```bash
cd ~/Documents/github_skills/gmail_manager && python3 gmail_manager.py --trash-mail --account 별칭 --id 메일ID
```

여러 개 삭제:
```bash
cd ~/Documents/github_skills/gmail_manager && python3 gmail_manager.py --trash-mail --account 별칭 --ids ID1,ID2,ID3
```

---

## 계정별 특이사항

### bnam91 (고야앤드미디어)
- 팔도, 쿠팡, 홈택스 관련 → 보존
- 고야앤드미디어 발신 메일 → 보존 (업무용)
- 로켓그로스 알림 → 삭제 대상
- 멘토리 관련 메일 (이혜진, 박가람 등) → 삭제 대상

### 현빈개인메일 (coq3820)
- KAPITAL 등 쇼핑 뉴스레터 → 삭제 대상
- Instagram, Postman, Claude 알림 → 삭제 대상
- Google 보안 알림 → 보존
