/**
 * create_project.js - PM 프로젝트 셋업 자동화
 *
 * Usage:
 *   node create_project.js \
 *     --keyword <키워드> \
 *     --desc "프로젝트 설명" \
 *     --members "현빈,수지" \
 *     --goal "목표" \
 *     --dday "YYYY-MM-DD" \
 *     [--levels "CEO,CMO,CTO,COO,CFO"]
 *
 * 생성 항목:
 *   1. Notion 프로젝트 페이지 (project-manager 하위)
 *      - 설명 콜아웃
 *      - PM 브리핑 DB (인라인, 빈 DB)
 *      - 업무요청 콜아웃 (담당자별 H2 + 콜아웃)
 *      - 애자일 테이블 DB
 *   2. ~/.claude/commands/pm-{keyword}.md 생성
 *   3. ~/.claude/commands/pm.md 프로젝트 목록 업데이트
 */

import { createPage, createDatabase, updateDatabase, appendBlocks, HEADERS } from './notion_api.js';
import { writeFileSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

// ─── 상수 ──────────────────────────────────────────────────────────────────
const PARENT_PAGE_ID = '31c111a5778880ccbc47f4070ae6e780';
const COMMANDS_DIR = path.join(os.homedir(), '.claude', 'commands');
const DEFAULT_LEVELS = 'CEO,COO,CMO,CFO,CTO';

// ─── 인자 파싱 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const keyword  = getArg('--keyword');
const desc     = getArg('--desc') || '(입력 예정)';
const membersRaw = getArg('--members') || '';
const goal     = getArg('--goal') || '(입력 예정)';
const dday     = getArg('--dday') || '(입력 예정)';
const levelsArg = getArg('--levels') || DEFAULT_LEVELS;

const levels  = levelsArg.split(',').map(l => l.trim()).filter(Boolean);
const members = membersRaw.split(',').map(m => m.trim()).filter(Boolean);

if (!keyword) {
  console.error('오류: --keyword 옵션이 필요합니다.');
  process.exit(1);
}
if (members.length === 0) {
  console.error('오류: --members 옵션이 필요합니다. (예: --members "현빈,수지")');
  process.exit(1);
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

/** 아이콘 포함 페이지 생성 (notion_api.js의 createPage는 icon 미지원) */
async function createProjectPage() {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      icon: { type: 'emoji', emoji: '🏇' },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: `project_manager_${keyword}` } }]
        }
      }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`페이지 생성 오류 (${res.status}): ${data.message}`);
  return data;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 프로젝트 셋업 시작: ${keyword.toUpperCase()}`);
  console.log(`   키워드 : ${keyword}`);
  console.log(`   목표   : ${goal}`);
  console.log(`   D-day  : ${dday}`);
  console.log(`   인원   : ${members.join(', ')}`);
  console.log(`   C-레벨 : ${levels.join(', ')}`);
  console.log(`   설명   : ${desc}\n`);

  // ── 1. 프로젝트 페이지 생성 ────────────────────────────────────────────
  process.stdout.write('1/7  프로젝트 페이지 생성 중... ');
  const page = await createProjectPage();
  const pageId = page.id;
  const pageUrl = `https://www.notion.so/project-manager-${pageId.replace(/-/g, '')}`;
  console.log(`완료`);
  console.log(`     페이지 ID : ${pageId}`);

  // ── 2. 설명 콜아웃 + 구분선 추가 ─────────────────────────────────────
  process.stdout.write('2/7  설명 콜아웃 추가 중... ');
  await appendBlocks(pageId, [
    {
      object: 'block', type: 'callout',
      callout: {
        rich_text: [{ type: 'text', text: { content: desc } }],
        icon: { type: 'emoji', emoji: '📌' },
        color: 'blue_background'
      }
    },
    { object: 'block', type: 'divider', divider: {} }
  ]);
  console.log(`완료`);

  // ── 3. PM 브리핑 DB 생성 (빈 인라인 DB) ──────────────────────────────
  // 브리핑 DB 구조: 이름(title) 컬럼만. 각 페이지에 '업무 시작/마감 브리핑' 토글을 추가해 사용.
  process.stdout.write('3/7  PM 브리핑 DB 생성 중... ');
  const briefingDb = await createDatabase(pageId, 'PM 브리핑', {
    '이름': { title: {} }
  });
  const briefingDbId = briefingDb.id;
  console.log(`완료`);
  console.log(`     브리핑 DB ID : ${briefingDbId}`);

  // ── 4. 구분선 추가 ────────────────────────────────────────────────────
  process.stdout.write('4/7  섹션 구분선 추가 중... ');
  await appendBlocks(pageId, [
    { object: 'block', type: 'divider', divider: {} }
  ]);
  console.log(`완료`);

  // ── 5. 담당자별 업무요청 콜아웃 추가 ─────────────────────────────────
  process.stdout.write('5/7  업무요청 콜아웃 추가 중... ');
  const memberBlocks = [];
  for (const member of members) {
    memberBlocks.push({
      object: 'block', type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: `${member} 업무요청` } }]
      }
    });
    memberBlocks.push({
      object: 'block', type: 'callout',
      callout: {
        rich_text: [{ type: 'text', text: { content: '' } }],
        icon: { type: 'emoji', emoji: '📋' },
        color: 'default_background'
      }
    });
  }
  memberBlocks.push({ object: 'block', type: 'divider', divider: {} });

  const memberBlocksResult = await appendBlocks(pageId, memberBlocks);
  console.log(`완료`);

  // callout 블록 ID 추출
  const calloutBlocks = memberBlocksResult.results.filter(b => b.type === 'callout');
  const calloutIds = calloutBlocks.map(b => b.id);
  members.forEach((member, i) => {
    console.log(`     ${member} 콜아웃 ID : ${calloutIds[i] ?? '(오류)'}`);
  });

  // ── 6. 애자일 테이블 DB 생성 + C-레벨 행 추가 ────────────────────────
  process.stdout.write('6/7  애자일 테이블 DB 생성 중... ');
  const agileDb = await createDatabase(pageId, `${keyword.toUpperCase()} 애자일 테이블`, {
    '업무': { title: {} },
    '1_우선순위': {
      select: {
        options: [
          { name: '-',           color: 'default' },
          { name: '대기',        color: 'gray'    },
          { name: '1',           color: 'red'     },
          { name: '2',           color: 'orange'  },
          { name: '3',           color: 'yellow'  },
          { name: '4',           color: 'gray'    },
          { name: '5',           color: 'gray'    },
          { name: '📍MileStone', color: 'blue'    },
          { name: '🎖 GOAL',     color: 'pink'    },
        ]
      }
    },
    '2_아웃풋':   { rich_text: {} },
    '3_데드라인': { date: {} },
    '4_상태': {
      select: {
        options: [
          { name: '-',       color: 'default' },
          { name: '진행대기', color: 'gray'   },
          { name: '진행 중',  color: 'blue'   },
          { name: '**완료**', color: 'green'  },
          { name: '완료',     color: 'green'  },
          { name: '업무막힘', color: 'red'    },
        ]
      }
    },
    '5_이슈노트': { rich_text: {} },
  });
  const agileDbId = agileDb.id;

  // 상위 항목 relation 컬럼 추가 (자기 참조)
  await updateDatabase(agileDbId, {
    '상위 항목': {
      relation: {
        database_id: agileDbId,
        type: 'single_property',
        single_property: {}
      }
    }
  });
  console.log(`완료`);
  console.log(`     애자일 DB ID : ${agileDbId}`);

  // GOAL 행 + C-레벨 행 추가 (역순으로 생성해야 Notion에서 올바른 순서)
  process.stdout.write('     C-레벨 행 추가 중... ');
  await createPage(
    { database_id: agileDbId },
    {
      '업무':       { title: [{ type: 'text', text: { content: goal } }] },
      '1_우선순위': { select: { name: '🎖 GOAL' } },
      '4_상태':     { select: { name: '-' } }
    }
  );
  for (const level of [...levels].reverse()) {
    await createPage(
      { database_id: agileDbId },
      {
        '업무':       { title: [{ type: 'text', text: { content: `[${level}]` } }] },
        '1_우선순위': { select: { name: '📍MileStone' } },
        '4_상태':     { select: { name: '-' } }
      }
    );
  }
  console.log(`완료`);

  // ── 7. pm-{keyword}.md 생성 + pm.md 업데이트 ─────────────────────────
  process.stdout.write(`7/7  pm-${keyword}.md 및 pm.md 업데이트 중... `);

  // pm-{keyword}.md 내용 생성
  const memberTableRows = members.map((member, i) =>
    `| ${member} | ${member} | \`${calloutIds[i] ?? 'ID_입력필요'}\` | |`
  ).join('\n');

  const pmSkillContent =
