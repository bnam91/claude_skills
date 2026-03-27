import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const config = JSON.parse(readFileSync(join(homedir(), 'Documents/claude_skills/notion_manager/config.json'), 'utf8'));
const HEADERS = {
  'Authorization': `Bearer ${config.api_key}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

async function req(method, endpoint, body = null) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method, headers: HEADERS,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

const PAGE_ID = '32e111a5-7788-800a-80c7-f299bfbae51e';

const db = await req('POST', '/databases', {
  parent: { type: 'page_id', page_id: PAGE_ID },
  title: [{ type: 'text', text: { content: '크몽 등록 서비스 목록' } }],
  properties: {
    '서비스명': { title: {} },
    '상태': { select: { options: [
      { name: '🔵 준비중', color: 'blue' },
      { name: '🟡 패키징필요', color: 'yellow' },
      { name: '🟠 검토중', color: 'orange' },
      { name: '🟢 등록완료', color: 'green' },
    ]}},
    '카테고리': { select: { options: [
      { name: '크롤링', color: 'purple' },
      { name: '판매량분석', color: 'blue' },
      { name: '마케팅자동화', color: 'pink' },
      { name: 'DB서비스', color: 'orange' },
    ]}},
    '개발자 안내사항': { rich_text: {} },
    '등록담당자 메모': { rich_text: {} },
  }
});
console.log('✅ DB 생성:', db.id);

const items = [
  { name: '쿠팡 판매량 구독 서비스', status: '🟢 등록완료', cat: '판매량분석' },
  { name: '인스타 URL 크롤링 프로그램', status: '🔵 준비중', cat: '크롤링' },
  { name: '네이버 판매량 구독서비스', status: '🔵 준비중', cat: '판매량분석' },
  { name: '쿠팡 리뷰 크롤링 프로그램', status: '🔵 준비중', cat: '크롤링' },
  { name: '유튜브 키워드 크롤링 프로그램', status: '🔵 준비중', cat: '크롤링' },
  { name: '인스타 해시태그 크롤링 프로그램', status: '🔵 준비중', cat: '크롤링' },
  { name: '인스타 공동구매 계정 DB', status: '🔵 준비중', cat: 'DB서비스' },
  { name: '네이버 메일 대량 발송기', status: '🔵 준비중', cat: '마케팅자동화' },
  { name: '카톡 자동 발송기', status: '🔵 준비중', cat: '마케팅자동화' },
  { name: '지메일 / 구글드라이브 / 구글폼 / 노션 자동화', status: '🔵 준비중', cat: '마케팅자동화' },
];

for (const item of items) {
  await req('POST', '/pages', {
    parent: { database_id: db.id },
    properties: {
      '서비스명': { title: [{ text: { content: item.name } }] },
      '상태': { select: { name: item.status } },
      '카테고리': { select: { name: item.cat } },
    }
  });
  console.log('  추가:', item.name);
}
console.log('\n✅ 완료! URL:', db.url);
