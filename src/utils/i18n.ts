import type { LangType } from "@/stores/settingsStore";

type TranslationKeys = {
  todo: string;
  notepad: string;
  newNote: string;
  importMd: string;
  importTxt: string;
  importNote: string;
  comingSoon: string;
  notes: string;
  categories: string;
  allNotes: string;
  uncategorizedNotes: string;
  newCategory: string;
  categoryNamePrompt: string;
  renameCategory: string;
  deleteCategory: string;
  confirmDeleteCategory: string;
  dragCategory: string;
  dragNote: string;
  moveNoteToCategoryConfirm: string;
  tags: string;
  all: string;
  settings: string;
  noNotes: string;
  untitled: string;
  confirmDelete: string;
  confirmDeleteNoteMessage: string;
  confirmYes: string;
  confirmNo: string;
  deleteNote: string;
  deleteTodo: string;
  confirmDeleteTodoMessage: string;
  todoTitle: string;
  totalStats: string;
  addTaskPlaceholder: string;
  lowPriority: string;
  mediumPriority: string;
  highPriority: string;
  dueDate: string;
  noDueDate: string;
  clearDueDate: string;
  add: string;
  filterAll: string;
  filterActive: string;
  filterCompleted: string;
  filterPriority: string;
  noCompleted: string;
  allDone: string;
  noTodos: string;
  pinTodo: string;
  unpinTodo: string;
  low: string;
  medium: string;
  high: string;
  noteTitlePlaceholder: string;
  createdAt: string;
  updatedAt: string;
  selectNote: string;
  orCreateNote: string;
  sourceEditor: string;
  preview: string;
  mdViewSource: string;
  mdViewPreview: string;
  mdViewSplit: string;
  mdPlaceholder: string;
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
  exportFile: string;
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
  friendSponsor: string;
  minimize: string;
  maximize: string;
  restore: string;
  wordCount: string;
  showWindow: string;
  quitApp: string;
  hideToTray: string;
  shortcutsSection: string;
  autoSaveSection: string;
  autoSaveOff: string;
  autoSave10s: string;
  autoSave30s: string;
  autoSave1m: string;
  shortcutToggleWindow: string;
  shortcutPinSticky: string;
  resetShortcuts: string;
  pressShortcut: string;
  pinSticky: string;
  unpinSticky: string;
  stickyNote: string;
  pinNote: string;
  unpinNote: string;
  tileNoNote: string;
  checkUpdate: string;
  checkingUpdate: string;
  upToDate: string;
  newVersion: string;
  downloadUpdate: string;
  checkUpdateFailed: string;
};

const zh: TranslationKeys = {
  todo: "待办事项",
  notepad: "记事本",
  newNote: "新建笔记",
  importMd: "导入 Markdown",
  importTxt: "导入 Text",
  importNote: "导入文件",
  comingSoon: "敬请期待",
  notes: "笔记",
  categories: "分类",
  allNotes: "全部笔记",
  uncategorizedNotes: "未分类笔记",
  newCategory: "新建分类",
  categoryNamePrompt: "输入分类名称:",
  renameCategory: "重命名分类",
  deleteCategory: "删除分类",
  confirmDeleteCategory: '删除分类"',
  dragCategory: "拖动分类",
  dragNote: "拖动笔记",
  moveNoteToCategoryConfirm: '是否将"{note}"笔记移动到"{category}"文件夹中？',
  tags: "标签",
  all: "全部",
  settings: "设置",
  noNotes: '暂无笔记，点击"新建笔记"开始',
  untitled: "无标题",
  confirmDelete: '确定删除笔记"',
  confirmDeleteNoteMessage: '是否删除"{note}"笔记？',
  confirmYes: "是",
  confirmNo: "否",
  deleteNote: "删除笔记",
  deleteTodo: "删除待办",
  confirmDeleteTodoMessage: '是否删除"{todo}"待办？',
  todoTitle: "待办事项",
  totalStats: "共 {total} 项，已完成 {done} 项",
  addTaskPlaceholder: "添加新任务...",
  lowPriority: "低优先级",
  mediumPriority: "中优先级",
  highPriority: "高优先级",
  dueDate: "截止日期",
  noDueDate: "截止",
  clearDueDate: "清除截止日期",
  add: "添加",
  filterAll: "全部",
  filterActive: "进行中",
  filterCompleted: "已完成",
  filterPriority: "全部优先级",
  noCompleted: "还没有已完成的任务",
  allDone: "所有任务都已完成！",
  noTodos: "暂无待办事项，添加一个吧",
  pinTodo: "置顶待办",
  unpinTodo: "取消置顶",
  low: "低",
  medium: "中",
  high: "高",
  noteTitlePlaceholder: "笔记标题...",
  createdAt: "创建于",
  updatedAt: "更新于",
  selectNote: "选择一个笔记开始编辑",
  orCreateNote: '或点击左侧"新建笔记"按钮',
  sourceEditor: "源码编辑",
  preview: "预览",
  mdViewSource: "源码",
  mdViewPreview: "预览",
  mdViewSplit: "分屏",
  mdPlaceholder: "在此输入 Markdown 源码...",
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
  exportFile: "导出文件",
  collapseSidebar: "收起边栏",
  expandSidebar: "展开边栏",
  saved: "已保存",
  unsaved: "未保存",
  save: "保存",
  file: "文件",
  help: "帮助",
  exit: "退出",
  about: "关于",
  aboutTitle: "关于 Cyan Notepad",
  version: "版本",
  author: "作者",
  sourceCode: "源代码",
  friendSponsor: "友情赞助",
  minimize: "最小化",
  maximize: "最大化",
  restore: "还原",
  wordCount: "{count} 字",
  showWindow: "显示窗口",
  quitApp: "退出",
  hideToTray: "最小化到托盘",
  shortcutsSection: "快捷键设置",
  autoSaveSection: "自动保存",
  autoSaveOff: "关闭",
  autoSave10s: "10 秒",
  autoSave30s: "30 秒",
  autoSave1m: "1 分钟",
  shortcutToggleWindow: "显示/隐藏窗口",
  shortcutPinSticky: "钉住磁贴",
  resetShortcuts: "恢复默认",
  pressShortcut: "按下快捷键...",
  pinSticky: "钉住磁贴",
  unpinSticky: "取消钉住",
  stickyNote: "磁贴笔记",
  pinNote: "置顶笔记",
  unpinNote: "取消置顶",
  tileNoNote: "没有选中的笔记",
  checkUpdate: "检查更新",
  checkingUpdate: "检查中...",
  upToDate: "已是最新版本",
  newVersion: "发现新版本 v{version}",
  downloadUpdate: "下载更新",
  checkUpdateFailed: "检查更新失败",
};

