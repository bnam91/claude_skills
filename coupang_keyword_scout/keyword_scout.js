/**
 * coupang-keyword-scout
 * 쿠팡 판매자 페이지에서 베스트셀링 상품을 크롤링하여
 * 재판매 가능한 키워드를 추출하는 스크립트
 *
 * 사용법:
 *   node keyword_scout.js <spreadsheetId> <tabName> [rowFilter]
 *
 * 예시:
 *   node keyword_scout.js 1WdWdRvvfm4C... "2.(DB)지표셀러"
 *   node keyword_scout.js 1WdWdRvvfm4C... "2.(DB)지표셀러" 8,9,17
 *
 * 시트 구조:
 *   A=추가날짜, B=판매자ID, C=판매자명, D=링크,
 *   I=수지님제외(체크박스), M=채널확인유무(체크박스), L=키워드 출력열
 *
 * 조건: I열=TRUE AND M열=TRUE 인 행만 처리
 */

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

// ──────────────────────────────────────────
// 제외 키워드 (식품, 건기식, 의류, 뷰티/화장품, 가전, 부피큰침구, KC필요)
// ──────────────────────────────────────────
const EXCLUDE_KEYWORDS = [
  // 식품/음료
  '식품','음식','음료','과자','간식','쌀','라면','면류','김치','된장','고추장','소스','오일','식용유',
  '커피','차','티','주스','생수','삼다수','탐사수','에비앙','화장지','티슈','물티슈','롤화장지',
  // 건강기능식품
  '비타민','유산균','오메가','콜라겐','단백질','프로틴','보충제','홍삼','인삼','건강식품','영양제',
  // 의류 (패션잡화 제외: 모자, 넥워머, 장갑, 슬리퍼 등은 허용)
  '티셔츠','바지','원피스','자켓','코트','후드티','후드집업','맨투맨','청바지','레깅스','속옷','양말','언더웨어',
  '브라','팬티','스타킹','니트','스웨터','점퍼','패딩','조끼','카디건',
  // 뷰티/화장품류 (샴푸, 탈취제 포함 – 화장품제조업 허가 필요)
  '샴푸','린스','트리트먼트','바디워시','클렌징','폼클렌저','스킨','로션','크림','에센스','세럼',
  '앰플','마스크팩','선크림','파운데이션','립스틱','아이섀도','향수','탈취제','미스트','데오도란트',
  '헤어왁스','헤어젤','퍼퓸','영양크림','수분크림','토너','비비크림',
  // 가전
  '건조기','세탁기','에어컨','냉장고','청소기','공기청정기','텔레비전','전자레인지','오븐',
  '식기세척기','전기밥솥','밥솥','커피머신','블렌더','믹서','다리미','제습기','가습기',
  '선풍기','히터','전기장판','에어프라이어','전기포트','로봇청소기','안마기','안마의자',
  // 부피 큰 침구류
  '이불','차렵이불','침대패드','매트리스','베개솜','베게솜','침낭','토퍼',
  // 큰 가구
  '소파','침대','장롱','옷장','붙박이장','신발장',
  // KC 인증 필요 전기/가스
  '버너','가스레인지','인덕션','충전기','어댑터','멀티탭','전구','조명',
  // 차량용품 (안전인증)
  '차량용','대쉬보드','자동차',
];

function isExcluded(title) {
  const t = title.toLowerCase();
  for (const kw of EXCLUDE_KEYWORDS) {
    if (t.includes(kw.toLowerCase())) return { excluded: true, reason: kw };
  }
  return { excluded: false };
}

// URL에서 urlName 추출 (shop.coupang.com/XXX)
function extractUrlName(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    return seg[0] || null;
  } catch { return null; }
}

