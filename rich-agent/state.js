// rich-agent state — dashboard data source
// 갱신 시 lastUpdated 같이 수정 + 해당 섹션 직접 편집

const STATE = {
  meta: {
    owner: "신현빈",
    target: 100000000000, // 1000억
    targetDate: "2036-03-04",
    startDate: "2026-03-04",
    capital: 50000000, // 5천만 (사업 운영 자본)
    capitalNote: "사업 운영 자본 (발주/광고용)",
    lastUpdated: "2026-04-29"
  },

  // ──────────────────────────────────────────
  // 원씽 — 올해 가장 중요한 한 가지
  // ──────────────────────────────────────────
  oneThing: {
    goal: "소문의섬 구독자 10만명",
    why: "마케팅 채널 = SaaS·강의·기타 셀러 모집의 모든 통로. 광고비 0의 자체 자산.",
    deadline: "2026-12-31",
    target: 100000,
    current: 23,
    note: "현재 구독자 수 미입력 — state.js의 oneThing.current 갱신 시 진행률 자동 반영"
  },

  // 올해 필수 미션 — 원씽 다음 우선순위
  mustHave: [
    { icon: "🪄", title: "상페마법사 앱 프로그램 완성", detail: "MVP 마무리 (현 72%) + 유료 전환 가능 상태로" },
    { icon: "🛒", title: "커머스 시스템 구축",         detail: "월 200만 나오는 상품 발굴 → 2주에 1개 업로드 자동 사이클" },
    { icon: "🛠", title: "마케팅 지원 프로그램 3종 완성", detail: "셀러 대상 도구 3개 / 크몽 판매 + 소문의섬 홍보" }
  ],

  // 다음 영입 (시점 미정 — 매출/시스템 안정 후)
  hiring: [
    { role: "영상편집자", priority: 1, reason: "소문의섬 콘텐츠 볼륨 확대 → 원씽 10만 구독 달성에 직결", trigger: "주 2편 페이스가 본인 한계일 때" },
    { role: "디자이너",   priority: 2, reason: "상페 디자인 + SaaS UI + 마케팅 자료",                  trigger: "SaaS 유료 전환 시작 시점" }
  ],

  // ──────────────────────────────────────────
  // 1000억 작전 / 개요
  // ──────────────────────────────────────────
  strategy: {
    annual: {
      title: "2026 연간 작전",
      summary: "12월 31일 풀가동 시스템 = 월 1.4억 순익 + Q4 강의 5천만",
      pillars: [
        {
          icon: "🛒",
          title: "커머스가 메인 엔진",
          detail: "20 SKU 시스템화 (2주에 1개) · 12월 월 순익 1억 · 시즌 SKU 1~2개 폭발이 핵심"
        },
        {
          icon: "🎬",
          title: "소문의섬 = 마케팅 채널",
          detail: "셀러 대상 콘텐츠 / SaaS·강의·크몽 도구 모집 통로 / 광고비 0"
        },
        {
          icon: "💎",
          title: "SaaS·강의·기타 = 폭발 트리거",
          detail: "SaaS 월 3천 + 기타 월 1천 + Q4 강의 5천만 / 커머스 잘되면 강의 의미 ↑"
        }
      ],
      principles: [
        "매출이 먼저, 자본은 나중 (부족분은 외부 차입)",
        "펭귄날다 ≠ 커머스 전체 (자체 브랜드 중 하나일 뿐)",
        "마케팅 대행 신규 수주 X (팔도만 유지)",
        "현빈의 시간 = 콘텐츠에만",
        "현재 분배는 최소값 — 더 잘 나올 수 있다"
      ]
    },
    monthly: {
      month: "2026-05",
      title: "5월 작전 — 도미노 방지 (원씽 시작 + MVP 마무리)",
      summary: "5월 안 못 풀면 12월 목표 붕괴. 원씽·MVP 두 트랙이 핵심. 나머지는 후순위.",
      pillars: [
        {
          icon: "🎬",
          title: "🔴 1순위 — 원씽 시작",
          detail: "소문의섬 P1 시작. 첫 1편 (이번주!) → 5월 4편 / 6월 4편 = P1 8편 완성"
        },
        {
          icon: "🪄",
          title: "🔴 2순위 — MVP 100%",
          detail: "상페마법사 28% 마무리. 결제·라이센스·베타 페이지까지. 6월 베타 시작 트리거"
        },
        {
          icon: "🛒",
          title: "🔴 3순위 — 커머스 페이스 정착",
          detail: "두더지 입고+등록 / 무릎 본품 발주 / 햇빛 평가 / 신규 SKU 1개 발주"
        }
      ],
      keyMissions: [
        "🔴 [원씽] 소문의섬 첫 영상 업로드 (이번주 안!)",
        "🔴 [원씽] 5월 영상 4편 완성 + 댓글 응답 100%",
        "🔴 [MVP] 상페마법사 남은 28% 완성 (Step 3-A)",
        "🔴 [MVP] 결제 시스템 연동 (토스/스트라이프)",
        "🔴 [MVP] 베타 신청 페이지 + 알파 테스트",
        "🔴 [커머스] 두더지퇴치기 입고 (5/20) + 등록 + 광고 ON",
        "🔴 [커머스] 무릎보호대 본품 발주 (5월 초)",
        "🔴 [커머스] 햇빛가리개 샘플 평가 → 본품 발주 결정",
        "🟡 [커머스] 신규 SKU 1개 발굴·발주 (5월말, 페이스 시작)",
        "🟡 [도구] 셀러 도구 #2·#3 후보 확정",
        "🟡 [자본] 6월 외부 자금 트리거 검토 (사업자 카드/대출)",
        "⚫ 5월 안 결정 보류: 강의 주제, 광고마법사 가격, 노션 대시보드 GO"
      ],
      blockers: [
        "소문의섬 시작 안 함 → 원씽 미달 → 모든 마케팅 약함",
        "MVP 정체 (3-31 마지막 세션, 30일 멈춤) → 베타 일정 밀림",
        "신규 SKU 페이스 미시작 → 12월 매출 4억 미달"
      ],
      capitalForecast: "5월 말 잔여 자본 약 1,250만 → 6월 외부 자금 1억+ 트리거 검토",
      decisions: [
        { item: "셀러 도구 #2,#3", deadline: "5월 말", options: "소싱/리뷰/광고마법사/노션 중 2개" },
        { item: "강의 주제", deadline: "Q3 시작 전", options: "커머스 500만 / 디자인 200만 / 코딩 200만" },
        { item: "광고마법사 가격 모델", deadline: "후보 확정 시", options: "단발 / 월 구독 / 강의 패키지" }
      ]
    }
  },

  // ──────────────────────────────────────────
  // 주간 / 월간 — 자주 갱신
  // ──────────────────────────────────────────
  weekly: {
    weekOf: "2026-04-27",
    label: "2026 W18 (4/27~5/3)",
    goals: [
      { task: "두더지퇴치기 300개 발주 (완료 4/29)", done: true, priority: "🔴", project: "커머스" },
      { task: "햇빛가리개 샘플 주문 (4/29 완료) → 도착 후 평가", done: true, priority: "🔴", project: "커머스" },
      { task: "무릎보호대 본품 주문", done: false, priority: "🔴", project: "커머스" },
      { task: "유튜브 2편 업로드 (소문의섬)", done: false, priority: "🔴", project: "콘텐츠" },
      { task: "두더지 NotebookLM 결제방법 확인", done: false, priority: "🔴", project: "커머스" },
      { task: "유트랜스퍼 가입 (지혜/수지)", done: false, priority: "🟡", project: "운영" },
      { task: "카페24 세금계산서 발행 요청 (지혜)", done: false, priority: "🟡", project: "운영" }
    ]
  },

  monthly: {
    month: "2026-04",
    target: 10000000, // 4월: 준비 단계 (1천만, 매출 거의 없음)
    actual: null,
    note: "Q2 준비 단계 — 매출 거의 없음 / 발주 + 세팅에 집중",
    keyMilestones: [
      "두더지/무릎/햇빛가리개 발주 트랙 확정",
      "유트랜스퍼 사업자 가입 (월드퍼스트 대안)",
      "유튜브 채널 본격 가동 시작"
    ]
  },

  // 다음 큰 마일스톤
  nextMilestone: {
    title: "⭐ 펭귄날다 판매재개 (재등록 + 로켓그로스 입고)",
    targetDate: "2026-05-08",
    blocker: "피에스팀 단가 확인 → 반출지 결정 (피에스 vs 27호)"
  },

  // ──────────────────────────────────────────
  // 2026 분기/월/수익원
  // ──────────────────────────────────────────
  year2026: {
    target: 1000000000, // 10억
    quarters: [
      { name: "Q1", months: "1~3월", target: 50000000,  actual: null, phase: "지남", note: "이미 경과 — 실적 미정" },
      { name: "Q2", months: "4~6월", target: 50000000,  actual: null, phase: "준비", note: "발주/세팅 — 매출 거의 없음 / 6월 첫 매출 시작" },
      { name: "Q3", months: "7~9월", target: 400000000, actual: null, phase: "수확", note: "본격 매출 — SKU 회전 + 시즌 + 유튜브" },
      { name: "Q4", months: "10~12월", target: 500000000, actual: null, phase: "피크", note: "연말 커머스 + SaaS 유료 + 강의 폭발" }
    ],
    monthlyRamp: [
      { m: "1월", t: 10, phase: "지남" }, { m: "2월", t: 15, phase: "지남" }, { m: "3월", t: 25, phase: "지남" },
      { m: "4월", t: 10, phase: "준비" }, { m: "5월", t: 15, phase: "준비" }, { m: "6월", t: 25, phase: "준비" },
      { m: "7월", t: 80, phase: "수확" }, { m: "8월", t: 130, phase: "수확" }, { m: "9월", t: 190, phase: "수확" },
      { m: "10월", t: 170, phase: "피크" }, { m: "11월", t: 170, phase: "피크" }, { m: "12월", t: 160, phase: "피크" }
    ],
    // 마케팅 대행은 안 함 (사용자 결정 2026-04-29)
    // 12.31 풀가동 기준 월 순익 + 6개월 점진 증가 누적 (최소값)
    revenueMix: [
      { src: "커머스 (자체 브랜드 20 SKU)", monthlyAtPeak: 100, profit6m: 310, note: "12월 풀가동 = 월 순익 1억 / 7월부터 점진 증가" },
      { src: "강의 (유튜브 강의)",        monthlyAtPeak: null, profit6m: 50,  note: "Q4 1회 · 10명 × 500만 = 5천만 단발" },
      { src: "SaaS (상페마법사)",          monthlyAtPeak: 30,  profit6m: 80,  note: "12월 풀가동 = 월 순익 3천 / 점진 가입" },
      { src: "기타 프로그램 (크몽)",       monthlyAtPeak: 10,  profit6m: 30,  note: "12월 풀가동 = 월 순익 1천 / 셀러 도구" }
    ]
    // 합 6개월 순익 누적 = 4.7억 (최소값, 사용자 표현)
    // 실제는 시즌 폭발/광고 효율로 6~10억 가능 ("더 잘 나올 수 있다")
    ,
  },

  // ──────────────────────────────────────────
  // Phase 1 만다라트 — 빈 골격, 사용하면서 채움
  // ──────────────────────────────────────────
  mandalart: {
    center: { title: "2026", subtitle: "10억" },
    // 수익 4 (블루 진→옅, 매출 큰 순) + 운영 4 (회색 진→옅, 중요 순)
    categories: [
      // 수익원 4
      { title: "커머스",      subtitle: "자체 브랜드 20 SKU", amount: 310, kind: "rev", color: "#1e3a8a",
        actions: [
          "올해 신규 20 SKU (2주에 1개)",
          "발주 500만/SKU · 자본 5천만 회전",
          "기존 4: 두더지/무릎/햇빛/펭귄날다",
          "마진 20% 사수 / SKU당 200만 안정",
          "광고 ROAS 4x+ / CTR 1.5%+ / CVR 4%+",
          "100클릭 임계 검증 (1억맵 4주차)",
          "시즌 SKU 1~2개 폭발",
          "12월 매출 4억 / 마진 8천만"
        ] },
      { title: "강의",        subtitle: "Q4 1회 단발",      amount: 50,  kind: "rev", color: "#1d4ed8",
        actions: [
          "Q4 1회 강의 (10명 × 500만 = 5천만)",
          "강의 주제 결정 (커머스/디자인/코딩)",
          "강의 콘텐츠 기획 (Q3 시작)",
          "모집 채널 = 소문의섬 P3~P4",
          "후기/사례 영상화",
          "2027 정기 강의화 검토",
          "", ""
        ] },
      { title: "SaaS",        subtitle: "상페마법사",       amount: 80,  kind: "rev", color: "#2563eb",
        actions: [
          "MVP 완성 (현 72% → 100%)",
          "결제 시스템 (토스/스트라이프)",
          "4 플랜: Free / Lite 2만 / Pro 14만 / Pro Max 32만",
          "P2 베타 50계정 (7~9월)",
          "P3 유료 전환 150계정 (10~11월)",
          "P4 풀가동 300계정 = 월 3천만",
          "소문의섬 마케팅 (구독자 먼저 오픈)",
          "디자이너 영입 (P4 시점)"
        ] },
      { title: "기타 프로그램", subtitle: "셀러 도구 3종",   amount: 30,  kind: "rev", color: "#3b82f6",
        actions: [
          "쿠팡/네이버 재고 모니터링 (월 10만, 1순위)",
          "후보 2: 소싱/리뷰/광고마법사/노션대시보드 중 선택",
          "후보 3: 동일 풀에서 선택",
          "크몽 등록 (kmong-manager)",
          "소문의섬 홍보 (시연 영상)",
          "월 5만+ = 월 구독 / 5만 미만 = 연간권",
          "12월 월 1천만 도달",
          ""
        ] },
      // 운영 4
      { title: "소문의섬",    subtitle: "원씽 = 10만 구독",  amount: null,    kind: "ops", color: "#374151",
        actions: [
          "원씽: 12.31까지 구독자 10만",
          "주 2편 업로드 (P1부터)",
          "영상 구조: 훅→공감→컨셉→시연→현황→CTA",
          "P1~P2 시그니처 자리잡기 (5~9월, 1만)",
          "P3 베타 공개 = SaaS 시드 (10~11월, 3만)",
          "P4 정식 출시 = 폭발 (12월, 10만)",
          "11월 말 역전야매 확장 GO 점검",
          "댓글 응답 100% (P1 한정)"
        ] },
      { title: "콘텐츠 시간", subtitle: "사수",            amount: null,    kind: "ops", color: "#4b5563",
        actions: [
          "오전 2시간 블록 (콘텐츠 전용)",
          "🔵 작업 일 2시간 상한",
          "새벽 1시 후 신규 작업 금지",
          "코딩이 콘텐츠 침범 시 즉시 경고",
          "주 4편+ 콘텐츠 페이스",
          "흥미 없는 업무 ⚫ 거절",
          "", ""
        ] },
      { title: "팀 시스템",  subtitle: "위임/영입",        amount: null,    kind: "ops", color: "#6b7280",
        actions: [
          "지혜 업무 위임 (운영/등록)",
          "수지 업무 위임",
          "노션 업무요청 정착 (notion_task_manager)",
          "1순위 영입: 영상편집자 (9~10월)",
          "2순위 영입: 디자이너 (SaaS P4)",
          "마케팅 대행 신규 X (팔도 베이스만)",
          "마감 브리핑 (pm_eod)",
          ""
        ] },
      { title: "ADHD 루틴",  subtitle: "정착",            amount: null,    kind: "ops", color: "#9ca3af",
        actions: [
          "1000억보드 매일 확인 (오전)",
          "미리알림 깃발 = 🔴 동기화",
          "/task_today 매일 사용",
          "주간 목표 3개 확정 (월요일)",
          "분기 점검 (state.js 갱신)",
          "월 1회 만다라트 점검",
          "", ""
        ] }
    ]
  },

  // ──────────────────────────────────────────
  // 유튜브 로드맵 — 소문의섬 → 역전야매 확장
  // ──────────────────────────────────────────
  youtubeRoadmap: {
    primary: {
      name: "소문의섬",
      target: "구독자 10만 (원씽)",
      currentSubscribers: 23,
      targetSubscribers: 100000,
      tone: "직설, 친근, 허세 X, 본질만",
      videoStructure: ["훅", "문제 공감", "컨셉 한 줄", "시연/본론", "현황/맥락", "CTA"]
    },
    secondary: {
      name: "역전야매치트키",
      expansionStart: "2026-11 말 (4 신호 점검)",
      fullLaunch: "2027-01",
      tone: "자비스/알프레드, 비전공자 눈높이, 감탄/감동",
      taglines: ["고치트", "매치트"]
    },
    goSignals: [
      { signal: "소문의섬 구독자 10,000+ 안정", status: "대기", expectedDate: "2026-09" },
      { signal: "영상편집자 영입 완료",          status: "대기", expectedDate: "2026-09~10" },
      { signal: "SaaS 베타 50계정 확보",         status: "대기", expectedDate: "2026-11" },
      { signal: "본업 시간 주 5시간+ 여유",      status: "대기", expectedDate: "2026-11" }
    ],
    phases: [
      {
        id: 1, name: "시그니처 확립", period: "5~6월", subscribersRange: [0, 1000],
        currentPhase: true,
        somun: ["영상 구조 템플릿 검증 (훅→공감→컨셉→시연→현황→CTA)", "첫 8~10편 업로드 (꿀팁 + 고디터 개발 시작)", "댓글 응답 100% (초기 팬 확보)", "주 2편 페이스 시작"],
        yeokjeon: []
      },
      {
        id: 2, name: "시리즈 자리잡기", period: "7~9월", subscribersRange: [1000, 10000],
        somun: ["주 2편 안정 페이스", "1~2편 알고리즘 적중 (썸네일/제목 실험)", "SEO 키워드 발굴", "고디터 신기능 공개 시리즈", "셀러 인터뷰 시리즈 시도"],
        yeokjeon: []
      },
      {
        id: 3, name: "베타 공개 + 확장 셋업", period: "10~11월", subscribersRange: [10000, 30000],
        somun: ["상페마법사 클로즈 베타 공개", "'구독자 먼저 오픈' CTA 전환", "베타 50계정 확보 = SaaS 시드", "사용자 후기/케이스 영상"],
        yeokjeon: ["채널 개설 (11월 말, 4 신호 GO 시)", "닉네임 확정 (고치트/매치트)", "포맷 기획 + 첫 영상 촬영"]
      },
      {
        id: 4, name: "정식 출시 폭발", period: "12월", subscribersRange: [30000, 100000],
        somun: ["정식 출시 영상 1~2편 (초대형)", "연말 결산 / Best 사례", "광고 푸시 (필요 시)", "100명 → 500명 사용자 확장"],
        yeokjeon: ["첫 콘텐츠 1~2편 업로드", "2027 본격 운영 준비"]
      }
    ]
  },

  // ──────────────────────────────────────────
  // SaaS 로드맵 — 상페마법사 (월 순익 3천만)
  // ──────────────────────────────────────────
  saasRoadmap: {
    product: "상페마법사 (고디터)",
    targetMonthlyProfit: 30000000, // 3천만/월
    pricing: "월 2만~32만 (Pro 월 14만 메인)",
    targetAccountsAtPeak: 300,
    currentAccounts: 0,
    mvpProgress: 72, // %
    keyKPIs: [
      "MVP 완성률 (현재 72%)",
      "베타 가입자 수",
      "유료 전환율",
      "월 활성 유료 계정 (MRR)"
    ],
    // 국내 시장 크기 분석
    marketAnalysis: {
      title: "국내 이커머스 셀러 시장 크기 (5인 미만)",
      summary: "TAM 30~40만 (이커머스 한정) / 12월 목표 300계정 = 0.08% 침투 (매우 보수적)",
      macroData: [
        { label: "통신판매업 등록 (활성)", value: "약 50만" },
        { label: "스마트스토어 셀러 (추정)", value: "60~70만" },
        { label: "쿠팡 Wing 셀러 (추정)", value: "30~50만" },
        { label: "카페24 호스팅 셀러", value: "50만+" },
        { label: "활성 셀러 (중복 제거)", value: "약 30~50만" },
        { label: "이커머스 5인 미만 비중", value: "90%+ (≈ 30~45만)" }
      ],
      tamSamSom: [
        { tier: "TAM", label: "이커머스 5인 미만 셀러 + 외주 디자이너", value: "30~40만 명", note: "활성 셀러 + 디자인 외주자" },
        { tier: "SAM", label: "도달 가능 시장", value: "10~15만 명", note: "상세페이지 직접 제작 시도자" },
        { tier: "SOM", label: "3년 확보 가능", value: "1~1.5만 명", note: "마케팅·CTA로 실제 모집" }
      ],
      penetrationScenarios: [
        { rate: "0.08%", accounts: "300",   monthlyRevenue: "4,200만", annual: "5억",   label: "12월 목표" },
        { rate: "0.5%",  accounts: "1,750", monthlyRevenue: "2.4억",   annual: "29억",  label: "1년차 안정" },
        { rate: "0.8%",  accounts: "2,400", monthlyRevenue: "3.4억",   annual: "40억",  label: "⭐ 자연 전환선 (실측 기준)", anchor: true },
        { rate: "1%",    accounts: "3,500", monthlyRevenue: "4.9억",   annual: "59억",  label: "2~3년 도달" },
        { rate: "3%",    accounts: "10,500", monthlyRevenue: "14.7억", annual: "176억", label: "장기 천장" }
      ],
      keyAnchor: {
        title: "⭐ 0.8% 자연 전환 = 2,400명 (연 40억)",
        note: "1,000명 중 8명 (실측 데이터). 이 수준이 마케팅·CTA 없이도 도달 가능한 베이스라인. 마케팅 강화 시 1.5~3% (연 80~150억) 가능"
      },
      vsCompetitor: {
        us:    { name: "상페마법사", tam: "30~40만 (이커머스 셀러)", scope: "5인 미만 이커머스 셀러", price: "월 14만" },
        them:  { name: "미리캔버스",  tam: "5,000만+ (전국민)",       scope: "모든 디자인 사용자",      price: "월 1.49만" }
      },
      insights: [
        "이커머스 셀러 시장 30~40만 — 좁고 명확한 타겟",
        "TAM 대비 침투율 매우 낮음 → 경쟁자 부재",
        "1% 침투 (3,500계정) 시 연 59억 — SaaS 폭발 자산",
        "12월 300계정 = TAM의 0.08%, 매우 보수적 (도달 가능성 99%)",
        "이론 천장: TAM 3% (10,500계정) = 연 176억",
        "이커머스 전용 = 미리캔버스가 못 채우는 깊이 — 1000억 가능 영역 (5~10년)"
      ],
      risks: [
        "미리캔버스가 '셀러 전용 모드' 추가 → 직접 경쟁",
        "AI 상페 자동생성 도구 (찰리 / 씬에브리원 등) 폭발",
        "쿠팡·네이버가 자체 상페 에디터 강화"
      ],
      sources: [
        "통신판매사업자 등록현황 - 공정거래위원회",
        "KOSIS 사업체수 통계",
        "KPMG 한국 이커머스 트렌드 리포트"
      ]
    },

    // 경쟁사 비교 — 미리캔버스
    competitorComparison: {
      competitor: "미리캔버스",
      competitorScale: "가입자 1,000만 / Pro 월 14,900원",
      rows: [
        { item: "타겟",        us: "셀러 전용 (좁고 명확)",     them: "모든 디자인 사용자 (대중)" },
        { item: "Pro 가격 (월)", us: "14만 원",                  them: "14,900 원 (약 1/9)" },
        { item: "사업 모델",   us: "고단가 + 좁은 타겟",         them: "박리다매" },
        { item: "차별점",      us: "커머스 전용 / ROI 명확",     them: "범용 디자인 툴" },
        { item: "도달 목표",   us: "300계정 = 월 3,000만",       them: "1,000만 가입 (이미 점유)" }
      ],
      insights: [
        "상페마법사 Pro = 미리캔버스 Pro의 약 9.4배 단가 — '셀러 전용'이 가격 정당화",
        "셀러는 상페 1개로 매출 회수 → 월 14만 ROI 명확, 가격 저항 ↓",
        "범용 디자인 툴(미리캔버스)이 못 채우는 '커머스 전용 + 고급 기능' 영역",
        "B2B 비즈니스 도구 카테고리 = 가격 저항 ↓ (개인 디자인 툴과 다름)",
        "박리다매 대신 소수 정예 — 300명 × 14만 = 월 3,000만으로 충분한 비즈니스",
        "미리캔버스의 '넓이' vs 상페마법사의 '깊이' — 다른 게임"
      ]
    },

    // Pro 300명 기준 비율 시뮬
    proBasedScenarios: [
      { name: "균형 분포",   note: "가장 현실적", ratio: { lite: 30, pro: 60, proMax: 10 }, recommended: true },
      { name: "Pro 집중",    note: "강한 메인 푸시", ratio: { lite: 15, pro: 75, proMax: 10 } },
      { name: "Lite 多",     note: "저가 진입 자연", ratio: { lite: 50, pro: 40, proMax: 10 } }
    ],

    // 구독자 → 가입자 환산표 (소문의섬 기준)
    subscriberConversion: {
      rate: 0.008,         // 0.8% 구독자 → 누적 가입 전환율
      retention: 0.75,     // 75% Active 유지율
      avgPrice: 140000,    // Pro 평균 (월)
      milestones: [
        { subscribers: 1000 },
        { subscribers: 3000 },
        { subscribers: 5000 },
        { subscribers: 10000, label: "P2 끝" },
        { subscribers: 20000 },
        { subscribers: 30000, label: "P3 끝" },
        { subscribers: 40000 },
        { subscribers: 50000, label: "풀가동" },
        { subscribers: 70000 },
        { subscribers: 100000, label: "원씽" }
      ]
    },
    // 가격 플랜 — 월 구독 모델
    pricingPlans: [
      {
        name: "Free", price: 0, period: "체험",
        target: "신규 사용자 · 체험",
        features: ["기본 에디터", "피그마 익스포트", "워터마크", "1 프로젝트", "템플릿 5개"],
        recommended: false
      },
      {
        name: "Lite", price: 20000, period: "월",
        target: "개인 셀러 입문 / 사이드",
        features: ["워터마크 X", "5 프로젝트", "템플릿 전체", "기본 내보내기"],
        recommended: false
      },
      {
        name: "Pro", price: 140000, period: "월",
        target: "전문 셀러 (메인 플랜)",
        features: ["무제한 프로젝트", "피그마 양방향 연동 (임포트/동기화)", "AI 섹션 자동생성", "GIF 생성"],
        recommended: true
      },
      {
        name: "Pro Max", price: 320000, period: "월",
        target: "최고 프로 · 팀 단위",
        features: ["Pro 풀기능", "팀 협업 (멤버 5명+)", "공유 라이브러리", "고급 AI / 무제한 생성", "우선 CS / 전용 지원"],
        recommended: false
      }
    ],
    phases: [
      {
        id: 1, name: "MVP 완성", period: "5~6월", accountsRange: [0, 0],
        currentPhase: true,
        missions: [
          "남은 28% 기능 완성 (Step 3-A 외부 연동/PDF/임시URL)",
          "결제 시스템 연동 (토스페이먼츠/스트라이프)",
          "유저 등록 + 라이센스 시스템 (Step 3-B)",
          "베타 신청 페이지 / 폼",
          "알파 테스트 (내부, 소수)"
        ]
      },
      {
        id: 2, name: "베타 출시 + 검증", period: "7~9월", accountsRange: [0, 50],
        missions: [
          "클로즈 베타 오픈 (소문의섬 구독자 우선)",
          "50명 모집 (Free + Lite 저가 진입)",
          "사용자 피드백 수렴 / 핵심 버그 수정",
          "사용자 사례 1~2개 영상화 (소문의섬)",
          "기능 개선 빠르게 (출시 후 개선)"
        ]
      },
      {
        id: 3, name: "유료 전환 + 본격 모집", period: "10~11월", accountsRange: [50, 150],
        missions: [
          "정식 유료 플랜 오픈 (월 2만~30만)",
          "베타 → 유료 전환 캠페인 (Lite/Pro 유도)",
          "150계정 도달",
          "사용자 후기 영상 폭발 (소문의섬 P3)",
          "Pro Max 첫 고객 확보"
        ]
      },
      {
        id: 4, name: "풀가동 폭발", period: "12월", accountsRange: [150, 300],
        missions: [
          "정식 출시 마케팅 폭발 (소문의섬 P4)",
          "시즌 프로모션 (연말)",
          "300계정 도달 = 월 3,000만 (목표)",
          "디자이너 영입 (시점 트리거)",
          "2027 확장 준비 (기능 / 플랜 다양화)"
        ]
      }
    ]
  },

  // ──────────────────────────────────────────
  // 셀러 도구 (마케팅 지원 프로그램 3종)
  // ──────────────────────────────────────────
  marketingTools: {
    title: "마케팅 지원 프로그램 3종",
    summary: "셀러 대상 도구 3개 완성 + 크몽 판매 + 소문의섬 홍보 (= 필수 미션 #3 + 기타 프로그램 트랙)",
    monthlyTargetProfit: 10000000, // 12월 풀가동 시 월 1천만
    annualNote: "올해 누적 약 3,000만 (12월 풀가동 도달)",
    programs: [
      {
        id: 1, name: "쿠팡/네이버 재고 모니터링 (잠정)", status: "후보확정",
        price: 100000, cumulativeSales: 0, monthlyRevenue: null,
        note: "월 10만 구독 / 사용자 잠정 확정 — 정식 확정은 추후",
        candidate: "coupang-stock + naver-stock-sheet"
      },
      {
        id: 2, name: "프로그램 2 (미정)", status: "기획",
        price: null, cumulativeSales: 0, monthlyRevenue: null,
        note: "후보 풀에서 2차 결정 필요",
        candidate: null
      },
      {
        id: 3, name: "프로그램 3 (미정)", status: "기획",
        price: null, cumulativeSales: 0, monthlyRevenue: null,
        note: "후보 풀에서 3차 결정 필요",
        candidate: null
      }
    ],
    statusOrder: ["기획", "후보확정", "개발", "베타", "출시", "판매중"],
    candidatePool: [
      { name: "쿠팡/네이버 재고 모니터링", existingSkill: "coupang-stock + naver-stock-sheet", priceModel: "월 구독", estimatedPrice: 100000, note: "월 10만원 ⭐ 반복 매출 / 사용자 1순위 — 잠정 확정", priority: "★ 1순위 (구독) ✓" },
      { name: "소싱 파이프라인",       existingSkill: "sourcing-pipeline",      priceModel: "월 구독",   estimatedPrice: null,    note: "1688 키워드 발굴 자동화 / 매월 신규 후보", priority: "★ 후보 (구독 가능)" },
      { name: "리뷰 크롤러",         existingSkill: "cto-review",             priceModel: "월 구독",   estimatedPrice: null,    note: "리뷰 자동수집·요약 / 모니터링 성격 → 구독", priority: "★ 후보 (구독 가능)" },
      { name: "마진 계산기 (gomargin)", existingSkill: "gomargin-manager",     priceModel: "단발",      estimatedPrice: null,    note: "단발성 → 판매 여부 사용자 고민 중", priority: "🟡 보류 (단발)" },
      { name: "광고마법사",          existingSkill: "ads-manager-app",         priceModel: "단발/구독",  estimatedPrice: null,    note: "쿠팡 광고 계산기 (ad-calculator.html) — 가격 모델 결정 필요", priority: "★ 후보 (사용자 추가)" },
      { name: "노션 연계 대시보드",    existingSkill: "(개발 전)",              priceModel: "연간권",     estimatedPrice: 200000,  note: "연 20만 (월 2만 환산 + 17% 할인) / 셀러용 노션 템플릿 + API 연동", priority: "🟡 아이디어 (사용자 추가)" },
      { name: "고파인더 (GoFinder)",   existingSkill: "gofinder",               priceModel: "미정",      estimatedPrice: null,    note: "유튜브 크롤링 + MongoDB + Sheets / 유튜브 영역 도구 (보관)", priority: "🟡 옵션 (유튜브)" },
      { name: "인스타그램 도구",       existingSkill: "(미정)",                 priceModel: "미정",      estimatedPrice: null,    note: "용도/기능 미정 — 추후 정의", priority: "🟡 옵션" },
      { name: "쿠팡 Wing 자동등록",   existingSkill: "coupang-register",       priceModel: "단발/구독", estimatedPrice: null,    note: "기존 스킬 패키징", priority: "보조" },
      { name: "경쟁사 키워드 스카우트", existingSkill: "coupang-keyword-scout",  priceModel: "월 구독",   estimatedPrice: null,    note: "정기 키워드 발굴 모니터링", priority: "보조" },
      { name: "광고 자동화 (캠페인 빌더)", existingSkill: "ads-manager",       priceModel: "단발/구독", estimatedPrice: null,    note: "1억맵 강의 기반", priority: "보조" }
    ],
    insight: "구독제 > 단발. 1년 누적 = 12배. 단 **월 5만 미만 도구는 연간권으로 (PG 수수료/이탈률 ↓)**. 월 5만+ = 월 구독 OK. 재고 모니터링(월 10만) = 월 구독 / 노션 대시보드(월 2만 환산) = 연간권.",
    pricingPolicy: [
      "월 5만+ → 월 구독 (재고 모니터링 / 소싱 / 리뷰)",
      "월 5만 미만 → 연간권 (할인 10~20% 적용 / 노션 대시보드 등)",
      "단발 → 가능하면 연간권 또는 강의 패키지로 전환 (마진 계산기 / 광고마법사)"
    ],
    channels: [
      { name: "크몽 (kmong.com)", role: "판매 채널", note: "셀러 대상 도구 등록 + 자동업로드 활용 (kmong-manager 스킬)" },
      { name: "소문의섬 유튜브", role: "마케팅/홍보 채널", note: "셀러 콘텐츠로 자연 유입 + 도구 시연 영상" }
    ],
    phases: [
      {
        id: 1, name: "후보 발굴", period: "5월", currentPhase: true,
        missions: [
          "기존 스킬 7개 풀에서 패키징 가능성 검토",
          "3개 후보 확정 (셀러 ROI 명확 + 기존 스킬 활용 가능)",
          "크몽 시장 조사 (경쟁 도구 가격대 / 후기)",
          "각 도구 가격대 결정"
        ]
      },
      {
        id: 2, name: "1번 출시", period: "6~7월",
        missions: [
          "프로그램 1 패키징 (UI 정리 / 사용자 가이드)",
          "크몽 상품 등록 (kmong-manager 활용)",
          "소문의섬 홍보 영상 1편",
          "첫 매출 발생 + 후기 1~2건 확보"
        ]
      },
      {
        id: 3, name: "2~3번 출시", period: "8~10월",
        missions: [
          "프로그램 2 출시",
          "프로그램 3 출시",
          "크몽 운영 + 후기 누적",
          "소문의섬 홍보 영상 시리즈"
        ]
      },
      {
        id: 4, name: "수익화 안정", period: "11~12월",
        missions: [
          "3종 크몽 안정 운영",
          "월 1천만 도달",
          "신규 도구 기획 (2027 확장)",
          "디자이너 영입 후 UI/UX 강화"
        ]
      }
    ]
  },

  // ──────────────────────────────────────────
  // 커머스 트래커 — 20 SKU 진척 + 2주 루틴
  // ──────────────────────────────────────────
  commerceTracker: {
    totalTarget: 20,
    stageOrder: ["시장조사", "샘플발주", "샘플검증", "본품발주", "입고", "등록", "광고", "안정"],
    stageActions: {
      "시장조사":  ["키워드 발굴 (소싱파이프라인)", "1688 원가 확인", "마진 시뮬레이션", "샘플 GO/NO-GO 결정"],
      "샘플발주":  ["1688 샘플 주문", "결제 (유트랜스퍼)", "샘플 도착 대기"],
      "샘플검증":  ["샘플 도착 확인", "품질·실측 평가", "본품 발주 결정"],
      "본품발주":  ["본품 수량 결정", "1688 본품 주문", "결제 완료"],
      "입고":      ["배대지 도착", "통관 처리", "한국 배송 완료"],
      "등록":      ["쿠팡 Wing 등록", "상페 작성", "옵션·이미지 세팅"],
      "광고":      ["광고 ON (저예산)", "100클릭 모니터링", "ROAS 추적 (목표 4x+)"],
      "안정":      ["재고 모니터링", "재구매율 점검", "재발주 결정"]
    },
    skus: [
      { name: "두더지퇴치기", category: "신규소싱", stage: "입고",     expectedMonthlyProfit: 5000000, launchDate: "2026-05-20", monthlyRevenue: null, note: "본품 300개 발주 완료 (4/29) · 입고 대기" },
      { name: "무릎보호대",  category: "신규소싱", stage: "본품발주", expectedMonthlyProfit: 3000000, launchDate: null, monthlyRevenue: null, note: "샘플 검증 완료 / 본품 주문 대기" },
      { name: "햇빛가리개",  category: "신규소싱", stage: "샘플검증", expectedMonthlyProfit: 2000000, launchDate: null, monthlyRevenue: null, note: "샘플 주문 완료 (4/29) / 도착 후 평가" },
      { name: "펭귄날다",   category: "신규소싱", stage: "등록",     expectedMonthlyProfit: 20000000, launchDate: "2026-05-08", monthlyRevenue: null, note: "재등록 진행 중 / 5/8까지 판매재개 / 반출지 결정 보류 (피에스 vs 27호)" },
      { name: "럭슨오페라글라스", category: "기존", stage: "안정", expectedMonthlyProfit: 3000000, launchDate: null, monthlyRevenue: null, note: "기존 운영 SKU · 20개 소싱 목표 외" }
      // 빈 슬롯 (신규소싱) 16개는 사용하면서 채움
    ],
    currentCycle: {
      title: "두더지퇴치기 발주 사이클",
      targetLaunchDate: "2026-05-15",
      routine: [
        {
          phase: "발굴/검증",
          window: "D-14 ~ D-7",
          items: [
            { task: "키워드 발굴 (소싱파이프라인)", done: true },
            { task: "1688 원가 확인", done: true },
            { task: "마진 계산", done: true },
            { task: "100클릭 임계 검증", done: false },
            { task: "발주 결정 (GO/NO-GO)", done: true }
          ]
        },
        {
          phase: "발주/세팅",
          window: "D-7 ~ D-day",
          items: [
            { task: "1688 발주 (유트랜스퍼/월드퍼스트)", done: false },
            { task: "배대지 등록 (PSTM/팬더)", done: false },
            { task: "상페 초안", done: false },
            { task: "쿠팡 등록 준비 (Wing)", done: false }
          ]
        },
        {
          phase: "런칭",
          window: "D-day",
          items: [
            { task: "입고 확인", done: false },
            { task: "쿠팡 등록", done: false },
            { task: "광고 ON (저예산 시작)", done: false },
            { task: "100클릭 데이터 모니터링", done: false }
          ]
        }
      ]
    },
    monthlyKPI: {
      month: "2026-04",
      targetSkuLaunch: 0,
      actualSkuLaunch: 0,
      targetROAS: 4,
      actualROAS: null,
      monthlyTarget: 0,
      monthlyActual: null,
      note: "준비 단계 — 5월말부터 본격 런칭"
    }
  },

  // ──────────────────────────────────────────
  // 10년 로드맵 — 변경 거의 없음
  // ──────────────────────────────────────────
  phases: [
    {
      id: 1, name: "기반 강화", period: "2026~2027", years: 2,
      targetRange: [500000000, 1000000000], currentPhase: true,
      actions: [
        "대행 매출 안정화 (팔도 + 신규 1~2)",
        "쇼핑몰 자체 브랜드화",
        "유튜브 채널 본격 가동",
        "콘텐츠 시간 사수",
        "운영 자동화",
        "ADHD 루틴 정착"
      ]
    },
    {
      id: 2, name: "스케일업", period: "2028~2030", years: 3,
      targetRange: [3000000000, 8000000000],
      actions: ["SaaS 런칭 (B2B)", "유튜브 수익화 극대화", "대행 → 컨설팅 전환", "팀 시스템화", "부동산/투자 진입"]
    },
    {
      id: 3, name: "레버리지", period: "2031~2033", years: 3,
      targetRange: [15000000000, 40000000000],
      actions: ["SaaS 글로벌 진출", "IP 수익화 (책/강의/라이선싱)", "투자 포트폴리오", "강연/IR"]
    },
    {
      id: 4, name: "복리 수확", period: "2034~2036", years: 2,
      targetRange: [50000000000, 100000000000],
      actions: ["SaaS Exit or IPO", "복리 자산 증식", "브랜드 가치 현금화"]
    }
  ],

  portfolio: {
    years: ["2027", "2030", "2036"],
    sources: [
      { name: "대행/컨설팅",  values: [50, 20, 5] },
      { name: "쇼핑몰/커머스", values: [30, 20, 10] },
      { name: "SaaS/디지털",  values: [10, 40, 30] },
      { name: "유튜브/IP",    values: [10, 15, 20] },
      { name: "투자/자산",    values: [0,  5, 35] }
    ]
  },

  principles: [
    { title: "현빈의 시간 = 콘텐츠에만", desc: "콘텐츠가 유일한 해자" },
    { title: "바이브코딩은 운영 자동화에", desc: "콘텐츠 생산 자동화 금지" },
    { title: "완성 > 완벽", desc: "출시 후 개선" },
    { title: "현금흐름 먼저", desc: "수익 없이 투자 없다" },
    { title: "레버리지", desc: "돈이 돈을, 사람이 사람을" },
    { title: "집중", desc: "동시에 10개보다 한 번에 1개를 끝까지" }
  ],

  // ──────────────────────────────────────────
  // 데이터 소스 일람
  // ──────────────────────────────────────────
  dataSources: {
    files: [
      { path: "~/Documents/claude_skills/rich-agent/profile_신현빈.md", role: "프로파일" },
      { path: "~/Documents/claude_skills/rich-agent/roadmap.md", role: "1000억 10년 로드맵" },
      { path: "~/Documents/claude_skills/rich-agent/insights_신현빈.md", role: "특이점 누적" },
      { path: "~/.claude/commands/rich-agent.md", role: "스킬 정의 (다이어트본)" },
      { path: "~/.claude/projects/.../memory/MEMORY.md", role: "메모리 인덱스" },
      { path: "~/Documents/claude_skills/rich-agent/state.js", role: "현재 자본/실적/주간/만다라트 (이 파일)" }
    ],
    reminders: [
      { name: "inbox", role: "들어오는 일" },
      { name: "upcoming / someday / setting day", role: "홀딩" },
      { name: "커머스_두더지퇴치기 / 무릎보호대 / 햇빛가리개", role: "발주 트랙" },
      { name: "유튜브_소문의섬", role: "콘텐츠" },
      { name: "소싱파이프라인 / 코딩_고디터 / 커머스_gg / 맥미니 / book_2026", role: "기타 활성" }
    ],
    notion: [
      { name: "Projects DB", role: "CTO 프로젝트 진행률 (cto-manager)" },
      { name: "업무요청 콜아웃", role: "지혜/수지/수현/현빈 (notion_task_manager)" },
      { name: "브리핑 DB", role: "pm_eod 마감 브리핑" },
      { name: "weekly meeting 페이지", role: "pm_xx_weekly / pm_cc_weekly / pm_gg_weekly" }
    ]
  }
};
