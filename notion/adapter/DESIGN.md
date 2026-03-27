# PM 어댑터 레이어 설계 문서

> 작성: adapter-designer | 2026-03-27
> 목적: GG, CC, XX 3개 PM 프로젝트의 DB 필드 차이를 통일하는 추상 레이어

---

## 1. 문제 정의

현재 3개 프로젝트가 Notion DB를 사용하지만 필드명, 타입, 쿼리 문법이 다름.
`_pm_briefing.js`는 GG/CC를 CONFIG 분기로 처리하고, XX는 스크립트 자체가 없음.
프로젝트가 추가될 때마다 분기문이 늘어나는 구조 → 어댑터로 추상화 필요.

### 현재 필드 차이

| 공통 개념 | GG | CC | XX |
|---|---|---|---|
| 제목 | `TASK` (title) | `업무` (title) | `업무` (title) |
| 상태 | `상태` (status) | `4_상태` (select) | `4_상태` (select) |
| 우선순위 | `우선순위` (status) | `1_우선순위` (select) | `1_우선순위` (select) |
| 상위 항목 | `상위 항목` (relation) | `상위 항목` (relation) | `상위 항목` (relation) |
| 데드라인 | `데드라인(까지)` (date) | - | - |
| 아웃풋 | `아웃풋` (rich_text) | - | - |
| 이슈 노트 | `이슈 노트` (rich_text) | - | - |

### 프로젝트별 특수 로직

- **GG**: `완료` vs `**완료**` (AAR 전/후 구분), D-day 카운터
- **CC**: 우선순위 숫자(1~6) = 6단계 제품 파이프라인 스테이지
- **XX**: 우선순위 숫자 = 주차 번호, 3개 Phase 구조

---

## 2. 공통 인터페이스 스키마 (Canonical Schema)

모든 프로젝트가 동일한 이름으로 접근하는 추상 필드 정의.

```typescript
// === Canonical Task Interface ===
interface CanonicalTask {
  id: string;                    // Notion page ID
  title: string;                 // 제목 (GG: TASK, CC/XX: 업무)
  status: TaskStatus;            // 상태 (통일)
  priority: string;              // 우선순위 원본값 ("1", "2", "📍MileStone", "🎖 GOAL", "-" 등)
  parentId?: string;             // 상위 항목 relation ID
  deadline?: string;             // ISO date (GG만 해당, 나머지 null)
  output?: string;               // 아웃풋 텍스트 (GG만 해당)
  issueNote?: string;            // 이슈 노트 (GG만 해당)
  raw: Record<string, any>;      // Notion 원본 properties (프로젝트별 커스텀 필드 접근용)
}

// === 통일 상태값 ===
type TaskStatus = '진행 중' | '업무막힘' | '진행대기' | '완료' | '완료_aar';
// '완료_aar'은 GG의 **완료** (AAR 완료 후)에만 해당

// === 쿼리 필터 (Canonical) ===
interface CanonicalFilter {
  status?: TaskStatus | TaskStatus[];
  priority?: string | string[];
  hasParent?: boolean;           // depth 필터용
  deadline?: { before?: string; after?: string };
}

// === 업데이트 필드 (Canonical) ===
interface CanonicalUpdate {
  title?: string;
  status?: TaskStatus;
  priority?: string;
  parentId?: string;
  deadline?: string;
  output?: string;
  issueNote?: string;
}
```

### 설계 원칙

1. **존재하지 않는 필드는 무시** — CC에 `deadline`을 쿼리하면 해당 필터를 건너뜀
2. **원본 접근 보장** — `raw` 필드로 프로젝트별 커스텀 속성에 직접 접근 가능
3. **상태값 정규화** — GG의 `**완료**`는 `완료_aar`로 매핑, 나머지는 1:1 대응

---

## 3. 프로젝트별 매핑 Config

```
adapter/
  config/
    gg.json
    cc.json
    xx.json
```

### 3-1. Config 스키마

