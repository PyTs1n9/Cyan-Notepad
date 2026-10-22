/**
 * 「小青」离线模式的回答组装层。
 *
 * 问题：原先 `composeLocalAnswer` 把 top-1 chunk 原样吐出（`**标题**\n\n正文`）。
 * BM25 与向量融合（RRF）都是确定性算法，于是「同一个问题 → 同一个 chunk →
 * 逐字相同的回答」；不同问法只要命中同一段，答案也一字不差。
 *
 * 这一层把「chunk → 回答」的搬运换成组装，分两步：
 *
 *   1. 定位：在块内找出与提问最相关的那一行（不看句式，只比词）；
 *   2. 展开：按意图从定位行展开成步骤 / 位置 / 结论 / 并列表述。
 *
 * 依然是零模型、零依赖、零新增体积：素材全部来自知识库原文，改变的只是
 * 「取哪几句、按什么结构摆」。措辞不会同义改写——那是生成模型才做得到的事。
 *
 * 变化来自两级：
 *   1. 问法不同 → 意图不同 → 结构不同（主来源）；
 *   2. 问法相同 → 同一意图的模板变体按轮换游标取下一套（确定性递增，不用
 *      随机数，便于复现与测试）。
 *
 * 有意不做句子顺序轮换：步骤类答案一旦乱序就会引导用户做错事，「变化」的
 * 收益远小于风险。展开始终沿原文顺序走。
 *
 * 两个踩过的坑，记在这里免得回退：
 *   - 不能只靠「动作词」筛步骤。手册的枚举块里动作词分布是随机的：「主题：
 *     想换主题在这里——…」不含动作词，反而是相邻的「语言：即时切换」含，
 *     按动作词筛会把答案换掉。
 *   - 必须先定位再展开。整块与提问的相关性由检索保证，但块内哪一行才是答案
 *     只能逐行比词。
 */

import { t } from "@/utils/i18n";
import { tokenize, type ManualHit } from "./manualEngine";

/** 回答的组织结构。`fallback` 表示识别不出意图，沿用原来的整段直出。 */
export type AnswerIntent =
  | "howto"
  | "where"
  | "capability"
  | "definition"
  | "lookup"
  | "fallback";

type Lang = "zh" | "en";

/**
 * 意图规则，按顺序匹配，先具体后宽泛：「有什么区别」必须命中 definition，
 * 不能被后面的「怎么」抢走。表里每个正则只描述「问法」，不描述领域。
 */
