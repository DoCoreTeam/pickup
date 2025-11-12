/**
 * 다중 LLM 오케스트레이터
 * OpenAI와 Google Gemini를 병행 사용하여 SEO/AB 테스트 전략을 생성한다.
 */

const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class MultiAgentOrchestrator {
  constructor() {
    /** @type {OpenAI|null} */
    this.openaiClient = null;
    /** @type {GoogleGenerativeAI|null} */
    this.geminiClient = null;
    /** @type {string|null} */
    this.geminiModelName = null;

    this.initializeClients();
  }

  getStoreProfile(payload = {}) {
    return payload?.storeProfile || {};
  }

  deriveBrandName(payload = {}) {
    const profile = this.getStoreProfile(payload);
    return payload?.brandName
      || profile.name
      || profile.basic?.storeName
      || '우리 가게';
  }

  derivePrimaryKeyword(payload = {}) {
    const profile = this.getStoreProfile(payload);
    const tags = profile.tags || profile.basic?.tags || [];
    return payload?.primaryKeyword
      || profile.category
      || (Array.isArray(tags) && tags.length ? tags[0] : null)
      || '대표 메뉴';
  }

  deriveTargetAudience(payload = {}) {
    const profile = this.getStoreProfile(payload);
    return payload?.targetAudience
      || profile.targetAudience
      || '근처 고객층';
  }

  deriveConversionGoal(payload = {}) {
    const profile = this.getStoreProfile(payload);
    return payload?.conversionGoal
      || profile.conversionGoal
      || '주문 전환 증가';
  }

  deriveHighlights(payload = {}) {
    const highlights = new Set();
    (payload?.productHighlights || []).forEach(item => {
      if (item) highlights.add(item);
    });
    const profile = this.getStoreProfile(payload);
    (profile.highlights || []).forEach(item => {
      if (item) highlights.add(item);
    });
    return Array.from(highlights.values());
  }

  buildStoreProfileNarrative(profile = {}) {
    if (!profile || Object.keys(profile).length === 0) {
      return '스토어 정보가 제공되지 않았습니다.';
    }

    const lines = [];
    if (profile.name) lines.push(`- 가게명: ${profile.name}`);
    if (profile.subtitle) lines.push(`- 슬로건: ${profile.subtitle}`);
    if (profile.category) lines.push(`- 카테고리: ${profile.category}`);
    if (profile.tags && profile.tags.length) {
      lines.push(`- 태그: ${profile.tags.join(', ')}`);
    }
    if (profile.address) lines.push(`- 주소: ${profile.address}`);
    if (profile.phone) lines.push(`- 연락처: ${profile.phone}`);
    if (profile.domain?.subdomain) {
      lines.push(`- 도메인: ${profile.domain.host}/${profile.domain.subdomain}`);
    } else if (profile.domain?.host) {
      lines.push(`- 도메인: ${profile.domain.host}`);
    }
    if (profile.highlights && profile.highlights.length) {
      lines.push(`- 특징: ${profile.highlights.join(', ')}`);
    }
    if (profile.deliveryChannels && profile.deliveryChannels.length) {
      lines.push(`- 배달 채널: ${profile.deliveryChannels.join(', ')}`);
    }
    if (profile.businessHours && profile.businessHours.length) {
      lines.push(`- 영업시간 요약: ${profile.businessHours.join(' / ')}`);
    }
    return lines.join('\n');
  }

  buildAvailabilityMeta() {
    return {
      openai: Boolean(this.openaiClient),
      gemini: Boolean(this.geminiClient)
    };
  }

  /**
   * 환경변수를 기반으로 LLM 클라이언트를 초기화한다.
   */
  initializeClients() {
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: parseInt(process.env.OPENAI_TIMEOUT, 10) || 30000
      });
    } else {
      console.warn('⚠️ OPENAI_API_KEY가 설정되지 않았습니다. OpenAI 에이전트를 사용할 수 없습니다.');
    }

    if (process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        apiVersion: process.env.GEMINI_API_VERSION || 'v1beta'
      });
      this.geminiModelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    } else {
      console.warn('⚠️ GEMINI_API_KEY가 설정되지 않았습니다. Gemini 에이전트를 사용할 수 없습니다.');
    }
  }

  /**
   * JSON 문자열을 안전하게 파싱한다.
   * @param {string} rawText JSON 문자열
   * @param {object} fallback 실패 시 반환할 값
   * @returns {object}
   */
  safeJsonParse(rawText, fallback = {}) {
    try {
      if (!rawText) {
        return fallback;
      }
      const cleaned = rawText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.warn('⚠️ JSON 파싱 실패, 폴백 사용', { error: error.message, rawText });
      return fallback;
    }
  }

  /**
   * 배열 요소를 고유하게 병합한다.
   * @param {Array} base 기본 배열
   * @param {Array} extra 추가 배열
   * @returns {Array}
   */
  mergeUnique(base = [], extra = []) {
    const set = new Set();
    (base || []).forEach(item => set.add(typeof item === 'string' ? item.trim() : JSON.stringify(item)));
    (extra || []).forEach(item => set.add(typeof item === 'string' ? item.trim() : JSON.stringify(item)));

    return Array.from(set.values()).map(value => {
      try {
        return JSON.parse(value);
      } catch (_) {
        return value;
      }
    });
  }

  safeTruncate(text = '', maxLength = 60) {
    if (!text) return '';
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, maxLength - 1).trim()}…`;
  }

  buildSeoBaseFromPayload(payload = {}) {
    const brandName = this.deriveBrandName(payload);
    const primaryKeyword = this.derivePrimaryKeyword(payload);
    const targetAudience = this.deriveTargetAudience(payload);
    const conversionGoal = this.deriveConversionGoal(payload);
    const productHighlights = this.deriveHighlights(payload);
    const { customPrompt = '' } = payload || {};

    const highlights = Array.isArray(productHighlights) ? productHighlights.filter(Boolean) : [];
    const keywords = [
      brandName,
      primaryKeyword,
      ...highlights
    ].map(text => (text || '').toString().trim()).filter(Boolean);

    const titleCandidate = `${brandName} - ${primaryKeyword}`;
    const descriptionCandidate = `${brandName}은(는) ${targetAudience}을 위한 ${primaryKeyword} 전문 브랜드입니다. ${highlights.slice(0, 2).join(', ') || '핵심 혜택을 확인하세요.'}`;

    return {
      meta: {
        title: this.safeTruncate(titleCandidate, 60),
        description: this.safeTruncate(descriptionCandidate, 150),
        keywords: Array.from(new Set(keywords)).slice(0, 8)
      },
      seoChecklist: [
        {
          item: `${conversionGoal} 유도를 위한 CTA 위치/문구 점검`,
          priority: '높음',
          impact: '전환율 향상'
        },
        {
          item: `${primaryKeyword} 포함 H1/H2 구조 최적화`,
          priority: '중간',
          impact: '검색 노출 개선'
        }
      ],
      contentGuidelines: {
        tone: customPrompt ? `요청 반영: ${customPrompt}` : '신뢰감 있는 친근한 톤',
        audienceFocus: targetAudience,
        callToAction: `${conversionGoal} 바로가기`,
        recommendedSections: ['대표 메뉴 소개', '이용 후기', '특별 혜택', '위치 · 연락처']
      },
      abTestIdeas: [
        {
          testName: '히어로 CTA 문구 테스트',
          hypothesis: '혜택을 강조하면 클릭률이 증가한다.',
          variantA: '지금 주문하고 할인받기',
          variantB: '3분 만에 픽업 예약하기',
          primaryMetric: `${conversionGoal} 전환율`
        }
      ]
    };
  }

  buildSeoFallbackPlan(payload = {}) {
    const base = this.buildSeoBaseFromPayload(payload);
    return {
      meta: base.meta,
      seoChecklist: base.seoChecklist,
      contentGuidelines: base.contentGuidelines,
      abTestRecommendations: base.abTestIdeas.map(item => ({
        testName: item.testName,
        hypothesis: item.hypothesis,
        variationIdeas: [item.variantA, item.variantB].filter(Boolean),
        riskMitigation: '실험 기간 2주 이상 확보 후 유입 경로 균등 분배'
      })),
      riskWarnings: [
        '실제 데이터 기반으로 문구/구조를 지속 검증하세요.',
        '주요 변경 후에는 검색 콘솔 및 전환 데이터를 모니터링하세요.'
      ],
      finalAdvice: '상기 제안은 기본 가이드입니다. 고객 반응을 기반으로 주 단위로 개선하세요.',
      sources: {
        openai: null,
        gemini: null,
        fallback: true
      }
    };
  }

  buildAbFallbackPlan(payload = {}) {
    const brandName = this.deriveBrandName(payload);
    const targetAudience = this.deriveTargetAudience(payload);
    const conversionGoal = this.deriveConversionGoal(payload);
    const {
      experimentFocus = '랜딩 페이지'
    } = payload || {};

    return {
      tests: [
        {
          name: `${experimentFocus} 문구/비주얼 테스트`,
          hypothesis: `${targetAudience}에게 구체적 혜택을 제시하면 ${conversionGoal}이 증가한다.`,
          variants: [
            { label: 'A', description: '기존 콘텐츠 유지' },
            { label: 'B', description: '혜택 강조 헤드라인 + 강한 CTA' }
          ],
          primaryMetric: `${conversionGoal} 전환율`,
          secondaryMetrics: ['페이지 체류 시간', '이탈률'],
          estimatedDuration: '최소 14일'
        }
      ],
      copyVariants: [
        {
          placement: '히어로 영역',
          ideas: [
            '혜택 강조형 vs. 신뢰 강화형 헤드라인 비교',
            'CTA 버튼 색상 및 텍스트 대비 실험'
          ]
        }
      ],
      analysisPlan: {
        evaluationCriteria: '95% 신뢰수준에서의 전환율 차이 검증',
        riskMitigation: '충분한 트래픽 확보 후 시험 시작, 외부 캠페인 영향 분리'
      },
      guardrails: [
        '실험 기간 중 가격/프로모션을 변경하지 말 것'
      ],
      successSignals: [
        `${conversionGoal} 전환율이 기준 대비 유의미하게 증가`
      ],
      analysisTips: [
        '모바일/데스크톱을 분리 분석하여 UX 차이를 확인하세요.'
      ],
      context: {
        brandName,
        conversionGoal
      },
      sources: {
        openai: null,
        gemini: null,
        fallback: true
      }
    };
  }

  /**
   * Gemini 호출을 공통 처리하며, 모델 404 발생 시 기본 모델로 재시도한다.
   * @param {string} prompt 프롬프트
   * @param {object} generationConfig 생성 옵션
   * @returns {Promise<object|null>}
   */
  async generateGeminiContent(prompt, generationConfig = {}) {
    if (!this.geminiClient) return null;

    const attempt = async (modelName) => {
      const model = this.geminiClient.getGenerativeModel({ model: modelName });
      return model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      });
    };

    const preferredModel = this.geminiModelName || 'gemini-1.5-flash';

    try {
      const result = await attempt(preferredModel);
      this.geminiModelName = preferredModel;
      return result;
    } catch (error) {
      const message = error?.message || '';
      if (message.includes('404') && preferredModel !== 'gemini-1.5-flash') {
        console.warn('⚠️ Gemini 모델이 지원되지 않아 기본 모델로 재시도합니다.', { previousModel: preferredModel });
        this.geminiModelName = 'gemini-1.5-flash';
        return await attempt(this.geminiModelName);
      }
      throw error;
    }
  }

  /**
   * OpenAI 에이전트를 통해 SEO 전략 기본안을 생성한다.
   * @param {object} payload 사용자 입력 데이터
   * @returns {Promise<object|null>}
   */
  async runOpenAiSeoAgent(payload) {
    if (!this.openaiClient) return null;

    const brandName = this.deriveBrandName(payload);
    const primaryKeyword = this.derivePrimaryKeyword(payload);
    const targetAudience = this.deriveTargetAudience(payload);
    const conversionGoal = this.deriveConversionGoal(payload);
    const productHighlights = this.deriveHighlights(payload);
    const {
      currentMeta = {},
      customPrompt = ''
    } = payload || {};
    const storeSummary = this.buildStoreProfileNarrative(this.getStoreProfile(payload));

    const systemPrompt = `당신은 한국 시장을 잘 이해하는 시니어 SEO 전략가 겸 마케팅 카피라이터입니다.