const en: TranslationKeys = {
  todo: "Todo List",
  notepad: "Notepad",
  newNote: "New Note",
  importMd: "Import Markdown",
  importTxt: "Import Text",
  importNote: "Import File",
  comingSoon: "Coming Soon",
  notes: "Notes",
  categories: "Categories",
  allNotes: "All Notes",
  uncategorizedNotes: "Uncategorized",
  newCategory: "New Category",
  categoryNamePrompt: "Enter category name:",
  renameCategory: "Rename Category",
  deleteCategory: "Delete Category",
  confirmDeleteCategory: 'Delete category "',
  dragCategory: "Drag Category",
  dragNote: "Drag Note",
  moveNoteToCategoryConfirm: 'Move "{note}" note to "{category}" folder?',
  tags: "Tags",
  all: "All",
  settings: "Settings",
  noNotes: 'No notes yet. Click "New Note" to start',
  untitled: "Untitled",
  confirmDelete: 'Delete note "',
  confirmDeleteNoteMessage: 'Delete "{note}" note?',
  confirmYes: "Yes",
  confirmNo: "No",
  deleteNote: "Delete Note",
  deleteTodo: "Delete Todo",
  confirmDeleteTodoMessage: 'Delete "{todo}" todo?',
  todoTitle: "Todo List",
  totalStats: "{total} items, {done} completed",
  addTaskPlaceholder: "Add a new task...",
  lowPriority: "Low Priority",
  mediumPriority: "Medium Priority",
  highPriority: "High Priority",
  dueDate: "Due Date",
  noDueDate: "Due",
  clearDueDate: "Clear due date",
  add: "Add",
  filterAll: "All",
  filterActive: "Active",
  filterCompleted: "Completed",
  filterPriority: "All Priorities",
  noCompleted: "No completed tasks yet",
  allDone: "All tasks are done!",
  noTodos: "No todos yet, add one",
  pinTodo: "Pin Todo",
  unpinTodo: "Unpin Todo",
  low: "Low",
  medium: "Med",
  high: "High",
  noteTitlePlaceholder: "Note title...",
  createdAt: "Created",
  updatedAt: "Updated",
  selectNote: "Select a note to start editing",
  orCreateNote: 'Or click "New Note" on the left',
  sourceEditor: "Source",
  preview: "Preview",
  mdViewSource: "Source",
  mdViewPreview: "Preview",
  mdViewSplit: "Split",
  mdPlaceholder: "Type Markdown source here...",
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
  exportFile: "Export File",
  collapseSidebar: "Collapse",
  expandSidebar: "Expand",
  saved: "Saved",
  unsaved: "Unsaved",
  save: "Save",
  file: "File",
  help: "Help",
  exit: "Exit",
  about: "About",
  aboutTitle: "About Cyan Notepad",
  version: "Version",
  author: "Author",
  sourceCode: "Source Code",
  friendSponsor: "Friend Sponsor",
  minimize: "Minimize",
  maximize: "Maximize",
  restore: "Restore",
  wordCount: "{count} words",
  showWindow: "Show Window",
  quitApp: "Quit",
  hideToTray: "Minimize to Tray",
  shortcutsSection: "Keyboard Shortcuts",
  autoSaveSection: "Auto Save",
  autoSaveOff: "Off",
  autoSave10s: "10 seconds",
  autoSave30s: "30 seconds",
  autoSave1m: "1 minute",
  shortcutToggleWindow: "Show/Hide Window",
  shortcutPinSticky: "Pin Sticky Note",
  resetShortcuts: "Reset to Default",
  pressShortcut: "Press shortcut...",
  pinSticky: "Pin as Sticky",
  unpinSticky: "Unpin",
  stickyNote: "Sticky Note",
  pinNote: "Pin Note",
  unpinNote: "Unpin Note",
  tileNoNote: "No note selected",
  checkUpdate: "Check for Updates",
  checkingUpdate: "Checking...",
  upToDate: "Up to date",
  newVersion: "New version v{version}",
  downloadUpdate: "Download Update",
  checkUpdateFailed: "Update check failed",
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