```typescript
interface ProjectConfig {
  projectId: string;             // "gg" | "cc" | "xx"
  displayName: string;           // "GG 딜롱·사입" 등
  databaseId: string;            // Notion DB ID
  briefingDbId: string;          // 브리핑 DB ID

  // 필드 매핑: canonical name → Notion 실제 필드명
  fields: {
    title: { name: string; type: 'title' };
    status: { name: string; type: 'status' | 'select' };
    priority: { name: string; type: 'status' | 'select' };
    parent: { name: string; type: 'relation' };
    deadline?: { name: string; type: 'date' };
    output?: { name: string; type: 'rich_text' };
    issueNote?: { name: string; type: 'rich_text' };
  };

  // 상태값 매핑: canonical → Notion 실제값
  statusMap: {
    '진행 중': string;
    '업무막힘': string;
    '진행대기': string;
    '완료': string;
    '완료_aar'?: string;         // GG만
  };

  // 우선순위 해석 (프로젝트별 의미)
  prioritySemantics: 'stage' | 'week' | 'level';
  skipPriorities: string[];      // 브리핑에서 제외할 우선순위값

  // 팀 구성
  members: Array<{
    name: string;
    calloutId: string;
    role: string;                // "blocker+p1" | "today" | "inprog+p1" | "blocker"
  }>;

  // 프로젝트 메타
  launchDate?: string;           // ISO date
  phases?: Array<{ name: string; weeks: string }>;
}
```

### 3-2. GG Config 예시

```json
{
  "projectId": "gg",
  "displayName": "GG 딜롱·사입",
  "databaseId": "2f6111a5778881ceaf1be4e73f6644ea",
  "briefingDbId": "318111a57788804ba081cb8ae05707ae",

  "fields": {
    "title":     { "name": "TASK",        "type": "title" },
    "status":    { "name": "상태",         "type": "status" },
    "priority":  { "name": "우선순위",     "type": "status" },
    "parent":    { "name": "상위 항목",    "type": "relation" },
    "deadline":  { "name": "데드라인(까지)", "type": "date" },
    "output":    { "name": "아웃풋",       "type": "rich_text" },
    "issueNote": { "name": "이슈 노트",   "type": "rich_text" }
  },

  "statusMap": {
    "진행 중": "진행 중",
    "업무막힘": "업무막힘",
    "진행대기": "진행대기",
    "완료": "완료",
    "완료_aar": "**완료**"
  },

  "prioritySemantics": "level",
  "skipPriorities": ["-"],

  "members": [
    { "name": "현빈02", "calloutId": "2f1111a577888127951bc2b17188efff", "role": "blocker+p1" },
    { "name": "지혜",   "calloutId": "2f1111a5778881e0b79eec85bbc540c5", "role": "today" }
  ],

  "launchDate": "2026-03-20"
}
```

### 3-3. CC Config 예시

```json
{
  "projectId": "cc",
  "displayName": "CC 커머스",
  "databaseId": "31c111a5778881a89626ceef93de198b",
  "briefingDbId": "31c111a57788814babddf63dad42844e",

  "fields": {
    "title":    { "name": "업무",       "type": "title" },
    "status":   { "name": "4_상태",     "type": "select" },
    "priority": { "name": "1_우선순위", "type": "select" },
    "parent":   { "name": "상위 항목",  "type": "relation" }
  },

  "statusMap": {
    "진행 중": "진행 중",
    "업무막힘": "업무막힘",
    "진행대기": "진행대기",
    "완료": "완료"
  },

  "prioritySemantics": "stage",
  "skipPriorities": ["대기"],

  "members": [
    { "name": "수지", "calloutId": "2e6111a5778880a6a2f7cfca611ea5b7", "role": "inprog+p1" },
    { "name": "현빈", "calloutId": "8bcea4ed47cb46ae90d7dfa888e09c16", "role": "blocker" }
  ],

  "launchDate": "2026-04-14"
}
```

### 3-4. XX Config 예시

