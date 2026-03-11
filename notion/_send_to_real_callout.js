/**
 * _send_to_real_callout.js
 * 브리핑 DB 오늘 페이지 → 실제 콜아웃에 업무 전송
 *
 * ⚠️  반드시 2단계(브리핑 검토) 완료 후 실행
 *     현빈이 수정한 내용이 그대로 반영됨 (--assign 재사용 아님)
 *
 * 실행: node _send_to_real_callout.js --pm gg|cc
 */
import { queryDatabase, getChildren, appendBlocks, getText } from './notion_api.js';

const pmArg = process.argv.includes('--pm') ? process.argv[process.argv.indexOf('--pm') + 1] : 'gg';
const PM = pmArg.toLowerCase();
if (!['gg', 'cc'].includes(PM)) { console.error('--pm gg 또는 --pm cc 로 지정하세요'); process.exit(1); }
const JSON_MODE = process.argv.includes('--json');

const now = new Date();
const TODAY_LABEL = `${now.getMonth() + 1}.${now.getDate()}`;

const CONFIG = {
  gg: {
    briefingDbId: '318111a57788804ba081cb8ae05707ae',
    members: [
      { name: '현빈02', calloutId: '2f1111a577888127951bc2b17188efff' },
      { name: '지혜',   calloutId: '2f1111a5778881e0b79eec85bbc540c5' },
    ],
  },
  cc: {
    briefingDbId: '31c111a57788814babddf63dad42844e',
    members: [
      { name: '수지',   calloutId: '2e6111a5778880a6a2f7cfca611ea5b7' },
      { name: '현빈',   calloutId: '8bcea4ed47cb46ae90d7dfa888e09c16' },
    ],
  },
};

// ── 업무 타입별 포맷 (변수로 관리) ──────────────────────────
const TASK_TEMPLATES = {
  urgent:  (text) => `🚨 ${text}`,       // 긴급 — 오늘 중 해소
  normal:  (text) => text,                // 일반 진행
  waiting: (text) => `[대기] ${text}`,    // 진행대기
};

const cfg = CONFIG[PM];

// ── 브리핑 DB 오늘 페이지 조회 ──────────────────────────────
console.log(`📋 브리핑 DB 오늘 페이지(${TODAY_LABEL}) 조회 중...`);
const dbRes = await queryDatabase(cfg.briefingDbId, {
  filter: { property: '이름', title: { equals: TODAY_LABEL } }
}).catch(() => ({ results: [] }));

if (!dbRes.results?.length) {
  console.error(`❌ 브리핑 DB에 ${TODAY_LABEL} 페이지 없음. 1단계 먼저 실행하세요.`);
  process.exit(1);
}

const pageId = dbRes.results[0].id;
const pageChildren = await getChildren(pageId);

// ── 업무 시작 브리핑 토글 찾기 ──────────────────────────────
const startToggle = pageChildren.find(b => b.type === 'toggle' && getText(b) === '업무 시작 브리핑');
if (!startToggle) {
  console.error('❌ "업무 시작 브리핑" 토글 없음.');
  process.exit(1);
}

const startChildren = await getChildren(startToggle.id);

// ── 불릿 블록에서 task 추출 (context/output 하위 블록 포함) ──
async function extractTaskFromBullet(b) {
  const text = getText(b).trim();
  if (!text) return null;

  let context = '', output = '';
  // 하위 블록 있으면 읽어서 📍/아웃풋 추출
  if (b.bulleted_list_item?.has_children || b.has_children) {
    const sub = await getChildren(b.id);
    for (const s of sub) {
      const t = getText(s).trim();
      if (t.startsWith('📍')) context = t.replace(/^📍\s*/, '');
      else if (t.startsWith('아웃풋:')) output = t.replace(/^아웃풋:\s*/, '');
    }
  }
  return { text, context, output };
}

