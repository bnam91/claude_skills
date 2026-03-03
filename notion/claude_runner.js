/**
 * claude_runner.js - Notion 통합 스킬 (MCP 미사용)
 *
 * 사용법:
 *   node claude_runner.js --read                                       → 업무요청 전체 조회
 *   node claude_runner.js --read --who 지혜                            → 특정 담당자 조회
 *   node claude_runner.js --add --who 지혜 --date 3.2 --task "업무내용" → 업무 추가
 *   node claude_runner.js --write --page <pageId> --text "내용"         → 페이지에 단락 추가
 *   node claude_runner.js --page-read --page <pageId>                  → 페이지 블록 조회
 */

import { getChildren, appendBlocks, appendParagraph, getText, deleteBlock, updatePageParent } from './notion_api.js';

const CALLOUTS = {
  '지혜':   '2f1111a5-7788-81e0-b79e-ec85bbc540c5',
  '현빈02': '2f1111a5-7788-8127-951b-c2b17188efff', // 사업체02에서 현빈이 수현 이름으로 활동
  '수지':   '2e6111a5-7788-80a6-a2f7-cfca611ea5b7',
  '현빈':   '8bcea4ed47cb46ae90d7dfa888e09c16'
};

const LEGACY_PAGES = {
  '지혜':   '2f6111a57788808eae5defbaa785763f',
  '현빈02': '302111a57788802fb1e2d4c8cbd59df3',
  '수지':   '2e6111a57788807bad70f81ef26fc2f7',
  '현빈':   '1cf111a5778880eabe57d809143caf40'
};

/** 앵커블록: 정리 시 유지되는 블록 정의 */
const ANCHOR_BLOCKS = {
  child_page: { titles: ['이전', 'inbox'] },
  block_types: ['divider'],
  toggle: {
    titles: ['inbox'],
    pinned_prefix: '📌',
    date_within_days: 7
  },
  heading: { date_within_days: 7 },
  paragraph: {
    last_empty_only: true,
    include_prefix: '업무요청_'  // '업무요청_현빈' 등 포함 시 앵커
  }
};

function log(msg) { console.log(msg); }
function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

// ── 업무요청 조회 ──────────────────────────────
async function readCallout(name, calloutId, opts = {}) {
  const summaryOnly = opts.summary === true;
  log(`\n📋 업무요청_${name}`);
  log('─'.repeat(30));
  try {
    const blocks = await getChildren(calloutId);
    for (const b of blocks) {
      if (b.type === 'child_page') {
        log(`  📄 [페이지] ${b.child_page?.title || '(무제)'}`);
      } else if (b.type === 'toggle') {
        log(`  🔽 [토글] ${getText(b)}`);
        if (!summaryOnly) {
          const children = await getChildren(b.id);
          for (const c of children) {
            if (c.type === 'to_do') {
              log(`    ${c.to_do.checked ? '☑' : '☐'} ${getText(c)}`);
            }
          }
        }
      } else {
        const text = getText(b);
        const icon = { paragraph: '📝', heading_1: 'H1', heading_2: 'H2', heading_3: 'H3', bulleted_list_item: '•', numbered_list_item: '1.', callout: '💬', divider: '─', quote: '❝' }[b.type] || '▪';
        log(`  ${icon} [${b.type}] ${text || '(빈 블록)'}`);
      }
    }
  } catch (e) {
    log(`  ❌ 조회 실패: ${e.message}`);
  }
}

// ── 업무 추가 ──────────────────────────────────
async function addTask(name, date, task) {
  const calloutId = CALLOUTS[name];
  if (!calloutId) { log(`❌ 알 수 없는 담당자: ${name}`); process.exit(1); }

  const blocks = await getChildren(calloutId);
  const existing = blocks.find(b => b.type === 'toggle' && getText(b) === date);

  if (existing) {
    await appendBlocks(existing.id, [{
      object: 'block', type: 'to_do',
      to_do: { rich_text: [{ type: 'text', text: { content: task } }], checked: false }
    }]);
    log(`✅ [${name}] "${date}" 토글에 업무 추가: ${task}`);
  } else {
    await appendBlocks(calloutId, [{
      object: 'block', type: 'toggle',
      toggle: {
        rich_text: [{ type: 'text', text: { content: date } }],
        children: [{
          object: 'block', type: 'to_do',
          to_do: { rich_text: [{ type: 'text', text: { content: task } }], checked: false }
        }]
      }
    }]);
    log(`✅ [${name}] "${date}" 토글 생성 후 업무 추가: ${task}`);
  }
}

