/**
 * update-builder.js — CanonicalUpdate → Notion API properties 변환
 */

/**
 * @param {object} canonicalUpdate - { title, status, priority, parentId, deadline, output, issueNote }
 * @param {object} config - 프로젝트 config
 * @returns {object} Notion API properties payload
 */
export function buildNotionUpdate(canonicalUpdate, config) {
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
