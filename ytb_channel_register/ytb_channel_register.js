/**
 * ytb_channel_register.js
 *
 * raw_data 시트 A열의 YouTube 링크들을 읽고,
 * YouTube API로 채널 정보를 조회한 뒤
 * list 시트에 채널명 / 채널ID / 채널링크(바로가기 하이퍼링크)를 입력합니다.
 *
 * 사용법:
 *   node ytb_channel_register.js <spreadsheet_id>
 *
 * 예:
 *   node ytb_channel_register.js 1gJ1BzMIviX7Sp69OvKsEnVJDVfFkURovMBPAvonV2ys
 */

import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { google } from 'googleapis';
import { pathToFileURL } from 'url';

// 환경변수 로드
const envPath = path.join(os.homedir(), 'Documents', 'github_cloud', 'module_api_key', '.env');
dotenv.config({ path: envPath });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY가 설정되지 않았습니다.');

const AUTH_PATH = path.join(os.homedir(), 'Documents', 'github_cloud', 'module_auth', 'auth.js');
const { getCredentials } = await import(pathToFileURL(AUTH_PATH).href);

const SPREADSHEET_ID = process.argv[2];
if (!SPREADSHEET_ID) {
  console.error('사용법: node ytb_channel_register.js <spreadsheet_id>');
  process.exit(1);
}

// ── YouTube URL → 채널 핸들/ID 파싱 ──────────────────────────────────────────

function parseChannelFromUrl(url) {
  try {
    const u = new URL(url);
    const pathname = decodeURIComponent(u.pathname);

    // @handle 형식 (한글 포함)
    const handleMatch = pathname.match(/^\/@([^/]+)/);
    if (handleMatch) return { type: 'handle', value: decodeURIComponent(handleMatch[1]) };

    // /channel/UCxxx 형식
    const channelMatch = pathname.match(/^\/channel\/(UC[\w-]{22})/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };

    // /user/xxx 형식
    const userMatch = pathname.match(/^\/user\/([\w.-]+)/);
    if (userMatch) return { type: 'handle', value: userMatch[1] };

    // /watch?v=xxx → 영상 ID
    const videoId = u.searchParams.get('v');
    if (videoId) return { type: 'video', value: videoId };

    // /shorts/xxx 형식
    const shortsMatch = pathname.match(/^\/shorts\/([\w-]+)/);
    if (shortsMatch) return { type: 'video', value: shortsMatch[1] };

    return null;
  } catch {
    return null;
  }
}

// ── YouTube API 호출 ──────────────────────────────────────────────────────────

async function fetchChannelByHandle(handle) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('forHandle', handle);
  url.searchParams.set('key', YOUTUBE_API_KEY);
  const res = await fetch(url.toString());
  const data = await res.json();
  return data?.items?.[0] ?? null;
}

async function fetchChannelById(channelId) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', channelId);
  url.searchParams.set('key', YOUTUBE_API_KEY);
  const res = await fetch(url.toString());
  const data = await res.json();
  return data?.items?.[0] ?? null;
}

async function fetchChannelByVideoId(videoId) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', YOUTUBE_API_KEY);
  const res = await fetch(url.toString());
  const data = await res.json();
  const channelId = data?.items?.[0]?.snippet?.channelId;
  if (!channelId) return null;
  return fetchChannelById(channelId);
}

async function getChannelInfo(ytUrl) {
  const parsed = parseChannelFromUrl(ytUrl);
  if (!parsed) return null;

  let item = null;
  if (parsed.type === 'handle') item = await fetchChannelByHandle(parsed.value);
  else if (parsed.type === 'id') item = await fetchChannelById(parsed.value);
  else if (parsed.type === 'video') item = await fetchChannelByVideoId(parsed.value);

  if (!item) return null;

  const channelId = item.id;
  const channelName = item.snippet?.title ?? '';
  const customUrl = item.snippet?.customUrl ?? ''; // @handle 형태

  const thumbnailUrl = item.snippet?.thumbnails?.medium?.url ?? '';

  return { channelId, channelName, customUrl, thumbnailUrl };
}