```json
{
  "projectId": "xx",
  "displayName": "XX 역전야매치트키",
  "databaseId": "31c111a5-7788-81df-aa2b-d7121a81563d",
  "briefingDbId": "31c111a5-7788-8195-ad63-dd9acca7e5d9",

  "fields": {
    "title":    { "name": "업무",       "type": "title" },
    "status":   { "name": "4_상태",     "type": "select" },
    "priority": { "name": "1_우선순위", "type": "select" },
    "parent":   { "name": "상위 항목",  "type": "relation" }
  },

  "statusMap": {
    "진행 중": "진행 중",
    "업무막힘": "업무막힘",
    "진행대기": "진행대기",
    "완료": "완료"
  },

  "prioritySemantics": "week",
  "skipPriorities": [],

  "members": [
    { "name": "현빈01", "calloutId": "31c111a5-7788-81cc-813b-ec06b86bf5a7", "role": "blocker+p1" }
  ],

  "launchDate": "2026-06-15",
  "phases": [
    { "name": "Phase 1", "weeks": "1-4" },
    { "name": "Phase 2", "weeks": "5-8" },
    { "name": "Phase 3", "weeks": "9-12" }
  ]
}
```

---

## 4. 어댑터 함수 시그니처

### 4-1. 파일 구조

```
adapter/
  index.js              ← 메인 진입점 (createAdapter)
  config/
    gg.json
    cc.json
    xx.json
  lib/
    field-mapper.js     ← Canonical ↔ Notion 필드 변환
    query-builder.js    ← CanonicalFilter → Notion API filter 변환
    response-parser.js  ← Notion API 응답 → CanonicalTask 변환
    update-builder.js   ← CanonicalUpdate → Notion API properties 변환
```

### 4-2. 핵심 API

```javascript
// === adapter/index.js ===

const { loadConfig } = require('./config');
const { buildNotionFilter } = require('./lib/query-builder');
const { parseNotionPage } = require('./lib/response-parser');
const { buildNotionUpdate } = require('./lib/update-builder');
const notionApi = require('../notion_api');   // 기존 API 래퍼 재사용

/**
 * 프로젝트별 어댑터 인스턴스 생성
 * @param {string} projectId - "gg" | "cc" | "xx"
 * @returns {ProjectAdapter}
 */
function createAdapter(projectId) {
  const config = loadConfig(projectId);
  return new ProjectAdapter(config);
}

class ProjectAdapter {
  constructor(config) {
    this.config = config;
  }

  /**
   * 태스크 조회 (필터 + 정렬)
   * @param {CanonicalFilter} filters
   * @param {object} [options] - { sorts, depth, limit }
   * @returns {Promise<CanonicalTask[]>}
   */
  async queryTasks(filters = {}, options = {}) { }

  /**
   * 단일 태스크 조회
   * @param {string} taskId - Notion page ID
   * @returns {Promise<CanonicalTask>}
   */
  async getTask(taskId) { }

  /**
   * 태스크 업데이트
   * @param {string} taskId - Notion page ID
   * @param {CanonicalUpdate} fields
   * @returns {Promise<void>}
   */
  async updateTask(taskId, fields) { }

  /**
   * 태스크 생성
   * @param {CanonicalUpdate} fields
   * @param {string} [parentId] - 상위 항목 page ID
   * @returns {Promise<string>} 생성된 page ID
   */
  async createTask(fields, parentId) { }

  /**
   * 하위 태스크 트리 조회 (계층)
   * @param {string} [rootId] - 루트 ID (없으면 전체)
   * @param {number} [maxDepth] - 최대 깊이
   * @returns {Promise<CanonicalTaskTree>}
   */
  async getTaskTree(rootId, maxDepth) { }

  /**
   * 프로젝트 Config 접근
   * @returns {ProjectConfig}
   */
  getConfig() { return this.config; }
}
```

### 4-3. 내부 변환 함수

