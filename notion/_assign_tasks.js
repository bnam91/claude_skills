import { getChildren, appendBlocks } from './notion_api.js';

const TODAY = '3.3';

const CALLOUTS = {
  '현빈02': '317111a5778880629606f53db233f88d',
  '지혜':   '317111a577888034aca6dba69a9c3500'
};

function getText(block) {
  return block[block.type]?.rich_text?.map(t => t.plain_text).join('') || '';
}

function todo(title, detailChildren) {
  return {
    object: 'block', type: 'to_do',
    to_do: {
      rich_text: [{ type: 'text', text: { content: title }, annotations: { bold: true } }],
      checked: false,
      children: [{
        object: 'block', type: 'toggle',
        toggle: {
          rich_text: [{ type: 'text', text: { content: '내용:' } }],
          children: detailChildren
        }
      }]
    }
  };
}

function bullet(text) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function note(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

async function getOrCreateDateToggle(calloutId, name) {
  const blocks = await getChildren(calloutId);
  const existing = blocks.find(b => b.type === 'toggle' && getText(b) === TODAY);
  if (existing) {
    console.log(`  📅 [${name}] "${TODAY}" 토글 발견`);
    return existing.id;
  }
  const res = await appendBlocks(calloutId, [{
    object: 'block', type: 'toggle',
    toggle: { rich_text: [{ type: 'text', text: { content: TODAY } }] }
  }]);
  console.log(`  📅 [${name}] "${TODAY}" 토글 생성`);
  return res.results[0].id;
}

// ── 현빈02 배정 ──────────────────────────────────────────
const h2ToggleId = await getOrCreateDateToggle(CALLOUTS['현빈02'], '현빈02');

const h2Tasks = [
  todo('1688 재가입', [
    bullet('아웃풋 : 1688 계정 로그인 캡쳐'),
    note('📍 동결된 계정 확인 후 새 계정으로 재가입 시도 부탁드립니다. 로그인 성공 시 캡쳐해 주세요.'),
  ]),
  todo('통신판매업 신고', [
    bullet('아웃풋 : 통신판매업 신고증 발급 캡쳐'),
    note('📍 전화 문의 후 신고 진행 부탁드립니다. 신고증 발급 완료 시 캡쳐해 주세요.'),
  ]),
  todo('본품 주문 10종 — 막힘 해소', [
    bullet('아웃풋 : 주문 결제 캡쳐'),
    note('📍 막힌 원인 파악 후 해소해 주세요. 주문 완료 시 결제 캡쳐 전달 부탁드립니다.'),
  ]),
  todo('타오바오 가입 최종 확인', [
    bullet('아웃풋 : 타오바오 계정 로그인 캡쳐'),
    note('📍 신규번호 가입 + 아이폰 미러링 세팅 확인 후 로그인 캡쳐 부탁드립니다.'),
  ]),
  todo('원가 정리 완료', [
    bullet('아웃풋 : 원가 정리 시트'),
    note('📍 1688 트래커 시트 마이그레이션 포함하여 완료 부탁드립니다.'),
  ]),
];

await appendBlocks(h2ToggleId, h2Tasks);
console.log(`  ✅ [현빈02] ${h2Tasks.length}건 업무 추가`);

// ── 지혜 배정 ────────────────────────────────────────────
const jiToggleId = await getOrCreateDateToggle(CALLOUTS['지혜'], '지혜');

const jiTasks = [
  todo('✨ 1-2차 15종 소싱 리스트 찾기', [
    bullet('아웃풋 : 15종 소싱 리스트 (시트)'),
    note('📍 런칭 핵심 업무입니다. 2차 15종 찾아서 시트에 정리 부탁드립니다.'),
  ]),
  todo('✨ 쑤자오, 타오003 업체 샘플 주문', [
    bullet('아웃풋 : 주문 결제 캡쳐 (업체별 각 1건)'),
    note('📍 두 업체 샘플 주문 진행 부탁드립니다. 결제 완료 시 캡쳐해 주세요.'),
  ]),
  todo('1차 샘플 도착 시 즉시 검수', [
    bullet('아웃풋 : 검수 완료 사진'),
    note('📍 샘플 도착 즉시 검수 후 사진 전달 부탁드립니다.'),
  ]),
  todo('ccmm 제품 수령 확인', [
    bullet('아웃풋 : ccmm 제품 수령 사진'),
    note('📍 수령 확인 후 사진 전달 부탁드립니다.'),
  ]),
  todo('브랜드별 캐리어 매칭 시트 v1 + 당근 캐리어 세팅', [
    bullet('아웃풋 : 캐리어 브랜드 매칭 시트 v1 / 당근 세팅 완료 캡쳐'),
    note('📍 브랜드 매칭 시트 v1 완성 + 당근 캐리어 세팅 마무리 부탁드립니다.'),
  ]),
  todo('홈택스 등록', [
    bullet('아웃풋 : 홈택스 등록 완료 캡쳐'),
    note('📍 계산서 메일 가입 + 사업자 카드 등록 포함하여 진행 부탁드립니다.'),
  ]),
];

await appendBlocks(jiToggleId, jiTasks);
console.log(`  ✅ [지혜] ${jiTasks.length}건 업무 추가`);

console.log('\n완료! 임시 콜아웃 확인해주세요.');
