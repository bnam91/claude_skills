#!/usr/bin/env node
/**
 * dday_count.js - Notion 페이지 D-day 제목 최신화
 *
 * 사용법: node dday_count.js
 *
 * D-day: 3월 20일. 실행 시마다 제목의 D-XX를 오늘 기준으로 업데이트.
 * 예: "런칭 (D-22)" → "런칭 (D-18)"
 */

import { getPage, updatePageTitle } from './notion_api.js';

const NOTION_URL = 'https://www.notion.so/D-22-2f6111a5778880c0acdbc65c60238999';
const D_DAY = { month: 3, day: 20 };  // 3월 20일

function extractPageId(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[a-f0-9]{32}$/i.test(s)) return s;
  const m = s.match(/([a-f0-9]{32})(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

function getTitleProp(page) {
  const props = page.properties || {};
  for (const [key, val] of Object.entries(props)) {
    if (val?.type === 'title' && Array.isArray(val.title)) {
      const text = val.title.map(t => t.plain_text).join('') || '';
      return { key, text };
    }
  }
  return null;
}

function calcDday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(today.getFullYear(), D_DAY.month - 1, D_DAY.day);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (24 * 60 * 60 * 1000));
}

function updateDdayInTitle(title) {
  const dday = calcDday();
  const dStr = dday >= 0 ? `D-${dday}` : `D+${Math.abs(dday)}`;
  return title.replace(/\(D[+-]?\d+\)/g, `(${dStr})`);
}

const pageId = extractPageId(NOTION_URL);
if (!pageId) {
  console.error('오류: URL에서 페이지 ID를 추출할 수 없습니다.');
  process.exit(1);
}

try {
  const page = await getPage(pageId);
  const prop = getTitleProp(page);
  if (!prop) {
    console.error('오류: 제목 속성을 찾을 수 없습니다.');
    process.exit(1);
  }

  const newTitle = updateDdayInTitle(prop.text);
  if (newTitle !== prop.text) {
    await updatePageTitle(pageId, prop.key, newTitle);
  }
  console.log(newTitle);
} catch (e) {
  console.error('오류:', e.message);
  process.exit(1);
}