const INTENT_RULES: Record<Lang, ReadonlyArray<readonly [AnswerIntent, RegExp]>> = {
  zh: [
    ["definition", /是什么|什么是|什么意思|区别|不同|干嘛|做什么|你是谁|何人/],
    [
      "lookup",
      /我记过什么|我写过什么|我记得什么|我有哪些|我记录过|(哪些|什么)(笔记|待办|画布|便签)/,
    ],
    [
      "capability",
      /能不能|可不可以|能否|是否|有没有|支持|吗[？?]?$|能.{0,6}吗|可以.{0,6}吗/,
    ],
    ["where", /在哪|哪里|哪儿|什么地方|位置|入口|去哪|怎么打开|怎么进/],
    ["howto", /怎么|如何|怎样|咋|步骤|流程/],
  ],
  en: [
    ["definition", /what('s| is| are)|difference between|who are you|what does .* do/],
    ["lookup", /my notes|my todos|did i (write|note|add)|what did i/],
    ["capability", /can i|do you support|does .* support|is there|are there|possible/],
    ["where", /where (is|are|do|does|can)|which (menu|tab|panel)/],
    ["howto", /how (do|does|to|can)|steps|walk me through/],
  ],
};

/**
 * 句首是动作词，说明这句本身是一步操作。用来判断「相邻两句是不是同族步骤」：
 * 「单击笔记开预览标签…」与「双击转正式标签…」共享这个开头，即使后者与提问
 * 没有一个词重合，也该跟着前者一起出现；也用于向前回溯步骤起点。
 *
 * 只匹配句首，不匹配句中出现：手册的枚举块里动作词分布是随机的，「语言：中文 /
 * English 即时切换」含「切换」但不是一步操作，按句中匹配会把它当成第二步。
 */
const ACTION_HEAD =
  /^(点|单击|双击|右键|选择|选中|输入|拖动|拖进|拖拽|按下|勾选|填写|填入|进入|导入|导出|新建|复制|粘贴|保存|删除|打开|关闭|切换|找到|按)/;

/** 句中出现即说明这句在讲「东西在哪」。 */
const PLACE_CUE =
  /设置|侧边栏|活动栏|工具栏|标题栏|内容区|菜单|按钮|右上角|左下|底部|顶部|窗口|托盘|输入栏|搜索框|编辑器|列表|对话框|文件夹/;

/** 句中出现即说明这句是判断句（能不能、有没有）。 */
const VERDICT_CUE = /能|不能|可以|支持|没有|不会|允许|可[以设建改删恢导加用重置]/;

/** 术语定义行，例如「**便签**：置顶的可编辑小窗」。 */
const DEF_CUE = /：|:/;

/** 摘句后去掉的开头连接词，避免答案以「不过」「其实」起头。 */
const LEADING_CONNECTIVE = /^(不过|但是|但|此外|另外|其实|所以|因此|同时)[，,]?\s*/;

/** 摘句后去掉的句末标点，列表项不需要再加一个句号。 */
const TRAILING_PUNCT = /[。；;，,.\s]+$/;

/** 每个意图最多展开几条要点，超过就不再引，其余交给原文兜底。 */
const MAX_UNITS = { howto: 4, where: 3, capability: 2, definition: 3 } as const;

interface Unit {
  text: string;
  /** 在原文中的位置，用于取相邻行。 */
  index: number;
}

interface Picked {
  /** 步骤前的引导行，例如「活动栏底部点「设置」：」去掉冒号后的内容。 */
  lead: string | null;
  units: Unit[];
}

/** 模板变体游标，按意图分开计数，避免不同类问题互相干扰。 */
const variantCursors = new Map<AnswerIntent, number>();

function nextVariant<T>(intent: AnswerIntent, options: readonly T[]): T {
  const at = variantCursors.get(intent) ?? 0;
  variantCursors.set(intent, at + 1);
  return options[at % options.length];
}

/**
 * 判定提问的语言，用于挑意图规则。必须按问题本身判，不能按命中块的语言判：
 * 英文提问命中中文手册时，仍然要用英文规则去识别「How do I…」。
 */
function questionLang(question: string): Lang {
  return /[\u4e00-\u9fff]/.test(question) ? "zh" : "en";
}

/**
 * 判定回答小标题的语言。语料是中文的，所以英文提问 + 中文命中时标签仍用中文：
 * 「中文正文配英文小标题」比「全中文」更割裂。只有命中块本身没有中文时才
 * 切到英文标签。
 */
function answerLang(question: string, body: string): Lang {
  if (/[\u4e00-\u9fff]/.test(body)) return "zh";
  return questionLang(question);
}

export function classifyIntent(question: string, lang: Lang = "zh"): AnswerIntent {
  // 英文规则写成小写，输入先折平：提问开头的 How/Where/Can 常是大写。
  const haystack = lang === "en" ? question.toLowerCase() : question;
  for (const [intent, pattern] of INTENT_RULES[lang]) {
    if (pattern.test(haystack)) return intent;
  }
  return "fallback";
}

/**
 * 切分要点。先按 `lineBreaks` 还原原始行边界，再在行内按中文句末标点切：
 * 手册的每一行（一个 bullet）就是一个语义单元，把行拼平再切会让「活动栏底部
 * 点设置：」和紧跟的「主题：…」粘成一句。
 *
 * 只认句号、问号、叹号。分号连的是同一句里的并列成分（「找到 data 文件夹
 * （…；找不到就看 …）；」），在那切断会凭空造出一个「找不到就看…」的片段，
 * 回溯步骤起点时会被它挡住。
 *
 * 英文句点同样不算边界，否则 `.md`、`.docx`、`v1.2` 会被切断。
 */
function splitUnits(text: string, lineBreaks?: number[]): Unit[] {
  const lines: string[] = [];
  let start = 0;
  for (const at of (lineBreaks ?? []).filter((n) => n > start && n < text.length)) {
    lines.push(text.slice(start, at));
    start = at;
  }
  lines.push(text.slice(start));

  const units: Unit[] = [];
  const push = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed) units.push({ text: trimmed, index: units.length });
  };
  for (const line of lines) {
    let buffer = "";
    for (const char of line) {
      buffer += char;
      if (/[。！？!?]/.test(char)) {
        push(buffer);
        buffer = "";
      }
    }
    push(buffer);
  }
  return units;
}

function questionTerms(question: string): Set<string> {
  return new Set(tokenize(question));
}

/** 一个要点与问题的词重合量；bigram 命中即算，不额外加权。 */
function overlapOf(unit: Unit, terms: Set<string>): number {
  let hits = 0;
  for (const term of tokenize(unit.text)) {
    if (terms.has(term)) hits += 1;
  }
  return hits;
}