모든 결과는 JSON 형식으로만 응답하세요.`;

    const userPrompt = `다음 정보를 참고하여 SEO 메타 정보와 A/B 테스트 전략의 초안을 작성하세요.
---
브랜드명: ${brandName}
핵심 키워드: ${primaryKeyword}
변환 목표: ${conversionGoal}
타깃 고객: ${targetAudience}
제품/서비스 하이라이트: ${productHighlights.join(', ') || '특이사항 없음'}
현재 메타 타이틀: ${currentMeta.title || '미정'}
현재 메타 설명: ${currentMeta.description || '미정'}
현재 주요 키워드: ${(currentMeta.keywords || []).join(', ') || '없음'}
사용자 추가 요청: ${customPrompt || '추가 요청 없음'}
스토어 상세 정보:
${storeSummary}
---
아래 JSON 스키마를 지켜서 응답하세요.
{
  "meta": {
    "title": "새 메타 타이틀 (60자 이내)",
    "description": "메타 설명 (150자 내외)",
    "keywords": ["키워드1", "키워드2", "키워드3"]
  },
  "seoChecklist": [
    {"item": "실행 과제 1", "priority": "높음/중간/낮음", "impact": "예상 효과"}
  ],
  "contentGuidelines": {
    "tone": "콘텐츠 톤 가이드",
    "audienceFocus": "타깃 고객 인사이트",
    "callToAction": "권장 CTA 문구",
    "recommendedSections": ["섹션 1", "섹션 2"]
  },
  "abTestIdeas": [
    {
      "testName": "테스트 이름",
      "hypothesis": "가설",
      "variantA": "안 A 개요",
      "variantB": "안 B 개요",
      "primaryMetric": "측정할 핵심 지표"
    }
  ]
}`;

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: process.env.OPENAI_SEO_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: parseFloat(process.env.OPENAI_SEO_TEMPERATURE) || 0.6,
        max_tokens: parseInt(process.env.OPENAI_SEO_MAX_TOKENS, 10) || 1200,
        response_format: { type: 'json_object' }
      });

      const content = response.choices?.[0]?.message?.content;
      return this.safeJsonParse(content, null);
    } catch (error) {
      console.error('❌ OpenAI SEO 에이전트 호출 실패', { message: error.message });
      return null;
    }
  }

  /**
   * Gemini 에이전트를 통해 보강 피드백을 생성한다.
   * @param {object} payload 사용자 입력 데이터
   * @param {object|null} basePlan OpenAI에서 생성한 초안
   * @returns {Promise<object|null>}
   */
  async runGeminiSeoAgent(payload, basePlan) {
    if (!this.geminiClient) return null;

    const brandName = this.deriveBrandName(payload);
    const primaryKeyword = this.derivePrimaryKeyword(payload);
    const conversionGoal = this.deriveConversionGoal(payload);
    const { customPrompt = '' } = payload || {};
    const storeSummary = this.buildStoreProfileNarrative(this.getStoreProfile(payload));

    const prompt = `당신은 한국 시장에 특화된 Growth 마케터입니다.
