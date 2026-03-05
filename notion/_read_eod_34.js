import { getChildren } from './notion_api.js';

const targets = [
  ['현빈02', '2f1111a577888127951bc2b17188efff'],
  ['지혜',   '2f1111a5778881e0b79eec85bbc540c5'],
  ['지혜 업무코멘트', '317111a5778880669d83c48e88d71b22'],
];

for (const [name, id] of targets) {
  console.log(`\n=== ${name} ===`);
  const children = await getChildren(id);

  const toggle34 = children.find(b => {
    const text = b.toggle?.rich_text?.map(t => t.plain_text).join('')
              || b.heading_3?.rich_text?.map(t => t.plain_text).join('') || '';
    return text.includes('3.4') || text.includes('3/4');
  });

  if (!toggle34) {
    console.log('3.4 토글 없음. 최근 항목:');
    children.slice(-3).forEach(b => {
      const text = b.toggle?.rich_text?.map(t => t.plain_text).join('')
                || b.paragraph?.rich_text?.map(t => t.plain_text).join('')
                || b.heading_3?.rich_text?.map(t => t.plain_text).join('') || '';
      if (text) console.log('  - ' + text);
    });
    continue;
  }

  const sub = await getChildren(toggle34.id);
  sub.forEach(b => {
    const text = b.to_do?.rich_text?.map(t => t.plain_text).join('')
              || b.paragraph?.rich_text?.map(t => t.plain_text).join('')
              || b.bulleted_list_item?.rich_text?.map(t => t.plain_text).join('') || '';
    const checked = b.to_do?.checked;
    if (text) console.log(`  ${checked !== undefined ? (checked ? '✅' : '⬜') : '📌'} ${text}`);
  });
}
