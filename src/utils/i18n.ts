import type { LangType } from "@/stores/settingsStore";

type TranslationKeys = {
  todo: string;
  notepad: string;
  newNote: string;
  importMd: string;
  importTxt: string;
  notes: string;
  tags: string;
  all: string;
  settings: string;
  noNotes: string;
  untitled: string;
  confirmDelete: string;
  deleteNote: string;
  todoTitle: string;
  totalStats: string;
  addTaskPlaceholder: string;
  lowPriority: string;
  mediumPriority: string;
  highPriority: string;
  add: string;
  filterAll: string;
  filterActive: string;
  filterCompleted: string;
  filterPriority: string;
  noCompleted: string;
  allDone: string;
  noTodos: string;
  low: string;
  medium: string;
  high: string;
  notepadMode: string;
  mdMode: string;
  noteTitlePlaceholder: string;
  createdAt: string;
  updatedAt: string;
  selectNote: string;
  orCreateNote: string;
  sourceEditor: string;
  preview: string;
  mdPlaceholder: string;
  editorPlaceholder: string;
  inputTagName: string;
  toggleToolbar: string;
  settingsTitle: string;
  themeColor: string;
  darkTheme: string;
  blueTheme: string;
  yellowTheme: string;
  greenTheme: string;
  customTheme: string;
  customPalette: string;
  savePreset: string;
  selectPreset: string;
  noPresets: string;
  presetName: string;
  presetFull: string;
  bgPrimary: string;
  bgSecondary: string;
  bgSidebar: string;
  textPrimary: string;
  accentColor: string;
  language: string;
  chinese: string;
  english: string;
  close: string;
  defaultFont: string;
  importFont: string;
  exportMd: string;
  exportTxt: string;
  collapseSidebar: string;
  expandSidebar: string;
  saved: string;
  unsaved: string;
  save: string;
  file: string;
  help: string;
  exit: string;
  about: string;
  aboutTitle: string;
  version: string;
  author: string;
  sourceCode: string;
  minimize: string;
  maximize: string;
  restore: string;
  wordCount: string;
  showWindow: string;
  quitApp: string;
  hideToTray: string;
  shortcutsSection: string;
  shortcutToggleWindow: string;
  shortcutPinSticky: string;
  resetShortcuts: string;
  pressShortcut: string;
  pinSticky: string;
  unpinSticky: string;
  stickyNote: string;
  pinNote: string;
  tileNoNote: string;
};

const zh: TranslationKeys = {
  todo: "待办事项",
  notepad: "记事本",
  newNote: "新建笔记",
  importMd: "导入 Markdown",
  importTxt: "导入 Text",
  notes: "笔记",
  tags: "标签",
  all: "全部",
  settings: "设置",
  noNotes: '暂无笔记，点击"新建笔记"开始',
  untitled: "无标题",
  confirmDelete: '确定删除笔记"',
  deleteNote: "删除笔记",
  todoTitle: "待办事项",
  totalStats: "共 {total} 项，已完成 {done} 项",
  addTaskPlaceholder: "添加新任务...",
  lowPriority: "低优先级",
  mediumPriority: "中优先级",
  highPriority: "高优先级",
  add: "添加",
  filterAll: "全部",
  filterActive: "进行中",
  filterCompleted: "已完成",
  filterPriority: "全部优先级",
  noCompleted: "还没有已完成的任务",
  allDone: "所有任务都已完成！",
  noTodos: "暂无待办事项，添加一个吧",
  low: "低",
  medium: "中",
  high: "高",
  notepadMode: "记事本模式",
  mdMode: "MD 模式",
  noteTitlePlaceholder: "笔记标题...",
  createdAt: "创建于",
  updatedAt: "更新于",
  selectNote: "选择一个笔记开始编辑",
  orCreateNote: '或点击左侧"新建笔记"按钮',
  sourceEditor: "源码编辑",
  preview: "预览",
  mdPlaceholder: "在此输入 Markdown 源码...",
  editorPlaceholder: "开始写下你的想法...",
  inputTagName: "输入标签名称:",
  toggleToolbar: "工具栏",
  settingsTitle: "设置",
  themeColor: "主题颜色",
  darkTheme: "深色",
  blueTheme: "蓝调",
  yellowTheme: "忧郁黄",
  greenTheme: "清新绿",
  customTheme: "自定义",
  customPalette: "自定义调色板",
  savePreset: "保存预设",
  selectPreset: "选择预设",
  noPresets: "暂无保存的预设",
  presetName: "预设名称",
  presetFull: "已保存 5 个预设（已满）",
  bgPrimary: "主背景",
  bgSecondary: "次背景",
  bgSidebar: "侧边栏",
  textPrimary: "主文字",
  accentColor: "强调色",
  language: "语言",
  chinese: "中文",
  english: "English",
  close: "关闭",
  defaultFont: "默认字体",
  importFont: "导入字体",
  exportMd: "导出 MD",
  exportTxt: "导出 TXT",
  collapseSidebar: "收起边栏",
  expandSidebar: "展开边栏",
  saved: "已保存",
  unsaved: "未保存",
  save: "保存",
  file: "文件",
  help: "帮助",
  exit: "退出",
  about: "关于",
  aboutTitle: "关于 BaiQingTodo",
  version: "版本",
  author: "作者",
  sourceCode: "源代码",
  minimize: "最小化",
  maximize: "最大化",
  restore: "还原",
  wordCount: "{count} 字",
  showWindow: "显示窗口",
  quitApp: "退出",
  hideToTray: "最小化到托盘",
  shortcutsSection: "快捷键设置",
  shortcutToggleWindow: "显示/隐藏窗口",
  shortcutPinSticky: "钉住磁贴",
  resetShortcuts: "恢复默认",
  pressShortcut: "按下快捷键...",
  pinSticky: "钉住磁贴",
  unpinSticky: "取消钉住",
  stickyNote: "磁贴笔记",
  pinNote: "置顶笔记",
  tileNoNote: "没有选中的笔记",
};

