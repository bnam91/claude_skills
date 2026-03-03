/**
 * db_set_friday_deadline.js
 * depth 1 + 우선순위 1인 항목의 데드라인을 이번 주 금요일로 일괄 설정
 *
 * Usage: node db_set_friday_deadline.js
 */

import { queryDatabase, updatePageProperties } from './notion_api.js';

const DB_ID = '2f6111a5778881ceaf1be4e73f6644ea';

// 이번 주 금요일 계산 (금요일이면 당일, 토/일이면 다음 주 금요일)
function getThisFriday() {
  const today = new Date();
  const day = today.getDay(); // 0=일 1=월 ... 5=금 6=토
  const diff = day <= 5 ? 5 - day : 7 - day + 5;
  const friday = new Date(today);
  friday.setDate(today.getDate() + diff);
  // toISOString()은 UTC 기준이라 KST에서 날짜가 밀릴 수 있으므로 로컬 기준으로 포맷
  const yyyy = friday.getFullYear();
  const mm = String(friday.getMonth() + 1).padStart(2, '0');
  const dd = String(friday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DEADLINE = getThisFriday();

const result = await queryDatabase(DB_ID, { page_size: 100 });
const pages = result.results;

// pageId → { priority, title, parentId } 맵
const pageMap = {};
for (const page of pages) {
  const priority = page.properties['우선순위']?.status?.name || '-';
  const title = page.properties['TASK']?.title?.[0]?.plain_text || '';
  const parentId = page.properties['상위 항목']?.relation?.[0]?.id || null;
  pageMap[page.id] = { priority, title, parentId };
}

// depth 1 = 부모가 MileStone인 항목
const targets = [];
for (const [id, info] of Object.entries(pageMap)) {
  if (info.priority !== '1') continue;
  if (!info.parentId) continue;
  const parent = pageMap[info.parentId];
  if (parent?.priority === '📍MileStone') {
    targets.push({ id, title: info.title });
  }
}

console.log(`\n📅 이번 주 금요일: ${DEADLINE}`);
console.log(`📋 업데이트 대상: ${targets.length}개\n`);

for (const t of targets) {
  process.stdout.write(`  ${t.title} ... `);
  await updatePageProperties(t.id, {
    '데드라인(까지)': { date: { start: DEADLINE } }
  });
  console.log('✅');
}

console.log('\n완료!');
