/**
 * update_project.js — 프로젝트 세션 종료 시 Notion DB + 페이지 업데이트
 *
 * 사용법:
 *   node update_project.js \
 *     --page "PAGE_ID" \
 *     --next "다음에 할 작업" \
 *     --progress 50 \
 *     --status "진행중" \
 *     --blocker "" \
 *     --did "이번 세션에 한 것" \
 *     --decision "결정사항"
 *
 * 필수: --page, --next, --progress, --status
 * 선택: --blocker (없으면 빈칸), --did, --decision
 */

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

// ── 인자 파싱 ────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(key) {
  const i = args.indexOf(key);
  return i !== -1 ? args[i + 1] : null;
}

const pageId    = getArg('--page');
const next      = getArg('--next');
const progress  = parseFloat(getArg('--progress') ?? '0');
const status    = getArg('--status') ?? '진행중';
const blocker   = getArg('--blocker') ?? '';
const did       = getArg('--did') ?? '';
const decision  = getArg('--decision') ?? '-';

if (!pageId || !next) {
  console.error('❌ --page 와 --next 는 필수입니다');
  process.exit(1);
}

if (status === '🔴 스톱' && !blocker) {
  console.warn('⚠️  status가 🔴 스톱인데 --blocker가 비어있어. 블로커 내용을 입력해줘.');
}

const today = new Date().toISOString().split('T')[0];
// --progress는 항상 0~100 정수로 입력 (Notion percent 필드는 0~1 소수로 저장)
const progressDecimal = progress / 100;

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

// ── 1. DB row 업데이트 ───────────────────────────────
const props = {
  '다음할일':   { rich_text: [{ text: { content: next } }] },
  '진행률':     { number: progressDecimal },
  '마지막세션': { date: { start: today } },
  '상태':       { select: { name: status } },
  '블로커':     { rich_text: [{ text: { content: blocker } }] }
};

await request('PATCH', `/pages/${pageId}`, { properties: props });
console.log(`✅ DB row 업데이트 완료`);
console.log(`   상태: ${status} | 진행률: ${progress}% | 다음: ${next}`);
if (blocker) console.log(`   🔴 블로커: ${blocker}`);

// ── 2. 페이지에 세션 로그 토글 추가 ─────────────────
const logChildren = [];

if (did) {
  logChildren.push({
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ text: { content: `✅ 한 것: ${did}` } }] }
  });
}

logChildren.push({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: [{ text: { content: `➡️ 다음: ${next}` } }] }
});

logChildren.push({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: [{ text: { content: `💬 결정사항: ${decision}` } }] }
});

if (blocker) {
  logChildren.push({
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ text: { content: `🔴 블로커: ${blocker}` } }] }
  });
}

await request('PATCH', `/blocks/${pageId}/children`, {
  children: [{
    object: 'block', type: 'toggle',
    toggle: {
      rich_text: [{ text: { content: `${today} | ${did ? did.slice(0, 30) + (did.length > 30 ? '...' : '') : '세션 업데이트'}` } }],
      children: logChildren
    }
  }]
});

console.log(`✅ 세션 로그 추가 완료 (${today})`);
console.log(`\n📎 페이지: https://www.notion.so/${pageId.replace(/-/g, '')}`);
