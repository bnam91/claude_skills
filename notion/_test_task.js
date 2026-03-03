import { getChildren, appendBlocks } from './notion_api.js';

const TODAY = '3.3';

const CALLOUTS = {
  '테스트01': '317111a5778880629606f53db233f88d',
  '테스트02': '317111a577888039b920f4b2c961ed69'
};

function getText(block) {
  return block[block.type]?.rich_text?.map(t => t.plain_text).join('') || '';
}

async function addDetailTask(calloutId, name, taskName, details) {
  // 1. 오늘 날짜 토글 찾기
  const blocks = await getChildren(calloutId);
  const existing = blocks.find(b => b.type === 'toggle' && getText(b) === TODAY);

  let dateToggleId;
  if (existing) {
    dateToggleId = existing.id;
    console.log(`  📅 [${name}] "${TODAY}" 토글 기존 발견`);
  } else {
    const res = await appendBlocks(calloutId, [{
      object: 'block', type: 'toggle',
      toggle: { rich_text: [{ type: 'text', text: { content: TODAY } }] }
    }]);
    dateToggleId = res.results[0].id;
    console.log(`  📅 [${name}] "${TODAY}" 토글 새로 생성`);
  }

  // 2. 체크박스 + 내용: 토글 추가
  await appendBlocks(dateToggleId, [{
    object: 'block', type: 'to_do',
    to_do: {
      rich_text: [{ type: 'text', text: { content: taskName }, annotations: { bold: true } }],
      checked: false,
      children: [{
        object: 'block', type: 'toggle',
        toggle: {
          rich_text: [{ type: 'text', text: { content: '내용:' } }],
          children: details
        }
      }]
    }
  }]);
  console.log(`  ✅ [${name}] 업무 추가: ${taskName}`);
}

// 테스트01
await addDetailTask(
  CALLOUTS['테스트01'],
  '테스트01',
  '샘플 데이터 정리 요청',
  [
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '인풋 : 공용드라이브 > 테스트폴더 내 파일' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '아웃풋 : 정리 시트 A열에 입력' } }] } },
    { object: 'block', type: 'paragraph',          paragraph:          { rich_text: [{ type: 'text', text: { content: '📍 파일 확인 후 항목별로 분류하여 시트에 입력 부탁드립니다.' } }] } }
  ]
);

// 테스트02
await addDetailTask(
  CALLOUTS['테스트02'],
  '테스트02',
  '상품 이미지 리사이징 요청',
  [
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '인풋 : 원본 이미지 폴더 (공용드라이브 > images)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '아웃풋 : 800x800 리사이징 후 동일 폴더에 저장' } }] } },
    { object: 'block', type: 'paragraph',          paragraph:          { rich_text: [{ type: 'text', text: { content: '📍 파일명은 원본과 동일하게 유지, _800 접미사 추가 부탁드립니다.' } }] } },
    { object: 'block', type: 'paragraph',          paragraph:          { rich_text: [{ type: 'text', text: { content: '👉 총 20개 파일입니다. 완료 후 체크 부탁드려요!' } }] } }
  ]
);

console.log('\n완료!');