// ── 페이지 단락 추가 ───────────────────────────
async function writePage(pageId, text) {
  await appendParagraph(pageId, text);
  log(`✅ 페이지에 작성 완료: "${text}"`);
}

// ── Legacy 이동 (일주일 지난 날짜 토글 → 이전 페이지) ───
function parseDateFromToggle(text) {
  let m = text.match(/^(\d{1,2})[./](\d{1,2})$/);  // 2.23, 2/27
  if (m) return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
  m = text.match(/^(\d{2})(\d{2})$/);  // 0223, 0227 (MMDD)
  if (m) return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
  return null;
}

function isOlderThanWeek(parsed, today) {
  let year = today.getFullYear();
  const d = new Date(year, parsed.month - 1, parsed.day);
  if (d > today) year--; // 미래 날짜면 작년
  const target = new Date(year, parsed.month - 1, parsed.day);
  const diffDays = Math.floor((today - target) / (24 * 60 * 60 * 1000));
  return diffDays >= 7;  // 7일 이상 지남 (일주일 포함)
}

function isEmptyOrJunk(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  return t === '' || /^[.\s\-_]+$/.test(t);  // 빈칸, 마침표만, 구분자만
}

function isAnchorBlock(b, text, isLast, today) {
  const { child_page, block_types, toggle, heading, paragraph } = ANCHOR_BLOCKS;

  if (b.type === 'child_page') {
    const title = (b.child_page?.title || '').trim();
    return child_page.titles.includes(title);
  }
  if (block_types.includes(b.type)) return true;

  if (b.type === 'toggle') {
    const t = (text || '').trimStart();
    if (t.startsWith(toggle.pinned_prefix)) return true;
    if (toggle.titles.some(tit => t === tit)) return true;
    const parsed = parseDateFromToggle(text);
    if (!parsed) return false;
    return !isOlderThanWeek(parsed, today);
  }
  if (['heading_1', 'heading_2', 'heading_3'].includes(b.type)) {
    const parsed = parseDateFromToggle(text);
    if (!parsed) return false;
    return !isOlderThanWeek(parsed, today);
  }
  if (b.type === 'paragraph') {
    if (paragraph.include_prefix && (text || '').includes(paragraph.include_prefix)) return true;
    if (paragraph.last_empty_only && isLast && isEmptyOrJunk(text)) return true;
  }
  return false;
}

function richTextFromBlock(block) {
  const rt = block[block.type]?.rich_text;
  if (!rt?.length) return [{ type: 'text', text: { content: getText(block) || '' } }];
  return rt.map(t => ({ type: 'text', text: { content: t.plain_text || t.text?.content || '' } }));
}

function buildBlockForLegacy(b) {
  const text = getText(b);
  const rt = richTextFromBlock(b);
  if (b.type === 'paragraph') return { object: 'block', type: 'paragraph', paragraph: { rich_text: rt } };
  if (b.type === 'heading_1') return { object: 'block', type: 'heading_1', heading_1: { rich_text: rt } };
  if (b.type === 'heading_2') return { object: 'block', type: 'heading_2', heading_2: { rich_text: rt } };
  if (b.type === 'heading_3') return { object: 'block', type: 'heading_3', heading_3: { rich_text: rt } };
  if (b.type === 'to_do') return { object: 'block', type: 'to_do', to_do: { rich_text: rt, checked: !!b.to_do?.checked } };
  return null;
}

