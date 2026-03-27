/**
 * weekly-report.js — 주간 현빈리포트 생성 + 텔레그램 발송
 *
 * 사용법:
 *   node weekly-report.js              # 이번 주 리포트 생성 + 텔레그램 발송
 *   node weekly-report.js --dry-run    # 리포트 생성만 (발송 안 함)
 */

import { createAdapter, listProjects } from '../../adapter/index.js';
import { formatDate, formatDayOfWeek } from './formatter.js';
import https from 'https';

const BOT_TOKEN = '8702727796:AAFEGeQulDaWoUmCAEaTHpCFCXaPb2_jJuo';
const CHAT_ID = 6942656480;
const DRY_RUN = process.argv.includes('--dry-run');

// ─── 텔레그램 발송 ───

function sendTelegram(text) {
  if (DRY_RUN) {
    console.log('\n[DRY RUN] 텔레그램 발송 스킵\n');
    console.log(text);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' });
    const url = new URL(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 30000, family: 4
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const data = JSON.parse(body);
        if (data.ok) resolve();
        else reject(new Error(data.description));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ─── 프로그레스바 ───

function progressBar(ratio, len = 8) {
  const filled = Math.round(ratio * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

// ─── 프로젝트 데이터 수집 ───

async function getProjectWeekData(projectId) {
  const adapter = createAdapter(projectId);
  const config = adapter.getConfig();
  const meta = adapter.getProjectMeta();
  const allTasks = await adapter.queryTasks();

  const statusCount = {};
  allTasks.forEach(t => { statusCount[t.status] = (statusCount[t.status] || 0) + 1; });

  const inProg = statusCount['진행 중'] || 0;
  const blocked = statusCount['업무막힘'] || 0;
  const waiting = statusCount['진행대기'] || 0;
  const completed = (statusCount['완료'] || 0) + (statusCount['완료_aar'] || 0);

  // 블로킹 항목 제목
  const blockedTasks = allTasks.filter(t => t.status === '업무막힘').map(t => t.title.replace(/^✅\s*/, '').trim());

  // 담당자별 집계
  const memberStats = {};
  config.members.forEach(m => { memberStats[m.name] = { total: 0 }; });

  return {
    projectId,
    displayName: config.displayName.split(' ')[0],
    dday: meta.dday,
    launchDate: meta.launchDate,
    inProg, blocked, waiting, completed,
    total: allTasks.length,
    blockedTasks,
    members: config.members,
    memberStats,
    phases: meta.phases
  };
}

// ─── 메시지 1: MVP + 대시보드 ───

function buildMessage1(projects, weekLabel) {
  const openers = [
    '이번 주의 현빈을 숫자로 만나보자 📊',
    '금요일이다. 이번 주 어땠는지 볼까? 🏆',
    '또 한 주가 갔다. 체크인 타임 ⏰',
    '이번 주 리포트, 준비됐어 📋',
  ];
  const opener = openers[Math.floor(Math.random() * openers.length)];

  let msg = `━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 주간 현빈리포트\n`;
  msg += `${weekLabel}\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `${opener}\n\n`;

  for (const p of projects) {
    const ddayStr = p.dday !== null
      ? (p.dday >= 0 ? `D-${p.dday}` : `D+${Math.abs(p.dday)}`)
      : '';
    const ddayIcon = p.dday !== null
      ? (p.dday < 0 ? '⚠️' : p.dday <= 7 ? '🔴' : p.dday <= 30 ? '🟡' : '🟢')
      : '';

    const active = p.inProg + p.blocked + p.waiting;
    const speed = active > 0 ? Math.min(1, p.completed / Math.max(active, 1)) : 0;

    msg += `■ ${p.displayName} | ${ddayStr} ${ddayIcon}\n`;
    msg += `  진행중 ${p.inProg} · 막힘 ${p.blocked} · 대기 ${p.waiting}\n`;
    msg += `  속도 ${progressBar(speed)} ${Math.round(speed * 100)}%\n`;

    if (p.blocked > 0) {
      msg += `  🚨 ${p.blockedTasks.slice(0, 2).join(', ')}\n`;
    }
    if (p.inProg === 0 && p.blocked === 0 && p.completed === 0) {
      msg += `  ⚠️ 이번 주 활동 없음\n`;
    }
    msg += `\n`;
  }

  return msg.trim();
}

// ─── 메시지 2: 분석 + 원샷 미션 ───

function buildMessage2(projects) {
  let msg = `━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 분석 + 다음 주\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;

  // 팀원 요약
  msg += `👥 팀원 주간\n`;
  for (const p of projects) {
    for (const m of p.members) {
      msg += `  ${m.name}(${p.displayName}) — ${m.role}\n`;
    }
  }
  msg += `\n`;

  // 다음 주 필수
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 다음 주 필수\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;

  for (const p of projects) {
    msg += `■ ${p.displayName}\n`;
    if (p.blocked > 0) {
      msg += `  ① 🚨 ${p.blockedTasks[0]} 해소\n`;
    }
    if (p.inProg > 0) {
      msg += `  ${p.blocked > 0 ? '②' : '①'} 진행 중 ${p.inProg}건 마무리\n`;
    }
    if (p.inProg === 0 && p.blocked === 0) {
      msg += `  ① 첫 태스크 시작하기\n`;
    }
    msg += `\n`;
  }

  // 원샷 미션
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 다음 주 원샷 미션\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;

  // 가장 방치된 프로젝트에서 미션 추출
  const mostNeglected = projects
    .filter(p => p.dday === null || p.dday > 0) // 아직 마감 안 지난 것
    .sort((a, b) => (a.inProg + a.completed) - (b.inProg + b.completed))[0];

  if (mostNeglected) {
    if (mostNeglected.inProg === 0 && mostNeglected.completed === 0) {
      msg += `"${mostNeglected.displayName}에서 태스크 1개 시작하기"\n\n`;
      msg += `📍 ${mostNeglected.displayName}가 가장 오래 멈춰있습니다\n`;
    } else if (mostNeglected.blocked > 0) {
      msg += `"${mostNeglected.blockedTasks[0]} 해소하기"\n\n`;
      msg += `📍 블로킹이 다른 업무를 막고 있습니다\n`;
    } else {
      msg += `"${mostNeglected.displayName} 진행 중 업무 1건 완료하기"\n\n`;
    }
  }

  // PM 코멘트
  msg += `\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `💬 현빈에게\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;

  const warnings = [];
  for (const p of projects) {
    if (p.inProg === 0 && p.completed === 0 && p.blocked === 0) {
      warnings.push(`${p.displayName}가 멈춰있습니다.`);
    }
    if (p.dday !== null && p.dday < 0) {
      warnings.push(`${p.displayName} D-day가 ${Math.abs(p.dday)}일 지났습니다.`);
    }
    if (p.dday !== null && p.dday > 0 && p.dday <= 7) {
      warnings.push(`${p.displayName} 런칭까지 ${p.dday}일 남았습니다.`);
    }
  }

  if (warnings.length > 0) {
    msg += warnings.join('\n');
  } else {
    msg += `전체적으로 진행 중입니다. 다음 주도 화이팅.`;
  }

  msg += `\n\n다음 리포트: ${getNextFriday()}`;

  return msg.trim();
}

function getNextFriday() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getMonth() + 1}.${d.getDate()}(금)`;
}

// ─── 메인 ───

console.log('=== 주간 현빈리포트 생성 ===\n');

const now = new Date();
const monday = new Date(now);
monday.setDate(now.getDate() - now.getDay() + 1);
const friday = new Date(monday);
friday.setDate(monday.getDate() + 4);
const weekLabel = `${formatDate(monday)}(월) ~ ${formatDate(friday)}(금)`;

console.log(`기간: ${weekLabel}\n`);

// 프로젝트 데이터 수집
const projects = [];
for (const pid of listProjects()) {
  try {
    const data = await getProjectWeekData(pid);
    projects.push(data);
    console.log(`✅ ${data.displayName}: 진행${data.inProg} 막힘${data.blocked} 대기${data.waiting} 완료${data.completed}`);
  } catch (e) {
    console.log(`❌ ${pid}: ${e.message}`);
  }
}

// 메시지 생성
const msg1 = buildMessage1(projects, weekLabel);
const msg2 = buildMessage2(projects);

console.log(`\n메시지1: ${msg1.length}자`);
console.log(`메시지2: ${msg2.length}자`);

// 텔레그램 발송
try {
  await sendTelegram(msg1);
  console.log('✅ 메시지 1 발송 완료');
  await new Promise(r => setTimeout(r, 1000)); // 1초 간격
  await sendTelegram(msg2);
  console.log('✅ 메시지 2 발송 완료');
} catch (e) {
  console.log(`❌ 텔레그램 발송 실패: ${e.message}`);
  // Markdown 파싱 실패 시 plain text로 재시도
  try {
    const plainSend = (text) => {
      return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ chat_id: CHAT_ID, text });
        const url = new URL(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
        const req = https.request({
          hostname: url.hostname, path: url.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
          timeout: 30000, family: 4
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => resolve());
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    };
    await plainSend(msg1);
    await new Promise(r => setTimeout(r, 1000));
    await plainSend(msg2);
    console.log('✅ Plain text로 재발송 완료');
  } catch (e2) {
    console.log(`❌ 재발송도 실패: ${e2.message}`);
  }
}

// 디버그 로그
try {
  const { execSync } = await import('child_process');
  const notesScript = `${process.env.HOME}/Documents/claude_skills/app_notes_control/app_notes_control.py`;
  const log = [
    `[${new Date().toLocaleString('ko-KR')}] 주간 현빈리포트 발송`,
    `  기간: ${weekLabel}`,
    `  프로젝트: ${projects.map(p => `${p.displayName}(진행${p.inProg}/막힘${p.blocked})`).join(', ')}`,
    `  메시지: ${msg1.length}자 + ${msg2.length}자`,
    `  상태: ${DRY_RUN ? 'DRY RUN' : '✅ 발송 완료'}`,
    `---`,
    `💡 이 로그를 끄려면: 터미널에서 "디버그 로그 꺼줘" 라고 말하세요.`
  ].join('\\n');
  execSync(`python3 "${notesScript}" --append --title "PM 시스템 디버그 로그" --body "${log}"`,
    { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
} catch { /* 로그 실패 무시 */ }

console.log('\n✅ 주간 리포트 완료');
