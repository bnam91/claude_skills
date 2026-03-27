/**
 * formatter.js — CanonicalTask → Notion 블록 변환 (포맷 표준 적용)
 *
 * format-standard.md 규격 준수:
 * - 날짜: M.D (점 구분, 앞자리 0 생략)
 * - 톤: 서술형 존댓말 통일
 * - 긴급도: 🚨블로킹 / 🔴긴급 / 🟡중요 / (없음)일반
 * - 블록 구조: 날짜토글 → ☐ **업무명** → 내용: 토글 → 인풋+아웃풋+📍
 */

// ─── 유틸 ───

/**
 * Date → M.D 포맷 (앞자리 0 생략)
 */
export function formatDate(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 요일 약어
 */
export function formatDayOfWeek(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

/**
 * urgency 값 → 이모지
 */
export function formatUrgencyMarker(urgency) {
  const map = { blocking: '🚨', red: '🔴', yellow: '🟡', green: '' };
  return map[urgency] || '';
}

// ─── 단계명 해석 ───

/**
 * config.prioritySemantics에 따라 우선순위를 단계명으로 변환
 */
export function resolveStageName(priority, config) {
  if (config.prioritySemantics === 'stage') {
    const stageMap = {
      '1': '1단계: 시장 발굴 및 기획',
      '2': '2단계: 상품 소싱',
      '3': '3단계: 런칭 준비',
      '4': '4단계: 상품 입고',
      '5': '5단계: 상품 등록',
      '6': '6단계: 마케팅'
    };
    return stageMap[priority] || priority;
  }
  if (config.prioritySemantics === 'week') {
    return `${priority}주차`;
  }
  return `우선순위 ${priority}`;
}

// ─── Notion 블록 빌더 ───

function textBlock(type, content, annotations = {}) {
  return {
    object: 'block', type,
    [type]: {
      rich_text: [{ type: 'text', text: { content }, annotations }]
    }
  };
}

function heading2(text) { return textBlock('heading_2', text); }
function heading3(text) { return textBlock('heading_3', text); }
function paragraph(text) { return textBlock('paragraph', text); }
function bullet(text) { return textBlock('bulleted_list_item', text); }

function callout(text, emoji = '💡', color = 'gray_background') {
  return {
    object: 'block', type: 'callout',
    callout: {
      rich_text: [{ type: 'text', text: { content: text } }],
      icon: { type: 'emoji', emoji }, color
    }
  };
}

function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}

// ─── 업무요청 블록 ───

/**
 * 단일 업무를 표준 블록 구조로 변환
 * @param {object} task - { title, urgency?, input?, output?, instruction?, note? }
 * @returns {object} Notion to_do 블록
 */
export function formatTaskBlock(task) {
  const marker = task.urgency ? formatUrgencyMarker(task.urgency) + ' ' : '';
  const children = [];

  // 내용: 토글 (📍 → 인풋 → 아웃풋 순서)
  const toggleChildren = [];
  if (task.instruction) {
    toggleChildren.push(paragraph(`📍 ${task.instruction}`));
  }
  if (task.input) {
    toggleChildren.push(bullet(`인풋 : ${task.input}`));
  }
  if (task.output) {
    toggleChildren.push(bullet(`아웃풋 : ${task.output}`));
  }
  if (task.note) {
    toggleChildren.push(paragraph(task.note));
  }

  if (toggleChildren.length > 0) {
    children.push({
      object: 'block', type: 'toggle',
      toggle: {
        rich_text: [{ type: 'text', text: { content: '내용:' } }],
        children: toggleChildren
      }
    });
  }

  return {
    object: 'block', type: 'to_do',
    to_do: {
      rich_text: [{
        type: 'text',
        text: { content: `${marker}${task.title}` },
        annotations: { bold: true }
      }],
      checked: false,
      children
    }
  };
}

/**
 * 날짜 토글 + 업무 블록들
 * @param {string} date - ISO date string
 * @param {Array} taskBlocks - formatTaskBlock() 결과 배열
 * @returns {object} Notion toggle 블록
 */
export function formatDateToggle(date, taskBlocks) {
  return {
    object: 'block', type: 'toggle',
    toggle: {
      rich_text: [{ type: 'text', text: { content: formatDate(date) } }],
      children: taskBlocks
    }
  };
}

// ─── 브리핑 포맷 ───

/**
 * 아침 브리핑 Notion 블록 배열 생성
 * @param {object} data - { project, date, dday, currentStage, blocking, memberTasks, pmComment }
 * @returns {Array} Notion 블록 배열
 */
export function formatMorningBriefing(data) {
  const blocks = [];
  const dateStr = formatDate(data.date);
  const dayStr = formatDayOfWeek(data.date);
  const ddayStr = data.dday >= 0 ? `D-${data.dday}` : `D+${Math.abs(data.dday)}`;

  // 헤더
  blocks.push(paragraph(`📍 현재 단계: ${data.currentStage.name} (${data.currentStage.progress}%)`));
  blocks.push(paragraph(`${ddayStr} (${dateStr} ${dayStr} 기준)`));

  // 블로킹
  if (data.blocking && data.blocking.length > 0) {
    blocks.push(divider());
    blocks.push(heading3('🚨 블로킹'));
    data.blocking.forEach(item => {
      blocks.push(bullet(`${item.title} — ${item.reason}. ${item.resolution || ''}`));
    });
  }

  // 담당자별 배정
  blocks.push(divider());
  blocks.push(heading3('📋 오늘 배정'));

  for (const [memberName, tasks] of Object.entries(data.memberTasks || {})) {
    blocks.push(paragraph(`[${memberName}]`));
    tasks.forEach(t => {
      const marker = t.urgency ? formatUrgencyMarker(t.urgency) + ' ' : '';
      blocks.push(bullet(`${marker}${t.title} — ${t.summary || ''}`));
    });
  }

  // PM 코멘트
  blocks.push(divider());
  blocks.push(heading3('💬 PM 코멘트'));
  blocks.push(paragraph(data.pmComment || ''));

  return blocks;
}

/**
 * 마감 브리핑 Notion 블록 배열 생성
 * @param {object} data - { project, date, dday, completed, incomplete, blocking, tomorrowPriority, pmComment }
 * @returns {Array} Notion 블록 배열
 */
export function formatEodBriefing(data) {
  const blocks = [];

  // 오늘 결과
  blocks.push(heading3('📊 오늘 결과'));

  if (data.completed && data.completed.length > 0) {
    blocks.push(paragraph(`✅ 완료: ${data.completed.length}건`));
    data.completed.forEach(t => {
      blocks.push(bullet(`${t.title} — ${t.summary || ''}`));
    });
  }

  if (data.incomplete && data.incomplete.length > 0) {
    blocks.push(paragraph(`⬜ 미완료: ${data.incomplete.length}건`));
    data.incomplete.forEach(t => {
      blocks.push(bullet(`${t.title} — ${t.reason || ''}`));
    });
  }

  // 잔여 블로킹
  if (data.blocking && data.blocking.length > 0) {
    blocks.push(divider());
    blocks.push(heading3('🚨 잔여 블로킹'));
    data.blocking.forEach(item => {
      blocks.push(bullet(`${item.title} — ${item.status || ''}`));
    });
  }

  // 내일 우선순위
  blocks.push(divider());
  blocks.push(heading3('📌 내일 우선순위'));
  (data.tomorrowPriority || []).forEach((t, i) => {
    blocks.push(bullet(`${i + 1}. ${t}`));
  });

  // PM 총평
  blocks.push(divider());
  blocks.push(heading3('💬 PM 총평'));
  blocks.push(paragraph(data.pmComment || ''));

  return blocks;
}

/**
 * 주간 브리핑 Notion 블록 배열 생성
 * @param {object} data - { project, dday, currentStage, blocking, weeklyGoals, nextTasks, supportNeeded, pmComment }
 * @returns {Array} Notion 블록 배열
 */
export function formatWeeklyBriefing(data) {
  const blocks = [];
  const ddayStr = data.dday >= 0 ? `D-${data.dday}` : `D+${Math.abs(data.dday)}`;

  blocks.push(paragraph(`📍 현재 단계: ${data.currentStage.name} (전체 ${data.currentStage.total}단계 중 ${data.currentStage.number}단계)`));
  blocks.push(paragraph(`진행률: ${data.currentStage.progress}%`));

  if (data.blocking && data.blocking.length > 0) {
    blocks.push(divider());
    blocks.push(heading3('🚨 블로킹 이슈'));
    data.blocking.forEach(item => {
      blocks.push(bullet(`${item.title} — ${item.reason}`));
    });
  }

  blocks.push(divider());
  blocks.push(heading3('🔄 이번주 집중 목표'));
  (data.weeklyGoals || []).forEach(g => {
    blocks.push(bullet(`${g.title} — ${g.target || ''}`));
  });

  blocks.push(divider());
  blocks.push(heading3('📌 다음 착수 예정'));
  (data.nextTasks || []).forEach(t => {
    blocks.push(bullet(t));
  });

  if (data.supportNeeded && data.supportNeeded.length > 0) {
    blocks.push(divider());
    blocks.push(heading3('👤 현빈 지원 요청'));
    data.supportNeeded.forEach(s => {
      blocks.push(bullet(`${s.title} — ${s.detail}`));
    });
  }

  blocks.push(divider());
  blocks.push(heading3('💬 PM 코멘트'));
  blocks.push(paragraph(`${ddayStr}까지 남음. ${data.pmComment || ''}`));

  return blocks;
}

/**
 * Morning Meeting content (2~4줄 구어체 문자열)
 * @param {object} data - { dday, keyMessage, memberInstructions, riskNote }
 * @returns {string}
 */
export function formatMorningMeetingContent(data) {
  const ddayStr = data.dday >= 0 ? `D-${data.dday}` : `D+${Math.abs(data.dday)}`;
  let content = `${ddayStr}. ${data.keyMessage}\n`;
  if (data.memberInstructions) {
    content += data.memberInstructions.join('\n') + '\n';
  }
  if (data.riskNote) {
    content += data.riskNote;
  }
  return content.trim();
}
