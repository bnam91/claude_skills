import { getChildren } from './notion_api.js';

async function printTree(blockId, depth = 0) {
  const blocks = await getChildren(blockId);
  for (const b of blocks) {
    const text = b[b.type]?.rich_text?.map(r => r.plain_text).join('') || '';
    const checked = b.type === 'to_do' ? (b.to_do.checked ? '[x]' : '[ ]') : '';
    console.log('  '.repeat(depth) + '[' + b.type + '] ' + checked + ' ' + text.substring(0, 100));
    if (b.has_children) await printTree(b.id, depth + 1);
  }
}

const 현빈임시 = '317111a5778880629606f53db233f88d';
const 지혜임시 = '317111a577888034aca6dba69a9c3500';

console.log('=== 현빈02 임시 콜아웃 ===');
const h = await getChildren(현빈임시);
const h34 = h.find(b => b[b.type]?.rich_text?.map(r => r.plain_text).join('').includes('3.4'));
if (h34) await printTree(h34.id);
else console.log('3.4 토글 없음');

console.log('\n=== 지혜 임시 콜아웃 ===');
const j = await getChildren(지혜임시);
const j34 = j.find(b => b[b.type]?.rich_text?.map(r => r.plain_text).join('').includes('3.4'));
if (j34) await printTree(j34.id);
else console.log('3.4 토글 없음');