다음 SEO/AB 테스트 초안을 검토하고 보완 제안을 JSON으로 작성하세요.
---
브랜드명: ${brandName}
핵심 키워드: ${primaryKeyword}
변환 목표: ${conversionGoal}
사용자 추가 요청: ${customPrompt || '추가 요청 없음'}
스토어 상세 정보:
${storeSummary}
초안(JSON): ${JSON.stringify(basePlan || {}, null, 2)}
---
아래 JSON 형식을 반드시 지키세요.
{
  "metaAdjustments": {
    "title": "필요 시 수정된 타이틀",
    "description": "필요 시 수정된 설명",
    "additionalKeywords": ["추가 키워드"]
  },
  "checklistUpdates": [
    {"item": "추가 과제", "priority": "높음/중간/낮음", "reason": "보완 이유"}
  ],
  "abTestEnhancements": [
    {
      "testName": "보완 테스트 이름",
      "variationIdeas": ["아이디어 1", "아이디어 2"],
      "riskMitigation": "위험 완화 방안"
    }
  ],
  "riskWarnings": ["주의해야 할 사항"],
  "finalAdvice": "한 문단 요약"
}`;

    try {
      const result = await this.generateGeminiContent(prompt, {
        temperature: parseFloat(process.env.GEMINI_SEO_TEMPERATURE) || 0.65,
        maxOutputTokens: parseInt(process.env.GEMINI_SEO_MAX_TOKENS, 10) || 1100
      });

      const text = result?.response?.text?.() || '';
      return this.safeJsonParse(text, null);
    } catch (error) {
      console.error('❌ Gemini SEO 에이전트 호출 실패', { message: error.message });
      return null;
    }
  }

  /**
   * OpenAI 결과와 Gemini 보강을 결합해 최종 SEO 플랜을 만든다.
   * @param {object|null} basePlan OpenAI 초안
   * @param {object|null} refinement Gemini 보강
   * @param {object} payload 사용자 입력
   * @returns {object}
   */
  composeSeoPlan(basePlan, refinement, payload = {}) {
    const fallbackMetaTitle = `${this.deriveBrandName(payload)} - ${this.derivePrimaryKeyword(payload)}`;

    const finalMeta = {
      title: refinement?.metaAdjustments?.title || basePlan?.meta?.title || fallbackMetaTitle,
      description: refinement?.metaAdjustments?.description || basePlan?.meta?.description || `${this.deriveBrandName(payload)}의 매력을 한눈에 확인하세요.`,
      keywords: this.mergeUnique(
        basePlan?.meta?.keywords || [],
        refinement?.metaAdjustments?.additionalKeywords || []
      )
    };
    finalMeta.title = this.safeTruncate(finalMeta.title, 60);
    finalMeta.description = this.safeTruncate(finalMeta.description, 150);
    finalMeta.keywords = (finalMeta.keywords || []).filter(Boolean).slice(0, 10);

    const finalChecklist = this.mergeUnique(basePlan?.seoChecklist, refinement?.checklistUpdates);
    const finalAbTests = this.mergeUnique(basePlan?.abTestIdeas, refinement?.abTestEnhancements);

    return {
      meta: finalMeta,
      seoChecklist: finalChecklist.map(item => {
        if (typeof item === 'string') return { item, priority: '중간', impact: '' };
        return item;
      }),
      contentGuidelines: basePlan?.contentGuidelines || {
        tone: '신뢰감 있는 친근한 톤',
        audienceFocus: this.deriveTargetAudience(payload) || '주 고객층',
        callToAction: '지금 주문하기',
        recommendedSections: ['대표 메뉴', '이용 후기', '위치 안내']
      },
      abTestRecommendations: finalAbTests.map(entry => {
        if (entry && entry.testName) return entry;
        return {
          testName: entry?.testName || 'CTA 버튼 문구 테스트',
          hypothesis: entry?.hypothesis || '문구 톤 변경 시 클릭률이 증가할 것이다.',
          variationIdeas: entry?.variationIdeas || [entry?.variantA, entry?.variantB].filter(Boolean),
          riskMitigation: entry?.riskMitigation || ''
        };
      }),
      riskWarnings: refinement?.riskWarnings || [],
      finalAdvice: refinement?.finalAdvice || '제안된 항목을 바탕으로 주간 단위 실험을 진행해 주세요.',
      sources: {
        openai: basePlan,
        gemini: refinement
      }
    };
  }

  /**
   * A/B 테스트 전용 에이전트 실행
   * @param {object} payload 사용자 입력
   * @returns {Promise<object>}
   */
  async generateAbTestPlan(payload = {}) {
    const base = await this.runOpenAiAbAgent(payload);
    const enhanced = await this.runGeminiAbAgent(payload, base);
    if (!base && !enhanced) {
      const fallback = this.buildAbFallbackPlan(payload);
      fallback.sources.availability = this.buildAvailabilityMeta();
      fallback.sources.fallback = true;
      fallback.sources.fallbackReason = 'AI_CLIENT_MISSING_OR_FAILURE';
      return fallback;
    }
    const baseline = base || this.buildAbFallbackPlan(payload);
    const plan = this.composeAbPlan(baseline, enhanced, payload);
    if (!plan.sources.openai && !plan.sources.gemini) {
      plan.sources.fallback = true;
      plan.sources.fallbackReason = 'AI_CLIENT_MISSING_OR_FAILURE';
    }
    plan.sources.availability = this.buildAvailabilityMeta();
    return plan;
  }

  /**
   * A/B 테스트 OpenAI 에이전트
   */
  async runOpenAiAbAgent(payload) {
    if (!this.openaiClient) return null;

    const brandName = this.deriveBrandName(payload);
    const targetAudience = this.deriveTargetAudience(payload);
    const conversionGoal = this.deriveConversionGoal(payload);
    const {
      experimentFocus = '랜딩 페이지',
      hypothesis = 'CTA 문구 개선 시 전환율 상승',
      customPrompt = ''
    } = payload || {};
    const storeSummary = this.buildStoreProfileNarrative(this.getStoreProfile(payload));

    const systemPrompt = `당신은 고급 Growth 마케터입니다. 실험 설계를 JSON으로 작성하세요.`;
    const userPrompt = `다음 조건으로 A/B 테스트 실험안을 작성하세요.
