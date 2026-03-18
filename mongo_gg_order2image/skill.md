# mongo-gg-order2image

발주서 Google Sheets URL을 받아서 B7부터 gg_id를 읽고, MongoDB `08_commerce_gg.sku_options`에서 이미지 URL을 찾아 I열에 입력하는 스킬이야.

## 트리거
- 사용자가 발주서 URL을 전달할 때
- "발주서 이미지 채워줘" / "이미지 넣어줘" + 발주서 URL

## 실행 순서

### STEP 1. 시트 ID 추출
URL에서 spreadsheet_id 파싱:
`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit...`

### STEP 2. 탭 목록 조회
```bash
python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py tabs <SPREADSHEET_ID>
```
→ 발주서 탭명 확인 (gid로 특정 탭 식별 불가 시 첫 번째 탭 사용, 또는 사용자에게 확인)

### STEP 3. B7부터 gg_id 읽기
```bash
python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py read <SPREADSHEET_ID> --tab <탭명> --range B7:B50
```
→ 빈 셀 무시, gg_id 목록 수집

### STEP 4. MongoDB에서 imgbb_url 조회
```bash
cd ~/Documents/claude_skills/mongo_manager && python3 mongo_manager.py read --db 08_commerce_gg --col sku_options --filter '{"gg_id":{"$in":[<gg_id_list>]}}'
```
→ gg_id → imgbb_url 매핑 딕셔너리 생성

### STEP 5. 매핑 결과 출력 및 확인
아래 형식으로 보여주고 I열 입력 여부 물어봄:

| 행 | gg_id | imgbb_url |
|---|---|---|
| I7 | gg101 | https://... |
| I8 | gg102 | https://... |
...

"I열에 입력할까요?"

### STEP 6. 승인 시 I열 write
B열 행 번호에 맞춰 I열에 write:
```bash
python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py write <SPREADSHEET_ID> --tab <탭명> --range I7:I<N> --values '<[[url1],[url2],...]]>'
```

## 주의사항
- B열에 gg_id가 없는 행은 스킵 (I열도 빈칸 유지)
- MongoDB에 없는 gg_id는 "미등록" 표시하고 사용자에게 알림
- 발주서-print 탭은 건드리지 않음 (gg_id 구성이 다름)
- 여러 탭에 같은 gg_id가 있으면 동일한 URL 적용

## 관련 스킬
- `mongo_manager` — MongoDB 조회
- `sheet_manager` — Google Sheets 읽기/쓰기
