/**
 * response-parser.js — Notion API 응답 → CanonicalTask 변환
 */

/**
 * Notion page → CanonicalTask
 * @param {object} page - Notion API page object
 * @param {object} config - 프로젝트 config
 * @returns {object} CanonicalTask
 */
export function parseNotionPage(page, config) {
  const props = page.properties;

  // 제목
  const titleFieldName = config.fields.title.name;
  const title = props[titleFieldName]?.title?.[0]?.plain_text || '';

  // 상태 (역매핑)
  const statusFieldName = config.fields.status.name;
  const statusType = config.fields.status.type;
  const rawStatus = props[statusFieldName]?.[statusType]?.name || '';
  const status = reverseStatusMap(rawStatus, config.statusMap);

  // 우선순위
  const priorityFieldName = config.fields.priority.name;
  const priorityType = config.fields.priority.type;
  const priority = props[priorityFieldName]?.[priorityType]?.name || '';

  // 상위 항목
  const parentFieldName = config.fields.parent.name;
  const parentId = props[parentFieldName]?.relation?.[0]?.id || null;

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

/**
 * Notion 실제 상태값 → canonical 상태값으로 역매핑
 */
function reverseStatusMap(notionValue, statusMap) {
  for (const [canonical, notion] of Object.entries(statusMap)) {
    if (notion === notionValue) return canonical;
  }
  return notionValue; // 매핑 없으면 원본 반환
}

/**
 * rich_text property에서 텍스트 추출
 */
function extractRichText(richTextProp) {
  if (!richTextProp?.rich_text) return null;
  return richTextProp.rich_text.map(t => t.plain_text).join('') || null;
}

/**
 * CanonicalTask 배열을 계층 트리로 변환
 * @param {Array} tasks - flat CanonicalTask[]
 * @param {number} maxDepth - 최대 깊이 (-1 = 무한)
 * @returns {Array} 트리 구조 [{...task, depth, children}]
 */
export function buildTaskTree(tasks, maxDepth = -1) {
  const taskMap = new Map();
  tasks.forEach(t => taskMap.set(t.id, { ...t, children: [], depth: 0 }));

  const roots = [];

  for (const node of taskMap.values()) {
    if (node.parentId && taskMap.has(node.parentId)) {
      const parent = taskMap.get(node.parentId);
      node.depth = parent.depth + 1;
      if (maxDepth === -1 || node.depth <= maxDepth) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // 깊이 재계산 (부모가 root에서 멀리 있는 경우)
  function setDepth(node, d) {
    node.depth = d;
    node.children.forEach(c => setDepth(c, d + 1));
  }
  roots.forEach(r => setDepth(r, 0));

  return roots;
}