/**
 * 展开的继续条件：下一行要么与锚点行同族（句首也是动作词，说明是同组操作），
 * 要么自己与提问有足够的词重合。两个都不满足就停——枚举块里下一个 bullet
 * 讲的是别的事，不该被当成第二步。
 *
 * 阈值为 2 而不是 1：只重合一个词就续上，会把「语言：中文 / English 即时切换」
 * 接到「主题：…」后面（两者只共享「切换」），也会把「在线工作台的内容在云端」
 * 接到数据迁移步骤后面（只共享「电脑」）。
 */
function keepsGoing(candidate: Unit, anchor: Unit, terms: Set<string>): boolean {
  if (ACTION_HEAD.test(candidate.text) && ACTION_HEAD.test(anchor.text)) return true;
  return overlapOf(candidate, terms) >= 2;
}

/**
 * 定位：块内与提问词重合最多的那一行；全无重合则退回第一行。
 */
function findFocus(units: Unit[], terms: Set<string>): Unit {
  let best = units[0];
  let bestScore = -1;
  for (const unit of units) {
    const score = overlapOf(unit, terms);
    if (score > bestScore) {
      best = unit;
      bestScore = score;
    }
  }
  return best;
}

/**
 * 找到步骤组的起点。
 *
 * 定位行是「最相关的一行」，但一步流程里最相关的往往是第二步：问「换电脑后
 * 怎么迁移笔记」，「整个文件夹复制到新电脑」比「找到旧电脑上的 data 文件夹」
 * 更贴题，直接从它开始答就丢了第一步。所以只要是句首动作行就继续向前回溯。
 *
 * 以「：」结尾的行不前移进去：那是引导语（「活动栏底部点「设置」：」），
 * 由 `leadOf` 单独取，不该占一个步骤号。
 */
function stepStart(units: Unit[], focus: Unit): number {
  let at = focus.index;
  while (at > 0) {
    const previous = units[at - 1];
    if (/[：:]\s*$/.test(previous.text)) break;
    if (!ACTION_HEAD.test(previous.text)) break;
    at -= 1;
  }
  return at;
}

/** 步骤前的引导行：「活动栏底部点「设置」：」→「活动栏底部点「设置」」。 */
function leadOf(units: Unit[], start: number): string | null {
  const strip = (text: string) =>
    cleanUnit(text).replace(/[：:]\s*$/, "").trim() || null;

  const previous = units[start - 1];
  if (previous && /[：:]\s*$/.test(previous.text)) return strip(previous.text);

  // 块首行常是整块的入口指引，而定位行在中间，它的上一行却是同级另一个条目。
  const head = units[0];
  if (start > 1 && head && /[：:]\s*$/.test(head.text)) return strip(head.text);
  return null;
}

function pickUnits(intent: AnswerIntent, units: Unit[], terms: Set<string>): Picked {
  const focus = findFocus(units, terms);

  switch (intent) {
    case "howto": {
      const start = stepStart(units, focus);
      const anchor = units[start];
      const steps: Unit[] = [anchor];
      for (let at = start + 1; at < units.length; at += 1) {
        if (steps.length >= MAX_UNITS.howto) break;
        // 同族判断始终对锚点做：第 3 步的句式可能与第 1 步不同，但它是不是
        // 「同一组操作」要看它像不像这组的开头。
        if (!keepsGoing(units[at], anchor, terms)) break;
        steps.push(units[at]);
      }
      return { lead: leadOf(units, start), units: steps };
    }
    case "where": {
      const picked: Unit[] = [focus];
      for (let at = focus.index + 1; at < units.length; at += 1) {
        if (picked.length >= MAX_UNITS.where) break;
        const candidate = units[at];
        if (!PLACE_CUE.test(candidate.text)) break;
        picked.push(candidate);
      }
      return { lead: null, units: picked };
    }
    case "capability": {
      // 结论句要真的在回答「能不能」，所以只在判断句里挑，不拿定位行凑数。
      const verdicts = units.filter((unit) => VERDICT_CUE.test(unit.text));
      const pool = verdicts.length ? verdicts : [focus];
      const top = pool.reduce((a, b) => (overlapOf(b, terms) > overlapOf(a, terms) ? b : a));
      const follower = units.find((unit) => unit.index === top.index + 1);
      const picked = follower ? [top, follower] : [top];
      return { lead: null, units: picked.slice(0, MAX_UNITS.capability) };
    }
    case "definition": {
      const defs = units.filter((unit) => DEF_CUE.test(unit.text));
      return { lead: null, units: (defs.length ? defs : units).slice(0, MAX_UNITS.definition) };
    }
    case "lookup":
      return { lead: null, units };
    default:
      return { lead: null, units: [] };
  }
}

