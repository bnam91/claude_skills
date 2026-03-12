/**
 * new_project.js — Notion Projects DB에 새 프로젝트를 10단계 프레임워크로 생성
 *
 * 사용법:
 *   node new_project.js \
 *     --name "프로젝트명" \
 *     --skill "skill-name" \
 *     --kpi "성공 기준 설명" \
 *     --step6 "핵심 기능 구현 1차 내용" \
 *     --step7 "핵심 기능 구현 2차 내용"
 *
 * 필수: --name
 * 선택: --skill, --kpi, --step6, --step7 (없으면 기본값 사용)
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

const DB_ID = '321111a5-7788-81ba-bc96-e1f4df41135b';

// ── 인자 파싱 ────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(key) {
  const i = args.indexOf(key);
  return i !== -1 ? args[i + 1] : null;
}

const name   = getArg('--name');
const skill  = getArg('--skill') || '';
const kpi    = getArg('--kpi')   || '성공 기준을 정의해주세요';
const step6  = getArg('--step6') || '핵심 기능 구현 1차';
const step7  = getArg('--step7') || '핵심 기능 구현 2차 (보완 및 연동)';

if (!name) {
  console.error('❌ --name 은 필수입니다');
  console.error('예시: node new_project.js --name "프로젝트명" --skill "my-skill" --kpi "목표 설명"');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];

// ── 1. DB에 row 생성 ─────────────────────────────────
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

console.log(`\n🚀 "${name}" 프로젝트 생성 시작...\n`);

const page = await request('POST', '/pages', {
  parent: { database_id: DB_ID },
  properties: {
    '프로젝트명': { title: [{ text: { content: name } }] },
    '상태':       { select: { name: '기획중' } },
    '스킬명':     { rich_text: [{ text: { content: skill } }] },
    '다음할일':   { rich_text: [{ text: { content: '[사업가] STEP 1. 프로젝트 목표 및 배경 정의' } }] },
    '진행률':     { number: 0 },
    '마지막세션': { date: { start: today } }
  }
});

const PAGE_ID = page.id;
console.log(`✅ DB row 생성 완료 (ID: ${PAGE_ID})`);

// ── 2. 페이지 내부 블록 생성 ──────────────────────────
const steps = [
  { step: 1,  text: '프로젝트 목표 및 배경 정의 (Claude Code와 대화 → .md 저장)' },
  { step: 2,  text: `성공 기준(KPI) 및 최종 Output 정의 → ${kpi}` },
  { step: 3,  text: '우선순위 및 범위 확정' },
  { step: 4,  text: '프레임워크 .md 작성 및 Notion 페이지 구성' },
  { step: 5,  text: '환경 설정 및 도구 준비' },
  { step: 6,  text: step6 },
  { step: 7,  text: step7 },
  { step: 8,  text: '테스트 및 오류 수정' },
  { step: 9,  text: 'KPI 기준 Output 검수 — 검수 체크리스트 완료' },
  { step: 10, text: '최종 승인 및 완료 처리 (상태 → 완료, 세션 로그 마감)' },
];

await request('PATCH', `/blocks/${PAGE_ID}/children`, {
  children: [
    // ── 📋 Framework ──
    {
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: '📋 Framework' } }] }
    },
    // 가이드 callout
    {
      object: 'block', type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '📌' },
        rich_text: [{ text: { content: '순서대로 진행. 막히거나 논의가 필요하면 블로커 필드에 이유를 입력하고 상태를 🔴 스톱으로 변경.' } }]
      }
    },
    ...steps.map(s => ({
      object: 'block', type: 'to_do',
      to_do: {
        rich_text: [{ text: { content: `STEP ${s.step}. ${s.text}` } }],
        checked: false
      }
    })),

    // ── 📝 세션 로그 ──
    {
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: '📝 세션 로그' } }] }
    },
    {
      object: 'block', type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '💡' },
        rich_text: [{ text: { content: '매 세션 종료 시 토글 추가. 형식: "날짜 | 작업요약" → 내부에 ✅ 한 것 / ➡️ 다음 할 것 / 💬 결정사항 기록.' } }]
      }
    },
    {
      object: 'block', type: 'toggle',
      toggle: {
        rich_text: [{ text: { content: `${today} | 프로젝트 생성` } }],
        children: [
          { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: `✅ 한 것: Projects DB에 "${name}" 프로젝트 생성, 10단계 Framework 구성` } }] } },
          { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: '➡️ 다음: [사업가] STEP 1 — 프로젝트 목표 및 배경 정의' } }] } },
          { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: '💬 결정사항: -' } }] } }
        ]
      }
    },

    // ── ✅ 검수 ──
    {
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: '✅ 검수' } }] }
    },
    {
      object: 'block', type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '🔍' },
        rich_text: [{ text: { content: '[관리자] STEP 9에서 아래 항목을 하나씩 확인. 모두 통과해야 STEP 10(최종 승인)으로 넘어갈 수 있음.' } }]
      }
    },
    { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: `KPI 달성 여부 확인: ${kpi}` } }], checked: false } },
    { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '최종 Output이 STEP 2에서 정의한 기준과 일치하는가' } }], checked: false } },
    { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '사업가가 직접 사용해보고 이상 없는가' } }], checked: false } },
    { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '세션 로그가 빠짐없이 기록되어 있는가' } }], checked: false } }
  ]
});

console.log(`✅ 페이지 구조 생성 완료 (Framework / 세션로그 / 검수)`);
console.log(`\n📎 페이지 URL: ${page.url}`);
console.log(`\n🎯 다음 할 일: [사업가] STEP 1 — 프로젝트 목표 및 배경 정의\n`);