```javascript
// === lib/query-builder.js ===

/**
 * Canonical 필터 → Notion API filter body 변환
 *
 * 핵심: config.fields[key].type에 따라 쿼리 문법을 자동 결정
 *   status 타입 → { "status": { "equals": "값" } }
 *   select 타입 → { "select": { "equals": "값" } }
 */
function buildNotionFilter(canonicalFilter, config) {
  const conditions = [];

  if (canonicalFilter.status) {
    const fieldDef = config.fields.status;
    const values = Array.isArray(canonicalFilter.status)
      ? canonicalFilter.status
      : [canonicalFilter.status];

    const statusConditions = values.map(v => {
      const notionValue = config.statusMap[v] || v;
      return {
        property: fieldDef.name,
        [fieldDef.type]: { equals: notionValue }
      };
    });

    if (statusConditions.length === 1) {
      conditions.push(statusConditions[0]);
    } else {
      conditions.push({ or: statusConditions });
    }
  }

  if (canonicalFilter.priority) {
    const fieldDef = config.fields.priority;
    const values = Array.isArray(canonicalFilter.priority)
      ? canonicalFilter.priority
      : [canonicalFilter.priority];

    const prioConditions = values.map(v => ({
      property: fieldDef.name,
      [fieldDef.type]: { equals: v }
    }));

    if (prioConditions.length === 1) {
      conditions.push(prioConditions[0]);
    } else {
      conditions.push({ or: prioConditions });
    }
  }

  // deadline 필터 (해당 필드 없는 프로젝트는 건너뜀)
  if (canonicalFilter.deadline && config.fields.deadline) {
    const deadlineFilter = { property: config.fields.deadline.name };
    if (canonicalFilter.deadline.before) {
      deadlineFilter.date = { before: canonicalFilter.deadline.before };
    }
    if (canonicalFilter.deadline.after) {
      deadlineFilter.date = { ...deadlineFilter.date, after: canonicalFilter.deadline.after };
    }
    conditions.push(deadlineFilter);
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return { filter: conditions[0] };
  return { filter: { and: conditions } };
}

// === lib/response-parser.js ===

/**
 * Notion page → CanonicalTask 변환
 */
function parseNotionPage(page, config) {
  const props = page.properties;
  const titleField = config.fields.title.name;
  const statusField = config.fields.status.name;
  const priorityField = config.fields.priority.name;
  const parentField = config.fields.parent.name;

  // 제목 추출
  const title = props[titleField]?.title?.[0]?.plain_text || '';

  // 상태 추출 + 역매핑
  const rawStatus = props[statusField]?.[config.fields.status.type]?.name || '';
  const status = reverseStatusMap(rawStatus, config.statusMap);

  // 우선순위 추출
  const priority = props[priorityField]?.[config.fields.priority.type]?.name || '';

  // 상위 항목
  const parentId = props[parentField]?.relation?.[0]?.id || null;

  // 선택적 필드
  const deadline = config.fields.deadline
    ? props[config.fields.deadline.name]?.date?.start || null
    : null;
  const output = config.fields.output
    ? extractRichText(props[config.fields.output.name])
    : null;
  const issueNote = config.fields.issueNote
    ? extractRichText(props[config.fields.issueNote.name])
    : null;

  return {
    id: page.id,
    title,
    status,
    priority,
    parentId,
    deadline,
    output,
    issueNote,
    raw: props
  };
}

// === lib/update-builder.js ===

/**
 * CanonicalUpdate → Notion API properties 변환
 */
function buildNotionUpdate(canonicalUpdate, config) {
  const properties = {};

  if (canonicalUpdate.title !== undefined) {
    properties[config.fields.title.name] = {
      title: [{ text: { content: canonicalUpdate.title } }]
    };
  }

  if (canonicalUpdate.status !== undefined) {
    const notionValue = config.statusMap[canonicalUpdate.status] || canonicalUpdate.status;
    properties[config.fields.status.name] = {
      [config.fields.status.type]: { name: notionValue }
    };
  }

  if (canonicalUpdate.priority !== undefined) {
    properties[config.fields.priority.name] = {
      [config.fields.priority.type]: { name: canonicalUpdate.priority }
    };
  }

  if (canonicalUpdate.parentId !== undefined && config.fields.parent) {
    properties[config.fields.parent.name] = {
      relation: canonicalUpdate.parentId
        ? [{ id: canonicalUpdate.parentId }]
        : []
    };
  }

  if (canonicalUpdate.deadline !== undefined && config.fields.deadline) {
    properties[config.fields.deadline.name] = {
      date: canonicalUpdate.deadline
        ? { start: canonicalUpdate.deadline }
        : null
    };
  }

  if (canonicalUpdate.output !== undefined && config.fields.output) {
    properties[config.fields.output.name] = {
      rich_text: [{ text: { content: canonicalUpdate.output } }]
    };
  }

  if (canonicalUpdate.issueNote !== undefined && config.fields.issueNote) {
    properties[config.fields.issueNote.name] = {
      rich_text: [{ text: { content: canonicalUpdate.issueNote } }]
    };
  }

  return properties;
}
```

