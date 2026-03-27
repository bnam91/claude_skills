/**
 * _pm_briefing.js
 * 브리핑 DB 초안 작성 + 실제 콜아웃 업무 전송 (2단계 통합)
 * 실행: node _pm_briefing.js --pm gg|cc
 */
import { queryDatabase, getChildren, deleteBlock, appendBlocks, createPage, getText } from './notion_api.js';
import { createAdapter } from './adapter/index.js';

// ── CLI 인자 ─────────────────────────────────────────────
const pmArg = process.argv.includes('--pm') ? process.argv[process.argv.indexOf('--pm') + 1] : 'gg';
const PM = pmArg.toLowerCase();
if (!['gg', 'cc', 'xx'].includes(PM)) { console.error('--pm gg|cc|xx 로 지정하세요'); process.exit(1); }
const JSON_MODE = process.argv.includes('--json');
const ASSIGN_IDX = process.argv.indexOf('--assign');
const ASSIGN_DATA = ASSIGN_IDX !== -1 ? JSON.parse(process.argv[ASSIGN_IDX + 1]) : null;

// ── 날짜 / D-day ─────────────────────────────────────────
const now = new Date();
const TODAY_LABEL = `${now.getMonth() + 1}.${now.getDate()}`;
const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
const YESTERDAY_LABEL = `${yesterday.getMonth() + 1}.${yesterday.getDate()}`;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TODAY_DAY = WEEKDAYS[now.getDay()];

// ── PM별 설정 (어댑터 기반) ──────────────────────────────
const adapter = createAdapter(PM);
const adapterConfig = adapter.getConfig();
const meta = adapter.getProjectMeta();

const cfg = {
  label: adapterConfig.displayName.split(' ')[0], // "GG", "CC", "XX"
  projectDbId: adapterConfig.databaseId,
  briefingDbId: adapterConfig.briefingDbId,
  launchDate: adapterConfig.launchDate,
  titleField: adapterConfig.fields.title.name,
  statusField: adapterConfig.fields.status.name,
  priorityField: adapterConfig.fields.priority.name,
  statusType: adapterConfig.fields.status.type,
  members: adapterConfig.members,
  jihyeCalloutId: adapterConfig.members.find(m => m.name === '지혜')?.calloutId || null,
};

const LAUNCH = new Date(cfg.launchDate);
const DDAY = meta.dday;

// ── 블록 빌더 ────────────────────────────────────────────
const mkBullet = (text, bold = false, color = 'default') => ({
  object: 'block', type: 'bulleted_list_item',
  bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text }, annotations: { bold, color } }] }
});
const mkTodo = (text, checked = false) => ({
  object: 'block', type: 'to_do',
  to_do: { rich_text: [{ type: 'text', text: { content: text } }], checked }
});

// task 항목 → 브리핑 토글용 불릿
// flat=true: callout 내부처럼 중첩 불가한 위치에서 context를 텍스트에 합침
const mkTaskBullet = (item, flat = false) => {
  if (flat) {
    // callout 안에서는 children 중첩 불가 → context/output을 텍스트에 직접 합침
    let text = item.title.trim();
    if (item.output)  text += ` | 아웃풋: ${item.output}`;
    if (item.context) text += `\n📍 ${item.context}`;
    return mkBullet(text);
  }
  const children = [];
  if (item.input)   children.push(mkBullet(`인풋: ${item.input}`));
  if (item.output)  children.push(mkBullet(`아웃풋: ${item.output}`));
  if (item.context) children.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `📍 ${item.context}` } }] } });
  const block = mkBullet(item.title.trim());
  if (children.length > 0) block.bulleted_list_item.children = children;
  return block;
};

// ── 1. 프로젝트 DB 조회 ──────────────────────────────────
console.log(`📊 ${cfg.label} DB 조회 중...`);
const db = await queryDatabase(cfg.projectDbId, { page_size: 100 });

const SKIP_PRIORITY = ['📍MileStone', '🎖 GOAL', '-'];
const getStatus = p => cfg.statusType === 'status'
  ? p.properties[cfg.statusField]?.status?.name || '-'
  : p.properties[cfg.statusField]?.select?.name || '-';
const getPriority = p => cfg.statusType === 'status'
  ? p.properties[cfg.priorityField]?.status?.name || '-'
  : p.properties[cfg.priorityField]?.select?.name || '-';

const items = db.results
  .map(p => ({
    title: (p.properties[cfg.titleField]?.title?.[0]?.plain_text || '').replace(/^✅\s*/, '').trim(),
    status: getStatus(p),
    priority: getPriority(p),
  }))
  .filter(i => i.title.trim() && !SKIP_PRIORITY.includes(i.priority));

