/**
 * notion_manager.js - Notion REST API 범용 매니저
 * API 키 위치: ~/Documents/claude_skills/notion_manager/config.json
 */

import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';

// API 키 로드
function getApiKey() {
  const configPath = path.join(os.homedir(), 'Documents/claude_skills/notion_manager/config.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config.api_key;
  } catch {
    throw new Error(`config.json 없음. ${configPath} 에 API 키를 설정해줘.`);
  }
}

const HEADERS = {
  'Authorization': `Bearer ${getApiKey()}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

async function request(method, endpoint, body = null) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: HEADERS,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

// ── 페이지 ──────────────────────────────────────
export async function getPage(pageId) {
  return request('GET', `/pages/${pageId}`);
}

export async function getPageContent(blockId) {
  const data = await request('GET', `/blocks/${blockId}/children`);
  return data.results || [];
}

export async function createPage(parentId, parentType, properties, children = []) {
  const parent = parentType === 'database'
    ? { database_id: parentId }
    : { page_id: parentId };
  return request('POST', '/pages', { parent, properties, ...(children.length ? { children } : {}) });
}

export async function updatePage(pageId, properties) {
  return request('PATCH', `/pages/${pageId}`, { properties });
}

export async function appendText(pageId, text) {
  return request('PATCH', `/blocks/${pageId}/children`, {
    children: [{
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: text } }] }
    }]
  });
}

export async function deletePage(pageId) {
  return request('PATCH', `/pages/${pageId}`, { archived: true });
}

// ── 데이터베이스 ─────────────────────────────────
export async function queryDatabase(databaseId, filter = null, sorts = null) {
  const body = {};
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  return request('POST', `/databases/${databaseId}/query`, body);
}

export async function getDatabase(databaseId) {
  return request('GET', `/databases/${databaseId}`);
}

// ── 검색 ─────────────────────────────────────────
export async function search(query, filterType = null) {
  const body = { query };
  if (filterType) body.filter = { value: filterType, property: 'object' };
  return request('POST', '/search', body);
}

// ── 유틸 ─────────────────────────────────────────
export function getText(block) {
  return block[block.type]?.rich_text?.map(t => t.plain_text).join('') || '';
}

export function getTitle(page) {
  const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title');
  return titleProp?.title?.map(t => t.plain_text).join('') || '(제목 없음)';
}

// ── CLI ──────────────────────────────────────────
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [,, action, id, ...rest] = process.argv;

  const actions = {
    'get-page': async () => {
      const page = await getPage(id);
      console.log(JSON.stringify(page, null, 2));
    },
    'get-content': async () => {
      const blocks = await getPageContent(id);
      blocks.forEach(b => console.log(`[${b.type}] ${getText(b)}`));
    },
    'query-db': async () => {
      const data = await queryDatabase(id);
      data.results.forEach(p => console.log(`- ${getTitle(p)} | ${p.id}`));
    },
    'append-text': async () => {
      await appendText(id, rest.join(' '));
      console.log('텍스트 추가 완료');
    },
    'search': async () => {
      const data = await search(id, rest[0] || null);
      data.results.forEach(r => console.log(`[${r.object}] ${getTitle(r)} | ${r.id}`));
    },
    'delete-page': async () => {
      await deletePage(id);
      console.log('페이지 삭제(아카이브) 완료');
    }
  };

  if (!actions[action]) {
    console.log('사용법: node notion_manager.js <action> <id> [args]');
    console.log('actions: get-page, get-content, query-db, append-text, search, delete-page');
    process.exit(1);
  }

  actions[action]().catch(e => { console.error(e.message); process.exit(1); });
}