function buildToggleBlock(toggleBlock, childBlocks) {
  const richText = toggleBlock.toggle?.rich_text || [{ type: 'text', text: { content: getText(toggleBlock) } }];
  const children = childBlocks.map(c => {
    if (c.type !== 'to_do') return null;
    const rt = c.to_do?.rich_text || [{ type: 'text', text: { content: getText(c) } }];
    return {
      object: 'block', type: 'to_do',
      to_do: { rich_text: rt.map(t => ({ type: 'text', text: { content: t.plain_text || t.text?.content || '' } })), checked: !!c.to_do?.checked }
    };
  }).filter(Boolean);
  return {
    object: 'block', type: 'toggle',
    toggle: { rich_text: richText.map(t => ({ type: 'text', text: { content: t.plain_text || t.text?.content || '' } })), children }
  };
}

// 앵커블록(유지): child_page(이전,inbox), divider, 7일 이내 날짜 토글/heading, 📌 토글, 맨 끝 빈 paragraph. 그 외 → 이전 페이지로 이동.
async function cleanCallout(name) {
  const calloutId = CALLOUTS[name];
  const legacyId = LEGACY_PAGES[name];
  if (!calloutId || !legacyId) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const blocks = await getChildren(calloutId);
  let moved = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const isLast = i === blocks.length - 1;
    const text = getText(b);
    if (!isAnchorBlock(b, text, isLast, today)) {
      const preview = ((text || '').trim() || '(빈)').slice(0, 20);
      try {
        if (b.type === 'child_page') {
          await updatePageParent(b.id, legacyId);
        } else if (b.type === 'toggle') {
          const children = await getChildren(b.id);
          const newBlock = buildToggleBlock(b, children);
          await appendBlocks(legacyId, [newBlock]);
          await deleteBlock(b.id);
        } else {
          const newBlock = buildBlockForLegacy(b);
          if (newBlock) {
            await appendBlocks(legacyId, [newBlock]);
            await deleteBlock(b.id);
          } else {
            await deleteBlock(b.id);  // 지원 안 하는 타입은 삭제
          }
        }
        moved++;
        log(`  📤 [${name}] 이동: ${b.type} "${preview}${(text || '').length > 20 ? '...' : ''}"`);
      } catch (e) {
        log(`  ❌ [${name}] 이동 실패 ${b.type}: ${e.message}`);
      }
    }
  }
  return moved;
}

async function ensureTrailingEmptyParagraph(name) {
  const calloutId = CALLOUTS[name];
  if (!calloutId) return;
  const blocks = await getChildren(calloutId);
  const last = blocks[blocks.length - 1];
  const isLastEmptyPara = last?.type === 'paragraph' && isEmptyOrJunk(getText(last));
  if (!isLastEmptyPara) {
    await appendBlocks(calloutId, [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }]);
    log(`  ➕ [${name}] 맨 끝 빈 paragraph 추가`);
  }
}

