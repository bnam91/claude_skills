/**
 * timeline-sync.js — 어댑터 DB → 미리알림 타임라인 자동 동기화
 *
 * 사용법:
 *   node timeline-sync.js --pm gg|cc|xx      # 특정 프로젝트 동기화
 *   node timeline-sync.js --all              # 전체 프로젝트 동기화
 *   node timeline-sync.js --pm gg --complete "태스크 제목"  # 완료 처리
 *
 * 동작:
 *   1. 어댑터로 프로젝트 DB 조회 (진행 중 + 업무막힘 + 이번 주 데드라인)
 *   2. 미리알림 타임라인 목록에서 기존 항목 조회
 *   3. 누락 항목 추가, 완료 항목 체크, 우선순위 매핑
 */

import { createAdapter, listProjects } from '../../adapter/index.js';
import { execSync } from 'child_process';
import path from 'path';

const REMINDER_DIR = path.join(process.env.HOME, 'Documents/claude_skills/app_reminder_control');
const REMINDER_SCRIPT = path.join(REMINDER_DIR, 'app_reminders_control.py');
const SET_PRIORITY_SCRIPT = path.join(REMINDER_DIR, 'set_priority.py');
const COMPLETE_SCRIPT = path.join(REMINDER_DIR, 'complete_reminder.py');

// ─── 미리알림 목록 이름 규칙 ───
function getTimelineName(projectId) {
  return `${projectId.toUpperCase()}_timeline`;
}

