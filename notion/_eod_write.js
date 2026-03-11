/**
 * _eod_write.js — 마감 브리핑 작성기 (2단계 구조)
 *
 * ── 1단계: 원시 데이터 수집 (Claude 분석용) ──────────────────
 *   node _eod_write.js --json [--date M.D] [--pm gg|cc]
 *   → 콜아웃 + 프로젝트DB 상태를 JSON으로 출력
 *   → Claude가 이 JSON을 읽고 PM 브리핑 초안 작성
 *
 * ── 2단계: Claude가 작성한 PM 브리핑을 DB에 기록 ─────────────
 *   node _eod_write.js --write '<json>' [--date M.D] [--pm gg|cc]
 *   → Claude가 넘겨준 구조화된 JSON을 Notion 블록으로 변환해 기록
 *
 * ⚠️  단순 완료율 집계 금지 — PM 분석(왜 안됐는지, 내일 우선순위) 포함 필수
 *
 * --write JSON 스키마:
 * {
 *   "members": [
 *     {
 *       "name": "현빈02",
 *       "done": ["task1", "task2"],
 *       "undone": [
 *         { "task": "task3", "comment": "미완료 이유 및 내일 연동 방식" }
 *       ]
 *     }
 *   ],
 *   "comments": ["지혜 코멘트 요약1", "요약2"],
 *   "conditionalWaiting": [
 *     "항목명 → PM 판단 (조건, 리스크)"
 *   ],
 *   "pmSummary": [
 *     "[담당] 업무명 → 판단 이유 (D-day 영향 포함)"
 *   ]
 * }
 */
import {
  getChildren, getText, queryDatabase, createPage, appendBlocks, deleteBlock
} from './notion_api.js';

// ── CLI 인자 ─────────────────────────────────────────────────
const dateArg   = process.argv.includes('--date')  ? process.argv[process.argv.indexOf('--date')  + 1] : null;
const pmArg     = process.argv.includes('--pm')    ? process.argv[process.argv.indexOf('--pm')    + 1] : 'gg';
const jsonMode  = process.argv.includes('--json');
const writeIdx  = process.argv.indexOf('--write');
const writeData = writeIdx !== -1 ? JSON.parse(process.argv[writeIdx + 1]) : null;

const PM = pmArg.toLowerCase();
if (!['gg', 'cc'].includes(PM)) { console.error('--pm gg 또는 --pm cc 로 지정하세요'); process.exit(1); }

const now = new Date();
const TARGET_DATE = dateArg || `${now.getMonth() + 1}.${now.getDate()}`;

// ── PM별 설정 ────────────────────────────────────────────────
const CONFIG = {
  gg: {
    projectDbId:  '2f6111a5778881ceaf1be4e73f6644ea',
    briefingDbId: '318111a57788804ba081cb8ae05707ae',
    titleField: 'TASK', statusField: '상태', priorityField: '우선순위', statusType: 'status',
    launchDate: '2026-03-20',
    members: [
      { name: '현빈02', calloutId: '2f1111a577888127951bc2b17188efff' },
      { name: '지혜',   calloutId: '2f1111a5778881e0b79eec85bbc540c5' },
    ],
    jihyeCommentId: '317111a5778880669d83c48e88d71b22',
  },
  cc: {
    projectDbId:  '31c111a5778881a89626ceef93de198b',
    briefingDbId: '31c111a57788814babddf63dad42844e',
    titleField: '업무', statusField: '4_상태', priorityField: '1_우선순위', statusType: 'select',
    launchDate: '2026-04-14',
    members: [
      { name: '현빈',   calloutId: '8bcea4ed47cb46ae90d7dfa888e09c16' },
      { name: '수지',   calloutId: '2e6111a5778880a6a2f7cfca611ea5b7' },
    ],
    jihyeCommentId: null,
  },
};