async function moveLegacy(name) {
  const calloutId = CALLOUTS[name];
  const legacyId = LEGACY_PAGES[name];
  if (!calloutId || !legacyId) { log(`❌ 알 수 없는 담당자: ${name}`); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const blocks = await getChildren(calloutId);
  const toggles = blocks.filter(b => b.type === 'toggle');
  const toMove = toggles.filter(t => {
    const dateText = getText(t);
    const parsed = parseDateFromToggle(dateText);
    return parsed && isOlderThanWeek(parsed, today);
  });

  if (toMove.length > 0) {
    const list = toMove.map(t => getText(t)).join(', ');
    log(`  📋 [${name}] 이동 대상: ${list}`);
  }

  let moved = 0;
  for (const t of toMove) {
    const dateText = getText(t);
    const children = await getChildren(t.id);
    const newBlock = buildToggleBlock(t, children);
    await appendBlocks(legacyId, [newBlock]);
    await deleteBlock(t.id);
    moved++;
    log(`  ✅ [${name}] "${dateText}" → 이전 페이지로 이동`);
  }
  return moved;
}

async function runLegacyMove(who) {
  log('\n📦 일주일 지난 날짜 토글 → 이전(legacy) 페이지 이동');
  log('─'.repeat(40));
  const names = who ? [who] : Object.keys(CALLOUTS);
  let total = 0;
  for (const name of names) {
    if (!LEGACY_PAGES[name]) continue;
    try {
      const n = await moveLegacy(name);
      total += n || 0;
    } catch (e) {
      log(`  ❌ [${name}] 실패: ${e.message}`);
    }
  }
  log(`\n완료: 총 ${total}개 토글 이동`);

  log('\n🧹 빈 블록 정리');
  log('─'.repeat(40));
  let cleaned = 0;
  for (const name of names) {
    if (!CALLOUTS[name]) continue;
    try {
      const n = await cleanCallout(name);
      cleaned += n || 0;
    } catch (e) {
      log(`  ❌ [${name}] 정리 실패: ${e.message}`);
    }
  }
  log(cleaned > 0 ? `\n정리 완료: ${cleaned}개 → 이전 페이지로 이동` : '');

  log('\n➕ 맨 끝 빈 paragraph 확인');
  log('─'.repeat(40));
  for (const name of names) {
    if (!CALLOUTS[name]) continue;
    try {
      await ensureTrailingEmptyParagraph(name);
    } catch (e) {
      log(`  ❌ [${name}] 실패: ${e.message}`);
    }
  }

  log('\n📋 콜아웃 현재 상태 (이동 후)');
  log('─'.repeat(40));
  for (const name of names) {
    if (!CALLOUTS[name]) continue;
    try {
      await readCallout(name, CALLOUTS[name], { summary: true });
    } catch (e) {
      log(`  ❌ [${name}] 조회 실패: ${e.message}`);
    }
  }
}

// ── 페이지 블록 조회 ───────────────────────────
async function readPage(pageId) {
  const blocks = await getChildren(pageId);
  log(`\n=== 페이지 블록 (${blocks.length}개) ===`);
  for (const b of blocks) {
    const text = getText(b);
    const checked = b.type === 'to_do' ? (b.to_do.checked ? '☑ ' : '☐ ') : '';
    log(`  [${b.type}] ${checked}${text || '(빈 블록)'}`);
  }
}

// ── CLI 파싱 ───────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--read')) {
  const who = arg('--who');
  const opts = { summary: args.includes('--summary') };
  if (who) {
    if (!CALLOUTS[who]) { log(`❌ 알 수 없는 담당자: ${who}`); process.exit(1); }
    await readCallout(who, CALLOUTS[who], opts);
  } else {
    for (const [name, id] of Object.entries(CALLOUTS)) {
      await readCallout(name, id, opts);
    }
  }

} else if (args.includes('--add')) {
  const who = arg('--who'), date = arg('--date'), task = arg('--task');
  if (!who || !date || !task) {
    log('사용법: node claude_runner.js --add --who 지혜 --date 3.2 --task "업무내용"');
    process.exit(1);
  }
  await addTask(who, date, task);

} else if (args.includes('--write')) {
  const page = arg('--page'), text = arg('--text');
  if (!page || !text) {
    log('사용법: node claude_runner.js --write --page <pageId> --text "내용"');
    process.exit(1);
  }
  await writePage(page, text);

} else if (args.includes('--page-read')) {
  const page = arg('--page');
  if (!page) { log('사용법: node claude_runner.js --page-read --page <pageId>'); process.exit(1); }
  await readPage(page);

} else if (args.includes('--legacy-move')) {
  const who = arg('--who');
  await runLegacyMove(who);

} else {
  log('사용법:');
  log('  node claude_runner.js --read [--summary] [--who 지혜]  # --summary: 토글만, 하위 데이터 생략');
  log('  node claude_runner.js --add --who 지혜 --date 3.2 --task "업무내용"');
  log('  node claude_runner.js --legacy-move [--who 지혜]  # 일주일 지난 토글 → 이전 페이지');
  log('  node claude_runner.js --write --page <pageId> --text "내용"');
  log('  node claude_runner.js --page-read --page <pageId>');
}
