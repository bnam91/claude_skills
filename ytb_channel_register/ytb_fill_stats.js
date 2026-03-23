/**
 * ytb_fill_stats.js
 *
 * list 시트의 채널ID(C열)를 읽어 F~N열을 채웁니다.
 * F열이 이미 채워진 행은 스킵 (신규 행만 처리)
 *
 * F: 구독자
 * G: 업로드영상(쇼츠제외)
 * H: 업로드 영상 수 대비 구독자 수 비율
 * I: 최근 평균 조회수
 * J: 최근 평균보다 인기있었던 영상 (HYPERLINK)
 * K: 조회수 (J 영상)
 * L: 최근 평균보다 인기있었던 영상2 (HYPERLINK)
 * M: 조회수 (L 영상)
 * N: 마지막 영상 업로드일
 *
 * 사용법:
 *   node ytb_fill_stats.js <spreadsheet_id>
 *   node ytb_fill_stats.js <spreadsheet_id> --all  (전체 덮어쓰기)
 */

import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { google } from 'googleapis';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer';

const envPath = path.join(os.homedir(), 'Documents', 'github_cloud', 'module_api_key', '.env');
dotenv.config({ path: envPath });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY가 설정되지 않았습니다.');

const AUTH_PATH = path.join(os.homedir(), 'Documents', 'github_cloud', 'module_auth', 'auth.js');
const { getCredentials } = await import(pathToFileURL(AUTH_PATH).href);

const SPREADSHEET_ID = process.argv[2];
const FORCE_ALL = process.argv.includes('--all');
if (!SPREADSHEET_ID) {
  console.error('사용법: node ytb_fill_stats.js <spreadsheet_id> [--all]');
  process.exit(1);
}

// ── YouTube API ───────────────────────────────────────────────────────────────

async function fetchChannelStats(handle) {
  const raw = handle.replace(/^@/, '');
  const isId = /^UC[\w-]{22}$/.test(raw);
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  if (isId) url.searchParams.set('id', raw);
  else url.searchParams.set('forHandle', raw);
  url.searchParams.set('key', YOUTUBE_API_KEY);
  const res = await fetch(url.toString());
  const data = await res.json();
  return data?.items?.[0] ?? null;
}

function parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

async function fetchVideoDetails(videoIds) {
  if (!videoIds.length) return new Map();
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'contentDetails,statistics');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('key', YOUTUBE_API_KEY);
  const res = await fetch(url.toString());
  const data = await res.json();
  const map = new Map();
  for (const item of data?.items ?? []) {
    map.set(item.id, {
      duration: parseDuration(item?.contentDetails?.duration),
      viewCount: Number(item?.statistics?.viewCount ?? 0),
    });
  }
  return map;
}

async function fetchRecentVideosExcludingShorts(uploadsPlaylistId, maxResults = 10) {
  const results = [];
  let pageToken = null;
  while (results.length < maxResults) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('playlistId', uploadsPlaylistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', YOUTUBE_API_KEY);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString());
    const data = await res.json();
    const items = data?.items ?? [];
    if (!items.length) break;
    const videoIds = items.map((v) => v.snippet?.resourceId?.videoId).filter(Boolean);
    const detailsMap = await fetchVideoDetails(videoIds);
    for (const item of items) {
      if (results.length >= maxResults) break;
      const videoId = item.snippet?.resourceId?.videoId;
      const { duration, viewCount } = detailsMap.get(videoId) ?? {};
      if (duration > 60) results.push({ item, videoId, viewCount: viewCount ?? 0 });
    }
    pageToken = data.nextPageToken ?? null;
    if (!pageToken) break;
  }
  return results.slice(0, maxResults);
}

// ── Puppeteer: /videos 탭 영상수 스크랩 ──────────────────────────────────────

async function scrapeVideoCount(page, channelId) {
  const url = `https://www.youtube.com/${channelId}/videos`;
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));
    await page.waitForSelector('ytd-rich-grid-media, ytd-grid-video-renderer', { timeout: 10000 }).catch(() => null);

    // 탭 헤더에서 영상수 파싱
    const headerCount = await page.evaluate(() => {
      const tabs = document.querySelectorAll('yt-tab-shape');
      for (const tab of tabs) {
        const text = tab.textContent ?? '';
        const m = text.match(/동영상\s*[\n\r]*\s*([\d,]+)/);
        if (m) return parseInt(m[1].replace(/,/g, ''), 10);
      }
      return null;
    });
    if (headerCount != null) return headerCount;

    // fallback: 카드 수
    const count = await page.evaluate(() =>
      document.querySelectorAll('ytd-rich-grid-media, ytd-grid-video-renderer').length
    );
    return count || null;
  } catch {
    return null;
  }
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

async function getSheets() {
  const auth = await getCredentials();
  return google.sheets({ version: 'v4', auth });
}

