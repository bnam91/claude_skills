/**
 * category_filter.js
 * 최신 날짜 행(A열)에서 I=TRUE + J열 비어있는 판매자를 크롤링하여
 * 제외 카테고리(식품, 건강기능식품, 의류, 뷰티, 가전)에 해당하면 I=FALSE 처리
 *
 * 사용법:
 *   node category_filter.js <spreadsheetId> [tabName]
 *
 * 예시:
 *   NODE_PATH=./node_modules node category_filter.js 1WdWdRvvfm4C... "2.(DB)지표셀러"
 */

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

// ──────────────────────────────────────────
// 카테고리별 키워드 (제외 대상)
// ──────────────────────────────────────────
const CATEGORY_KEYWORDS = {
  '식품': [
    '식품','음식','음료','과자','간식','쌀','라면','면류','김치','된장','고추장','소스','오일',
    '식용유','커피','차','주스','생수','삼다수','분유','이유식','반찬','냉동식품','육포',
    '과일','채소','닭가슴살','참치','햄','소시지','통조림',
  ],
  '건강기능식품': [
    '비타민','유산균','오메가','콜라겐','단백질','프로틴','보충제','홍삼','인삼','건강식품',
    '영양제','다이어트','헬스','체중관리','면역','슬리밍',
  ],
  '의류': [
    '티셔츠','바지','원피스','자켓','코트','후드티','후드집업','맨투맨','청바지','레깅스',
    '속옷','양말','언더웨어','브라','팬티','스타킹','니트','스웨터','점퍼','패딩','조끼',
    '카디건','블라우스','셔츠','반바지','치마','드레스',
  ],
  '뷰티': [
    '샴푸','린스','트리트먼트','바디워시','클렌징','폼클렌저','스킨','로션','크림','에센스',
    '세럼','앰플','마스크팩','선크림','파운데이션','립스틱','아이섀도','향수','탈취제',
    '미스트','데오도란트','헤어왁스','헤어젤','퍼퓸','영양크림','수분크림','토너','비비크림',
    '화장품','스킨케어','헤어케어','바디케어',
  ],
  '가전': [
    '건조기','세탁기','에어컨','냉장고','청소기','공기청정기','텔레비전','TV','전자레인지',
    '오븐','식기세척기','전기밥솥','밥솥','커피머신','블렌더','믹서','다리미','제습기',
    '가습기','선풍기','히터','전기장판','에어프라이어','전기포트','로봇청소기','안마기',
    '안마의자','전기면도기','드라이기','고데기','헤어드라이어',
  ],
};

// 제품 타이틀 배열 → 주요 카테고리 판별 (30% 이상이면 해당 카테고리로 분류)
function detectCategory(titles) {
  if (!titles || titles.length === 0) return null;

  const counts = {};
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    counts[cat] = 0;
    for (const title of titles) {
      const t = title.toLowerCase();
      for (const kw of keywords) {
        if (t.includes(kw.toLowerCase())) {
          counts[cat]++;
          break;
        }
      }
    }
  }

  const total = titles.length;
  let dominant = null;
  let maxCount = 0;

  for (const [cat, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = cat;
    }
  }

  // 30% 이상이면 해당 카테고리
  if (maxCount / total >= 0.3) return dominant;
  return null;
}

// URL에서 urlName 추출
function extractUrlName(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    return seg[0] || null;
  } catch { return null; }
}

// 판매자 페이지 방문 + 상품 목록 가져오기 (keyword_scout.js와 동일)
async function fetchProductTitles(page, urlName) {
  let listingData = null;
  const listener = async (res) => {
    if (res.url().includes('/api/v1/listing')) {
      try { listingData = await res.json(); } catch (e) {}
    }
  };
  page.on('response', listener);
  await page.goto(`https://shop.coupang.com/${urlName}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  page.off('response', listener);

  let products = listingData?.data?.products || [];

  const isPlatform = products.some(p => (p.reviewArea?.ratingCount || 0) > 500000);

  if (isPlatform || products.length === 0) {
    const storeInfo = await page.evaluate(async (u) => {
      const r = await fetch(`https://shop.coupang.com/api/v1/store/getStoreInfo?urlName=${u}`);
      return r.json();
    }, urlName).catch(() => null);

    if (!storeInfo?.id) return [];

    const res = await page.evaluate(async (storeId, vendorId) => {
      const r = await fetch('https://shop.coupang.com/api/v1/listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId, vendorId,
          source: 'direct',
          enableAdultItemDisplay: true,
          nextPageKey: 0,
          filter: 'SORT_KEY:BEST_SELLING'
        })
      });
      return r.json();
    }, storeInfo.id, storeInfo.vendorId).catch(() => ({ data: { products: [] } }));

    products = res.data?.products || [];

    if (products.some(p => (p.reviewArea?.ratingCount || 0) > 500000)) return [];
  }

  return products.map(p => p.imageAndTitleArea?.title || p.productName || '').filter(Boolean);
}

// 시트 읽기
function readSheet(spreadsheetId, tabName) {
  const cmd = `python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py read ${spreadsheetId} --tab "${tabName}" 2>/dev/null`;
  const output = execSync(cmd, { encoding: 'utf8', shell: '/bin/zsh' });
  const rows = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^\s*(\d+):\s*(\[.+\])\s*$/);
    if (!m) continue;
    try {
      rows.push({
        lineNum: parseInt(m[1]),
        data: JSON.parse(m[2].replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false'))
      });
    } catch { /* skip */ }
  }
  return rows;
}

