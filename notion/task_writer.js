/**
 * task_writer.js - JSON 입력으로 노션 업무요청 콜아웃에 업무 추가
 *
 * 사용법:
 *   # JSON 문자열 직접 전달
 *   node task_writer.js --json '[{"who":"지혜","tasks":[{"task":"업무내용"}]}]'
 *
 *   # JSON 파일 경로 전달
 *   node task_writer.js --file ./tasks.json
 *
 *   # stdin
 *   echo '[...]' | node task_writer.js
 *
 * JSON 포맷:
 *   [
 *     {
 *       "who": "지혜",           // 담당자 (필수)
 *       "date": "3.17",          // 날짜 (생략 시 오늘)
 *       "tasks": [
 *         { "task": "단순 업무" },
 *         {
 *           "task": "복잡 업무명",
 *           "background": "배경/맥락",
 *           "input": "인풋 위치",
 *           "output": "아웃풋 위치",
 *           "comment": "코멘트 (👉 prefix 자동)"
 *         }
 *       ]
 *     }
 *   ]
 *
 * 복잡 업무(background/input/output/comment 중 하나라도 있으면):
 *   Notion API 중첩 제한으로 인해 2단계로 처리
 *   1단계: to_do 블록 생성
 *   2단계: "내용:" 토글 추가 → 세부 내용 추가
 */

import { readFileSync } from 'fs';
import { getChildren, appendBlocks, getText } from './notion_api.js';

const CALLOUTS = {
  '지혜':   '2f1111a5-7788-81e0-b79e-ec85bbc540c5',
  '현빈02': '2f1111a5-7788-8127-951b-c2b17188efff',
  '수지':   '2e6111a5-7788-80a6-a2f7-cfca611ea5b7',
  '현빈':   '8bcea4ed47cb46ae90d7dfa888e09c16'
};

function log(msg) { console.log(msg); }

function todayStr() {
  const d = new Date();
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function rt(content) {
  return [{ type: 'text', text: { content } }];
}

function isComplex(taskObj) {
  return !!(taskObj.background || taskObj.input || taskObj.output || taskObj.comment);
}

/** 단순 to_do 블록 (children 없음) */
function buildSimpleTodo(taskObj) {
  return { object: 'block', type: 'to_do', to_do: { rich_text: rt(taskObj.task), checked: false } };
}

/** 복잡 업무: to_do 생성 후 내용 토글을 별도 appendBlocks으로 추가 */
async function appendComplexDetail(todoBlockId, taskObj) {
  const { background, input, output, comment } = taskObj;

  // 1) "내용:" 토글 추가 (children 없이)
  const toggleRes = await appendBlocks(todoBlockId, [
    { object: 'block', type: 'toggle', toggle: { rich_text: rt('내용:') } }
  ]);
  const toggleId = toggleRes.results[0].id;

  // 2) 내용 토글 안에 세부 내용 추가
  const detailBlocks = [];
  if (background) detailBlocks.push({ object: 'block', type: 'paragraph',         paragraph:         { rich_text: rt(`📍 ${background}`) } });
  if (input)      detailBlocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item:{ rich_text: rt(`인풋: ${input}`) } });
  if (output)     detailBlocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item:{ rich_text: rt(`아웃풋: ${output}`) } });
  if (comment)    detailBlocks.push({ object: 'block', type: 'paragraph',         paragraph:         { rich_text: rt(`👉 ${comment}`) } });

  if (detailBlocks.length) {
    await appendBlocks(toggleId, detailBlocks);
  }
}

/** 검수: 추가된 업무가 실제로 존재하는지 확인 */
async function verify(dateToggleId, tasks) {
  const blocks = await getChildren(dateToggleId);
  const todoTexts = blocks
    .filter(b => b.type === 'to_do')
    .map(b => b.to_do?.rich_text?.[0]?.plain_text || '');

  const missing = [];
  for (const t of tasks) {
    const found = todoTexts.some(text => text.includes(t.task.slice(0, 10)));
    if (!found) missing.push(t.task);
  }
  return missing;
}

async function addTasksForPerson(entry) {
  const { who, tasks } = entry;
  const date = entry.date || todayStr();

  const calloutId = CALLOUTS[who];
  if (!calloutId) { log(`❌ 알 수 없는 담당자: ${who}`); return; }
  if (!tasks?.length) { log(`⚠️  [${who}] tasks 없음`); return; }

  // 날짜 토글 찾기 또는 생성
  const topBlocks = await getChildren(calloutId);
  let dateToggle = topBlocks.find(b => b.type === 'toggle' && getText(b) === date);

  if (!dateToggle) {
    const res = await appendBlocks(calloutId, [{
      object: 'block', type: 'toggle',
      toggle: { rich_text: rt(date) }
    }]);
    dateToggle = res.results[0];
    log(`  📅 "${date}" 토글 새로 생성`);
  }

  // 모든 task를 단순 to_do로 먼저 일괄 추가
  const simpleTodos = tasks.map(buildSimpleTodo);
  const addRes = await appendBlocks(dateToggle.id, simpleTodos);

  log(`✅ [${who}] "${date}" 토글에 ${tasks.length}개 업무 추가`);
  tasks.forEach(t => log(`   • ${t.task}`));

  // 복잡 업무는 생성된 블록 ID에 내용 토글 개별 추가
  const complexTasks = tasks.map((t, i) => ({ taskObj: t, blockId: addRes.results[i]?.id }))
                            .filter(({ taskObj }) => isComplex(taskObj));

  if (complexTasks.length) {
    log(`  📎 세부내용 추가 중... (${complexTasks.length}건)`);
    for (const { taskObj, blockId } of complexTasks) {
      if (!blockId) { log(`  ⚠️  블록 ID 없음 (${taskObj.task}) — 세부내용 스킵`); continue; }
      await appendComplexDetail(blockId, taskObj);
      log(`     ✓ 세부내용: ${taskObj.task}`);
    }
  }

  // 검수
  const missing = await verify(dateToggle.id, tasks);
  if (missing.length) {
    log(`  ⚠️  검수 실패 — 누락된 업무:`);
    missing.forEach(m => log(`     ✗ ${m}`));
  } else {
    log(`  ✔  검수 완료 — 모든 업무 정상 등록`);
  }
}

// ── JSON 로드 ───────────────────────────────────
async function loadJson() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf('--json');
  const fileIdx = args.indexOf('--file');

  if (jsonIdx !== -1) return JSON.parse(args[jsonIdx + 1]);
  if (fileIdx !== -1) return JSON.parse(readFileSync(args[fileIdx + 1], 'utf8'));

  // stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (chunks.length) return JSON.parse(Buffer.concat(chunks).toString());

  log('사용법:');
  log('  node task_writer.js --json \'[{"who":"지혜","tasks":[{"task":"업무내용"}]}]\'');
  log('  node task_writer.js --file ./tasks.json');
  log('  echo \'[...]\' | node task_writer.js');
  process.exit(1);
}

// ── 실행 ───────────────────────────────────────
const input = await loadJson();
const entries = Array.isArray(input) ? input : [input];

log(`\n📝 업무요청 추가 (${entries.length}명)`);
log('─'.repeat(40));

for (const entry of entries) {
  try {
    await addTasksForPerson(entry);
  } catch (e) {
    log(`❌ [${entry.who}] 실패: ${e.message}`);
  }
}

log('\n완료');