// ── Google Sheets 처리 ────────────────────────────────────────────────────────

async function getSheets() {
  const auth = await getCredentials();
  return google.sheets({ version: 'v4', auth });
}

async function readRawDataLinks(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'raw_data!A2:A',
  });
  return (res.data.values ?? []).map((r) => r[0]).filter(Boolean);
}

async function getListSheetId(sheets) {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = res.data.sheets.find((s) => s.properties.title === 'list');
  return sheet?.properties?.sheetId ?? null;
}

async function getExistingChannelIds(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'list!C2:C',
  });
  const values = res.data.values ?? [];
  return new Set(values.map((r) => (r[0] ?? '').toLowerCase()));
}

async function appendToListSheet(sheets, sheetId, rows) {
  // 현재 마지막 행 파악
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'list!A:A',
  });
  const nextRow = (res.data.values ?? []).length + 1;

  // batchUpdate로 하이퍼링크 포함 행 추가
  const requests = rows.map((row, i) => ({
    updateCells: {
      rows: [
        {
          values: [
            // A: 프로필 (썸네일 이미지)
            {
              userEnteredValue: {
                formulaValue: row.thumbnailUrl ? `=IMAGE("${row.thumbnailUrl}")` : '',
              },
            },
            // B: 채널명
            { userEnteredValue: { stringValue: row.channelName } },
            // C: 채널ID (@handle)
            { userEnteredValue: { stringValue: row.customUrl || row.channelId } },
            // D: 채널링크 (하이퍼링크 수식)
            {
              userEnteredValue: {
                formulaValue: `=HYPERLINK("https://www.youtube.com/${row.customUrl || row.channelId}","바로가기")`,
              },
            },
          ],
        },
      ],
      fields: 'userEnteredValue',
      start: { sheetId, rowIndex: nextRow - 1 + i, columnIndex: 0 },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const sheets = await getSheets();

  console.log('📋 raw_data 시트에서 링크 읽는 중...');
  const links = await readRawDataLinks(sheets);
  console.log(`  → ${links.length}개 링크 발견\n`);

  const sheetId = await getListSheetId(sheets);
  if (sheetId === null) throw new Error('list 시트를 찾을 수 없습니다.');

  const existingIds = await getExistingChannelIds(sheets);
  console.log(`  → list 시트 기존 채널 ${existingIds.size}개\n`);

  const toAppend = [];
  const skipped = [];
  const failed = [];

  for (const link of links) {
    process.stdout.write(`🔍 ${link.slice(0, 60)}... `);
    try {
      const info = await getChannelInfo(link);
      if (!info) {
        console.log('❌ 채널 정보 없음');
        failed.push(link);
        continue;
      }

      const idKey = (info.customUrl || info.channelId).toLowerCase();
      if (existingIds.has(idKey)) {
        console.log(`⏭ 중복 스킵 (${info.channelName})`);
        skipped.push(info.channelName);
        continue;
      }

      console.log(`✅ ${info.channelName} (${info.customUrl || info.channelId})`);
      toAppend.push(info);
      existingIds.add(idKey);
    } catch (err) {
      console.log(`❌ 오류: ${err.message}`);
      failed.push(link);
    }

    // API 쿼터 보호
    await new Promise((r) => setTimeout(r, 200));
  }

  if (toAppend.length === 0) {
    console.log('\n추가할 새 채널이 없습니다.');
  } else {
    console.log(`\n📝 list 시트에 ${toAppend.length}개 추가 중...`);
    await appendToListSheet(sheets, sheetId, toAppend);
    console.log('✅ 완료!');
  }

  console.log(`\n[결과] 추가 ${toAppend.length}개 / 중복 스킵 ${skipped.length}개 / 실패 ${failed.length}개`);
  if (failed.length) {
    console.log('\n실패 링크:');
    failed.forEach((f) => console.log(`  - ${f}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
