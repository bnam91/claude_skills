/**
 * notion_api.js - Notion REST API 직접 호출 (MCP 미사용)
 */
import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';

const envRaw = readFileSync(path.join(os.homedir(), 'github', 'api_key', '.env'), 'utf8');
const apiKey = envRaw.match(/NOTION_API_KEY=(.+)/)[1].trim();

export const HEADERS = {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

export async function getChildren(blockId) {
  const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children`, { headers: HEADERS });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data.results || [];
}

export async function appendBlocks(blockId, children) {
  const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ children })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function appendParagraph(pageId, text) {
  return appendBlocks(pageId, [{
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: text } }] }
  }]);
}

export function getText(block) {
  return block[block.type]?.rich_text?.map(t => t.plain_text).join('') || '';
}

export async function deleteBlock(blockId) {
  const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
    method: 'DELETE',
    headers: HEADERS
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function queryDatabase(databaseId, body = {}) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function getDatabase(databaseId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, { headers: HEADERS });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function getPage(pageId) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: HEADERS });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function updatePageTitle(pageId, titlePropertyKey, newTitle) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({
      properties: {
        [titlePropertyKey]: {
          type: 'title',
          title: [{ type: 'text', text: { content: newTitle } }]
        }
      }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function updatePageProperties(pageId, properties) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ properties })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function createPage(parent, properties, children) {
  const body = { parent, properties, ...(children?.length ? { children } : {}) };
  const res = await fetch(`https://api.notion.com/v1/pages`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function updatePageParent(pageId, newParentId) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ parent: { type: 'page_id', page_id: newParentId } })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function createDatabase(parentPageId, title, properties) {
  const res = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: title } }],
      properties
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

export async function updateDatabase(databaseId, properties) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ properties })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}