---

## 5. BriefingData 집계 레이어 (format-designer 연계)

> format-designer의 포맷 표준 문서 섹션 6.2에서 요구하는 입력 스키마에 맞춰,
> CanonicalTask[] → BriefingData 변환을 담당하는 상위 레이어.

### 5-1. BriefingData 인터페이스

```typescript
interface BriefingData {
  project: string;                // "gg" | "cc" | "xx"
  date: string;                   // ISO date "2026-03-27"
  dday: number;                   // 런칭까지 남은 일수 (음수 = 지남)
  currentStage: {
    name: string;                 // 단계명 ("상품 기획·소싱", "Phase 1" 등)
    number: number;               // 현재 단계 번호
    total: number;                // 전체 단계 수
    progress: number;             // 진행률 (0~100)
  };
  blocking: BlockingItem[];       // 🚨 블로킹 항목
  tasks: BriefingTask[];          // 배정 대상 태스크
  completed_today: BriefingTask[];// 오늘 완료된 태스크 (EOD용)
  weekly_goals: BriefingTask[];   // 이번주 목표 (주간 브리핑용)
}

interface BlockingItem {
  id: string;
  title: string;
  reason: string;                 // issueNote 또는 수동 입력
  assignee: string;               // config.members에서 매칭
}

interface BriefingTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  urgency: 'blocking' | 'red' | 'yellow' | 'green';
  assignee: string;
  input?: string;                 // 콜아웃 블록에서 추출 또는 null
  output?: string;                // CanonicalTask.output 또는 null
}
```

### 5-2. 긴급도(urgency) 결정 로직

```javascript
/**
 * CanonicalTask → urgency 결정
 * config.prioritySemantics에 무관하게 동일 로직 적용
 */
function determineUrgency(task, config) {
  // 1. 업무막힘 = blocking
  if (task.status === '업무막힘') return 'blocking';

  // 2. 데드라인이 오늘 이하 = red
  if (task.deadline) {
    const daysLeft = diffDays(task.deadline, today());
    if (daysLeft <= 0) return 'red';
    if (daysLeft <= 7) return 'yellow';
  }

  // 3. 우선순위 1 (최고) = red (프로젝트별 해석 무관)
  if (task.priority === '1') return 'red';

  // 4. 우선순위 2~3 = yellow
  if (['2', '3'].includes(task.priority)) return 'yellow';

  // 5. 나머지 = green
  return 'green';
}
```

### 5-3. 담당자(assignee) 매칭 로직

```javascript
/**
 * 태스크 → 담당자 결정
 * config.members[].role 기반으로 매칭
 *
 * 규칙:
 *   "blocker+p1" 역할 → status=업무막힘 또는 priority=1인 태스크
 *   "today" 역할     → 오늘 날짜 콜아웃에 배정된 태스크
 *   "inprog+p1" 역할 → status=진행 중 + priority=1인 태스크
 *   "blocker" 역할   → status=업무막힘인 태스크
 */
function assignMember(task, config) {
  for (const member of config.members) {
    if (member.role.includes('blocker') && task.status === '업무막힘') return member.name;
    if (member.role.includes('p1') && task.priority === '1') return member.name;
  }
  // 기본: 첫 번째 멤버
  return config.members[0]?.name || 'unassigned';
}
```

### 5-4. 단계(currentStage) 감지 로직

