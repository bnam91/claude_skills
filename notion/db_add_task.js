#!/usr/bin/env node
/**
 * db_add_task.js - Notion DB에 업무 추가
 *
 * 사용법:
 *   node db_add_task.js "업무명" [--parent "부모TASK키워드"]
 *
 * --parent: 부모 행의 TASK에 포함된 키워드. 생략 시 root에 추가.
 * 부모 검색: 우선순위="📍MileStone" 이면서 TASK에 키워드 포함된 행.
 */

import { queryDatabase, createPage } from './notion_api.js';

const DB_ID = '2f6111a5778881ceaf1be4e73f6644ea';

function propToText(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
      return (prop.title || []).map(t => t.plain_text).join('');
    case 'status':
      return prop.status?.name ?? '';
    default:
      return '';
  }
}

async function fetchAllPages() {
  const pages = [];
  let cursor;
  do {
    const body = { ...(cursor ? { start_cursor: cursor } : {}) };
    const res = await queryDatabase(DB_ID, body);
    pages.push(...(res.results || []));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

function findParent(pages, parentKeyword) {
  if (!parentKeyword) return null;
  const kw = parentKeyword.trim();
  return pages.find(p => {
    const prio = propToText(p.properties?.['우선순위']) || '';
    const task = propToText(p.properties?.['TASK']) || '';
    return prio.includes('MileStone') && task.includes(kw);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const taskArg = args.find(a => !a.startsWith('--'));
  const parentIdx = args.indexOf('--parent');
  const parentKeyword = parentIdx >= 0 ? args[parentIdx + 1] : null;

  const taskName = taskArg;
  if (!taskName) {
    console.error('사용법: node db_add_task.js "업무명" [--parent "부모TASK키워드"]');
    process.exit(1);
  }

  const pages = await fetchAllPages();
  const parent = findParent(pages, parentKeyword);

  const properties = {
    TASK: { title: [{ type: 'text', text: { content: taskName } }] },
    우선순위: { status: { name: '-' } },
    상태: { status: { name: '-' } }
  };

  if (parent) {
    properties['상위 항목'] = { relation: [{ id: parent.id }] };
  }

  const parentInfo = { database_id: DB_ID };
  const page = await createPage(parentInfo, properties);

  const parentLabel = parent ? `"${propToText(parent.properties?.['TASK'])}" 하위에` : 'root에';
  console.log(`✅ ${parentLabel} 업무 추가: ${taskName}`);
  console.log(`   페이지 ID: ${page.id}`);
}

main().catch(e => {
  console.error('오류:', e.message);
  process.exit(1);
});
