import { queryDatabase, updatePageProperties } from './notion_api.js';

const DB_ID = '2f6111a5778881ceaf1be4e73f6644ea';

const result = await queryDatabase(DB_ID, { page_size: 100 });
const pages = result.results;

// TASK 텍스트로 페이지 찾기
function findPage(keyword) {
  return pages.find(p => {
    const title = p.properties['TASK']?.title?.map(t => t.plain_text).join('') || '';
    return title.includes(keyword);
  });
}

const targets = [
  {
    keyword: '중국 업체 및 배대지에서 분류 가능한지',
    output: '분류 가능 여부 확인 + 추가금 금액 정리 문서'
  },
  {
    keyword: '구성품 및 패키지, CBM 확인',
    output: '구성품·CBM·나사드라이버 포함 여부 확인 정리 문서'
  },
  {
    keyword: '단가 협의',
    output: '단가 협의 완료 시트'
  }
];

for (const t of targets) {
  const page = findPage(t.keyword);
  if (!page) { console.log(`❌ 못 찾음: ${t.keyword}`); continue; }

  await updatePageProperties(page.id, {
    '아웃풋': { rich_text: [{ type: 'text', text: { content: t.output } }] }
  });
  console.log(`✅ 아웃풋 입력: "${t.keyword.slice(0, 25)}..." → ${t.output}`);
}

console.log('\n완료!');
