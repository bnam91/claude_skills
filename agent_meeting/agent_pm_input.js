#!/usr/bin/env node
/**
 * agent_pm_input.js — PM이 meeting 페이지 토글에 자동 입력
 *
 * 사용법:
 *   node agent_pm_input.js --pm pm-cc --type weekly [--content "직접 입력할 내용"]
 *   node agent_pm_input.js --pm pm-gg --type morning
 */

import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';

const envRaw = readFileSync(path.join(os.homedir(), 'github', 'api_key', '.env'), 'utf8');
const API_KEY = envRaw.match(/NOTION_API_KEY=(.+)/)[1].trim();
const MEETING_DB_ID = '31c111a5778880a68164f8f27f2463c8';

const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

// PM별 프로젝트 DB ID
const PM_DB = {
  'pm-cc': '31c111a5778881a89626ceef93de198b',
  'pm-gg': '2f6111a5778881ceaf1be4e73f6644ea',
  'pm-xx': '31c111a5778881dfaa2bd7121a81563d'
};

async function api(method, path_, body) {
  const res = await fetch(`https://api.notion.com/v1${path_}`, {
    method, headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${data.message}`);
  return data;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true;
    }
  }
  return result;
}

function getThisMonday() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

// ── 블록 빌더 ──────────────────────────────────────────────────────────────────
function mkBullet(content) {
  return {
    object: 'block', type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [{ type: 'text', text: { content } }] }
  };
}

function mkHeading3(content) {
  return {
    object: 'block', type: 'heading_3',
    heading_3: { rich_text: [{ type: 'text', text: { content } }] }
  };
}

function mkParagraph(content, bold = false) {
  return {
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content }, annotations: { bold } }] }
  };
}

function mkCallout(emoji, content, color = 'gray_background') {
  return {
    object: 'block', type: 'callout',
    callout: {
      rich_text: [{ type: 'text', text: { content } }],
      icon: { emoji },
      color
    }
  };
}

// ── 이번주 meeting 페이지 찾기 ──────────────────────────────────────────────────
async function findMeetingPage(type) {
  const monday = getThisMonday();
  const titleMap = { weekly: 'weekly meeting', morning: 'morning meeting' };
  const title = titleMap[type] || type;

  const res = await api('POST', `/databases/${MEETING_DB_ID}/query`, {
    filter: {
      and: [
        { property: '이름', title: { equals: title } },
        { property: '날짜', date: { on_or_after: monday } }
      ]
    },
    sorts: [{ property: '날짜', direction: 'descending' }],
    page_size: 1
  });

  if (res.results.length === 0) {
    throw new Error(`이번주 ${title} 페이지를 찾을 수 없음. 먼저 회의 페이지를 생성해주세요.`);
  }
  return res.results[0];
}

// ── pm-cc 단계 구조 (우선순위 → 단계명 매핑) ────────────────────────────────────
const CC_PHASE_MAP = [
  { maxP: 1, label: '1단계: 시장 발굴 및 기획', total: 6 },
  { maxP: 3, label: '2단계: 상품 소싱',         total: 6 },
  { maxP: 4, label: '3단계: 런칭 준비 (상세페이지)', total: 6 },
  { maxP: 6, label: '4~5단계: 상품 입고 및 등록', total: 6 },
];

function parsePriority(p) {
  if (!p || p === '-' || p === '대기') return 99;          // 미래 단계 제외
  if (p === '🎖 GOAL' || p === '📍MileStone') return 0;   // 단계 헤더 제외
  const n = parseInt(p);
  return isNaN(n) ? 99 : n;
}

function getCcPhaseLabel(priorityNum) {
  for (const phase of CC_PHASE_MAP) {
    if (priorityNum <= phase.maxP) return phase.label;
  }
  return `${priorityNum}단계`;
}

// ── pm-cc: 단계 인식 브리핑 블록 생성 ───────────────────────────────────────────
async function buildPmCcBlocks() {
  const res = await api('POST', `/databases/${PM_DB['pm-cc']}/query`, {
    page_size: 50  // 전체 조회 (완료 항목 포함해서 단계 파악)
  });

  const items = res.results.map(p => {
    const title = p.properties['업무']?.title?.[0]?.plain_text || '(제목 없음)';
    const status = p.properties['4_상태']?.select?.name || '';
    const rawPriority = p.properties['1_우선순위']?.select?.name || '';
    const priorityNum = parsePriority(rawPriority);
    return { title, status, rawPriority, priorityNum };
  }).filter(i => {
    // 제외: 단계 헤더 (✅ 또는 🛍 또는 📍 접두), 우선순위 대기/GOAL/MileStone
    if (i.priorityNum === 0 || i.priorityNum === 99) return false;
    if (/^(✅|🛍|📍|🎖)/.test(i.title)) return false;
    return true;
  });

  // 현재 단계 감지: 진행 중 > 업무막힘 > 최소 우선순위 번호 (진행대기)
  const active = items.filter(i => i.status === '진행 중' || i.status === '업무막힘');
  const activePriorities = active.map(i => i.priorityNum);
  const pendingPriorities = items.filter(i => i.status === '진행대기').map(i => i.priorityNum);
  const allPriorities = [...activePriorities, ...pendingPriorities];

  const currentPriority = allPriorities.length > 0 ? Math.min(...allPriorities) : 1;
  const phaseLabel = getCcPhaseLabel(currentPriority);

  // 단계별 분류
  const blocking   = items.filter(i => i.status === '업무막힘');
  const inProgress = items.filter(i => i.status === '진행 중' && i.priorityNum === currentPriority);
  // 이번주 집중 목표 = 현재 단계 진행대기 (현재 우선순위만)
  const currentGoals = items.filter(i => i.status === '진행대기' && i.priorityNum === currentPriority);
  // 다음 착수 = 현재 우선순위 + 1 항목
  const nextTasks = items.filter(i => i.status === '진행대기' && i.priorityNum === currentPriority + 1);

  // D-day 자동 계산
  const dday = Math.ceil((new Date('2026-04-14') - new Date()) / (1000 * 60 * 60 * 24));
  const totalCurrentPhase = items.filter(i => i.priorityNum === currentPriority).length;
  const completedCurrentPhase = items.filter(i => i.priorityNum === currentPriority && i.status === '완료').length;
  const progressPct = totalCurrentPhase > 0 ? Math.round(completedCurrentPhase / totalCurrentPhase * 100) : 0;

  const blocks = [];

  // 현재 단계 헤더
  blocks.push(mkCallout('📍',
    `현재 단계: ${phaseLabel} | D-${dday} (3.31 런칭) | 단계 진행률: ${progressPct}%`,
    'gray_background'
  ));

  // 🚨 블로킹
  if (blocking.length > 0) {
    blocks.push(mkHeading3('🚨 블로킹 이슈'));
    blocking.forEach(i => {
      blocks.push(mkBullet(`${i.title} — 진행이 불가한 상태입니다. 의사결정 또는 외부 연락이 필요합니다.`));
    });
  }

  // 🔄 이번주 집중 목표 (진행 중 + 현재 단계 진행대기, 최대 5건)
  const focusTasks = [...inProgress, ...currentGoals];
  const displayFocus = focusTasks.slice(0, 5);
  const extraFocus = focusTasks.length - displayFocus.length;

  blocks.push(mkHeading3('🔄 이번주 집중 목표'));
  if (displayFocus.length > 0) {
    displayFocus.forEach(i => {
      const statusLabel = i.status === '진행 중' ? ' [진행 중]' : '';
      blocks.push(mkBullet(`${i.title}${statusLabel}`));
    });
    if (extraFocus > 0) blocks.push(mkBullet(`외 ${extraFocus}건 (현재 단계 동일 우선순위)`));
  } else {
    blocks.push(mkBullet('현재 단계 착수가 필요합니다. 아래 목표를 확인해 주세요.'));
  }

  // 📌 다음 착수 (현재 단계 완료 후)
  if (nextTasks.length > 0) {
    blocks.push(mkHeading3('📌 다음 착수 예정 (현재 단계 완료 후)'));
    nextTasks.slice(0, 3).forEach(i => blocks.push(mkBullet(i.title)));
    if (nextTasks.length > 3) blocks.push(mkBullet(`외 ${nextTasks.length - 3}건`));
  }

  // 💬 PM 코멘트
  let comment = '';
  if (blocking.length > 0) {
    comment = `블로킹 ${blocking.length}건이 발생했습니다. 해소되기 전까지 다음 단계 착수가 불가합니다. 현빈의 의사결정 또는 외부 연락이 이번주 최우선입니다.`;
  } else if (focusTasks.length === 0) {
    comment = `D-${dday}입니다. ${phaseLabel}에 아직 착수하지 않은 상태입니다. 이번주 내에 시작하지 않으면 3.31 런칭 일정을 지키기 어렵습니다. 이번주가 분기점입니다.`;
  } else if (progressPct < 30) {
    comment = `D-${dday}입니다. ${phaseLabel} 진행률이 ${progressPct}%로 낮습니다. 이번주 집중 투입이 필요합니다. 현재 속도라면 런칭 일정이 위태롭습니다.`;
  } else {
    comment = `D-${dday}입니다. ${phaseLabel}이 정상적으로 진행 중입니다 (진행률 ${progressPct}%). 이번주 집중 목표를 완료하면 다음 단계 진입이 가능합니다.`;
  }

  blocks.push(mkHeading3('💬 PM 코멘트'));
  blocks.push(mkCallout('📋', comment, 'blue_background'));

  console.log(`  → 현재 단계: ${phaseLabel} | 블로킹: ${blocking.length} | 집중목표: ${focusTasks.length} | 다음착수: ${nextTasks.length}`);
  return blocks;
}

// ── 직접 입력 내용을 블록으로 변환 ─────────────────────────────────────────────
function buildManualBlocks(content) {
  return content.split('\\n').filter(Boolean).map(line => mkBullet(line));
}

// ── 토글에 구조화된 블록 입력 ───────────────────────────────────────────────────
async function writeToToggle(pageId, toggleLabel, blocks) {
  const res = await api('GET', `/blocks/${pageId}/children?page_size=50`);

  const target = res.results.find(b => {
    const txt = (b[b.type]?.rich_text || []).map(t => t.plain_text).join('');
    return txt.includes(toggleLabel);
  });

  if (!target) {
    console.log(`[오류] "${toggleLabel}" 토글을 찾을 수 없음`);
    console.log('사용 가능:', res.results
      .filter(b => b.type === 'toggle')
      .map(b => (b.toggle?.rich_text || []).map(t => t.plain_text).join(''))
      .join(' / '));
    return;
  }

  // 기존 내용 삭제
  const existing = await api('GET', `/blocks/${target.id}/children`);
  for (const child of existing.results) {
    await api('DELETE', `/blocks/${child.id}`);
  }

  // 새 블록 입력
  await api('PATCH', `/blocks/${target.id}/children`, { children: blocks });
  console.log(`✅ [${toggleLabel}] 입력 완료 (${blocks.length}개 블록)`);
}

async function main() {
  const args = parseArgs();
  const pm = args.pm;
  const type = args.type || 'weekly';

  if (!pm) { console.log('오류: --pm 필수 (pm-cc / pm-gg / pm-xx)'); process.exit(1); }

  // 1. 회의 페이지 찾기
  console.log(`[1] 이번주 ${type} meeting 페이지 조회 중...`);
  const page = await findMeetingPage(type);
  const dateRange = page.properties['날짜']?.date;
  console.log(`    → 발견: ${dateRange?.start} ~ ${dateRange?.end || dateRange?.start} (ID: ${page.id})`);

  // 2. 입력 블록 결정
  let blocks = [];

  if (args.content) {
    blocks = buildManualBlocks(args.content);
  } else if (pm === 'pm-cc') {
    console.log(`[2] pm-cc 프로젝트 현황 분석 중...`);
    blocks = await buildPmCcBlocks();
  } else {
    blocks = [mkBullet('(내용 없음 — --content "내용" 으로 직접 입력하세요)')];
  }

  // 3. 토글 레이블 결정
  const toggleLabel = type === 'weekly' ? `${pm} — 이번주 목표` : pm;

  // 4. 토글에 입력
  console.log(`[3] "${toggleLabel}" 토글에 입력 중...`);
  await writeToToggle(page.id, toggleLabel, blocks);
  console.log(`\n완료! 페이지: ${page.url}`);
}

main().catch(e => { console.error('[오류]', e.message); process.exit(1); });
