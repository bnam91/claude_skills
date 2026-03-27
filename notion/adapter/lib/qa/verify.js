/**
 * qa/verify.js — PM output 자동 검증 레이어
 *
 * 사용법:
 *   import { qaVerify } from './qa/verify.js';
 *   const result = await qaVerify(briefingText, 'gg', 'morning');
 *   // result.verdict: 'PASS' | 'WARN' | 'FAIL'
 */

import { createAdapter } from '../../index.js';
import { formatDate } from '../formatter.js';

// ─── 심각도 ───
const CRITICAL = 'CRITICAL';
const HIGH = 'HIGH';
const MEDIUM = 'MEDIUM';
const LOW = 'LOW';

// ─── 개별 체크 결과 ───
function pass(id, name) { return { id, name, result: 'PASS', detail: '' }; }
function fail(id, name, detail) { return { id, name, result: 'FAIL', detail }; }
function warn(id, name, detail) { return { id, name, result: 'WARN', detail }; }

// ─── 브리핑 텍스트에서 항목 추출 ───

function extractMentionedTasks(text) {
  // 불릿/체크박스 뒤의 텍스트를 추출
  const lines = text.split('\n');
  const tasks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // "• ", "- ", "☐ ", "✅ ", "⬜ " 등으로 시작하는 줄
    const match = trimmed.match(/^[•\-☐✅⬜🚨🔴🟡]\s*(?:\*\*)?(.+?)(?:\*\*)?(?:\s*—.*)?$/);
    if (match) tasks.push(match[1].trim());
  }
  return tasks;
}

function extractDday(text) {
  const match = text.match(/D[+-](\d+)/);
  return match ? parseInt(match[1]) : null;
}

function extractDateFormats(text) {
  const dates = [];
  // M.D 포맷 (좋은)
  const good = text.match(/\b\d{1,2}\.\d{1,2}\b/g) || [];
  // 슬래시 포맷 (나쁜)
  const bad = text.match(/\b\d{1,2}\/\d{1,2}\b/g) || [];
  // 앞자리 0 포맷 (나쁜)
  const padded = text.match(/\b0\d\.\d{1,2}\b/g) || [];
  return { good, bad: [...bad, ...padded] };
}

// ─── 검증 항목 ───

/** D1: 진행 중 항목 수 일치 */
async function checkItemCount(text, adapter, status) {
  const dbTasks = await adapter.queryTasks({ status: [status] });
  const mentioned = extractMentionedTasks(text);

  // 정확한 수 비교보다는, DB에 있는 항목이 브리핑에 언급되었는지 확인
  const dbTitles = dbTasks.map(t => t.title);
  const missing = dbTitles.filter(title =>
    !mentioned.some(m => title.includes(m) || m.includes(title.substring(0, 10)))
  );

  if (missing.length === 0) {
    return pass('D1', `${status} 항목 수 일치`);
  }
  if (missing.length <= 2) {
    return warn('D1', `${status} 항목 수`, `DB ${dbTasks.length}건 중 ${missing.length}건 누락 가능: ${missing.slice(0, 3).join(', ')}`);
  }
  return fail('D1', `${status} 항목 수 불일치`, `DB ${dbTasks.length}건, 누락: ${missing.join(', ')}`);
}

/** D3: 업무막힘 전수 포함 */
async function checkBlockingInclusion(text, adapter) {
  const blocking = await adapter.queryTasks({ status: ['업무막힘'] });
  if (blocking.length === 0) return pass('D3', '업무막힘 전수 포함 (해당 없음)');

  const mentioned = extractMentionedTasks(text);
  const textLower = text;
  const missing = blocking.filter(t =>
    !mentioned.some(m => t.title.includes(m) || m.includes(t.title.substring(0, 8))) &&
    !textLower.includes(t.title.substring(0, 10))
  );

  if (missing.length === 0) return pass('D3', '업무막힘 전수 포함');
  return fail('D3', '업무막힘 누락', `${missing.map(t => t.title).join(', ')}`);
}

/** T1: D-day 계산 정확성 */
function checkDday(text, adapter) {
  const meta = adapter.getProjectMeta();
  if (meta.dday === null) return pass('T1', 'D-day (런칭일 미설정)');

  const briefingDday = extractDday(text);
  if (briefingDday === null) return warn('T1', 'D-day', '브리핑에 D-day 표기 없음');

  const actualDday = Math.abs(meta.dday);
  if (briefingDday === actualDday) return pass('T1', 'D-day 계산 정확');
  return fail('T1', 'D-day 계산 오류', `브리핑 D-${briefingDday}, 실제 D-${actualDday}`);
}