async function readChannelList(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'list!B2:N',
  });
  return (res.data.values ?? []).map((r, i) => ({
    rowIndex: i + 2,
    channelName: r[0] ?? '',
    channelId: r[1] ?? '',
    hasData: !!r[4], // F열 (index 4 in B:N range) 채워져 있으면 스킵
  })).filter((r) => r.channelId);
}

async function getListSheetId(sheets) {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return res.data.sheets.find((s) => s.properties.title === 'list')?.properties?.sheetId ?? null;
}

async function writeStatsRow(sheets, sheetId, rowIndex, stats) {
  const r = rowIndex - 1; // 0-based

  const { subscribers, videoCount, avgViewCount, topVideos, lastUploadDate } = stats;
  const ratio = videoCount ? Math.round(subscribers / videoCount) : null;

  const cells = [
    // F(5): 구독자
    { col: 5, value: { numberValue: subscribers } },
    // G(6): 업로드영상(쇼츠제외)
    { col: 6, value: videoCount != null ? { numberValue: videoCount } : { stringValue: '-' } },
    // H(7): 비율
    { col: 7, value: ratio != null ? { numberValue: ratio } : { stringValue: '-' } },
    // I(8): 최근 평균 조회수
    { col: 8, value: avgViewCount != null ? { numberValue: Math.round(avgViewCount) } : { stringValue: '-' } },
    // J(9): 인기영상1 제목+링크
    {
      col: 9,
      value: topVideos[0]
        ? { formulaValue: `=HYPERLINK("https://www.youtube.com/watch?v=${topVideos[0].videoId}","${topVideos[0].title.replace(/"/g, '""')}")` }
        : { stringValue: '' },
    },
    // K(10): 인기영상1 조회수
    { col: 10, value: topVideos[0] ? { numberValue: topVideos[0].viewCount } : { stringValue: '' } },
    // L(11): 인기영상2 제목+링크
    {
      col: 11,
      value: topVideos[1]
        ? { formulaValue: `=HYPERLINK("https://www.youtube.com/watch?v=${topVideos[1].videoId}","${topVideos[1].title.replace(/"/g, '""')}")` }
        : { stringValue: '' },
    },
    // M(12): 인기영상2 조회수
    { col: 12, value: topVideos[1] ? { numberValue: topVideos[1].viewCount } : { stringValue: '' } },
    // N(13): 마지막 업로드일
    { col: 13, value: { stringValue: lastUploadDate ?? '' } },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: cells.map(({ col, value }) => ({
        updateCells: {
          rows: [{ values: [{ userEnteredValue: value }] }],
          fields: 'userEnteredValue',
          start: { sheetId, rowIndex: r, columnIndex: col },
        },
      })),
    },
  });
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const sheets = await getSheets();
  const sheetId = await getListSheetId(sheets);
  if (sheetId === null) throw new Error('list 시트를 찾을 수 없습니다.');

  const allChannels = await readChannelList(sheets);
  const channels = FORCE_ALL ? allChannels : allChannels.filter((ch) => !ch.hasData);

  console.log(`📋 전체 ${allChannels.length}개 중 처리 대상 ${channels.length}개\n`);
  if (!channels.length) {
    console.log('처리할 채널이 없습니다.');
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    for (const ch of channels) {
      process.stdout.write(`🔍 ${ch.channelName} (${ch.channelId}) row${ch.rowIndex}... `);
      try {
        const channelData = await fetchChannelStats(ch.channelId);
        if (!channelData) { console.log('❌ 채널 정보 없음'); continue; }

        const subscribers = Number(channelData.statistics?.subscriberCount ?? 0);
        const uploadsPlaylistId = channelData.contentDetails?.relatedPlaylists?.uploads;

        let topVideos = [];
        let lastUploadDate = '';
        let avgViewCount = null;

        if (uploadsPlaylistId) {
          const videos = await fetchRecentVideosExcludingShorts(uploadsPlaylistId, 10);
          lastUploadDate = videos[0]?.item?.snippet?.publishedAt?.slice(0, 10) ?? '';

          const viewCounts = videos.map((v) => v.viewCount);
          avgViewCount = viewCounts.length ? viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length : 0;

          topVideos = videos
            .filter((v) => v.viewCount > avgViewCount)
            .slice(0, 2)
            .map((v) => ({
              videoId: v.videoId,
              title: v.item?.snippet?.title ?? '',
              viewCount: v.viewCount,
            }));
        }

        const videoCount = await scrapeVideoCount(page, ch.channelId);

        await writeStatsRow(sheets, sheetId, ch.rowIndex, {
          subscribers, videoCount, avgViewCount, topVideos, lastUploadDate,
        });

        console.log(`✅ 구독자 ${subscribers.toLocaleString()}명 / 영상 ${videoCount ?? '-'}개 / 평균 ${Math.round(avgViewCount ?? 0).toLocaleString()}회`);
      } catch (err) {
        console.log(`❌ 오류: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    }
  } finally {
    await browser.close();
  }

  console.log('\n✅ 전체 완료!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