const done    = items.filter(i => i.status.includes('완료'));
const inProg  = items.filter(i => i.status === '진행 중');
const blocked = items.filter(i => i.status === '업무막힘');
const waiting = items.filter(i => i.status === '진행대기' && i.priority === '1');

console.log(`  ✅ 완료 ${done.length} | 🔄 진행 중 ${inProg.length} | 🚨 막힘 ${blocked.length} | ⏳ 대기 ${waiting.length}`);

// 지혜 오늘 업무는 3단계(실제 콜아웃 전송) 때 읽음
const jihyeTasks = [];

// ── 2. 주간회의 pm-gg 이번주 목표 읽기 ───────────────────
console.log(`📅 주간회의 이번주 목표 조회 중...`);
const MEETING_DB_ID = '31c111a5778880a68164f8f27f2463c8';
const meetingRes = await queryDatabase(MEETING_DB_ID, {
  filter: { property: '이름', title: { contains: 'weekly meeting' } },
  sorts: [{ property: '날짜', direction: 'descending' }],
  page_size: 1,
}).catch(() => ({ results: [] }));

let weeklyGoalLines = [];
if (meetingRes.results?.length > 0) {
  const weeklyPageId = meetingRes.results[0].id;
  const weeklyBlocks = await getChildren(weeklyPageId);
  const pmToggle = weeklyBlocks.find(b =>
    b.type === 'toggle' && getText(b).includes(`pm-${PM} — 이번주 목표`)
  );
  if (pmToggle) {
    const goalBlocks = await getChildren(pmToggle.id);
    weeklyGoalLines = goalBlocks.map(b => getText(b)).filter(t => t.trim());
    console.log(`  → pm-${PM} 이번주 목표 ${weeklyGoalLines.length}줄 읽음`);
  } else {
    console.log(`  → pm-${PM} 이번주 목표 토글 없음`);
  }
}

// ── 3. 전날 마감 브리핑 읽기 (없으면 스킵) ───────────────
let eodLines = [];
console.log(`📋 전날(${YESTERDAY_LABEL}) 마감 브리핑 조회 중...`);
const eodRes = await queryDatabase(cfg.briefingDbId, {
  filter: { property: '이름', title: { equals: YESTERDAY_LABEL } }
}).catch(() => ({ results: [] }));

if (eodRes.results?.length > 0) {
  const eodPageId = eodRes.results[0].id;
  const eodChildren = await getChildren(eodPageId);
  const eodToggle = eodChildren.find(b => b.type === 'toggle' && getText(b) === '업무 마감 브리핑');
  if (eodToggle) {
    const eodBlocks = await getChildren(eodToggle.id);
    eodLines = eodBlocks.map(b => getText(b)).filter(t => t.trim());
    console.log(`  → 마감 브리핑 ${eodLines.length}줄 읽음`);
  } else {
    console.log(`  → 마감 브리핑 토글 없음 (스킵)`);
  }
} else {
  console.log(`  → ${YESTERDAY_LABEL} 페이지 없음 (스킵)`);
}