/** T2: 날짜 포맷 통일 */
function checkDateFormat(text) {
  const { good, bad } = extractDateFormats(text);
  if (bad.length === 0) return pass('T2', '날짜 포맷 M.D 통일');
  return fail('T2', '날짜 포맷 불일치', `비표준: ${bad.join(', ')}`);
}

/** F3: 문체 규칙 (축약형 검사) */
function checkTone(text) {
  const banned = ['해소해야함', '반영 안됨', '착수 필요', '확인 바람', '참고 바랍니다'];
  const found = banned.filter(b => text.includes(b));
  if (found.length === 0) return pass('F3', '문체 서술형 준수');
  return warn('F3', '문체 규칙', `축약형 발견: ${found.join(', ')}`);
}

/** F5: PM 코멘트 존재 */
function checkPmComment(text) {
  if (text.includes('PM 코멘트') || text.includes('PM 총평') || text.includes('💬')) {
    return pass('F5', 'PM 코멘트 존재');
  }
  return fail('F5', 'PM 코멘트 없음', '브리핑에 PM 판단/코멘트가 포함되지 않았습니다');
}

// ─── 메인 검증 ───

/**
 * PM output 검증
 * @param {string} text - 브리핑/업무요청 텍스트
 * @param {string} projectId - 'gg' | 'cc' | 'xx'
 * @param {string} outputType - 'morning' | 'eod' | 'weekly' | 'task_request'
 * @returns {Promise<object>} QAResult
 */
export async function qaVerify(text, projectId, outputType = 'morning') {
  const adapter = createAdapter(projectId);
  const checks = [];

  // 데이터 정합성
  if (['morning', 'eod', 'weekly'].includes(outputType)) {
    checks.push(await checkItemCount(text, adapter, '진행 중'));
    checks.push(await checkBlockingInclusion(text, adapter));
  }

  // 날짜/D-day
  checks.push(checkDday(text, adapter));
  checks.push(checkDateFormat(text));

  // 포맷
  checks.push(checkTone(text));
  if (['morning', 'eod', 'weekly'].includes(outputType)) {
    checks.push(checkPmComment(text));
  }

  // 판정
  const criticalFails = checks.filter(c => c.result === 'FAIL');
  const highWarns = checks.filter(c => c.result === 'WARN');

  let verdict;
  if (criticalFails.length >= 1) {
    verdict = 'FAIL';
  } else if (highWarns.length >= 3) {
    verdict = 'FAIL';
  } else if (highWarns.length >= 1) {
    verdict = 'WARN';
  } else {
    verdict = 'PASS';
  }

  const summary = verdict === 'PASS'
    ? `✅ 검증 통과 (${checks.length}항목 전부 PASS)`
    : verdict === 'WARN'
      ? `⚠️ 경고 ${highWarns.length}건 (${criticalFails.length === 0 ? '치명적 오류 없음' : ''})`
      : `❌ 검증 실패 — ${criticalFails.map(f => f.id).join(', ')}`;

  return {
    verdict,
    checks,
    critical_failures: criticalFails,
    summary,
    timestamp: new Date().toISOString()
  };
}

// ─── 리포트 생성 ───

/** 간결 리포트 (브리핑 DB 첨부용) */
export function generateBriefReport(qaResult) {
  const lines = [
    '━'.repeat(30),
    `${qaResult.verdict === 'PASS' ? '✅' : qaResult.verdict === 'WARN' ? '⚠️' : '❌'} QA 검증 ${qaResult.verdict} | ${new Date(qaResult.timestamp).toLocaleString('ko-KR')}`,
    '━'.repeat(30),
  ];

  for (const check of qaResult.checks) {
    const icon = check.result === 'PASS' ? '✅' : check.result === 'WARN' ? '⚠️' : '❌';
    lines.push(`${icon} ${check.id}: ${check.name}${check.detail ? ' — ' + check.detail : ''}`);
  }

  lines.push('━'.repeat(30));
  return lines.join('\n');
}

/** FAIL 시 PM 리턴 메시지 */
export function generateFailMessage(qaResult) {
  if (qaResult.verdict === 'PASS') return null;

  const lines = ['❌ QA 검증 실패 — 재생성 필요\n'];

  const fails = qaResult.checks.filter(c => c.result === 'FAIL');
  if (fails.length > 0) {
    lines.push('[실패 항목]');
    fails.forEach(f => {
      lines.push(`  ❌ ${f.id}: ${f.name}`);
      if (f.detail) lines.push(`     ${f.detail}`);
    });
  }

  const warns = qaResult.checks.filter(c => c.result === 'WARN');
  if (warns.length > 0) {
    lines.push('\n[경고 항목]');
    warns.forEach(w => {
      lines.push(`  ⚠️ ${w.id}: ${w.name}`);
      if (w.detail) lines.push(`     ${w.detail}`);
    });
  }

  return lines.join('\n');
}