```javascript
/**
 * 프로젝트별 현재 단계 감지
 * config.prioritySemantics에 따라 로직 분기
 */
function detectCurrentStage(tasks, config) {
  switch (config.prioritySemantics) {
    case 'stage': {
      // CC: 우선순위 숫자 = 스테이지 번호
      // 가장 낮은 번호 중 진행 중인 태스크가 있는 스테이지 = 현재 단계
      const CC_STAGES = [
        '시장 발굴 및 기획', '상품 소싱', '상품 런칭 준비',
        '상품 입고', '상품 등록', '마케팅'
      ];
      const activeStage = Math.min(
        ...tasks.filter(t => t.status === '진행 중').map(t => parseInt(t.priority) || 99)
      );
      return {
        name: CC_STAGES[activeStage - 1] || CC_STAGES[0],
        number: activeStage,
        total: 6,
        progress: calculateProgress(tasks)
      };
    }
    case 'week': {
      // XX: 우선순위 = 주차. Phase는 config.phases에서 결정
      const currentWeek = Math.min(
        ...tasks.filter(t => t.status === '진행 중').map(t => parseInt(t.priority) || 99)
      );
      const phase = config.phases?.find(p => {
        const [start, end] = p.weeks.split('-').map(Number);
        return currentWeek >= start && currentWeek <= end;
      });
      return {
        name: phase?.name || `${currentWeek}주차`,
        number: config.phases?.indexOf(phase) + 1 || 1,
        total: config.phases?.length || 3,
        progress: calculateProgress(tasks)
      };
    }
    case 'level':
    default: {
      // GG: MileStone 기반. 완료되지 않은 첫 번째 MileStone = 현재 단계
      const milestones = tasks.filter(t => t.priority === '📍MileStone');
      const activeMilestone = milestones.find(t => t.status !== '완료' && t.status !== '완료_aar');
      const idx = milestones.indexOf(activeMilestone);
      return {
        name: activeMilestone?.title || '전체',
        number: idx + 1 || 1,
        total: milestones.length || 1,
        progress: calculateProgress(tasks)
      };
    }
  }
}

function calculateProgress(tasks) {
  const total = tasks.filter(t => !['📍MileStone', '🎖 GOAL'].includes(t.priority)).length;
  const done = tasks.filter(t => t.status === '완료' || t.status === '완료_aar').length;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
```

### 5-5. ProjectAdapter에 추가되는 메서드

```javascript
class ProjectAdapter {
  // ... 기존 메서드 (queryTasks, getTask, updateTask, createTask, getTaskTree) ...

  /**
   * 브리핑용 집계 데이터 생성
   * format-designer의 포맷팅 함수 입력 스키마에 정확히 맞춤
   *
   * @param {'morning' | 'eod' | 'weekly'} type - 브리핑 종류
   * @returns {Promise<BriefingData>}
   */
  async prepareBriefingData(type = 'morning') {
    const config = this.config;

    // 전체 태스크 조회 (진행 중 + 업무막힘 + 진행대기)
    const allTasks = await this.queryTasks({
      status: ['진행 중', '업무막힘', '진행대기']
    });

    // 완료 태스크 (EOD용)
    const completedToday = type === 'eod'
      ? await this.queryTasks({ status: ['완료'] })  // 추후 날짜 필터 추가
      : [];

    // D-day 계산
    const dday = config.launchDate
      ? diffDays(config.launchDate, today())
      : null;

    // 단계 감지
    const allForStage = await this.queryTasks({});  // 전체 조회 (진행률 계산용)
    const currentStage = detectCurrentStage(allForStage, config);

    // 블로킹 분리
    const blocking = allTasks
      .filter(t => t.status === '업무막힘')
      .map(t => ({
        id: t.id,
        title: t.title,
        reason: t.issueNote || '사유 미기재',
        assignee: assignMember(t, config)
      }));

    // 태스크 변환 (CanonicalTask → BriefingTask)
    const tasks = allTasks
      .filter(t => !config.skipPriorities.includes(t.priority))
      .filter(t => !['📍MileStone', '🎖 GOAL'].includes(t.priority))
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        urgency: determineUrgency(t, config),
        assignee: assignMember(t, config),
        input: null,    // 콜아웃 블록에서 추출 (별도 로직)
        output: t.output || null
      }));

    return {
      project: config.projectId,
      date: today(),
      dday,
      currentStage,
      blocking,
      tasks,
      completed_today: completedToday.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        urgency: 'green',
        assignee: assignMember(t, config),
        output: t.output || null
      })),
      weekly_goals: type === 'weekly'
        ? allTasks.filter(t => t.priority === '1' || t.priority === '🎖 GOAL')
            .map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              urgency: determineUrgency(t, config),
              assignee: assignMember(t, config)
            }))
        : []
    };
  }
}
```