const cfg = CONFIG[PM];
const LAUNCH = new Date(cfg.launchDate);
const DDAY = Math.ceil((LAUNCH - now) / (1000 * 60 * 60 * 24));
const SKIP_PRIORITY = ['📍MileStone', '🎖 GOAL', '-', '대기'];

// ── 블록 빌더 ────────────────────────────────────────────────
const h3     = (text) => ({ object: 'block', type: 'heading_3',           heading_3:           { rich_text: [{ type: 'text', text: { content: text } }] } });
const bullet = (text, color = 'default') => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text }, annotations: { color } }] } });
const numbered = (text) => ({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } });
const divider  = () => ({ object: 'block', type: 'divider', divider: {} });
const todo = (text, checked, comment = null) => ({
  object: 'block', type: 'to_do',
  to_do: {
    rich_text: [{ type: 'text', text: { content: text } }],
    checked,
    children: comment ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: comment }, annotations: { color: 'gray' } }] } }] : []
  }
});

// ── 콜아웃 날짜 토글 읽기 ────────────────────────────────────
async function readCallout(name, calloutId) {
  const blocks = await getChildren(calloutId);
  const toggle = blocks.find(b => b.type === 'toggle' && getText(b) === TARGET_DATE);
  if (!toggle) { console.log(`  [${name}] ⚠️ ${TARGET_DATE} 토글 없음`); return { name, done: [], undone: [], total: 0 }; }
  const children = await getChildren(toggle.id);
  const done = [], undone = [];
  for (const b of children) {
    if (b.type !== 'to_do') continue;
    const text = getText(b);
    if (!text) continue;
    b.to_do?.checked ? done.push(text) : undone.push(text);
  }
  console.log(`  [${name}] 완료 ${done.length}/${done.length + undone.length}`);
  return { name, done, undone, total: done.length + undone.length };
}

// ── 지혜 업무코멘트 읽기 ─────────────────────────────────────
async function readComment(id) {
  if (!id) return [];
  try {
    const blocks = await getChildren(id);
    const toggle = blocks.find(b => b.type === 'toggle' && getText(b) === TARGET_DATE);
    if (!toggle) return [];
    const children = await getChildren(toggle.id);
    return children.map(b => getText(b)).filter(Boolean);
  } catch { return []; }
}

// ── 프로젝트 DB 상태 읽기 ────────────────────────────────────
async function readProjectDb() {
  const db = await queryDatabase(cfg.projectDbId, { page_size: 200 });
  const getStatus   = p => cfg.statusType === 'status' ? p.properties[cfg.statusField]?.status?.name || '-' : p.properties[cfg.statusField]?.select?.name || '-';
  const getPriority = p => cfg.statusType === 'status' ? p.properties[cfg.priorityField]?.status?.name || '-' : p.properties[cfg.priorityField]?.select?.name || '-';
  return db.results
    .map(p => ({
      title: (p.properties[cfg.titleField]?.title?.[0]?.plain_text || '').replace(/^✅\s*/, '').trim(),
      status: getStatus(p),
      priority: getPriority(p),
    }))
    .filter(i => i.title && !SKIP_PRIORITY.includes(i.priority));
}