// E열(gb고유ID)로 실제 Google Sheets 행 번호 찾기
function findRowNumByGbId(spreadsheetId, tabName, gbId) {
  const cmd = `python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py read ${spreadsheetId} --tab "${tabName}" --range "E:E" 2>/dev/null`;
  const output = execSync(cmd, { encoding: 'utf8', shell: '/bin/zsh' });
  for (const line of output.split('\n')) {
    const m = line.match(/^\s*(\d+):\s*\['(.+?)'\]/);
    if (m && m[2].trim() === gbId) return parseInt(m[1]);
  }
  return null;
}

// 셀 업데이트 (gbId로 행 번호 확인 후 쓰기)
function writeCell(spreadsheetId, tabName, col, gbId, value) {
  const rowNum = findRowNumByGbId(spreadsheetId, tabName, gbId);
  if (!rowNum) { console.log(`  ⚠️  gb ID [${gbId}] 행 찾기 실패, 스킵`); return; }
  const escaped = String(value).replace(/'/g, "\\'").replace(/"/g, '\\"');
  const cmd = `python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py write ${spreadsheetId} --tab "${tabName}" --range ${col}${rowNum} --values '[["${escaped}"]]' 2>/dev/null`;
  execSync(cmd, { encoding: 'utf8', shell: '/bin/zsh' });
  console.log(`  → ${col}${rowNum} 업데이트 완료`);
}

// ──────────────────────────────────────────
// 메인
// ──────────────────────────────────────────
(async () => {
  const spreadsheetId = process.argv[2];
  const tabName = process.argv[3] || '2.(DB)지표셀러';

  if (!spreadsheetId) {
    console.error('사용법: node category_filter.js <spreadsheetId> [tabName]');
    process.exit(1);
  }

  // 시트 읽기
  console.log(`📋 시트 읽는 중: ${tabName}`);
  const rows = readSheet(spreadsheetId, tabName);
  if (rows.length === 0) { console.error('❌ 시트 읽기 실패'); process.exit(1); }

  // A열 최신 날짜 찾기 (헤더 row 1 제외)
  const dates = rows
    .filter(r => r.lineNum > 1 && r.data[0] && r.data[0] !== '추가날짜')
    .map(r => r.data[0]);
  const latestDate = dates.sort().reverse()[0];
  console.log(`📅 최신 날짜: ${latestDate}`);

  // 대상 행 필터: A열=최신날짜 + I열=TRUE + J열 비어있음
  const targets = rows.filter(r => {
    const d = r.data;
    const aCol = d[0];
    const iCol = (d[8] + '').toUpperCase() === 'TRUE';
    const jCol = (d[9] + '').trim();
    return aCol === latestDate && iCol && !jCol;
  });

  console.log(`✅ 처리 대상: ${targets.length}개 행`);
  if (targets.length === 0) { console.log('처리할 행이 없습니다.'); process.exit(0); }

  // Chrome CDP 연결
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
  const pages = await browser.pages();
  const page = pages[pages.length - 1];

  // 초기 진입 (쿠키 세팅)
  await page.goto('https://shop.coupang.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

  for (const row of targets) {
    const d = row.data;
    const gbId = d[4] || '';  // E열 고유ID
    const sellerName = d[2] || d[5] || '(알수없음)';
    const url = d[3] || '';
    const urlName = extractUrlName(url);

    if (!gbId) {
      console.log(`⚠️  [${sellerName}] E열 고유ID 없음 → 스킵`);
      continue;
    }

    if (!urlName) {
      console.log(`⚠️  [${sellerName}] URL 파싱 실패 → K열 메모`);
      writeCell(spreadsheetId, tabName, 'K', gbId, 'URL 파싱 불가 - 수동확인필요');
      continue;
    }

    console.log(`\n🔍 [${gbId}] ${sellerName} (${urlName}) 크롤링 중...`);

    try {
      const titles = await fetchProductTitles(page, urlName);
      console.log(`   상품 ${titles.length}개 수집`);

      if (titles.length === 0) {
        console.log(`   ⚠️  상품 없음 → K열 메모`);
        writeCell(spreadsheetId, tabName, 'K', gbId, '상품 크롤링 실패 - 수동확인필요');
        continue;
      }

      const category = detectCategory(titles);

      if (category) {
        console.log(`   ❌ [${category}] 판매자 → I열 FALSE 처리`);
        writeCell(spreadsheetId, tabName, 'I', gbId, 'FALSE');
        writeCell(spreadsheetId, tabName, 'J', gbId, category);
      } else {
        const sample = titles.slice(0, 3).join(', ').slice(0, 60);
        console.log(`   ✅ 제외 카테고리 아님 (샘플: ${sample})`);
        if (!d[10]) {
          writeCell(spreadsheetId, tabName, 'K', gbId, sample);
        }
      }

    } catch (err) {
      console.log(`   ❌ 에러: ${err.message} → K열 메모`);
      writeCell(spreadsheetId, tabName, 'K', gbId, `크롤링 오류: ${err.message.slice(0, 40)}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.disconnect();
  console.log('\n✅ category_filter 완료');
})();
