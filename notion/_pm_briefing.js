import { getChildren, deleteBlock, appendBlocks } from './notion_api.js';

const BRIEFING_BLOCK = '317111a57788806d8934ed70df847097';

const existing = await getChildren(BRIEFING_BLOCK);
for (const b of existing) await deleteBlock(b.id);
console.log(`🗑️  기존 블록 ${existing.length}개 삭제`);

const blocks = [
  { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📋 3.3 (화) PM:GG 브리핑 — D-17' } }] } },

  // 현황 스냅샷
  { object: 'block', type: 'callout', callout: {
    icon: { type: 'emoji', emoji: '📊' }, color: 'gray_background',
    rich_text: [{ type: 'text', text: { content: '이번 주 (~ 3.6) 현황' }, annotations: { bold: true } }],
    children: [
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '✅ 완료  ' } }, { type: 'text', text: { content: '통장/카드 구조, 경쟁사 제품 확보, 피그마 출력-1, 쇼핑몰 개설, 카카오페이 결제' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '🔄 진행 중  ' } }, { type: 'text', text: { content: '타오바오 가입, 원가 정리, 브랜드 세팅, 상품소싱(30종), 본품 세팅, 옵션카드 세팅' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '🚨 업무막힘  ' }, annotations: { bold: true, color: 'red' } }, { type: 'text', text: { content: '1688 가입 (동결), 통신판매업 신고, 본품 주문 10종, CPO 디자이너 미확보' } }] } },
    ]
  }},

  // 현빈02
  { object: 'block', type: 'toggle', toggle: {
    rich_text: [{ type: 'text', text: { content: '현빈02 배정 ' }, annotations: { bold: true } }, { type: 'text', text: { content: '(5건)' }, annotations: { color: 'gray' } }],
    children: [
      { object: 'block', type: 'callout', callout: {
        icon: { type: 'emoji', emoji: '🚨' }, color: 'red_background',
        rich_text: [{ type: 'text', text: { content: '긴급 — 오늘 중 해소' }, annotations: { bold: true } }],
        children: [
          { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[COO] 1688 재가입 — 새 계정으로 시도' } }] } },
          { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[COO] 통신판매업 신고 — 전화 문의 후 즉시 진행' } }] } },
          { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[CSCO] 본품 주문 10종 막힌 원인 파악 → 해소' } }] } },
        ]
      }},
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[COO] 타오바오 가입 최종 완료 확인' }, annotations: { color: 'gray' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[CFO] 원가 정리 완료' } }] } },
    ]
  }},

  // 지혜
  { object: 'block', type: 'toggle', toggle: {
    rich_text: [{ type: 'text', text: { content: '지혜 배정 ' }, annotations: { bold: true } }, { type: 'text', text: { content: '(6건)' }, annotations: { color: 'gray' } }],
    children: [
      { object: 'block', type: 'callout', callout: {
        icon: { type: 'emoji', emoji: '🔑' }, color: 'orange_background',
        rich_text: [{ type: 'text', text: { content: '핵심 — 런칭 소싱 직결' }, annotations: { bold: true } }],
        children: [
          { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[CSCO] 1-2차 15종 찾기' }, annotations: { bold: true } }, { type: 'text', text: { content: ' — 소싱 미완 = 런칭 불가. 최우선.' }, annotations: { color: 'gray' } }] } },
          { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[CSCO] 쑤자오, 타오003 업체 샘플 주문' }, annotations: { bold: true } }, { type: 'text', text: { content: ' — 주문 결제 캡쳐까지.' }, annotations: { color: 'gray' } }] } },
        ]
      }},
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[CSCO] 1차 샘플 도착 시 즉시 검수 → 완료 사진 전달' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[CSCO] ccmm 제품 수령 확인 → 수령 사진' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[CPO] 브랜드별 캐리어 매칭 시트 v1 + 당근 캐리어 세팅 마무리' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '[COO] 홈택스 등록 — 계산서 메일 가입 + 사업자 카드 등록' } }] } },
    ]
  }},

  // PM 코멘트
  { object: 'block', type: 'callout', callout: {
    icon: { type: 'emoji', emoji: '💬' }, color: 'blue_background',
    rich_text: [{ type: 'text', text: { content: 'PM 코멘트' }, annotations: { bold: true } }],
    children: [
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '최대 리스크: 소싱 미완 (15종 + 샘플 주문) + CPO 상세페이지/디자이너 미확보. 물건 없으면 런칭 없음.' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: 'CTO (경쟁사 체크, CS봇)는 MVP 외 기능 — 소싱/CPO 해결 후 여유 되면 진행.' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '지혜: 소싱 2건(15종 + 샘플 주문) 집중. 홈택스는 틈새 시간에 처리.' } }] } },
    ]
  }},
];

await appendBlocks(BRIEFING_BLOCK, blocks);
console.log('✅ PM 브리핑 재작성 완료');