// ── 브리핑 DB 마감 토글 확보 ─────────────────────────────────
async function getEodToggleId() {
  const res = await queryDatabase(cfg.briefingDbId, {
    filter: { property: '이름', title: { equals: TARGET_DATE } }
  });
  let pageId;
  if (res.results.length > 0) {
    pageId = res.results[0].id;
    console.log(`📅 기존 페이지: ${TARGET_DATE} (${pageId})`);
  } else {
    const p = await createPage(
      { type: 'database_id', database_id: cfg.briefingDbId },
      { '이름': { title: [{ type: 'text', text: { content: TARGET_DATE } }] } },
      [
        { object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 시작 브리핑' } }] } },
        { object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 마감 브리핑' } }] } },
      ]
    );
    pageId = p.id;
    console.log(`✨ 새 페이지 생성: ${TARGET_DATE} (${pageId})`);
  }
  const children = await getChildren(pageId);
  let eodToggle = children.find(b =>
    b.type === 'toggle' &&
    b.toggle?.rich_text?.map(t => t.plain_text).join('') === '업무 마감 브리핑'
  );
  if (!eodToggle) {
    const added = await appendBlocks(pageId, [{
      object: 'block', type: 'toggle',
      toggle: { rich_text: [{ type: 'text', text: { content: '업무 마감 브리핑' } }] }
    }]);
    eodToggle = added.results[0];
  }
  return eodToggle.id;
}

// ── 메인 ─────────────────────────────────────────────────────
console.log(`\n=== PM:${PM.toUpperCase()} 마감 브리핑 (${TARGET_DATE}) D-${DDAY} ===\n`);

// ── 1단계: JSON 출력 모드 ─────────────────────────────────────
if (jsonMode) {
  const calloutResults = [];
  for (const m of cfg.members) calloutResults.push(await readCallout(m.name, m.calloutId));
  const comments = await readComment(cfg.jihyeCommentId);
  const dbItems  = await readProjectDb();
  const blocked  = dbItems.filter(i => i.status === '업무막힘');
  const inProg   = dbItems.filter(i => i.status === '진행 중');
  const waiting  = dbItems.filter(i => i.status === '진행대기' && i.priority === '1');

  console.log(JSON.stringify({
    date: TARGET_DATE, dday: DDAY, pm: PM,
    callouts: calloutResults,
    jihyeComments: comments,
    db: { blocked, inProg, waiting }
  }, null, 2));

  console.log(`\n📋 위 데이터를 바탕으로 Claude가 PM 브리핑을 작성한 뒤:`);
  console.log(`   node _eod_write.js --pm ${PM} --date ${TARGET_DATE} --write '<json>'`);
  process.exit(0);
}

// ── 2단계: Claude 분석 결과 → DB 기록 ───────────────────────
if (writeData) {
  const eodToggleId = await getEodToggleId();
  const existing = await getChildren(eodToggleId);
  for (const b of existing) await deleteBlock(b.id);

  const blocks = [];

  // 멤버별 섹션
  for (const m of writeData.members) {
    const doneCount = m.done.length;
    const totalCount = doneCount + m.undone.length;
    blocks.push(h3(`${m.name} — 완료 ${doneCount}/${totalCount}`));
    for (const t of m.done)   blocks.push(todo(t, true));
    for (const t of m.undone) blocks.push(todo(t.task, false, t.comment || null));
  }

  // 지혜 코멘트
  if (writeData.comments?.length > 0) {
    blocks.push(h3('지혜 업무코멘트 주요 내용'));
    for (const c of writeData.comments) blocks.push(bullet(c));
  }

  blocks.push(divider());

  // 조건부 대기
  if (writeData.conditionalWaiting?.length > 0) {
    blocks.push(h3('⏳ 조건부 대기'));
    for (const c of writeData.conditionalWaiting) blocks.push(bullet(c));
    blocks.push(divider());
  }

  // PM 총평
  if (writeData.pmSummary?.length > 0) {
    blocks.push(h3(`PM 총평 — 내일(${TARGET_DATE.replace(/(\d+)\.(\d+)/, (_, m, d) => `${m}.${+d + 1}`)}) 우선순위`));
    for (const s of writeData.pmSummary) blocks.push(numbered(s));
  }

  await appendBlocks(eodToggleId, blocks);
  console.log(`✅ 마감 브리핑 작성 완료 → 브리핑 DB ${TARGET_DATE}`);
  process.exit(0);
}

// ── 인자 없으면 사용법 출력 ──────────────────────────────────
console.log(`사용법:
  1단계 (데이터 수집):  node _eod_write.js --pm gg --json
  2단계 (브리핑 기록):  node _eod_write.js --pm gg --write '<json>'
  날짜 지정:            --date 3.9`);