// 키워드 정제
function cleanKeyword(title) {
  return title
    .split(',')[0]
    .replace(/\b\d+[mlMLkgKGcm개P세단]+\b/g, '')
    .replace(/\s*x\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

// 상품 목록에서 키워드 추출 (최대 3개)
function extractKeywords(products, verbose = true) {
  const seen = new Set();
  const unique = products.filter(p => {
    const key = (p.imageAndTitleArea?.title || '').slice(0, 25);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => (b.reviewArea?.ratingCount || 0) - (a.reviewArea?.ratingCount || 0));

  const keywords = [];
  for (const p of unique) {
    const title = p.imageAndTitleArea?.title || '';
    const reviews = p.reviewArea?.ratingCount || 0;
    const { excluded, reason } = isExcluded(title);
    if (verbose) {
      console.log(`    [리뷰:${String(reviews).padStart(5)}] ${excluded ? `❌ (${reason})` : '✅'} ${title.slice(0, 60)}`);
    }
    if (!excluded && reviews >= 100) {
      const kw = cleanKeyword(title);
      if (kw && !keywords.find(k => k.slice(0, 10) === kw.slice(0, 10))) {
        keywords.push(kw);
      }
    }
    if (keywords.length >= 3) break;
  }
  return keywords;
}

// 판매자 페이지 방문 + listing API 인터셉트
async function fetchProducts(page, urlName) {
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

  // 플랫폼 전체 추천상품 감지 (리뷰 50만↑ = 쿠팡 자체 상품)
  const isPlatform = products.some(p => (p.reviewArea?.ratingCount || 0) > 500000);

  if (isPlatform || products.length === 0) {
    // storeInfo API로 storeId/vendorId 조회 후 직접 호출
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

    // 여전히 플랫폼 상품이면 빈 배열 반환
    if (products.some(p => (p.reviewArea?.ratingCount || 0) > 500000)) return [];
  }

  return products;
}

// Google Sheets에서 데이터 읽기 (sheet_manager.py 사용)
function readSheet(spreadsheetId, tabName) {
  const cmd = `python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py read ${spreadsheetId} --tab "${tabName}" 2>/dev/null`;
  const output = execSync(cmd, { encoding: 'utf8', shell: '/bin/zsh' });
  const rows = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^\s*(\d+):\s*(\[.+\])\s*$/);
    if (!m) continue;
    try { rows.push({ lineNum: parseInt(m[1]), data: JSON.parse(m[2].replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false')) }); }
    catch { /* skip */ }
  }
  return rows;
}

// Google Sheets L열 업데이트 (sheet_manager.py 사용)
function writeSheet(spreadsheetId, tabName, row, value) {
  const escaped = value.replace(/'/g, "\\'");
  const cmd = `python3 ~/Documents/claude_skills/sheet_manager/sheet_manager.py write ${spreadsheetId} --tab "${tabName}" --range L${row} --values '[["${escaped}"]]' 2>/dev/null`;
  execSync(cmd, { encoding: 'utf8', shell: '/bin/zsh' });
}

// ──────────────────────────────────────────
// 메인
// ──────────────────────────────────────────
(async () => {
  const spreadsheetId = process.argv[2];
  const tabName = process.argv[3] || '2.(DB)지표셀러';
  const rowFilter = process.argv[4] ? process.argv[4].split(',').map(Number) : null;

  if (!spreadsheetId) {
    console.error('사용법: node keyword_scout.js <spreadsheetId> [tabName] [rows]');
    process.exit(1);
  }

  // ── Chrome CDP 연결
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
  const pages = await browser.pages();
  const page = pages[pages.length - 1];

  // 쿠팡 세션 준비
  await page.goto('https://shop.coupang.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // ── 시트 읽기
  console.log(`\n📋 시트 읽는 중: ${tabName}`);
  const rows = readSheet(spreadsheetId, tabName);

  // I열(index 8)=TRUE, M열(index 12)=TRUE 필터
  const targets = rows.filter(r => {
    if (r.lineNum === 1) return false; // 헤더 제외
    const d = r.data;
    const iCol = (d[8] + '').toUpperCase() === 'TRUE';
    const mCol = (d[12] + '').toUpperCase() === 'TRUE';
    if (!iCol || !mCol) return false;
    if (rowFilter && !rowFilter.includes(r.lineNum)) return false;
    return true;
  });

  console.log(`✅ 처리 대상: ${targets.length}개 행\n`);

  const results = [];

  for (const { lineNum, data } of targets) {
    const sellerName = data[2] || '';
    const link = data[3] || '';
    const urlName = extractUrlName(link);

    console.log(`${'─'.repeat(60)}`);
    console.log(`Row ${lineNum}: ${sellerName} (${urlName})`);

    if (!urlName) {
      console.log('  ⚠️  URL 파싱 실패, 건너뜀');
      results.push({ row: lineNum, seller: sellerName, keywords: '' });
      continue;
    }

    try {
      const products = await fetchProducts(page, urlName);
      console.log(`  상품수: ${products.length}`);

      const keywords = extractKeywords(products);
      const keywordStr = keywords.join(', ');
      console.log(`  → 키워드: ${keywordStr || '(없음)'}`);

      writeSheet(spreadsheetId, tabName, lineNum, keywordStr);
      console.log(`  ✅ L${lineNum} 저장 완료`);

      results.push({ row: lineNum, seller: sellerName, keywords: keywordStr });
    } catch (e) {
      console.error(`  ❌ 오류: ${e.message}`);
      results.push({ row: lineNum, seller: sellerName, keywords: '오류' });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n\n══════════════════════════════════════');
  console.log('최종 결과 요약');
  console.log('══════════════════════════════════════');
  results.forEach(r => console.log(`Row ${r.row} [${r.seller}]: ${r.keywords || '(없음)'}`));

  await browser.disconnect();
})().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
