/**
 * query-builder.js — CanonicalFilter → Notion API filter 변환
 */

/**
 * @param {object} canonicalFilter - { status, priority, hasParent, deadline }
 * @param {object} config - 프로젝트 config (gg.json 등)
 * @returns {object} Notion API query body ({ filter: ... })
 */
export function buildNotionFilter(canonicalFilter, config) {
  const conditions = [];

  // status 필터
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

  // priority 필터
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

  // hasParent 필터
  if (canonicalFilter.hasParent !== undefined) {
    const parentField = config.fields.parent;
    if (canonicalFilter.hasParent) {
      conditions.push({
        property: parentField.name,
        relation: { is_not_empty: true }
      });
    } else {
      conditions.push({
        property: parentField.name,
        relation: { is_empty: true }
      });
    }
  }

  // deadline 필터 (해당 필드 없는 프로젝트는 건너뜀)
  if (canonicalFilter.deadline && config.fields.deadline) {
    const deadlineField = config.fields.deadline;
    const dateFilter = { property: deadlineField.name, date: {} };
    if (canonicalFilter.deadline.before) {
      dateFilter.date.before = canonicalFilter.deadline.before;
    }
    if (canonicalFilter.deadline.after) {
      dateFilter.date.on_or_after = canonicalFilter.deadline.after;
    }
    if (Object.keys(dateFilter.date).length > 0) {
      conditions.push(dateFilter);
    }
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return { filter: conditions[0] };
  return { filter: { and: conditions } };
}
