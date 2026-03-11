import { createPage } from '/Users/a1/Documents/claude_skills/notion/notion_api.js';

const DB_ID = '31c111a5-7788-81a8-9626-ceef93de198b';

async function add(task, parent = null, priority = '-', state = '진행대기') {
  const props = {
    '업무': { title: [{ type: 'text', text: { content: task } }] },
    '1_우선순위': { select: { name: priority } },
    '4_상태': { select: { name: state } },
  };
  if (parent) props['상위 항목'] = { relation: [{ id: parent }] };
  const res = await createPage({ database_id: DB_ID }, props);
  process.stdout.write('.');
  return res.id;
}

// 역순 삽입 헬퍼 (배열을 reverse해서 순서대로 add)
async function addAll(items, parentId) {
  const ids = {};
  for (const [key, task] of [...items].reverse()) {
    ids[key] = await add(task, parentId);
  }
  return ids;
}

console.log('🏗  역순으로 구조 생성 중...\n');

// ── GOAL (맨 마지막에 넣어야 노션에서 맨 아래 표시)
// ── 1차 상품 (먼저 넣으면 맨 아래)
// 원하는 순서: GOAL 맨 아래, 1차 상품 맨 위
// → GOAL 먼저, 1차 상품 나중에

const GOAL = await add('소싱루틴을 통한 쿠팡 첫 판매 3월 31일 런칭', null, '🎖 GOAL', '-');
const 상품1 = await add('🛍 1차 상품', null, '1', '-');

// 1차 상품 하위: 마케팅→등록→입고→런칭준비→소싱→시장발굴 순으로 입력
// (역순 입력 → 노션에서는 시장발굴이 맨 위)

// 6. 마케팅 (먼저 입력)
const 마케팅 = await add('✅ 마케팅', 상품1);
  await add('카페 핫딜 게시', 마케팅);
  await add('쿠팡광고 집행', 마케팅);
  await add('노마진 마케팅 세팅', 마케팅);

// 5. 상품 등록
const 등록 = await add('✅ 상품 등록', 상품1);
  await add('리뷰체험단 세팅', 등록);
  await add('쿠팡 상품 등록', 등록);

// 4. 상품 입고
const 입고 = await add('✅ 상품 입고', 상품1);
  await add('국내 3PL 창고 입고', 입고);
  await add('쿠팡 로켓그로스 입고 (바코드 출력 → 중국 전달 → 배대지)', 입고);

// 3. 상품 런칭 준비
const 런칭준비 = await add('✅ 상품 런칭 준비 (상세페이지)', 상품1);
  await add('상품 썸네일 제작', 런칭준비);
  await add('판매페이지 제작', 런칭준비);
  await add('상품 기획 (포지셔닝 전략 반영)', 런칭준비);

// 2. 상품 소싱
const 소싱 = await add('✅ 상품 소싱', 상품1);
  await add('본품 발주 확정 (수량·단가·납기 협의)', 소싱);
  await add('샘플 검수 (품질·포장·리드타임 확인)', 소싱);
  await add('샘플 소싱 (배대지 경유)', 소싱);
  await add('1688 거래처 찾기', 소싱);
  await add('경쟁사 상품 주문 (실제 사용 경험)', 소싱);

// 1. 시장 발굴 및 기획 (마지막에 입력 → 노션에서 맨 위)
const 시장발굴 = await add('✅ 시장 발굴 및 기획', 상품1);

  // Step 3 (먼저)
  const 포지셔닝 = await add('Step 3. 경쟁 포지셔닝 (비벼볼 수 있는가?)', 시장발굴);
    await add('최종 GO 선언 및 타겟 상품 확정', 포지셔닝);
    await add('우리 진입 전략 확정 (① 가격 ② 성능 ③ 디자인 ④ 마케팅)', 포지셔닝);
    await add('탑셀러 n명 점수 배정 (가격/제품/디자인/상세페이지 1~5점)', 포지셔닝);

  // Step 2
  const 매출분석 = await add('Step 2. 시장 검증 (매출·마진 분석)', 시장발굴);
    await add('최종 진입 키워드 선정 (월매출·마진율 기준 GO/NO-GO)', 매출분석);
    await add('마진 계산 (원가 + 쿠팡수수료 10.8% + 배송비 → 마진율)', 매출분석);
    await add('키워드별 탑셀러 3명 판매량 조회 (아이템스카우트)', 매출분석);
    await add('후보 키워드 5개로 컷 (흥미점수 + 탑키워드 순위 기준)', 매출분석);

  // Step 1 (마지막 → 노션에서 맨 위)
  const 키워드발굴 = await add('Step 1. 시장(키워드) 발굴', 시장발굴);
    await add('★키워드 수집 시트 입력 + 흥미점수 배정', 키워드발굴);
    await add('네이버 데이터랩 트렌드 확인 (상승세 검증)', 키워드발굴);
    await add('쿠팡 탑텐 키워드 필터링 (소거법 → 10~20개 선정)', 키워드발굴);
    await add('골드박스 셀러 모니터링 (지표 셀러 동향 파악)', 키워드발굴);

console.log('\n\n🎉 완료!');
