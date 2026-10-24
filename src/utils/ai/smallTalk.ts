/**
 * 「小青」的寒暄拦截层。
 *
 * 检索层的输入假定是「关于青记的问题」：用户问「你好」「你是谁」时，BM25 与
 * 向量通道仍会返回某个 chunk（只有得分下限，没有相关性下限），组装出的回答
 * 与提问毫无关系；问法贴近身份时还会被组装层判成 definition 意图，把某段手册
 * 正文当成自我介绍。离线模型没有生成能力，这类问法只能由固定话术回答。
 *
 * 因此这一层在检索之前做判定：命中则整轮跳过知识库，直接给小青的自我介绍。
 * 只认「整句就是寒暄」的问法——「你好，怎么导出 PDF」里带着实质问题，去掉寒暄
 * 词后仍有剩余文字，照旧走检索。
 */

/** 寒暄类别决定用哪段固定话术。 */
export type SmallTalkKind = "greeting" | "identity";

/** 标点、空白与符号不参与判定，先整体剔除。 */
const NOISE = /[\s，。、！？~～!?.,;:：；'"“”‘’()（）[\]【】\-—…·]/g;

/** 问候词。命中的部分在归一化文本里被减掉，剩余为空才算纯问候。 */
const GREETING_WORDS =
  /hellothere|hithere|你好|您好|哈喽|哈啰|嗨|在吗|在么|在不在|早上好|中午好|下午好|晚上好|早安|晚安|hello|hi|hey|yo/g;

/**
 * 称谓与语气助词。「小青你好呀」去掉问候与这些填充词后为空，仍是纯问候；
 * 但「小青山怎么改」会剩下「山怎么改」，因此不会被误拦。
 */
const FILLER = /小青|小晴|呀|啊|哈|哦|喔|呢|嘛|啦|鸭|哟|哇/g;

/**
 * 身份类问法。`NOISE` 已去掉空格，英文按连写匹配。
 * 只用于短句：长句里的「你是什么」多半在问别的，靠长度上限与负向前瞻挡掉
 * （「你是什么时候保存的」不能被当成自我介绍）。
 */
const IDENTITY_PATTERNS: readonly RegExp[] = [
  /你是谁|你是什么(?!时候|地方|原因|关系|意思)|你叫什么|你啥|啥模型|什么模型|哪个模型|哪家模型|你是(ai|人工智能|机器人|程序|助手|小青|小晴|真人|人吗)|介绍.{0,2}(你自己|你|自己)|你能做什么|你会做什么|你会什么|你能干嘛|你有什么(用|功能|能力)|你的(功能|能力|作用)/,
  /whoareyou|whatareyou|yourname|whichmodel|whatmodel|whatcanyoudo|whatdoyoudo|introduceyourself|areyou(an?ai|abot|robot|human)/,
];

/** 身份类判定只在这段长度内生效，避免长问句被整句误判。 */
const IDENTITY_MAX_CHARS = 30;

function normalize(text: string): string {
  return text.replace(NOISE, "").toLowerCase();
}

/** 去掉寒暄词与填充词后剩下的实义文字。 */
function residue(text: string): string {
  return text.replace(GREETING_WORDS, "").replace(FILLER, "");
}

/** 判定一句提问是不是寒暄/身份询问；返回 `null` 表示照常检索。 */
export function detectSmallTalk(question: string): SmallTalkKind | null {
  const bare = normalize(question);
  if (!bare) return null;

  // 身份类优先：「你好，你是谁」该答自我介绍，不是问候。
  if (bare.length <= IDENTITY_MAX_CHARS && IDENTITY_PATTERNS.some((p) => p.test(bare))) {
    return "identity";
  }
  if (residue(bare) === "") return "greeting";
  return null;
}
