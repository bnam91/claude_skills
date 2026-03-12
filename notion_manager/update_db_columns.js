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

const DB_ID = '321111a5-7788-81ba-bc96-e1f4df41135b';
const ROW_ID = '321111a5-7788-812f-9204-ffac743a6a11';

// 1. DB 컬럼 수정: 현재단계 삭제, 스킬명 + 진행률 추가
const dbRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
  method: 'PATCH',
  headers: HEADERS,
  body: JSON.stringify({
    properties: {
      '현재단계': null,           // 삭제
      '스킬명': { rich_text: {} }, // 추가
      '진행률': { number: { format: 'percent' } } // 추가
    }
  })
});
const dbData = await dbRes.json();
if (!dbRes.ok) console.error('DB 수정 오류:', JSON.stringify(dbData));
else console.log('✅ DB 컬럼 수정 완료 (현재단계 삭제, 스킬명+진행률 추가)');

// 2. 현재 row 업데이트
const rowRes = await fetch(`https://api.notion.com/v1/pages/${ROW_ID}`, {
  method: 'PATCH',
  headers: HEADERS,
  body: JSON.stringify({
    properties: {
      '스킬명': { rich_text: [{ text: { content: 'project-manager' } }] },
      '진행률': { number: 0.5 } // 5/10 = 50%
    }
  })
});
const rowData = await rowRes.json();
if (!rowRes.ok) console.error('Row 수정 오류:', JSON.stringify(rowData));
else console.log('✅ Row 업데이트 완료 (스킬명: project-manager, 진행률: 50%)');
