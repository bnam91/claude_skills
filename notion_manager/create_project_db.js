/**
 * create_project_db.js - CTO 페이지에 Projects DB 생성
 */
import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';

const envRaw = readFileSync(path.join(os.homedir(), 'Documents/claude_skills/.env'), 'utf8');
const apiKey = envRaw.match(/NOTION_API_KEY=(.+)/)[1].trim();

const HEADERS = {
  'Authorization': `Bearer ${apiKey}`,
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
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

// CTO 페이지 ID
const PARENT_PAGE_ID = '2ca111a57788803b955ae6254a5db338';

async function createProjectsDB() {
  const db = await request('POST', '/databases', {
    parent: { page_id: PARENT_PAGE_ID },
    icon: { type: 'emoji', emoji: '🗂️' },
    title: [{ type: 'text', text: { content: '🗂 Projects' } }],
    properties: {
      '프로젝트명': { title: {} },
      '상태': {
        select: {
          options: [
            { name: '기획중', color: 'gray' },
            { name: '진행중', color: 'blue' },
            { name: '🔴 스톱', color: 'red' },
            { name: '검수중', color: 'yellow' },
            { name: '완료', color: 'green' }
          ]
        }
      },
      '현재단계': {
        select: {
          options: [
            { name: '사업가', color: 'purple' },
            { name: '실무자', color: 'blue' },
            { name: '관리자', color: 'orange' }
          ]
        }
      },
      '다음할일': { rich_text: {} },
      '블로커': { rich_text: {} },
      '마지막세션': { date: {} }
    }
  });
  console.log('✅ Projects DB 생성 완료');
  console.log('DB ID:', db.id);
  console.log('URL:', db.url);
  return db;
}

createProjectsDB().catch(e => { console.error('❌', e.message); process.exit(1); });