// ─── 미리알림 조회 (Python 스크립트 호출) ───
function getExistingReminders(listName) {
  try {
    const output = execSync(
      `python3 "${REMINDER_SCRIPT}" "${listName}"`,
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    // 출력에서 항목 파싱
    const items = [];
    const lines = output.split('\n');
    let current = null;
    for (const line of lines) {
      const titleMatch = line.match(/^\d+\.\s*📌\s*(.+)/);
      if (titleMatch) {
        if (current) items.push(current);
        current = { title: titleMatch[1].trim(), completed: false, priority: 0 };
      }
      if (current && line.includes('✅ 완료')) current.completed = true;
      if (current && line.includes('🔴 높음')) current.priority = 1;
      if (current && line.includes('🟡 중간')) current.priority = 5;
    }
    if (current) items.push(current);
    return items;
  } catch {
    return []; // 목록이 없으면 빈 배열
  }
}

// ─── 미리알림 추가 (Python EventKit) ───
function addReminder(listName, title, priority, sectionName) {
  const priorityFlag = priority === 1 ? 'high' : priority === 5 ? 'medium' : 'normal';

  // 섹션이 있으면 섹션에 추가, 없으면 목록에 직접 추가
  const addArg = sectionName ? `"${sectionName}, ${title}"` : `"기본, ${title}"`;

  try {
    execSync(
      `python3 "${REMINDER_SCRIPT}" "${listName}" ${addArg}`,
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // 우선순위 설정
    if (priority === 1 || priority === 5) {
      try {
        execSync(`python3 "${SET_PRIORITY_SCRIPT}" "${listName}" "${title}" ${priority}`,
          { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch { /* 우선순위 실패는 무시 — 항목은 추가됨 */ }
    }
    return true;
  } catch (e) {
    console.log(`  ⚠️ 추가 실패: ${title} — ${e.message}`);
    return false;
  }
}

// ─── 미리알림 완료 처리 ───
function completeReminder(listName, title) {
  try {
    const result = execSync(`python3 "${COMPLETE_SCRIPT}" "${listName}" "${title}"`,
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
    return result.includes('completed');
  } catch {
    return false;
  }
}

// ─── 우선순위 매핑 ───
function mapPriority(task) {
  if (task.status === '업무막힘') return 1;       // 🔴 높음
  if (task.priority === '1') return 5;             // 🟡 중간
  return 0;                                         // 일반
}

// ─── 동기화 대상 태스크 추출 ───
async function getTimelineTasks(adapter) {
  const config = adapter.getConfig();

  // 진행 중 + 업무막힘
  const active = await adapter.queryTasks({
    status: ['진행 중', '업무막힘']
  });

  // 진행대기 중 우선순위 1 (이번 주 할 것)
  const waitingP1 = await adapter.queryTasks({
    status: ['진행대기'],
    priority: ['1']
  });

  // 합치고 중복 제거, skipPriorities 제외
  const all = [...active, ...waitingP1];
  const seen = new Set();
  const filtered = all.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    if (config.skipPriorities.includes(t.priority)) return false;
    if (!t.title.trim()) return false;
    if (t.title.startsWith('📦') || t.title.startsWith('🎯') || t.title.startsWith('⚙️')) return false; // MileStone/C-level 제외
    return true;
  });

  return filtered;
}

// ─── 메인 동기화 ───
async function syncProject(projectId) {
  const adapter = createAdapter(projectId);
  const meta = adapter.getProjectMeta();
  const listName = getTimelineName(projectId);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📋 ${meta.displayName} → ${listName}`);
  console.log(`   D-day: ${meta.dday !== null ? (meta.dday >= 0 ? 'D-' : 'D+') + Math.abs(meta.dday) : 'N/A'}`);

  // 1. DB에서 타임라인 대상 추출
  const dbTasks = await getTimelineTasks(adapter);
  console.log(`   DB 대상: ${dbTasks.length}건`);

  // 2. 기존 미리알림 조회
  const existing = getExistingReminders(listName);
  console.log(`   기존 미리알림: ${existing.length}건`);

  const existingTitles = new Set(existing.map(r => r.title));
  const dbTitles = new Set(dbTasks.map(t => t.title.replace(/^✅\s*/, '').trim()));

  // 3. 추가할 항목 (DB에 있는데 미리알림에 없는 것)
  const toAdd = dbTasks.filter(t => {
    const title = t.title.replace(/^✅\s*/, '').trim();
    return !existingTitles.has(title);
  });

  // 4. 완료 처리할 항목 (미리알림에 있는데 DB에서 완료된 것)
  const allTasks = await adapter.queryTasks();
  const completedTitles = new Set(
    allTasks.filter(t => t.status === '완료' || t.status === '완료_aar')
      .map(t => t.title.replace(/^✅\s*/, '').trim())
  );
  const toComplete = existing.filter(r => !r.completed && completedTitles.has(r.title));

  console.log(`   추가: ${toAdd.length}건, 완료처리: ${toComplete.length}건`);

  // 5. 실행
  let added = 0, completed = 0;

  for (const task of toAdd) {
    const title = task.title.replace(/^✅\s*/, '').trim();
    const priority = mapPriority(task);
    const priorityIcon = priority === 1 ? '🔴' : priority === 5 ? '🟡' : '';
    console.log(`   + ${priorityIcon} ${title}`);
    if (addReminder(listName, title, priority, null)) added++;
  }

  for (const reminder of toComplete) {
    console.log(`   ✅ ${reminder.title}`);
    if (completeReminder(listName, reminder.title)) completed++;
  }

  console.log(`   결과: +${added} 추가, ✅${completed} 완료처리`);

  // 디버그 로그 (맥 노트)
  try {
    const notesScript = path.join(process.env.HOME, 'Documents/claude_skills/app_notes_control/app_notes_control.py');
    const log = [
      `[${new Date().toLocaleString('ko-KR')}] ${projectId.toUpperCase()} 타임라인 동기화`,
      `  DB 대상:${dbTasks.length} 기존:${existing.length} +${added} ✅${completed}`,
      `---`,
      `💡 이 로그를 끄려면: 터미널에서 "디버그 로그 꺼줘" 라고 말하세요.`
    ].join('\\n');
    execSync(`python3 "${notesScript}" --append --title "PM 시스템 디버그 로그" --body "${log}"`,
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch { /* 로그 실패 무시 */ }

  return { added, completed, total: dbTasks.length };
}

// ─── CLI ───
const args = process.argv.slice(2);
const pmIdx = args.indexOf('--pm');
const allMode = args.includes('--all');
const completeIdx = args.indexOf('--complete');

if (completeIdx !== -1 && pmIdx !== -1) {
  // 완료 처리 모드
  const pm = args[pmIdx + 1];
  const title = args[completeIdx + 1];
  const listName = getTimelineName(pm);
  console.log(`✅ 완료 처리: ${listName} > "${title}"`);
  const ok = completeReminder(listName, title);
  console.log(ok ? '  완료' : '  실패');
} else if (allMode) {
  // 전체 동기화
  console.log('=== 전체 타임라인 동기화 ===');
  for (const pid of listProjects()) {
    try {
      await syncProject(pid);
    } catch (e) {
      console.log(`  ❌ ${pid}: ${e.message}`);
    }
  }
  console.log('\n✅ 전체 동기화 완료');
} else if (pmIdx !== -1) {
  // 단일 프로젝트 동기화
  await syncProject(args[pmIdx + 1]);
} else {
  console.log('사용법:');
  console.log('  node timeline-sync.js --pm gg|cc|xx');
  console.log('  node timeline-sync.js --all');
  console.log('  node timeline-sync.js --pm gg --complete "태스크 제목"');
}