// ── 멤버별 토글에서 태스크 추출 ─────────────────────────────
async function extractTasksFromMemberToggle(toggleId) {
  const blocks = await getChildren(toggleId);
  const tasks = [];

  for (const b of blocks) {
    if (b.type === 'callout') {
      // 🚨 긴급 callout → 하위 블록을 urgent로
      const calloutChildren = await getChildren(b.id);
      for (const child of calloutChildren) {
        const task = await extractTaskFromBullet(child);
        if (task) tasks.push({ ...task, type: 'urgent' });
      }
    } else if (b.type === 'bulleted_list_item') {
      const text = getText(b).trim();
      if (!text) continue;
      if (text.startsWith('[대기]')) {
        tasks.push({ text: text.replace(/^\[대기\]\s*/, ''), context: '', output: '', type: 'waiting' });
      } else {
        const task = await extractTaskFromBullet(b);
        if (task) tasks.push({ ...task, type: 'normal' });
      }
    }
  }

  return tasks;
}

// ── 업무요청 템플릿 블록 빌더 ────────────────────────────────
// context/output 있으면 채워 넣고, 없으면 빈 양식 생성 (담당자가 직접 입력)
function mkTaskTemplateBlock(task) {
  const title = (TASK_TEMPLATES[task.type] || TASK_TEMPLATES.normal)(task.text);
  return {
    object: 'block', type: 'to_do',
    to_do: {
      rich_text: [{ type: 'text', text: { content: title }, annotations: { bold: true } }],
      checked: false,
      children: [
        { object: 'block', type: 'paragraph',          paragraph:          { rich_text: [{ type: 'text', text: { content: '내용:' } }] } },
        { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `인풋 : ${task.input || ''}` } }] } },
        { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `아웃풋 : ${task.output || ''}` } }] } },
        { object: 'block', type: 'paragraph',          paragraph:          { rich_text: [{ type: 'text', text: { content: `📍 ${task.context || ''}` } }] } },
      ]
    }
  };
}

// ── 콜아웃에 날짜 토글 찾거나 생성 후 템플릿 블록 추가 ────────
async function addToCallout(calloutId, task) {
  const formatted = (TASK_TEMPLATES[task.type] || TASK_TEMPLATES.normal)(task.text);
  try {
    const blocks = await getChildren(calloutId);
    const toggle = blocks.find(b => b.type === 'toggle' && getText(b) === TODAY_LABEL);
    const block = mkTaskTemplateBlock(task);

    if (toggle) {
      await appendBlocks(toggle.id, [block]);
    } else {
      await appendBlocks(calloutId, [{
        object: 'block', type: 'toggle',
        toggle: { rich_text: [{ type: 'text', text: { content: TODAY_LABEL } }], children: [block] }
      }]);
    }
    return { ok: true, label: formatted };
  } catch (e) {
    return { ok: false, label: formatted, error: e.message };
  }
}

// ── 멤버별 태스크 수집 ──────────────────────────────────────
const memberTaskMap = {};

for (const member of cfg.members) {
  // 멤버 토글 찾기 ("현빈02 배정" 또는 "지혜 배정" 으로 시작)
  const memberToggle = startChildren.find(b =>
    b.type === 'toggle' && getText(b).startsWith(`${member.name} 배정`)
  );

  if (!memberToggle) {
    console.log(`  [${member.name}] 배정 토글 없음 — 스킵`);
    continue;
  }

  const tasks = await extractTasksFromMemberToggle(memberToggle.id);
  memberTaskMap[member.name] = { calloutId: member.calloutId, tasks };
}

// ── JSON 모드: 수집된 태스크 출력 후 종료 ────────────────────
if (JSON_MODE) {
  const output = {
    date: TODAY_LABEL,
    members: Object.fromEntries(
      Object.entries(memberTaskMap).map(([name, { tasks }]) => [name, tasks])
    )
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

// ── 실제 전송 ────────────────────────────────────────────────
console.log(`\n📤 실제 콜아웃 전송 중...`);

for (const [memberName, { calloutId, tasks }] of Object.entries(memberTaskMap)) {
  if (tasks.length === 0) {
    console.log(`  [${memberName}] 전송할 업무 없음`);
    continue;
  }

  console.log(`  [${memberName}] ${tasks.length}건 전송 중...`);
  let sent = 0;
  for (const task of tasks) {
    const result = await addToCallout(calloutId, task);
    if (result.ok) {
      console.log(`    ✅ ${result.label}`);
      sent++;
    } else {
      console.error(`    ❌ ${result.label} — ${result.error}`);
    }
  }
  console.log(`  [${memberName}] ✅ ${sent}/${tasks.length}건 전송 완료`);
}

console.log(`\n🎉 완료: 실제 콜아웃 전송 (${TODAY_LABEL})`);