const en: TranslationKeys = {
  todo: "Todo List",
  notepad: "Notepad",
  newNote: "New Note",
  importMd: "Import Markdown",
  importTxt: "Import Text",
  notes: "Notes",
  tags: "Tags",
  all: "All",
  settings: "Settings",
  noNotes: 'No notes yet. Click "New Note" to start',
  untitled: "Untitled",
  confirmDelete: 'Delete note "',
  deleteNote: "Delete Note",
  todoTitle: "Todo List",
  totalStats: "{total} items, {done} completed",
  addTaskPlaceholder: "Add a new task...",
  lowPriority: "Low Priority",
  mediumPriority: "Medium Priority",
  highPriority: "High Priority",
  add: "Add",
  filterAll: "All",
  filterActive: "Active",
  filterCompleted: "Completed",
  filterPriority: "All Priorities",
  noCompleted: "No completed tasks yet",
  allDone: "All tasks are done!",
  noTodos: "No todos yet, add one",
  low: "Low",
  medium: "Med",
  high: "High",
  notepadMode: "Notepad",
  mdMode: "MD Mode",
  noteTitlePlaceholder: "Note title...",
  createdAt: "Created",
  updatedAt: "Updated",
  selectNote: "Select a note to start editing",
  orCreateNote: 'Or click "New Note" on the left',
  sourceEditor: "Source",
  preview: "Preview",
  mdPlaceholder: "Type Markdown source here...",
  editorPlaceholder: "Start writing your thoughts...",
  inputTagName: "Enter tag name:",
  toggleToolbar: "Toolbar",
  settingsTitle: "Settings",
  themeColor: "Theme",
  darkTheme: "Dark",
  blueTheme: "Blue",
  yellowTheme: "Moody Yellow",
  greenTheme: "Fresh Green",
  customTheme: "Custom",
  customPalette: "Custom Palette",
  savePreset: "Save Preset",
  selectPreset: "Select Preset",
  noPresets: "No saved presets",
  presetName: "Preset name",
  presetFull: "5 presets saved (full)",
  bgPrimary: "Background",
  bgSecondary: "Secondary BG",
  bgSidebar: "Sidebar",
  textPrimary: "Text",
  accentColor: "Accent",
  language: "Language",
  chinese: "中文",
  english: "English",
  close: "Close",
  defaultFont: "Default Font",
  importFont: "Import Font",
  exportMd: "Export MD",
  exportTxt: "Export TXT",
  collapseSidebar: "Collapse",
  expandSidebar: "Expand",
  saved: "Saved",
  unsaved: "Unsaved",
  save: "Save",
  file: "File",
  help: "Help",
  exit: "Exit",
  about: "About",
  aboutTitle: "About BaiQingTodo",
  version: "Version",
  author: "Author",
  sourceCode: "Source Code",
  minimize: "Minimize",
  maximize: "Maximize",
  restore: "Restore",
  wordCount: "{count} words",
  showWindow: "Show Window",
  quitApp: "Quit",
  hideToTray: "Minimize to Tray",
  shortcutsSection: "Keyboard Shortcuts",
  shortcutToggleWindow: "Show/Hide Window",
  shortcutPinSticky: "Pin Sticky Note",
  resetShortcuts: "Reset to Default",
  pressShortcut: "Press shortcut...",
  pinSticky: "Pin as Sticky",
  unpinSticky: "Unpin",
  stickyNote: "Sticky Note",
  pinNote: "Pin Note",
  tileNoNote: "No note selected",
};

const translations: Record<LangType, TranslationKeys> = { zh, en };

export function t(lang: LangType, key: keyof TranslationKeys): string {
  return translations[lang][key];
}

export function tWithParams(
  lang: LangType,
  key: keyof TranslationKeys,
  params: Record<string, string | number>,
): string {
  let result = translations[lang][key];
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(`{${k}}`, String(v));
  }
  return result;
}