브랜드: ${brandName}
타깃: ${targetAudience}
목표: ${conversionGoal}
실험 대상: ${experimentFocus}
핵심 가설: ${hypothesis}
추가 요청: ${customPrompt || '추가 요청 없음'}
스토어 상세 정보:
${storeSummary}

아래 JSON 형식을 지키세요.
{
  "tests": [
    {
      "name": "실험 이름",
      "hypothesis": "가설",
      "variants": [
        {"label": "A", "description": "안 A 상세"},
        {"label": "B", "description": "안 B 상세"}
      ],
      "primaryMetric": "주요 지표",
      "secondaryMetrics": ["보조 지표"],
      "estimatedDuration": "예상 기간 (예: 2주)"
    }
  ],
  "copyVariants": [
    {"placement": "헤더", "variantA": "문구 A", "variantB": "문구 B"}
  ],
  "analysisPlan": {
    "evaluationCriteria": "평가 기준",
    "riskMitigation": "위험 관리"
  }
}`;

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: process.env.OPENAI_AB_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: parseFloat(process.env.OPENAI_AB_TEMPERATURE) || 0.65,
        max_tokens: parseInt(process.env.OPENAI_AB_MAX_TOKENS, 10) || 1200,
        response_format: { type: 'json_object' }
      });
      const content = response.choices?.[0]?.message?.content;
      return this.safeJsonParse(content, null);
    } catch (error) {
      console.error('❌ OpenAI AB 에이전트 호출 실패', { message: error.message });
      return null;
    }
  }

  /**
   * A/B 테스트 Gemini 에이전트
   */
  async runGeminiAbAgent(payload, basePlan) {
    if (!this.geminiClient) return null;

    const { customPrompt = '' } = payload || {};
    const storeSummary = this.buildStoreProfileNarrative(this.getStoreProfile(payload));

    const prompt = `당신은 데이터 기반 실험에 능숙한 UX 컨설턴트입니다.
