/**
 * adapter/index.js — PM 프로젝트 공통 어댑터
 *
 * 사용법:
 *   import { createAdapter } from './adapter/index.js';
 *   const adapter = createAdapter('gg'); // 'gg' | 'cc' | 'xx'
 *   const tasks = await adapter.queryTasks({ status: ['진행 중', '업무막힘'] });
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildNotionFilter } from './lib/query-builder.js';
import { parseNotionPage, buildTaskTree } from './lib/response-parser.js';
import { buildNotionUpdate } from './lib/update-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Notion API 설정
const envRaw = readFileSync(path.join(process.env.HOME, 'github', 'api_key', '.env'), 'utf8');
const apiKey = envRaw.match(/NOTION_API_KEY=(.+)/)[1].trim();
const HEADERS = {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

// ─── Config 로더 ───

function loadConfig(projectId) {
  const configPath = path.join(__dirname, 'config', `${projectId}.json`);
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

// ─── Notion API 호출 (저수준) ───

async function notionQuery(databaseId, body = {}) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion query 오류 (${res.status}): ${data.message}`);
  return data;
}

async function notionGetPage(pageId) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: HEADERS });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion getPage 오류 (${res.status}): ${data.message}`);
  return data;
}

async function notionUpdatePage(pageId, properties) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH', headers: HEADERS,
    body: JSON.stringify({ properties })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion updatePage 오류 (${res.status}): ${data.message}`);
  return data;
}

async function notionCreatePage(databaseId, properties) {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion createPage 오류 (${res.status}): ${data.message}`);
  return data;
}

// ─── ProjectAdapter ───

class ProjectAdapter {
  constructor(config) {
    this.config = config;
  }

  /**
   * 태스크 조회
   * @param {object} filters - { status, priority, hasParent, deadline }
   * @param {object} options - { pageSize }
   * @returns {Promise<Array>} CanonicalTask[]
   */
  async queryTasks(filters = {}, options = {}) {
    const queryBody = buildNotionFilter(filters, this.config);
    if (options.pageSize) queryBody.page_size = options.pageSize;

    const allResults = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      if (startCursor) queryBody.start_cursor = startCursor;
      const data = await notionQuery(this.config.databaseId, queryBody);
      allResults.push(...data.results);
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    return allResults.map(page => parseNotionPage(page, this.config));
  }

  /**
   * 단일 태스크 조회
   * @param {string} taskId - Notion page ID
   * @returns {Promise<object>} CanonicalTask
   */
  async getTask(taskId) {
    const page = await notionGetPage(taskId);
    return parseNotionPage(page, this.config);
  }

  /**
   * 태스크 업데이트
   * @param {string} taskId - Notion page ID
   * @param {object} fields - { title, status, priority, parentId, deadline, output, issueNote }
   */
  async updateTask(taskId, fields) {
    const properties = buildNotionUpdate(fields, this.config);
    await notionUpdatePage(taskId, properties);
  }

  /**
   * 태스크 생성
   * @param {object} fields - CanonicalUpdate
   * @param {string} parentId - 상위 항목 page ID
   * @returns {Promise<string>} 생성된 page ID
   */
  async createTask(fields, parentId) {
    if (parentId) fields.parentId = parentId;
    const properties = buildNotionUpdate(fields, this.config);
    const page = await notionCreatePage(this.config.databaseId, properties);
    return page.id;
  }

  /**
   * 계층 트리 조회
   * @param {number} maxDepth - 최대 깊이 (-1 = 무한)
   * @returns {Promise<Array>} 트리 구조
   */
  async getTaskTree(maxDepth = -1) {
    const tasks = await this.queryTasks();
    return buildTaskTree(tasks, maxDepth);
  }

  /**
   * 프로젝트 메타 정보
   */
  getProjectMeta() {
    const today = new Date();
    const launch = this.config.launchDate ? new Date(this.config.launchDate) : null;
    const dday = launch ? Math.ceil((launch - today) / (1000 * 60 * 60 * 24)) : null;

    return {
      projectId: this.config.projectId,
      displayName: this.config.displayName,
      dday,
      launchDate: this.config.launchDate,
      members: this.config.members,
      prioritySemantics: this.config.prioritySemantics,
      phases: this.config.phases || null
    };
  }

  /** Config 접근 */
  getConfig() { return this.config; }
}

// ─── 공개 API ───

/**
 * 프로젝트별 어댑터 인스턴스 생성
 * @param {string} projectId - "gg" | "cc" | "xx"
 * @returns {ProjectAdapter}
 */
export function createAdapter(projectId) {
  const config = loadConfig(projectId);
  return new ProjectAdapter(config);
}

/** 사용 가능한 프로젝트 목록 */
export function listProjects() {
  return ['gg', 'cc', 'xx'];
}
