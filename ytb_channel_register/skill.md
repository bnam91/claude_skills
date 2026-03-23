# ytb_channel_register

YouTube 채널 링크를 Google Sheets raw_data 시트에서 읽어 list 시트에 채널 정보를 자동 입력하는 스킬이야.

## 실행 조건

사용자가 아래와 같은 요청을 할 때 실행해:
- "채널 등록해줘"
- "유튜브 채널 시트에 넣어줘"
- "raw_data 읽어서 list 시트에 입력해줘"
- "ytb 채널 등록"

## 실행 방법

```bash
cd ~/Documents/claude_skills/ytb_channel_register && node ytb_channel_register.js <spreadsheet_id>
```

spreadsheet_id는 사용자가 시트 URL을 주면 추출하거나, 기본값 사용:
- 기본 시트: `1gJ1BzMIviX7Sp69OvKsEnVJDVfFkURovMBPAvonV2ys`

## 동작 방식

1. `raw_data` 시트 A열에서 YouTube 링크 목록 읽기
2. 링크 유형별 파싱:
   - `@handle` (영문/한글/인코딩 모두 지원) → YouTube API forHandle 조회
   - `/channel/UCxxx` → YouTube API id 조회
   - `/watch?v=xxx` → 영상 → 채널 정보 조회
3. `list` 시트에 추가 (중복 자동 스킵):
   - A: 프로필 (`=IMAGE(썸네일url)` 수식으로 채널 프로필 이미지)
   - B: 채널명
   - C: 채널ID (@handle)
   - D: 채널링크 (`=HYPERLINK(...)` 수식으로 "바로가기")

## 결과 출력

실행 결과를 한국어로 정리해서 보여줘:
- 추가된 채널 목록
- 중복 스킵된 채널
- 실패한 링크 (있을 경우)
