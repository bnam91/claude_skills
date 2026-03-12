import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';

const envRaw = readFileSync(path.join(os.homedir(), 'Documents/claude_skills/.env'), 'utf8');
const apiKey = envRaw.match(/NOTION_API_KEY=(.+)/)[1].trim();
const PAGE_ID = '321111a5-7788-812f-9204-ffac743a6a11';

const res = await fetch(`https://api.notion.com/v1/blocks/${PAGE_ID}/children`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  },
  body: JSON.stringify({
    children: [
      // 📋 Framework
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📋 Framework' } }] } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '[사업가] 프로젝트 목표 및 요구사항 정의 (Claude Code와 대화 → .md 저장)' } }], checked: true } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '[실무자] Notion Projects DB 구조 설계' } }], checked: true } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '[실무자] Projects DB 생성 (필드: 프로젝트명/상태/현재단계/다음할일/블로커/마지막세션)' } }], checked: true } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '[실무자] 첫 프로젝트 row 추가 테스트' } }], checked: true } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '[실무자] 프로젝트 페이지 내부 Framework 체크리스트 템플릿 구성' } }], checked: false } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '[실무자] 세션 시작 시 자동으로 컨텍스트 읽는 스킬 연동' } }], checked: false } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '[관리자] 전체 흐름 검수 - 사업가가 DB만 보고 현황 파악 가능한지 확인' } }], checked: false } },

      // 📝 세션 로그
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📝 세션 로그' } }] } },
      {
        object: 'block', type: 'toggle',
        toggle: {
          rich_text: [{ text: { content: '2026-03-13 | DB 구조 설계 및 생성' } }],
          children: [
            { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: '✅ 한 것: Projects DB 구조 확정 (DB 1개 + 페이지 내부 구조), DB 생성, 첫 row 추가' } }] } },
            { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: '➡️ 다음: Framework 체크리스트 템플릿 구성, 세션 시작 스킬 연동' } }] } },
            { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: '💬 결정사항: DB 4개 → 1개로 단순화. 나머지는 페이지 내부 토글로 관리' } }] } }
          ]
        }
      },

      // ✅ 검수
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '✅ 검수' } }] } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: 'Projects DB에서 전체 프로젝트 현황 한눈에 파악 가능한가' } }], checked: false } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: 'Claude Code 재시작 시 "다음할일" 필드만 읽으면 즉시 작업 재개 가능한가' } }], checked: false } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '🔴 스톱 상태가 사업가에게 명확히 전달되는가' } }], checked: false } },
      { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: '사업가/실무자/관리자 역할 구분이 체크리스트에 명시되어 있는가' } }], checked: false } }
    ]
  })
});

const data = await res.json();
if (!res.ok) console.error(JSON.stringify(data));
else console.log('✅ 템플릿 추가 완료');