// ── JSON 모드: 데이터만 출력하고 종료 ────────────────────
if (JSON_MODE) {
  const output = {
    date: TODAY_LABEL,
    day: TODAY_DAY,
    dday: DDAY,
    weeklyGoals: weeklyGoalLines,
    eod: eodLines,
    tasks: {
      done: done.map(i => ({ title: i.title, priority: i.priority })),
      inProg: inProg.map(i => ({ title: i.title, priority: i.priority })),
      blocked: blocked.map(i => ({ title: i.title, priority: i.priority })),
      waiting: waiting.map(i => ({ title: i.title, priority: i.priority })),
    }
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

// ── 4. 브리핑 DB 오늘 페이지 START_TOGGLE 확보 ──────────
console.log(`📅 브리핑 DB 오늘 페이지 확인 중...`);
const dbResult = await queryDatabase(cfg.briefingDbId, {
  filter: { property: '이름', title: { equals: TODAY_LABEL } }
}).catch(() => ({ results: [] }));

let startToggleId;

if (dbResult.results?.length > 0) {
  const pageId = dbResult.results[0].id;
  console.log(`  → 기존 페이지 (${pageId})`);
  const children = await getChildren(pageId);
  const t = children.find(b => b.type === 'toggle' && getText(b) === '업무 시작 브리핑');
  startToggleId = t?.id;
  if (!startToggleId) {
    const r = await appendBlocks(pageId, [{ object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 시작 브리핑' } }] } }]);
    startToggleId = r.results[0].id;
  }
} else {
  const newPage = await createPage(
    { type: 'database_id', database_id: cfg.briefingDbId },
    { '이름': { title: [{ type: 'text', text: { content: TODAY_LABEL } }] } },
    [
      { object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 시작 브리핑' } }] } },
      { object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: '업무 마감 브리핑' } }] } },
    ]
  );
  console.log(`  → 새 페이지 생성 (${newPage.id})`);
  const children = await getChildren(newPage.id);
  startToggleId = children.find(b => b.type === 'toggle' && getText(b) === '업무 시작 브리핑')?.id;
}

// 기존 내용 삭제
const existing = await getChildren(startToggleId);
for (const b of existing) await deleteBlock(b.id);

// ── 4. 멤버별 배정 업무 구성 ─────────────────────────────
const memberAssignments = {};

for (const member of cfg.members) {
  let tasks = [];

  // Claude --assign 모드: PM이 결정한 배분 사용 (context, output 포함 가능)
  if (ASSIGN_DATA && ASSIGN_DATA[member.name]) {
    const assigned = ASSIGN_DATA[member.name];
    tasks = {
      urgent: assigned.filter(i => i.urgent).map(i => ({ title: i.title, context: i.context, input: i.input, output: i.output })),
      normal: assigned.filter(i => !i.urgent).map(i => ({ title: i.title, context: i.context, input: i.input, output: i.output })),
    };
  } else if (member.role === 'blocker+p1') {
    // GG 현빈02: 업무막힘 + 진행 중 우선순위1 (의사결정·크리티컬)
    const urgent = blocked.filter(i => ['1','2','3'].includes(i.priority));
    const normal = inProg.filter(i => i.priority === '1');
    tasks = { urgent, normal, waiting: waiting.slice(0, 2) };
  } else if (member.role === 'today') {
    // GG 지혜: 진행 중 우선순위2,3 + 진행대기 상위3 (운영·실무 실행)
    const jihyeInProg = inProg.filter(i => i.priority === '2' || i.priority === '3');
    const jihyeWaiting = items.filter(i => i.status === '진행대기').slice(0, 3);
    tasks = { inprog: jihyeInProg, waiting: jihyeWaiting };
  } else if (member.role === 'inprog+p1') {
    // CC 수지: 진행 중 + 진행대기 우선순위1
    tasks = { inprog: inProg.filter(i => i.priority === '1' || i.priority === '2'), waiting: waiting.slice(0, 5) };
  } else if (member.role === 'blocker') {
    // CC 현빈: 업무막힘만
    tasks = { urgent: blocked };
  }
  memberAssignments[member.name] = tasks;
}

// ── 5. 브리핑 블록 구성 ──────────────────────────────────
const blocks = [];

// 헤더
blocks.push({
  object: 'block', type: 'heading_2',
  heading_2: { rich_text: [{ type: 'text', text: { content: `📋 ${TODAY_LABEL} (${TODAY_DAY}) PM:${cfg.label} 브리핑 — D-${DDAY}` } }] }
});

// 전날 마감 브리핑
if (eodLines.length > 0) {
  blocks.push({
    object: 'block', type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '🌙' }, color: 'purple_background',
      rich_text: [{ type: 'text', text: { content: `전날(${YESTERDAY_LABEL}) 마감 브리핑` }, annotations: { bold: true } }],
      children: eodLines.slice(0, 10).map(t => mkBullet(t))
    }
  });
}

// 이번주 목표 (weekly meeting에서 읽어온 내용)
if (weeklyGoalLines.length > 0) {
  blocks.push({
    object: 'block', type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '📌' }, color: 'yellow_background',
      rich_text: [{ type: 'text', text: { content: '이번주 목표' }, annotations: { bold: true } }],
      children: weeklyGoalLines.slice(0, 10).map(t => mkBullet(t))
    }
  });
}

// 현황 스냅샷
blocks.push({
  object: 'block', type: 'callout',
  callout: {
    icon: { type: 'emoji', emoji: '📊' }, color: 'gray_background',
    rich_text: [{ type: 'text', text: { content: '이번 주 현황' }, annotations: { bold: true } }],
    children: [
      mkBullet(`✅ 완료 ${done.length}건`),
      mkBullet(`🔄 진행 중 (${inProg.length}건)  ${inProg.map(i => i.title.trim()).join(', ')}`),
      blocked.length > 0
        ? { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
            { type: 'text', text: { content: `🚨 업무막힘 (${blocked.length}건)  ` }, annotations: { bold: true, color: 'red' } },
            { type: 'text', text: { content: blocked.map(i => i.title.trim()).join(', ') } }
          ] } }
        : mkBullet('🚨 업무막힘 없음'),
    ]
  }
});

