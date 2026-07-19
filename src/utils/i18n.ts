import type { LangType } from "@/stores/settingsStore";

type TranslationKeys = {
  todo: string;
  notepad: string;
  imageHost: string;
  explorer: string;
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
  authSignIn: string;
  authSignUp: string;
  authSignOut: string;
  authAccount: string;
  authWelcome: string;
  authSubtitle: string;
  authSignedIn: string;
  authEmail: string;
  authPassword: string;
  authConfirmPassword: string;
  authPasswordPlaceholder: string;
  authPasswordTooShort: string;
  authPasswordMismatch: string;
  authCheckEmail: string;
  authWorking: string;
  authNotConfigured: string;
  authNotConfiguredHint: string;
  workspace: string;
  workspaceTitle: string;
  workspaceLoginRequired: string;
  workspaceLoginHint: string;
  createWorkspace: string;
  joinWorkspace: string;
  workspaceName: string;
  inviteCode: string;
  inviteCodeHint: string;
  inviteRole: string;
  manageWorkspace: string;
  shareWorkspace: string;
  copyInvite: string;
  copied: string;
  regenerateInvite: string;
  newCloudDocument: string;
  cloudDocumentName: string;
  noWorkspaces: string;
  noCloudDocuments: string;
  workspaceMembers: string;
  roleOwner: string;
  roleEditor: string;
  roleViewer: string;
  removeMember: string;
  leaveWorkspace: string;
  deleteWorkspace: string;
  confirmDeleteWorkspace: string;
  confirmDeleteCloudDocument: string;
  collaborationConnecting: string;
  collaborationConnected: string;
  collaborationDisconnected: string;
  collaborationError: string;
  collaborationNotConfigured: string;
  onlineUsers: string;
  readOnly: string;
  cloudSavedRealtime: string;
  workspaceBackendNotReady: string;
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
  settingsBasic: string;
  settingsTheme: string;
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
  deletePreset: string;
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
  undo: string;
  redo: string;
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
  stickyOpacity: string;
  dataLocation: string;
  openDataFolder: string;
  imageCache: string;
  openImageCache: string;
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
  explorer: "资源管理器",
  imageHost: "图床",
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
  authSignIn: "登录",
  authSignUp: "注册",
  authSignOut: "退出登录",
  authAccount: "账号",
  authWelcome: "登录 Cyan Notepad",
  authSubtitle: "登录后可使用联网工作台",
  authSignedIn: "当前已登录",
  authEmail: "邮箱",
  authPassword: "密码",
  authConfirmPassword: "确认密码",
  authPasswordPlaceholder: "至少 6 位密码",
  authPasswordTooShort: "密码至少需要 6 位",
  authPasswordMismatch: "两次输入的密码不一致",
  authCheckEmail: "注册成功，请打开邮箱完成验证后再登录。",
  authWorking: "处理中...",
  authNotConfigured: "登录服务尚未配置",
  authNotConfiguredHint: "请在 .env.local 中填写 Supabase Project URL 和 publishable/anon key，然后重新启动应用。",
  workspace: "工作台",
  workspaceTitle: "联网工作台",
  workspaceLoginRequired: "登录后使用工作台",
  workspaceLoginHint: "登录后即可创建或加入多人协作工作台",
  createWorkspace: "创建工作台",
  joinWorkspace: "加入工作台",
  workspaceName: "工作台名称",
  inviteCode: "邀请码",
  inviteCodeHint: "将邀请码发送给其他用户即可加入",
  inviteRole: "新成员权限",
  manageWorkspace: "管理工作台",
  shareWorkspace: "分享工作台",
  copyInvite: "复制邀请码",
  copied: "已复制",
  regenerateInvite: "更换邀请码",
  newCloudDocument: "新建云文档",
  cloudDocumentName: "文档名称",
  noWorkspaces: "还没有工作台，创建或加入一个吧",
  noCloudDocuments: "工作台中还没有文档",
  workspaceMembers: "工作台成员",
  roleOwner: "所有者",
  roleEditor: "可编辑",
  roleViewer: "仅查看",
  removeMember: "移除成员",
  leaveWorkspace: "退出工作台",
  deleteWorkspace: "删除工作台",
  confirmDeleteWorkspace: "确定删除整个工作台及其中的所有文档吗？",
  confirmDeleteCloudDocument: "确定删除这篇云文档吗？",
  collaborationConnecting: "正在连接",
  collaborationConnected: "实时同步",
  collaborationDisconnected: "离线编辑",
  collaborationError: "协作连接失败",
  collaborationNotConfigured: "尚未配置协作服务器地址",
  onlineUsers: "在线",
  readOnly: "只读",
  cloudSavedRealtime: "修改会实时保存",
  workspaceBackendNotReady: "工作台数据库尚未初始化，请先在 Supabase SQL Editor 中执行项目提供的迁移脚本。",
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
  settingsBasic: "基础",
  settingsTheme: "主题",
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
  deletePreset: "删除预设",
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
  undo: "撤销",
  redo: "前进",
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
  stickyOpacity: "磁贴透明度",
  dataLocation: "数据保存位置",
  openDataFolder: "点击跳转",
  imageCache: "图片缓存",
  openImageCache: "点击跳转",
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
  explorer: "Explorer",
  imageHost: "Image Host",
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
  authSignIn: "Sign In",
  authSignUp: "Create Account",
  authSignOut: "Sign Out",
  authAccount: "Account",
  authWelcome: "Sign in to Cyan Notepad",
  authSubtitle: "Sign in to use online workspaces",
  authSignedIn: "Currently signed in",
  authEmail: "Email",
  authPassword: "Password",
  authConfirmPassword: "Confirm Password",
  authPasswordPlaceholder: "At least 6 characters",
  authPasswordTooShort: "Password must be at least 6 characters",
  authPasswordMismatch: "The passwords do not match",
  authCheckEmail: "Account created. Check your email to confirm it before signing in.",
  authWorking: "Working...",
  authNotConfigured: "Sign-in is not configured",
  authNotConfiguredHint: "Add the Supabase Project URL and publishable/anon key to .env.local, then restart the app.",
  workspace: "Workspace",
  workspaceTitle: "Online Workspace",
  workspaceLoginRequired: "Sign in to use workspaces",
  workspaceLoginHint: "Create or join a collaborative workspace after signing in",
  createWorkspace: "Create Workspace",
  joinWorkspace: "Join Workspace",
  workspaceName: "Workspace name",
  inviteCode: "Invite code",
  inviteCodeHint: "Share this code with people you want to invite",
  inviteRole: "New member role",
  manageWorkspace: "Manage Workspace",
  shareWorkspace: "Share Workspace",
  copyInvite: "Copy invite code",
  copied: "Copied",
  regenerateInvite: "Regenerate code",
  newCloudDocument: "New Cloud Document",
  cloudDocumentName: "Document name",
  noWorkspaces: "No workspace yet. Create or join one.",
  noCloudDocuments: "No documents in this workspace",
  workspaceMembers: "Workspace Members",
  roleOwner: "Owner",
  roleEditor: "Editor",
  roleViewer: "Viewer",
  removeMember: "Remove member",
  leaveWorkspace: "Leave Workspace",
  deleteWorkspace: "Delete Workspace",
  confirmDeleteWorkspace: "Delete this workspace and all of its documents?",
  confirmDeleteCloudDocument: "Delete this cloud document?",
  collaborationConnecting: "Connecting",
  collaborationConnected: "Live sync",
  collaborationDisconnected: "Editing offline",
  collaborationError: "Collaboration failed",
  collaborationNotConfigured: "Collaboration server URL is not configured",
  onlineUsers: "Online",
  readOnly: "Read only",
  cloudSavedRealtime: "Changes are saved in real time",
  workspaceBackendNotReady: "The workspace database is not initialized. Run the provided migration in the Supabase SQL Editor first.",
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
  settingsBasic: "General",
  settingsTheme: "Theme",
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
  deletePreset: "Delete preset",
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
  undo: "Undo",
  redo: "Redo",
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
  stickyOpacity: "Sticky Opacity",
  dataLocation: "Data Location",
  openDataFolder: "Open Folder",
  imageCache: "Image Cache",
  openImageCache: "Open Folder",
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
