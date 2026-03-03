/**
 * db_create_agile.js - 애자일 테이블(Notion DB) 생성
 *
 * Usage:
 *   node db_create_agile.js --parent-page <pageId|URL> --name <dbName>
 *                           [--levels "CTO,CFO,CMO,CPO,CSCO,COO,CEO"]
 *                           [--goal "프로젝트 목표 텍스트"]
 *
 * 칼럼 순서: 1_우선순위 > 2_아웃풋 > 3_데드라인 > 4_상태 > 5_이슈노트
 * 로우 생성 순서: GOAL → CTO → ... → CEO (역순 생성으로 Notion 표시는 CEO가 맨 위)
 * 주의: 우선순위·상태는 select 타입 (Notion API가 status 타입 옵션 설정 미지원)
 */

import { createPage, createDatabase } from './notion_api.js';

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

function extractPageId(input) {
  if (!input) return null;
  const urlMatch = input.match(/notion\.so\/(?:[^/?]+-)?([a-f0-9]{32})(?:\?|$)/);
  if (urlMatch) return urlMatch[1];
  const cleanId = input.replace(/-/g, '');
  if (/^[a-f0-9]{32}$/.test(cleanId)) return cleanId;
  return input;
}

const parentPageId = extractPageId(getArg('--parent-page'));
const dbName = getArg('--name') || '애자일 테이블';
const levelsArg = getArg('--levels') || 'CEO,COO,CSCO,CPO,CMO,CFO,CTO';
// 입력받은 레벨은 표시 순서(위→아래). 생성은 역순으로 해야 Notion에서 올바르게 보임
const levels = levelsArg.split(',').map(l => l.trim()).filter(Boolean);
const goal = getArg('--goal');

if (!parentPageId) {
  console.error('오류: --parent-page 옵션이 필요합니다.');
  process.exit(1);
}

// ─── DB 프로퍼티 정의 ────────────────────────────────────────────────────────
// 가나다라마 접두어로 원하는 칼럼 순서 고정

const PROPERTIES = {
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
};

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📋 애자일 테이블 생성 시작`);
  console.log(`   이름   : ${dbName}`);
  console.log(`   페이지 : ${parentPageId}`);
  console.log(`   C-레벨 : ${levels.join(', ')} (표시 순서)`);
  if (goal) console.log(`   GOAL   : ${goal}`);
  console.log();

  // 1단계: DB 생성
  process.stdout.write('1/2 DB 생성 중... ');
  const db = await createDatabase(parentPageId, dbName, PROPERTIES);
  const dbId = db.id;
  console.log(`완료 (${dbId})`);

  // 2단계: 로우 추가 — Notion은 최신 생성이 위로 올라오므로 역순 생성
  // 생성 순서: GOAL → 마지막 C-레벨 → ... → 첫 번째 C-레벨
  // 표시 순서: 첫 번째 C-레벨(맨 위) → ... → 마지막 C-레벨 → GOAL(맨 아래)
  console.log('2/2 항목 추가 중...');

  if (goal) {
    await createPage(
      { database_id: dbId },
      {
        '업무':       { title:  [{ type: 'text', text: { content: goal } }] },
        '1_우선순위': { select: { name: '🎖 GOAL' } },
        '4_상태':     { select: { name: '-' } }
      }
    );
    console.log(`   🎖 GOAL 추가: ${goal}`);
  }

  for (const level of [...levels].reverse()) {
    await createPage(
      { database_id: dbId },
      {
        '업무':       { title:  [{ type: 'text', text: { content: `[${level}]` } }] },
        '1_우선순위': { select: { name: '📍MileStone' } },
        '4_상태':     { select: { name: '-' } }
      }
    );
    console.log(`   ✅ [${level}] 추가`);
  }

  const dbUrl = `https://www.notion.so/${dbId.replace(/-/g, '')}`;
  console.log(`\n🎉 생성 완료!`);
  console.log(`   DB 이름 : ${dbName}`);
  console.log(`   DB ID   : ${dbId}`);
  console.log(`   DB URL  : ${dbUrl}`);
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Notion UI에서 추가 설정 필요
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 조건부 색상
   → [1_우선순위] 속성으로 설정

2. 추가설정 → 하위항목
   - 표시옵션 : 토글에 중첩항목으로 표시
   - 필터옵션 : 상위항목 및 하위항목
   - 고급설정  : 제목에 중첩토글 표시 ON

3. 칼럼 순서
   → [1_우선순위] 칼럼을 맨 앞으로 이동
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(err => {
  console.error('\n오류:', err.message);
  process.exit(1);
});
