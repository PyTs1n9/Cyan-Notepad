/**
 * Generates `preview-ai-panel.html`: the AI chat panel rendered at three widths
 * (280 / 340 / 500) with the real vendor SVG marks and the real metric formula
 * from `src/index.css`.
 *
 * Purpose: this machine has no GUI, so drag-resize behaviour cannot be checked
 * by eye. The preview is a static snapshot of the same numbers — it proves the
 * icons, the clamp curves and the narrow-state chip collapse, not the live drag.
 *
 * Run: node scripts/gen-ai-preview.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const LOGO_DIR = "src/assets/logos";
const BRANDS = {
  DeepSeek: "deepseek",
  OpenAI: "openai",
  Claude: "claude",
  Gemini: "gemini",
  "通义千问": "qwen",
  Kimi: "moonshot",
  "智谱 GLM": "zhipu",
  豆包: "doubao",
  Ollama: "ollama",
  "小米 MiMo": "xiaomimimo",
};

const marks = Object.fromEntries(
  Object.entries(BRANDS).map(([label, file]) => [
    label,
    readFileSync(`${LOGO_DIR}/${file}.svg`, "utf8").replace(/<title>[\s\S]*?<\/title>/i, ""),
  ]),
);

const chip = (label) => `
  <button class="ai-model-chip" type="button">
    <span class="ai-brand" role="img" aria-label="${label}" title="${label}">${marks[label]}</span>
    <span class="ai-model-chip__label">${label.toLowerCase().replace(/\s/g, "-")}</span>
    <span class="ai-model-chip__level">关闭</span>
    <svg class="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
  </button>`;

const tile = (label, extraClass = "") => `
  <div class="ai-avatar ai-avatar--brand ${extraClass}">
    <span class="ai-brand" role="img" aria-label="${label}">${marks[label]}</span>
  </div>`;

const panel = (width, label) => `
  <figure class="case">
    <figcaption>${label} · ${width}px</figcaption>
    <div class="ai-panel" style="width:${width}px">
      <div class="ai-head">
        ${tile("DeepSeek", "head-avatar")}
        <div class="head-text">
          <div class="head-title">deepseek-chat</div>
          <div class="head-status"><i></i>已连接</div>
        </div>
        <div class="head-actions">
          ${Array.from({ length: 4 }, () => '<span class="hbtn"></span>').join("")}
        </div>
      </div>
      <div class="ai-msg-list">
        <div class="ai-msg-row user-row">
          <div class="ai-msg-col ai-msg-col--user">
            <div class="ai-bubble user-bubble">帮我整理一下人工智能清单</div>
          </div>
          <div class="ai-avatar user-avatar">Q</div>
        </div>
        <div class="ai-msg-row">
          ${tile("DeepSeek")}
          <div class="ai-msg-col">
            <div class="ai-bubble">
              <p>「人工智能」清单（知识库收录内容）</p>
              <ul>
                <li>进行 YOLO v8 训练</li>
                <li>完成数据清洗任务</li>
                <li>调用 API 完成智能体搭建</li>
              </ul>
              <p>已同步更新到《测试文档》：清单列表补上了「人工智能」，并新增该清单的任务小节，原有内容未删。</p>
            </div>
          </div>
        </div>
      </div>
      <div class="ai-composer">
        <div class="capsule">
          <div class="capsule-footer">
            ${chip("DeepSeek")}
            <div class="perm"><span>只读</span><span class="perm-on">完全开放</span></div>
            <span class="send"></span>
          </div>
        </div>
      </div>
    </div>
  </figure>`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>AI 面板弹性缩放预览</title>
<style>
  /* The measured numbers below are copied from src/index.css so this page shows
     the same curve the app uses. Keep them in sync if that section changes. */
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 28px;
    background: #17171c; color: #e6e6ea;
    font: 14px/1.6 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    display: flex; gap: 26px; align-items: flex-start; flex-wrap: wrap;
  }
  .case { margin: 0; }
  figcaption { margin-bottom: 10px; font-size: 12px; color: #8b8b96; letter-spacing: .02em; }
  .ai-panel {
    container-type: inline-size;
    container-name: ai-sidebar;
    --ai-gutter: clamp(0.5rem, 2.4cqw, 0.75rem);
    --ai-head-gutter: clamp(0.5rem, 2.8cqw, 0.875rem);
    --ai-row-gap: clamp(0.3125rem, 1.6cqw, 0.5rem);
    --ai-avatar-size: clamp(1.25rem, 0.4rem + 4.35cqw, 1.625rem);
    --ai-bubble-px: clamp(0.625rem, 3.2cqw, 1rem);
    --ai-bubble-py: clamp(0.5rem, 2.2cqw, 0.6875rem);
    --ai-bubble-max: 95%;
    --ai-user-bubble-max: 85%;
    --ai-font: 0.875rem;
    height: 560px; display: flex; flex-direction: column;
    background: #1d1d23; border: 1px solid #2c2c34; border-radius: 10px; overflow: hidden;
  }
  .ai-head { display: flex; align-items: center; gap: 10px; height: 36px; padding-inline: var(--ai-head-gutter); border-bottom: 1px solid #2c2c34; }
  .head-text { min-width: 0; flex: 1; }
  .head-title { font-size: 14px; font-weight: 500; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head-status { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #8b8b96; margin-top: 2px; }
  .head-status i { width: 6px; height: 6px; border-radius: 99px; background: #22c55e; }
  .head-actions { display: flex; gap: 2px; }
  .hbtn { width: 28px; height: 28px; border-radius: 8px; background: #26262e; }
  .ai-avatar {
    width: var(--ai-avatar-size); height: var(--ai-avatar-size);
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 99px; background: #2b3a5c; color: #7aa2f7;
    font-size: calc(var(--ai-avatar-size) * 0.42);
  }
  .ai-avatar svg { width: 54%; height: 54%; }
  .ai-avatar--brand { background: transparent; box-shadow: none; color: #e6e6ea; }
  .ai-avatar--brand > .ai-brand { font-size: calc(var(--ai-avatar-size) * 0.8); }
  .head-avatar { --ai-avatar-size: 28px; }
  .user-avatar { background: #34343e; color: #cfcfd6; font-weight: 600; }
  .ai-msg-list { flex: 1; overflow: hidden; padding: 12px var(--ai-gutter); display: flex; flex-direction: column; justify-content: flex-end; gap: 12px; }
  .ai-msg-row { display: flex; align-items: flex-start; gap: var(--ai-row-gap); }
  .user-row { justify-content: flex-end; }
  .ai-msg-col { max-width: var(--ai-bubble-max); min-width: 0; }
  .ai-msg-col--user { max-width: var(--ai-user-bubble-max); display: flex; flex-direction: column; align-items: flex-end; }
  .ai-bubble {
    padding: var(--ai-bubble-py) var(--ai-bubble-px);
    font-size: var(--ai-font); line-height: 1.625;
    background: #22222a; border: 1px solid #2f2f38; border-radius: 16px 4px 16px 16px;
    overflow-wrap: anywhere;
  }
  .ai-bubble p { margin: 0 0 8px; }
  .ai-bubble p:last-child { margin-bottom: 0; }
  .ai-bubble ul { margin: 0 0 8px; padding-left: 20px; }
  .ai-bubble li { margin: 2px 0; }
  .user-bubble { background: #2b3a5c; border-color: transparent; border-radius: 16px 16px 4px 16px; }
  .ai-composer { padding: 4px var(--ai-gutter) 12px; }
  .capsule { border: 1px solid #2f2f38; background: #1a1a20; border-radius: 16px; padding: 8px 10px; }
  .capsule-footer { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 10px; }
  .ai-model-chip {
    display: flex; align-items: center; gap: 4px; max-width: 160px;
    padding: 4px 8px; border-radius: 99px; border: 1px solid #2f2f38;
    background: #23232b; color: #9a9aa6; font-size: 11px; cursor: pointer;
    min-width: 0; font-family: inherit;
  }
  .ai-model-chip__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-model-chip__level { flex-shrink: 0; background: #33333d; border-radius: 99px; padding: 0 4px; font-size: 10px; }
  .ai-brand { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; font-size: 0.8125rem; line-height: 1; color: #e6e6ea; }
  .ai-brand svg { display: block; width: 1em; height: 1em; }
  .chev { flex-shrink: 0; }
  .perm { display: flex; align-items: center; gap: 2px; border: 1px solid #2f2f38; border-radius: 99px; padding: 2px; font-size: 11px; color: #9a9aa6; }
  .perm span { padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
  .perm-on { background: #f59e0b; color: #fff; font-weight: 500; }
  .send { width: 32px; height: 32px; flex-shrink: 0; border-radius: 99px; background: #7aa2f7; }
  .capsule-footer > .ai-model-chip { margin-right: auto; }

  @container ai-sidebar (max-width: 340px) {
    .ai-msg-col { --ai-bubble-max: 100%; }
    .ai-msg-col--user { --ai-user-bubble-max: 92%; }
  }
  @container ai-sidebar (max-width: 320px) {
    .ai-bubble { --ai-font: 0.8125rem; }
    .ai-model-chip__label, .ai-model-chip__level { display: none; }
    .ai-model-chip { max-width: none; padding-inline: 0.375rem; }
    .ai-model-chip .ai-brand { font-size: 0.875rem; }
  }
  @container ai-sidebar (min-width: 440px) {
    .ai-msg-col { --ai-bubble-max: 88%; }
    .ai-msg-col--user { --ai-user-bubble-max: 80%; }
  }
</style>
</head>
<body>
${panel(280, "极窄（新下限）")}
${panel(340, "默认宽度")}
${panel(500, "上限宽度")}
</body>
</html>
`;

writeFileSync("preview-ai-panel.html", html, "utf8");
console.log("preview-ai-panel.html written");
