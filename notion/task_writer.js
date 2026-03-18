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
 *           "comment": "코멘트"
 *         }
 *       ]
 *     }
 *   ]
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

function buildTodoBlock(taskObj) {
  const { task, background, input, output } = taskObj;
  const isComplex = background || input || output;

  if (!isComplex) {
    return { object: 'block', type: 'to_do', to_do: { rich_text: rt(task), checked: false } };
  }

  const toggleChildren = [];
  if (background) toggleChildren.push({ object: 'block', type: 'paragraph',           paragraph:           { rich_text: rt(`📍 ${background}`) } });
  if (input)      toggleChildren.push({ object: 'block', type: 'bulleted_list_item',   bulleted_list_item:  { rich_text: rt(`인풋: ${input}`) } });
  if (output)     toggleChildren.push({ object: 'block', type: 'bulleted_list_item',   bulleted_list_item:  { rich_text: rt(`아웃풋: ${output}`) } });

  return {
    object: 'block', type: 'to_do',
    to_do: {
      rich_text: rt(task),
      checked: false,
      children: [{
        object: 'block', type: 'toggle',
        toggle: { rich_text: rt('내용:'), children: toggleChildren }
      }]
    }
  };
}

async function addTasksForPerson(entry) {
  const { who, tasks } = entry;
  const date = entry.date || todayStr();

  const calloutId = CALLOUTS[who];
  if (!calloutId) { log(`❌ 알 수 없는 담당자: ${who}`); return; }
  if (!tasks?.length) { log(`⚠️  [${who}] tasks 없음`); return; }

  const blocks = await getChildren(calloutId);
  const existing = blocks.find(b => b.type === 'toggle' && getText(b) === date);
  const todoBlocks = tasks.map(buildTodoBlock);

  if (existing) {
    await appendBlocks(existing.id, todoBlocks);
    log(`✅ [${who}] "${date}" 토글에 ${todoBlocks.length}개 업무 추가`);
  } else {
    await appendBlocks(calloutId, [{
      object: 'block', type: 'toggle',
      toggle: { rich_text: rt(date), children: todoBlocks }
    }]);
    log(`✅ [${who}] "${date}" 토글 생성 후 ${todoBlocks.length}개 업무 추가`);
  }

  tasks.forEach(t => log(`   • ${t.task}`));
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
