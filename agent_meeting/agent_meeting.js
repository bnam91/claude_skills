#!/usr/bin/env node
/**
 * agent_meeting.js — rich-agent ↔ PM 회의 관리 스크립트
 *
 * 사용법:
 *   node agent_meeting.js --morning [--date YYYY-MM-DD]
 *   node agent_meeting.js --weekly [--date YYYY-MM-DD]
 *   node agent_meeting.js --list [--date YYYY-MM-DD]
 *   node agent_meeting.js --read --id <page_id>
 *   node agent_meeting.js --write --id <page_id> --block "블록레이블" --text "내용"
 */

import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';

// ── API 설정 ──────────────────────────────────────────────────────────────────
const envRaw = readFileSync(path.join(os.homedir(), 'github', 'api_key', '.env'), 'utf8');
const API_KEY = envRaw.match(/NOTION_API_KEY=(.+)/)[1].trim();

const MEETING_DB_ID = '31c111a5778880a68164f8f27f2463c8';
const PM_LIST = ['pm-cc', 'pm-gg', 'pm-xx'];

const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

async function api(method, path_, body) {
  const res = await fetch(`https://api.notion.com/v1${path_}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return result;
}

// ── 블록 빌더 ─────────────────────────────────────────────────────────────────
function text(content, bold = false) {
  return { type: 'text', text: { content }, annotations: { bold } };
}

function callout(emoji, content, color) {
  return {
    object: 'block', type: 'callout',
    callout: { rich_text: [text(content)], icon: { emoji }, color }
  };
}

function toggle(label) {
  return {
    object: 'block', type: 'toggle',
    toggle: {
      rich_text: [text(label, true)],
      children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }]
    }
  };
}

function paragraph(content, bold = false) {
  return {
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [text(content, bold)] }
  };
}

// ── 오전 회의 생성 ────────────────────────────────────────────────────────────
async function createMorningMeeting(date) {
  date = date || getToday();

  const children = [
    callout('📢', '오늘자 프로젝트 매니저는 자신의 프로젝트 진행상황을 브리핑하고, 오늘자 현빈에게 요청할 업무를 말해주세요', 'blue_background'),
    ...PM_LIST.map(pm => toggle(pm)),
    callout('🤖', '매니저들이 전달한 내용을 확인했고 현빈의 다른 프로젝트 및 개인일정을 고려하여 피드백 전달드립니다. 이를 고려해 금일자 현빈의 업무 검토 및 재요청 부탁드립니다.', 'yellow_background'),
    toggle('Rich Agent 피드백'),
    ...PM_LIST.map(pm => toggle(`${pm} (피드백 반영)`)),
    callout('✅', '현빈의 컨디션과 수행능력을 고려해 최종 스케줄링 합니다.', 'green_background'),
    paragraph('오전미팅 결과 및 내용 : ', true)
  ];

  const page = await api('POST', '/pages', {
    parent: { database_id: MEETING_DB_ID },
    properties: {
      '이름': { title: [text('morning meeting')] },
      '날짜': { date: { start: date } },
      '상태': { select: { name: '예정' } }
    },
    children
  });

  console.log('✅ 오전 회의 생성 완료');
  console.log(`날짜: ${date}`);
  console.log(`ID: ${page.id}`);
  console.log(`URL: ${page.url}`);
  return page;
}

// ── 주간 회의 생성 ────────────────────────────────────────────────────────────
async function createWeeklyMeeting(date) {
  // 이번주 월요일 계산
  const base = date ? new Date(date) : new Date();
  const day = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayStr = sunday.toISOString().slice(0, 10);
  const weekLabel = `${mondayStr} ~ ${sundayStr}`;

  const children = [
    callout('📢', `이번주(${weekLabel}) 각 프로젝트 매니저는 달성 목표와 현빈에게 필요한 지원을 작성해주세요.`, 'blue_background'),
    ...PM_LIST.map(pm => toggle(`${pm} — 이번주 목표`)),
    callout('🤖', '각 PM의 목표를 취합하여 현빈의 이번주 캘린더, 컨디션, 우선순위를 고려한 종합 피드백을 드립니다.', 'yellow_background'),
    toggle('Rich Agent 종합 피드백'),
    ...PM_LIST.map(pm => toggle(`${pm} (피드백 반영)`)),
    callout('✅', '이번주 최종 실행 플랜을 확정합니다.', 'green_background'),
    paragraph('주간 미팅 결과 및 내용 : ', true)
  ];

  const page = await api('POST', '/pages', {
    parent: { database_id: MEETING_DB_ID },
    properties: {
      '이름': { title: [text('weekly meeting')] },
      '날짜': { date: { start: mondayStr, end: sundayStr } },
      '상태': { select: { name: '예정' } }
    },
    children
  });

  console.log('✅ 주간 회의 생성 완료');
  console.log(`기간: ${weekLabel}`);
  console.log(`ID: ${page.id}`);
  console.log(`URL: ${page.url}`);
  return page;
}

// ── 회의 목록 조회 ────────────────────────────────────────────────────────────
async function listMeetings(date) {
  const filter = date ? { property: '날짜', date: { equals: date } } : undefined;

  const res = await api('POST', `/databases/${MEETING_DB_ID}/query`, {
    filter,
    sorts: [{ property: '날짜', direction: 'descending' }]
  });

  if (res.results.length === 0) { console.log('회의 없음'); return; }

  console.log(`=== 회의 목록 (${res.results.length}개) ===`);
  for (const page of res.results) {
    const name = page.properties['이름']?.title?.[0]?.plain_text || '(제목 없음)';
    const d = page.properties['날짜']?.date?.start || '-';
    const status = page.properties['상태']?.select?.name || '-';
    console.log(`  [${d}] ${name} | ${status} | ${page.id}`);
  }
}

// ── 페이지 읽기 ───────────────────────────────────────────────────────────────
async function readMeeting(pageId) {
  const res = await api('GET', `/blocks/${pageId}/children?page_size=50`);
  console.log(`=== 페이지 블록 (${res.results.length}개) ===`);
  for (const block of res.results) {
    const richText = block[block.type]?.rich_text || [];
    const textContent = richText.map(t => t.plain_text).join('');
    console.log(`[${block.type}] ${textContent || '(비어있음)'} | id: ${block.id}`);
    if (block.type === 'toggle' && block.has_children) {
      const children = await api('GET', `/blocks/${block.id}/children`);
      for (const child of children.results) {
        const childText = (child[child.type]?.rich_text || []).map(t => t.plain_text).join('');
        console.log(`  └ [${child.type}] ${childText || '(비어있음)'}`);
      }
    }
  }
}

// ── 토글에 내용 추가 ──────────────────────────────────────────────────────────
async function writeToBlock(pageId, blockLabel, content) {
  const res = await api('GET', `/blocks/${pageId}/children?page_size=50`);
  const target = res.results.find(b => {
    const txt = (b[b.type]?.rich_text || []).map(t => t.plain_text).join('');
    return txt.includes(blockLabel);
  });

  if (!target) {
    console.log(`[오류] "${blockLabel}" 블록을 찾을 수 없음`);
    console.log('사용 가능한 블록:', res.results.map(b =>
      (b[b.type]?.rich_text || []).map(t => t.plain_text).join('')
    ).filter(Boolean).join(', '));
    return;
  }

  await api('PATCH', `/blocks/${target.id}/children`, {
    children: [paragraph(content)]
  });
  console.log(`✅ [${blockLabel}] 에 내용 추가 완료`);
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (args.morning) {
    await createMorningMeeting(args.date || null);
  } else if (args.weekly) {
    await createWeeklyMeeting(args.date || null);
  } else if (args.list) {
    await listMeetings(args.date || null);
  } else if (args.read) {
    if (!args.id) { console.log('오류: --id 필수'); process.exit(1); }
    await readMeeting(args.id);
  } else if (args.write) {
    if (!args.id || !args.block || !args.text) {
      console.log('오류: --id, --block, --text 필수'); process.exit(1);
    }
    await writeToBlock(args.id, args.block, args.text);
  } else {
    console.log(`사용법:
  node agent_meeting.js --morning [--date YYYY-MM-DD]
  node agent_meeting.js --list [--date YYYY-MM-DD]
  node agent_meeting.js --read --id <page_id>
  node agent_meeting.js --write --id <id> --block "pm-cc" --text "내용"`);
  }
}

main().catch(e => { console.error('[오류]', e.message); process.exit(1); });
