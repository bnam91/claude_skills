import { getChildren, appendBlocks } from './notion_api.js';

const TODAY = '3.4';

// 실제 콜아웃 IDs (pm-gg.md 기준)
const REAL = {
  현빈02: '2f1111a577888127951bc2b17188efff',
  지혜:   '2f1111a5778881e0b79eec85bbc540c5',
};

// 임시 콜아웃 IDs (pm.md 기준)
const TEMP = {
  현빈02: '317111a5778880629606f53db233f88d',
  지혜:   '317111a577888034aca6dba69a9c3500',
};

async function getOrCreateDateToggle(calloutId, dateLabel) {
  const blocks = await getChildren(calloutId);
  const existing = blocks.find(b =>
    b[b.type]?.rich_text?.map(r => r.plain_text).join('') === dateLabel
  );
  if (existing) return existing.id;

  // 없으면 생성
  const res = await appendBlocks(calloutId, [{
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: [{ type: 'text', text: { content: dateLabel } }],
      children: [],
    },
  }]);
  return res.results[0].id;
}

async function copyTasksToReal(tempCalloutId, realCalloutId, name) {
  // temp에서 오늘 토글 찾기
  const tempBlocks = await getChildren(tempCalloutId);
  const tempToggle = tempBlocks.find(b =>
    b[b.type]?.rich_text?.map(r => r.plain_text).join('').includes(TODAY)
  );
  if (!tempToggle) { console.log(`[${name}] 임시 콜아웃에 ${TODAY} 토글 없음`); return; }

  // 토글 안의 task 블록들 읽기
  const tasks = await getChildren(tempToggle.id);

  // 각 task의 children도 읽기
  const taskBlocks = [];
  for (const task of tasks) {
    let children = [];
    if (task.has_children) {
      const taskChildren = await getChildren(task.id);
      // toggle > bulleted + paragraph 구조
      for (const tc of taskChildren) {
        let tcChildren = [];
        if (tc.has_children) {
          const inner = await getChildren(tc.id);
          tcChildren = inner.map(i => ({
            object: 'block',
            type: i.type,
            [i.type]: { rich_text: i[i.type]?.rich_text || [] },
          }));
        }
        children.push({
          object: 'block',
          type: tc.type,
          [tc.type]: {
            rich_text: tc[tc.type]?.rich_text || [],
            ...(tcChildren.length > 0 ? { children: tcChildren } : {}),
          },
        });
      }
    }
    taskBlocks.push({
      object: 'block',
      type: task.type,
      [task.type]: {
        rich_text: task[task.type]?.rich_text || [],
        checked: false,
        ...(children.length > 0 ? { children } : {}),
      },
    });
  }

  // 실제 콜아웃에 오늘 토글 찾거나 생성
  const realToggleId = await getOrCreateDateToggle(realCalloutId, TODAY);

  // 전송
  await appendBlocks(realToggleId, taskBlocks);
  console.log(`[${name}] ✅ ${taskBlocks.length}개 업무 전송 완료`);
}

await copyTasksToReal(TEMP.현빈02, REAL.현빈02, '현빈02');
await copyTasksToReal(TEMP.지혜,   REAL.지혜,   '지혜');
