// _eod_read.js — 마감브리핑용 콜아웃 데이터 읽기
import { getChildren, getText } from './notion_api.js';

// 콜아웃 블록 ID (2f1111a5778880cf8d67ded111e95cb7 페이지 내)
const CALLOUTS = {
  '현빈02': '2f1111a577888127951bc2b17188efff',
  '지혜':   '2f1111a5778881e0b79eec85bbc540c5',
};

// 지혜 업무코멘트: 퇴근 전 작성하는 참고용 블록
const JIHYE_COMMENT_BLOCK = '317111a5778880669d83c48e88d71b22';

const now = new Date();
const TODAY = `${now.getMonth() + 1}.${now.getDate()}`;

async function readCallout(name, calloutId) {
  const blocks = await getChildren(calloutId);
  const toggle = blocks.find(b => b.type === 'toggle' && getText(b) === TODAY);

  if (!toggle) {
    console.log(`\n[${name}] ⚠️  ${TODAY} 토글 없음`);
    return;
  }

  const children = await getChildren(toggle.id);
  console.log(`\n[${name}] ${TODAY} 업무:`);

  let done = 0, total = 0;
  for (const b of children) {
    if (b.type === 'to_do') {
      total++;
      const checked = b.to_do?.checked ?? false;
      if (checked) done++;
      console.log(`  ${checked ? '✅' : '⬜'} ${getText(b)}`);
    } else {
      const text = getText(b);
      if (text) console.log(`  📌 ${text}`);
    }
  }
  console.log(`  → 완료 ${done}/${total}`);
}

async function readJihyeComment() {
  console.log('\n[지혜 업무코멘트]:');
  try {
    const blocks = await getChildren(JIHYE_COMMENT_BLOCK);
    // 오늘 날짜 토글 찾기
    const toggle = blocks.find(b => b.type === 'toggle' && getText(b) === TODAY);
    if (!toggle) {
      console.log('  (코멘트 없음)');
      return;
    }
    const children = await getChildren(toggle.id);
    for (const b of children) {
      if (b.type === 'to_do') {
        const checked = b.to_do?.checked ?? false;
        const text = getText(b);
        if (text) console.log(`  ${checked ? '✅' : '⬜'} ${text}`);
      } else {
        const text = getText(b);
        if (text) console.log(`  📌 ${text}`);
      }
    }
  } catch (e) {
    console.log(`  ❌ 읽기 실패: ${e.message}`);
  }
}

console.log(`=== 마감브리핑 데이터 읽기 (${TODAY}) ===`);
await readCallout('현빈02', CALLOUTS['현빈02']);
await readCallout('지혜', CALLOUTS['지혜']);
await readJihyeComment();
console.log('\n=== 읽기 완료 ===');
