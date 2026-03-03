/**
 * _db_get_today.js
 * PM_GG브리핑 DB에서 오늘자 페이지를 찾거나 생성한다.
 * 출력: 페이지 ID, 업무 시작 브리핑 토글 ID, 업무 마감 브리핑 토글 ID
 */
import { queryDatabase, createPage, getChildren, appendBlocks } from './notion_api.js';

const DB_ID = '318111a57788804ba081cb8ae05707ae';

const now = new Date();
const TODAY = `${now.getMonth() + 1}.${now.getDate()}`;

// 오늘자 페이지 검색
const result = await queryDatabase(DB_ID, {
  filter: {
    property: '이름',
    title: { equals: TODAY }
  }
});

let pageId;
let startToggleId;
let endToggleId;

if (result.results.length > 0) {
  // 기존 페이지 사용
  pageId = result.results[0].id;
  console.log(`📅 기존 페이지 발견: ${TODAY} (${pageId})`);

  const children = await getChildren(pageId);
  const startToggle = children.find(b => b.type === 'toggle' && b.toggle?.rich_text?.map(t => t.plain_text).join('') === '업무 시작 브리핑');
  const endToggle   = children.find(b => b.type === 'toggle' && b.toggle?.rich_text?.map(t => t.plain_text).join('') === '업무 마감 브리핑');

  startToggleId = startToggle?.id;
  endToggleId   = endToggle?.id;

  // 토글이 없으면 추가
  if (!startToggleId || !endToggleId) {
    const toAdd = [];
    if (!startToggleId) toAdd.push({ object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 시작 브리핑' } }] } });
    if (!endToggleId)   toAdd.push({ object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 마감 브리핑' } }] } });
    const added = await appendBlocks(pageId, toAdd);
    const updatedChildren = await getChildren(pageId);
    startToggleId = updatedChildren.find(b => b.type === 'toggle' && b.toggle?.rich_text?.map(t => t.plain_text).join('') === '업무 시작 브리핑')?.id;
    endToggleId   = updatedChildren.find(b => b.type === 'toggle' && b.toggle?.rich_text?.map(t => t.plain_text).join('') === '업무 마감 브리핑')?.id;
    console.log(`  ➕ 토글 추가됨`);
  }
} else {
  // 새 페이지 생성
  const newPage = await createPage(
    { type: 'database_id', database_id: DB_ID },
    { '이름': { title: [{ type: 'text', text: { content: TODAY } }] } },
    [
      { object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 시작 브리핑' } }] } },
      { object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 마감 브리핑' } }] } },
    ]
  );
  pageId = newPage.id;
  console.log(`✨ 새 페이지 생성: ${TODAY} (${pageId})`);

  const children = await getChildren(pageId);
  startToggleId = children.find(b => b.type === 'toggle' && b.toggle?.rich_text?.map(t => t.plain_text).join('') === '업무 시작 브리핑')?.id;
  endToggleId   = children.find(b => b.type === 'toggle' && b.toggle?.rich_text?.map(t => t.plain_text).join('') === '업무 마감 브리핑')?.id;
}

console.log(`PAGE_ID=${pageId}`);
console.log(`START_TOGGLE_ID=${startToggleId}`);
console.log(`END_TOGGLE_ID=${endToggleId}`);
