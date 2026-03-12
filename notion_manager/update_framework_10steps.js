import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';

const envRaw = readFileSync(path.join(os.homedir(), 'Documents/claude_skills/.env'), 'utf8');
const apiKey = envRaw.match(/NOTION_API_KEY=(.+)/)[1].trim();

const HEADERS = {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

// 기존 to_do 블록 삭제 (Framework 섹션 7개)
const oldBlocks = [
  '321111a5-7788-81c5-9b26-f339618203bd',
  '321111a5-7788-81e7-8d19-c20db4e4fb64',
  '321111a5-7788-81e3-8e16-feceaf1969de',
  '321111a5-7788-8169-9224-c934a83e6677',
  '321111a5-7788-810e-9226-d68e099bdbf2',
  '321111a5-7788-816f-85df-f0770870c756',
  '321111a5-7788-8194-b639-dfad8069735d',
];

for (const id of oldBlocks) {
  await fetch(`https://api.notion.com/v1/blocks/${id}`, {
    method: 'DELETE',
    headers: HEADERS
  });
}
console.log('🗑️ 기존 블록 삭제 완료');

// 페이지에 heading 다음 위치에 10단계 추가 (after 파라미터 사용)
const PAGE_ID = '321111a5-7788-812f-9204-ffac743a6a11';
const HEADING_ID = '321111a5-7788-81d6-b3ab-d1986525229b';

const steps = [
  { role: '사업가', step: 1,  text: '프로젝트 목표 및 배경 정의 (Claude Code와 대화 → .md 저장)', checked: true },
  { role: '사업가', step: 2,  text: '성공 기준(KPI) 및 최종 Output 정의', checked: true },
  { role: '사업가', step: 3,  text: '역할 배정 — 실무자 / 관리자 지정', checked: true },
  { role: '실무자', step: 4,  text: '프레임워크 .md 작성 및 Notion 페이지 구성', checked: true },
  { role: '실무자', step: 5,  text: '환경 설정 및 도구 준비', checked: true },
  { role: '실무자', step: 6,  text: '핵심 기능 구현 1차', checked: false },
  { role: '실무자', step: 7,  text: '핵심 기능 구현 2차 (보완 및 연동)', checked: false },
  { role: '실무자', step: 8,  text: '테스트 및 오류 수정', checked: false },
  { role: '관리자', step: 9,  text: 'KPI 기준 Output 검수 — 검수 체크리스트 완료', checked: false },
  { role: '사업가', step: 10, text: '최종 승인 및 완료 처리 (상태 → 완료, 세션 로그 마감)', checked: false },
];

const res = await fetch(`https://api.notion.com/v1/blocks/${PAGE_ID}/children`, {
  method: 'PATCH',
  headers: HEADERS,
  body: JSON.stringify({
    after: HEADING_ID,
    children: steps.map(s => ({
      object: 'block',
      type: 'to_do',
      to_do: {
        rich_text: [{ text: { content: `[${s.role}] STEP ${s.step}. ${s.text}` } }],
        checked: s.checked
      }
    }))
  })
});

const data = await res.json();
if (!res.ok) console.error(JSON.stringify(data));
else console.log('✅ 10단계 프레임워크 업데이트 완료');
