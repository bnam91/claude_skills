#!/usr/bin/env node
/**
 * db_read.js - Notion 데이터베이스 조회 (전용)
 *
 * 사용법: node db_read.js
 */

import { queryDatabase, getDatabase } from './notion_api.js';

const DB_URL = 'https://www.notion.so/2f6111a5778881ceaf1be4e73f6644ea?v=2f6111a577888116bef8000c96c9ba8f';
const DB_ID = '2f6111a5778881ceaf1be4e73f6644ea';

// UI 순서에 맞게 정렬 (Notion 뷰 기준. 필요시 수정)
const SORTS = [
  { property: '우선순위', direction: 'ascending' },
  { property: '상태', direction: 'ascending' },
  { property: '데드라인(까지)', direction: 'ascending' },
  { timestamp: 'created_time', direction: 'ascending' }
];

function propToText(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
      return (prop.title || []).map(t => t.plain_text).join('');
    case 'rich_text':
      return (prop.rich_text || []).map(t => t.plain_text).join('');
    case 'number':
      return String(prop.number ?? '');
    case 'select':
      return prop.select?.name ?? '';
    case 'status':
      return prop.status?.name ?? '';
    case 'multi_select':
      return (prop.multi_select || []).map(s => s.name).join(', ');
    case 'date':
      if (!prop.date) return '';
      return prop.date.end ? `${prop.date.start} ~ ${prop.date.end}` : prop.date.start;
    case 'checkbox':
      return prop.checkbox ? '☑' : '☐';
    case 'url':
      return prop.url ?? '';
    case 'relation':
      return (prop.relation || []).length ? `[${prop.relation.length}개]` : '';
    case 'people':
      return (prop.people || []).map(p => p.name).join(', ');
    case 'formula':
      if (prop.formula?.type === 'string') return prop.formula.string ?? '';
      if (prop.formula?.type === 'number') return String(prop.formula.number ?? '');
      if (prop.formula?.type === 'boolean') return prop.formula.boolean ? '☑' : '☐';
      if (prop.formula?.type === 'date') return prop.formula.date?.start ?? '';
      return '';
    default:
      return JSON.stringify(prop).slice(0, 50);
  }
}

async function fetchAllPages() {
  const pages = [];
  let cursor;
  do {
    const body = { sorts: SORTS, ...(cursor ? { start_cursor: cursor } : {}) };
    const res = await queryDatabase(DB_ID, body);
    pages.push(...(res.results || []));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

function getParentId(page) {
  const rel = page.properties?.['상위 항목']?.relation;
  return rel?.[0]?.id || null;
}

function buildHierarchy(pages) {
  const byId = new Map(pages.map(p => [p.id, p]));
  const children = new Map();
  const roots = [];

  for (const p of pages) {
    const parentId = getParentId(p);
    if (!parentId || !byId.has(parentId)) {
      roots.push(p);
    } else {
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(p);
    }
  }

  const sortKey = p => {
    const props = p.properties || {};
    let prio = propToText(props['우선순위']) || 'zzz';
    if (prio.includes('GOAL')) prio = '\uffff' + prio;  // GOAL은 맨 밑으로
    const status = propToText(props['상태']) || 'zzz';
    const date = propToText(props['데드라인(까지)']) || '';
    const task = propToText(props['TASK']) || '';
    return [prio, status, date, task];
  };
  roots.sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i].localeCompare(kb[i]);
    return 0;
  });
  for (const arr of children.values()) arr.sort((a, b) => sortKey(a).join().localeCompare(sortKey(b).join()));

  const ordered = [];
  function visit(p, depth = 0) {
    ordered.push({ page: p, depth });
    for (const c of (children.get(p.id) || [])) visit(c, depth + 1);
  }
  for (const r of roots) visit(r);
  return ordered;
}

function printPage(page, propKeys, indent = '') {
  const props = page.properties || {};
  const row = propKeys.map(key => {
    const val = props[key];
    const text = propToText(val);
    return (text || '-').replace(/\n/g, ' ').slice(0, 40);
  });
  console.log(indent + '  ' + row.join(' | '));
}

// 출력 칼럼 순서
const COLUMN_ORDER = ['우선순위', 'TASK', '아웃풋', '데드라인(까지)', '상태', '이슈 노트'];

try {
  const db = await getDatabase(DB_ID);
  const allKeys = Object.keys(db.properties || {});
  const propKeys = COLUMN_ORDER.filter(k => allKeys.includes(k));

  console.log('\n📊 DB:', db.title?.[0]?.plain_text || '(무제)');
  console.log('─'.repeat(60));
  console.log('  ' + propKeys.join(' | '));
  console.log('─'.repeat(60));

  const pages = await fetchAllPages();
  const ordered = buildHierarchy(pages);
  for (const { page, depth } of ordered) {
    const indent = '  '.repeat(depth);
    printPage(page, propKeys, indent);
  }
  console.log('─'.repeat(60));
  console.log(`총 ${pages.length}개 행\n`);
} catch (e) {
  console.error('오류:', e.message);
  process.exit(1);
}