`# ${keyword.toUpperCase()} 프로젝트 설정 (pm.md 엔진에 주입되는 설정값)

---

## 프로젝트 변수

| 항목 | 값 |
|------|-----|
| 프로젝트명 | ${keyword.toUpperCase()} |
| 목표 | ${goal} |
| D-day 기준일 | ${dday} |
| 프로젝트 DB ID | \`${agileDbId}\` |
| 브리핑 DB ID | \`${briefingDbId}\` |
| 스킬 경로 | \`~/Documents/claude_skills/notion\` |

---

## 담당 인원 및 콜아웃

| 인원 | 콜아웃 | 실제 콜아웃 Block ID | 비고 |
|------|--------|----------------------|------|
${memberTableRows}

---

## ${keyword.toUpperCase()} 전용 스크립트

| 스크립트 | 설명 |
|----------|------|
| (추가 예정) | |

---

## ${keyword.toUpperCase()} 전용 요청 트리거

| 사용자 요청 | 실행할 명령 |
|-------------|-------------|
| (추가 예정) | |
`;

  const pmSkillPath = path.join(COMMANDS_DIR, `pm-${keyword}.md`);
  writeFileSync(pmSkillPath, pmSkillContent, 'utf8');

  // pm.md 프로젝트 목록에 행 추가
  const pmMdPath = path.join(COMMANDS_DIR, 'pm.md');
  let pmMd = readFileSync(pmMdPath, 'utf8');
  const newRow = `| \`${keyword}\` | ${keyword.toUpperCase()} | \`/pm-${keyword}\` | ${goal} |`;

  if (pmMd.includes(`\`${keyword}\``)) {
    console.log(`완료 (pm.md: 이미 등록됨, 스킵)`);
  } else {
    // 프로젝트 목록 테이블의 마지막 행 뒤에 삽입
    pmMd = pmMd.replace(
      /((?:\| `\w+` \|[^\n]+\|\n)+)/,
      `$1${newRow}\n`
    );
    writeFileSync(pmMdPath, pmMd, 'utf8');
    console.log(`완료`);
  }

  // ── 최종 요약 ──────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 프로젝트 셋업 완료: ${keyword.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 프로젝트 페이지
   ID  : ${pageId}
   URL : ${pageUrl}

📊 PM 브리핑 DB
   ID  : ${briefingDbId}

📊 애자일 테이블 DB
   ID  : ${agileDbId}

👥 업무요청 콜아웃
${members.map((m, i) => `   ${m} : ${calloutIds[i] ?? '(오류)'}`).join('\n')}

📝 생성된 파일
   pm-${keyword}.md → ${pmSkillPath}
   pm.md 프로젝트 목록 업데이트 완료

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Notion UI에서 추가 설정 필요
   1. 애자일 테이블 조건부 색상 (1_우선순위 기준)
   2. 추가설정 → 하위항목 (토글에 중첩항목으로 표시)
   3. 칼럼 순서 (1_우선순위 맨 앞으로 이동)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(err => {
  console.error('\n오류:', err.message);
  process.exit(1);
});