다음 A/B 테스트 계획을 검토하고 추가 인사이트를 JSON으로 작성하세요.
---
기본 계획: ${JSON.stringify(basePlan || {}, null, 2)}
사용자 추가 요청: ${customPrompt || '추가 요청 없음'}
스토어 상세 정보:
${storeSummary}
---
JSON 형식:
{
  "variantIdeas": [
    {"placement": "영역", "ideas": ["아이디어1", "아이디어2"]}
  ],
  "guardrails": ["주의 사항"],
  "successSignals": ["성공 신호"],
  "analysisTips": ["분석 팁"]
}`;

    try {
      const result = await this.generateGeminiContent(prompt, {
        temperature: parseFloat(process.env.GEMINI_AB_TEMPERATURE) || 0.6,
        maxOutputTokens: parseInt(process.env.GEMINI_AB_MAX_TOKENS, 10) || 1000
      });

      const text = result?.response?.text?.() || '';
      return this.safeJsonParse(text, null);
    } catch (error) {
      console.error('❌ Gemini AB 에이전트 호출 실패', { message: error.message });
      return null;
    }
  }

  /**
   * A/B 테스트 플랜 병합
   */
  composeAbPlan(basePlan, enhancement, payload = {}) {
    const tests = this.mergeUnique(basePlan?.tests, enhancement?.additionalTests);
    const copyVariants = this.mergeUnique(basePlan?.copyVariants, enhancement?.variantIdeas);

    return {
      tests: (tests || []).map(test => test),
      copyVariants: (copyVariants || []).map(variant => {
        if (variant && variant.placement) return variant;
        return {
          placement: variant?.placement || '히어로 섹션',
          ideas: variant?.ideas || [variant?.variantA, variant?.variantB].filter(Boolean)
        };
      }),
      analysisPlan: basePlan?.analysisPlan || {
        evaluationCriteria: '주요 전환 지표가 통계적으로 유의미하게 증가했는지 확인',
        riskMitigation: '기간을 최소 2주 이상 확보하고 트래픽 소스를 균등 분배'
      },
      guardrails: enhancement?.guardrails || [],
      successSignals: enhancement?.successSignals || [],
      analysisTips: enhancement?.analysisTips || [],
      context: {
        brandName: this.deriveBrandName(payload),
        conversionGoal: this.deriveConversionGoal(payload)
      },
      sources: {
        openai: basePlan,
        gemini: enhancement
      }
    };
  }

  /**
   * SEO/AB 통합 플랜 생성
   * @param {object} payload 사용자 요청 데이터
   * @returns {Promise<object>}
   */
  async generateSeoPlan(payload = {}) {
    const basePlan = await this.runOpenAiSeoAgent(payload);
    const refinement = await this.runGeminiSeoAgent(payload, basePlan);
    if (!basePlan && !refinement) {
      const fallback = this.buildSeoFallbackPlan(payload);
      fallback.sources.availability = this.buildAvailabilityMeta();
      fallback.sources.fallback = true;
      fallback.sources.fallbackReason = 'AI_CLIENT_MISSING_OR_FAILURE';
      return fallback;
    }
    const baseline = basePlan || this.buildSeoBaseFromPayload(payload);
    const plan = this.composeSeoPlan(baseline, refinement, payload);
    if (!plan.sources.openai && !plan.sources.gemini) {
      plan.sources.fallback = true;
      plan.sources.fallbackReason = 'AI_CLIENT_MISSING_OR_FAILURE';
    }
    plan.sources.availability = this.buildAvailabilityMeta();
    return plan;
  }
}

module.exports = new MultiAgentOrchestrator();

