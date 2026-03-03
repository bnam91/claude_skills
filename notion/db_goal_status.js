#!/usr/bin/env node
/**
 * db_goal_status.js - GOAL 행의 상태를 업무막힘 → 진행 중으로 변경
 *
 * 사용법: node db_goal_status.js
 */

import { queryDatabase, updatePageProperties } from './notion_api.js';

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

try {
  const pages = await fetchAllPages();
  const goal = pages.find(p => {
    const prio = propToText(p.properties?.['우선순위']);
    return prio && prio.includes('GOAL');
  });

  if (!goal) {
    console.error('GOAL 행을 찾을 수 없습니다.');
    process.exit(1);
  }

  const currentStatus = propToText(goal.properties?.['상태']);
  if (currentStatus !== '업무막힘') {
    console.log(`현재 상태: ${currentStatus} (업무막힘이 아님, 변경 생략)`);
    process.exit(0);
  }

  if (!goal.properties?.['상태']) {
    console.error('상태 속성을 찾을 수 없습니다.');
    process.exit(1);
  }

  await updatePageProperties(goal.id, {
    '상태': { status: { name: '진행 중' } }
  });

  const task = propToText(goal.properties?.['TASK']);
  console.log(`✅ GOAL "${task}" 상태: 업무막힘 → 진행 중`);
} catch (e) {
  console.error('오류:', e.message);
  process.exit(1);
}