// 멤버별 토글
for (const member of cfg.members) {
  const a = memberAssignments[member.name];
  const children = [];

  if (a.urgent?.length > 0) {
    children.push({
      object: 'block', type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '🚨' }, color: 'red_background',
        rich_text: [{ type: 'text', text: { content: '긴급 — 오늘 중 해소' }, annotations: { bold: true } }],
        children: a.urgent.map(i => mkTaskBullet(i, true))
      }
    });
  }
  if (a.normal?.length > 0) a.normal.forEach(i => children.push(mkTaskBullet(i)));
  if (a.inprog?.length > 0) a.inprog.forEach(i => children.push(mkTaskBullet(i)));
  if (a.waiting?.length > 0) a.waiting.forEach(i => children.push(mkBullet(`[대기] ${i.title.trim()}`, false, 'gray')));
  if (a.urgent?.length === 0 && a.normal?.length === 0 && a.inprog?.length === 0 && a.waiting?.length === 0) {
    children.push(mkBullet('오늘 배정 업무 없음', false, 'gray'));
  }

  const total = (a.urgent?.length || 0) + (a.normal?.length || 0) + (a.inprog?.length || 0) + (a.today?.length || 0) + (a.waiting?.length || 0);
  blocks.push({
    object: 'block', type: 'toggle',
    toggle: {
      rich_text: [
        { type: 'text', text: { content: `${member.name} 배정 ` }, annotations: { bold: true } },
        { type: 'text', text: { content: `(${total}건)` }, annotations: { color: 'gray' } }
      ],
      children
    }
  });
}

// PM 코멘트
const commentLines = [];
if (blocked.length > 0) commentLines.push(`최대 리스크: ${blocked.map(i => i.title.trim()).join(', ')} — 오늘 해소 필요.`);
commentLines.push(DDAY <= 7 ? `D-${DDAY} 마지막 주. 모든 에너지 런칭에 집중.` : `D-${DDAY}. 크리티컬 패스 유지.`);
blocks.push({
  object: 'block', type: 'callout',
  callout: {
    icon: { type: 'emoji', emoji: '💬' }, color: 'blue_background',
    rich_text: [{ type: 'text', text: { content: 'PM 코멘트' }, annotations: { bold: true } }],
    children: commentLines.map(t => mkBullet(t))
  }
});

await appendBlocks(startToggleId, blocks);
console.log(`✅ 브리핑 초안 작성 완료 → ${TODAY_LABEL} (${TODAY_DAY}) D-${DDAY}`);

// ── 디버그 로그 (맥 노트에 기록) ──────────────────────────
try {
  const { execSync } = await import('child_process');
  const notesScript = `${process.env.HOME}/Documents/claude_skills/app_notes_control/app_notes_control.py`;
  const logLines = [
    `[${new Date().toLocaleString('ko-KR')}] ${cfg.label} 아침 브리핑`,
    `  프로젝트 DB: ${cfg.projectDbId}`,
    `  조회 결과 — 진행중:${inProg.length} 막힘:${blocked.length} 대기:${waiting.length}`,
    `  브리핑 DB: ${cfg.briefingDbId} → 페이지 작성 완료`,
    `  D-day: ${DDAY}`,
    `  주간목표: ${weeklyGoalLines.length}줄 읽음`,
    `  전날 마감: ${eodLines.length}줄 읽음`,
    `  배정: ${cfg.members.map(m => m.name).join(', ')}`,
    `  상태: ✅ 성공`,
    `---`,
    `💡 이 로그를 끄려면: 터미널에서 "디버그 로그 꺼줘" 라고 말하세요.`
  ].join('\\n');
  execSync(`python3 "${notesScript}" --append --title "PM 시스템 디버그 로그" --body "${logLines}"`,
    { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
} catch { /* 로그 실패는 무시 */ }

// ── 타임라인 자동 동기화 (브리핑과 함께 실행) ────────────
try {
  const { execSync } = await import('child_process');
  const syncScript = new URL('./adapter/lib/timeline-sync.js', import.meta.url).pathname;
  console.log(`📋 ${PM.toUpperCase()}_timeline 동기화 중...`);
  const syncResult = execSync(`node "${syncScript}" --pm ${PM}`, { encoding: 'utf8', timeout: 30000 });
  const resultLine = syncResult.split('\n').find(l => l.includes('결과:'));
  if (resultLine) console.log(`  ${resultLine.trim()}`);
} catch (e) {
  console.log(`  ⚠️ 타임라인 동기화 스킵: ${e.message?.split('\n')[0] || e}`);
}

console.log(`📋 브리핑 검토 후 "실제 콜아웃 전송해줘" 입력하면 업무 배정됩니다.`);