### 5-6. 파일 구조 업데이트

```
adapter/
  index.js              ← createAdapter() + ProjectAdapter 클래스
  config/
    gg.json / cc.json / xx.json
  lib/
    field-mapper.js     ← Canonical ↔ Notion 필드 변환
    query-builder.js    ← CanonicalFilter → Notion API filter
    response-parser.js  ← Notion response → CanonicalTask
    update-builder.js   ← CanonicalUpdate → Notion properties
    briefing-aggregator.js  ← [신규] CanonicalTask[] → BriefingData 집계
    urgency-resolver.js     ← [신규] 긴급도 결정 로직
    stage-detector.js       ← [신규] 단계 감지 로직
    member-assigner.js      ← [신규] 담당자 매칭 로직
```

### 5-7. 포맷팅 레이어와의 연결

```javascript
// === 사용 예시: 아침 브리핑 전체 흐름 ===
const { createAdapter } = require('./adapter');
const { formatMorningBriefing } = require('./formatter');  // format-designer 영역

async function morningBriefing(projectId) {
  const adapter = createAdapter(projectId);

  // 1. 어댑터: DB 조회 + 정규화 + 집계
  const briefingData = await adapter.prepareBriefingData('morning');

  // 2. 포맷터: BriefingData → Notion 블록 배열 (format-designer 영역)
  const blocks = formatMorningBriefing(briefingData);

  // 3. 출력: Notion에 블록 삽입 (notion_api.js)
  await notionApi.appendBlocks(toggleId, blocks);
}

// GG, CC, XX 모두 동일 코드
await morningBriefing('gg');
await morningBriefing('cc');
await morningBriefing('xx');
```

---

## 6. 기존 스크립트 마이그레이션 방안

### 6-1. 영향 받는 스크립트

| 스크립트 | 현재 방식 | 마이그레이션 |
|---|---|---|
| `_pm_briefing.js` | CONFIG 분기 (GG/CC) | `createAdapter(pm)` 사용, XX 자동 지원 |
| `db_read.js` | 직접 DB ID + 필드명 사용 | `adapter.queryTasks()` + `adapter.getTaskTree()` |
| `db_add_task.js` | 직접 properties 구성 | `adapter.createTask()` |
| `db_goal_status.js` | GG 전용 하드코딩 | `adapter.updateTask(id, { status: '진행 중' })` |
| `db_set_friday_deadline.js` | GG 전용 하드코딩 | `adapter.updateTask(id, { deadline })` |
| `cc_rebuild.js` | CC 전용 하드코딩 | config의 `prioritySemantics: 'stage'` 활용 |
| `_eod_read.js` | GG callout ID 하드코딩 | `config.members[].calloutId` 참조 |
| `_send_to_real_callout.js` | callout ID 하드코딩 | `config.members[].calloutId` 참조 |

### 6-2. 마이그레이션 전략: 점진적 래핑

**Phase 1** — 어댑터 + Config 파일 생성 (코드 변경 없음)
- `adapter/index.js`, `config/*.json`, `lib/*.js` 신규 생성
- 기존 스크립트는 그대로 동작

**Phase 2** — `_pm_briefing.js`를 어댑터 기반으로 리팩토링
- 가장 큰 분기문이 있는 핵심 스크립트
- `createAdapter(pm)`으로 CONFIG 분기 제거
- XX 프로젝트 자동 지원 시작

**Phase 3** — 나머지 스크립트 순차 전환
- `db_read.js` → `db_add_task.js` → 유틸리티 스크립트 순
- 각 스크립트에서 직접 Notion API 호출 → `adapter.*()` 호출로 전환