/** 「记事：Markdown 编辑 > 导入与导出」→「导入与导出」；「Q18｜怎么导出」→「怎么导出」。 */
function headingLabel(heading: string): string {
  const tail = heading.split(" > ").pop()?.trim() ?? "";
  const faq = /^Q\d+\s*[｜|]\s*(.+)$/.exec(tail);
  return faq ? faq[1].trim() : tail;
}

function cleanUnit(text: string): string {
  return text.replace(LEADING_CONNECTIVE, "").replace(TRAILING_PUNCT, "").trim();
}

/** 原样直出：与改造前的行为一致，作为识别失败时的兜底。 */
function legacyAnswer(heading: string, body: string): string {
  if (!heading) return body;
  return body ? `**${heading}**\n\n${body}` : `**${heading}**`;
}

function renderBody(intent: AnswerIntent, picked: Picked): string {
  const lines = picked.units.map((unit) => cleanUnit(unit.text)).filter(Boolean);
  if (lines.length === 0) return "";

  if (intent === "howto") {
    const lead = picked.lead ? `${picked.lead}\n\n` : "";
    // 只有一步时不编号：单个「1.」读起来像流程被截断了。
    const steps =
      lines.length === 1
        ? lines[0]
        : lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
    return `${lead}${steps}`;
  }
  if (intent === "capability") {
    const [verdict, ...rest] = lines;
    return rest.length ? `${verdict}\n\n${rest.join("\n")}` : verdict;
  }
  return lines.join("\n");
}

/**
 * 每个意图的小标题候选，按轮换游标取。`null` 表示这一轮不加小标题、直接以
 * 正文开头——结论类和解释类一半回合不加标题，连着问两次时观感差别最明显。
 * 文案本身走 i18n，同一张表在两种语言下通用。
 */
type LabelKey =
  | "aiAnswerSteps"
  | "aiAnswerHowto"
  | "aiAnswerWhere"
  | "aiAnswerWhereAlt"
  | "aiAnswerVerdict"
  | "aiAnswerExplain";

const INTENT_LABELS: Partial<Record<AnswerIntent, ReadonlyArray<LabelKey | null>>> = {
  howto: ["aiAnswerSteps", "aiAnswerHowto"],
  where: ["aiAnswerWhere", "aiAnswerWhereAlt"],
  capability: ["aiAnswerVerdict", null],
  definition: ["aiAnswerExplain", null],
};

function labelFor(intent: AnswerIntent, lang: Lang): string | null {
  const options = INTENT_LABELS[intent];
  if (!options) return null;
  const key = nextVariant(intent, options);
  return key ? t(lang, key) : null;
}

/**
 * 把一次检索命中组装成回答。
 *
 * @param hits     `searchKnowledge` 的结果，只用 top-1——跨段合成不在本层职责内。
 * @param question 用户原话，决定意图、定位行与展开方向。
 */
export function composeLocalAnswerFromHit(hits: ManualHit[], question: string): string {
  const hit = hits[0];
  if (!hit) return "";

  const heading = headingLabel(hit.chunk.heading ?? "");
  const body = hit.chunk.text.trim();
  if (!body) return heading ? `**${heading}**` : "";

  const intent = classifyIntent(question, questionLang(question));
  const labelLang = answerLang(question, body);
  const units = splitUnits(body, hit.chunk.lineBreaks);
  // 单句块也走组装：只加一个小标题、不编号，这比把用户的问题原样当标题贴
  // 回去（`**Q18｜怎么把笔记导出为 PDF？**`）自然得多。
  if (intent === "fallback" || units.length === 0) return legacyAnswer(heading, body);

  // 检索层只有「得分下限」，没有「相关性下限」：完全无关的提问（「量子计算机
  // 的原理」）也会拿到某个 chunk。此时块内没有一个词与提问重合，重组出来的
  // 结构只会让错答案看起来更肯定，所以退回原样直出，让用户一眼看出没命中。
  const terms = questionTerms(question);
  if (!units.some((unit) => overlapOf(unit, terms) > 0)) return legacyAnswer(heading, body);

  const picked = pickUnits(intent, units, terms);
  const rendered = renderBody(intent, picked);
  if (!rendered) return legacyAnswer(heading, body);

  const label = labelFor(intent, labelLang);
  let answer = label ? `**${label}**\n\n${rendered}` : rendered;

  // 原文兜底：摘句只覆盖了部分原文时补上全段，保证「完整优先」的取舍不丢
  // 信息。覆盖八成以上就不重复贴了，那是纯噪声。
  const usedChars = picked.units.reduce((sum, unit) => sum + unit.text.length, 0);
  if (usedChars < body.length * 0.8) {
    const excerptLabel = t(labelLang, "aiAnswerExcerpt");
    answer += `\n\n> ${excerptLabel}${labelLang === "zh" ? "：" : ": "}${body}`;
  }
  return answer;
}