### 6-3. 호환성 보장

```javascript
// 마이그레이션 중 기존 코드와의 호환 레이어
// 기존: notionApi.queryDatabase(dbId, { filter: { property: "상태", status: { equals: "진행 중" } } })
// 신규: adapter.queryTasks({ status: '진행 중' })

// 점진적 전환을 위해 adapter는 notion_api.js를 내부에서 호출
// notion_api.js의 22개 함수는 변경하지 않음 (저수준 API로 유지)
```

---

## 7. 사용 예시

### 7-1. 브리핑용 태스크 조회 (모든 프로젝트 동일 코드)

```javascript
const { createAdapter } = require('./adapter');

async function getBriefingTasks(projectId) {
  const adapter = createAdapter(projectId);
  const config = adapter.getConfig();

  // 진행 중 + 업무막힘 태스크 조회
  const tasks = await adapter.queryTasks({
    status: ['진행 중', '업무막힘']
  });

  // 우선순위별 그룹핑 (의미는 config.prioritySemantics로 해석)
  const grouped = {};
  for (const task of tasks) {
    if (config.skipPriorities.includes(task.priority)) continue;
    (grouped[task.priority] ||= []).push(task);
  }

  return { tasks, grouped, config };
}

// GG, CC, XX 모두 동일한 함수로 처리
await getBriefingTasks('gg');
await getBriefingTasks('cc');
await getBriefingTasks('xx');
```

### 7-2. 태스크 상태 변경

```javascript
const adapter = createAdapter('gg');

// GG의 **완료** (AAR 후) 처리도 통일된 인터페이스
await adapter.updateTask(taskId, { status: '완료_aar' });
// → 내부적으로 { "상태": { "status": { "name": "**완료**" } } } 로 변환됨

const adapter2 = createAdapter('cc');
await adapter2.updateTask(taskId, { status: '완료' });
// → 내부적으로 { "4_상태": { "select": { "name": "완료" } } } 로 변환됨
```

---

## 8. format-designer / qa-designer 연계 포인트

### format-designer에게

- **CanonicalTask 인터페이스**가 브리핑/요청 포맷의 데이터 소스
- `config.prioritySemantics`로 우선순위 숫자의 의미를 해석해서 포맷팅
- `config.members[].role`로 팀원별 업무 배정 로직 표준화
- 어댑터의 `queryTasks()` 반환값이 포맷 변환 입력

### qa-designer에게

- **CanonicalTask** 필드 유효성 검증: `status`가 정의된 값인지, `priority`가 config에 맞는지
- `buildNotionFilter()` 결과물이 Notion API 스펙에 맞는지 검증
- `parseNotionPage()` → `buildNotionUpdate()` 왕복(round-trip) 일관성 검증
- 프로젝트 추가 시 config JSON 스키마 검증

---

## 9. 파일 위치 요약

```
/Users/boosters/Documents/claude_skills/notion/
├── notion_api.js              ← [기존 유지] 저수준 Notion REST API
├── _pm_briefing.js            ← [Phase 2에서 리팩토링] 어댑터 사용으로 전환
├── db_read.js                 ← [Phase 3에서 리팩토링]
├── ...기타 기존 스크립트...
│
└── adapter/                   ← [신규] 어댑터 레이어
    ├── DESIGN.md              ← 이 문서
    ├── index.js               ← createAdapter() + ProjectAdapter 클래스
    ├── config/
    │   ├── gg.json
    │   ├── cc.json
    │   └── xx.json
    └── lib/
        ├── field-mapper.js        ← 필드명 매핑 유틸
        ├── query-builder.js       ← CanonicalFilter → Notion filter
        ├── response-parser.js     ← Notion response → CanonicalTask
        ├── update-builder.js      ← CanonicalUpdate → Notion properties
        ├── briefing-aggregator.js ← CanonicalTask[] → BriefingData 집계
        ├── urgency-resolver.js    ← 긴급도 결정 (blocking/red/yellow/green)
        ├── stage-detector.js      ← 프로젝트별 단계 감지
        └── member-assigner.js     ← 역할 기반 담당자 매칭
```
