import type { LangType } from "@/stores/settingsStore";

type TranslationKeys = {
  todo: string;
  notepad: string;
  imageHost: string;
  canvas: string;
  canvasSelect: string;
  canvasPan: string;
  canvasAddImage: string;
  canvasAddText: string;
  canvasZoomOut: string;
  canvasZoomIn: string;
  canvasResetZoom: string;
  canvasFit: string;
  canvasMoveLayerUp: string;
  canvasMoveLayerDown: string;
  canvasDelete: string;
  canvasExport: string;
  canvasExporting: string;
  canvasSaved: string;
  canvasSaving: string;
  canvasEmpty: string;
  canvasPasteHint: string;
  canvasLoading: string;
  canvasGuideTitle: string;
  canvasGuideSelect: string;
  canvasGuidePan: string;
  canvasGuideAdd: string;
  canvasGuideZoom: string;
  canvasGuideEdit: string;
  canvasGuideOverview: string;
  canvasOverview: string;
  canvasNew: string;
  canvasNamePlaceholder: string;
  canvasRename: string;
  canvasDeleteQuestion: string;
  canvasDeleteCanvas: string;
  canvasOpenList: string;
  canvasCloseList: string;
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
  authShowPassword: string;
  authHidePassword: string;
  authPasswordPlaceholder: string;
  authPasswordTooShort: string;
  authPasswordMismatch: string;
  authCheckEmail: string;
  authWorking: string;
  authAutoSigningIn: string;
  authRememberPassword: string;
  authAutoLogin: string;
  authForgotPassword: string;
  authForgotPasswordTitle: string;
  authForgotPasswordHint: string;
  authSendResetEmail: string;
  authResendResetEmail: string;
  authChangeResetEmail: string;
  authResetEmailRequired: string;
  authResetEmailSent: string;
  authManualRecoveryHint: string;
  authRecoveryLinkPlaceholder: string;
  authVerifyRecoveryLink: string;
  authRecoveryLinkRequired: string;
  authResetPasswordTitle: string;
  authResetPasswordHint: string;
  authNewPassword: string;
  authSetNewPassword: string;
  authRecoveryLinkInvalid: string;
  authPasswordResetSuccess: string;
  authPasswordResetDone: string;
  authNotConfigured: string;
  authNotConfiguredHint: string;
  workspace: string;
  workspaceTitle: string;
  workspaceLoginRequired: string;
  workspaceLoginHint: string;
  createWorkspace: string;
  joinWorkspace: string;
  workspaceAlreadyJoined: string;
  workspaceName: string;
  workspaceNameHint: string;
  renameWorkspace: string;
  saveWorkspaceName: string;
  inviteCode: string;
  inviteCodeHint: string;
  inviteRole: string;
  manageWorkspace: string;
  shareWorkspace: string;
  copyInvite: string;
  copied: string;
  regenerateInvite: string;
  newCloudDocument: string;
  newCloudDocumentHint: string;
  renameCloudDocument: string;
  cloudDocumentName: string;
  workspaceDocuments: string;
  noWorkspaces: string;
  noCloudDocuments: string;
  noCloudDocumentsReadOnly: string;
  workspaceMembers: string;
  roleOwner: string;
  roleEditor: string;
  roleViewer: string;
  removeMember: string;
  confirmRemoveMember: string;
  removedFromWorkspaceTitle: string;
  removedFromWorkspaceMessage: string;
  acknowledge: string;
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
  userHighlights: string;
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
  todoLists: string;
  todoListSummary: string;
  newTodoList: string;
  newTodo: string;
  defaultTodoList: string;
  listNamePlaceholder: string;
  renameTodoList: string;
  deleteTodoList: string;
  confirmDeleteTodoListMessage: string;
  pinTodoList: string;
  unpinTodoList: string;
  dragTodoList: string;
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
  customBackground: string;
  customBackgroundHint: string;
  backgroundHistory: string;
  chooseBackground: string;
  replaceBackground: string;
  removeBackground: string;
  backgroundUploadFailed: string;
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
  personal: string;
  personalSignInTitle: string;
  personalSignInHint: string;
  personalOpenSignIn: string;
  personalSignedIn: string;
  personalProfile: string;
  personalNickname: string;
  personalNicknamePlaceholder: string;
  personalChangeNickname: string;
  personalSaveNickname: string;
  personalChangeAvatar: string;
  personalAvatarHint: string;
  avatarCropTitle: string;
  avatarCropHint: string;
  avatarCropDragHint: string;
  avatarCropZoom: string;
  avatarCropZoomIn: string;
  avatarCropZoomOut: string;
  avatarCropCancel: string;
  avatarCropConfirm: string;
  avatarCropLoadFailed: string;
  avatarHistory: string;
  useHistoryAvatar: string;
  useHistoryBackground: string;
  deleteHistoryImage: string;
  personalSecurity: string;
  personalChangePassword: string;
  personalNewPassword: string;
  personalConfirmPassword: string;
  personalPasswordUpdated: string;
  personalPasswordMismatch: string;
  personalProfileUpdated: string;
  personalAvatarUpdated: string;
  personalSignOutHint: string;
  personalDataHint: string;
  personalNotConfigured: string;
  personalSaving: string;
  personalChooseImage: string;
  close: string;
  defaultFont: string;
  importFont: string;
  exportFile: string;
  collapseSidebar: string;
  expandSidebar: string;
  enableAlwaysOnTop: string;
  disableAlwaysOnTop: string;
  saved: string;
  unsaved: string;
  save: string;
  undo: string;
  redo: string;
  tools: string;
  portal: string;
  help: string;
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
  updateAvailableTitle: string;
  updateAvailableMessage: string;
  currentVersion: string;
  latestVersion: string;
  updateNow: string;
  updateLater: string;
  neverRemind: string;
};

const zh: TranslationKeys = {
  explorer: "资源管理器",
  imageHost: "图床",
  canvas: "画布",
  canvasSelect: "选择",
  canvasPan: "平移",
  canvasAddImage: "添加图片",
  canvasAddText: "添加文字",
  canvasZoomOut: "缩小",
  canvasZoomIn: "放大",
  canvasResetZoom: "重置缩放",
  canvasFit: "适应画布",
  canvasMoveLayerUp: "上移图层",
  canvasMoveLayerDown: "下移图层",
  canvasDelete: "删除对象",
  canvasExport: "导出",
  canvasExporting: "导出中…",
  canvasSaved: "已保存",
  canvasSaving: "保存中…",
  canvasEmpty: "画布还是空的",
  canvasPasteHint: "粘贴截图、拖入图片，或使用工具栏添加文字",
  canvasLoading: "正在加载画布…",
  canvasGuideTitle: "画布使用说明",
  canvasGuideSelect: "选择：拖动对象，拖拽右下角调整大小",
  canvasGuidePan: "平移：选择“平移”工具，或按住空格拖动",
  canvasGuideAdd: "添加：粘贴/拖入图片，或点击“添加图片”和“添加文字”",
  canvasGuideZoom: "缩放：按住 Ctrl/Cmd + 滚轮缩放画布；选中图片调整图片大小，选中文字调整字号",
  canvasGuideEdit: "编辑：双击文字进入编辑；Delete 删除，Ctrl/Cmd+Z 撤销",
  canvasGuideOverview: "小地图：右下角查看所有对象位置与当前视口，点击对象可居中跟踪",
  canvasOverview: "画布总览",
  canvasNew: "新建画布",
  canvasNamePlaceholder: "输入画布名称",
  canvasRename: "重命名画布",
  canvasDeleteQuestion: "确定删除“{name}”吗？",
  canvasDeleteCanvas: "删除画布",
  canvasOpenList: "展开画布列表",
  canvasCloseList: "收起画布列表",
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
  authShowPassword: "显示密码",
  authHidePassword: "隐藏密码",
  authPasswordPlaceholder: "至少 6 位密码",
  authPasswordTooShort: "密码至少需要 6 位",
  authPasswordMismatch: "两次输入的密码不一致",
  authCheckEmail: "注册成功，请打开邮箱完成验证后再登录。",
  authWorking: "处理中...",
  authAutoSigningIn: "正在自动登录",
  authRememberPassword: "记住密码",
  authAutoLogin: "自动登录",
  authForgotPassword: "找回密码",
  authForgotPasswordTitle: "找回密码",
  authForgotPasswordHint: "输入注册邮箱，我们会向该邮箱发送密码恢复链接。",
  authSendResetEmail: "发送重置邮件",
  authResendResetEmail: "重新发送",
  authChangeResetEmail: "更换邮箱",
  authResetEmailRequired: "请先输入用于找回密码的邮箱",
  authResetEmailSent: "密码重置邮件已发送，请复制邮件中的重置链接。",
  authManualRecoveryHint: "在邮件中右键复制“重置密码”按钮的链接，粘贴到这里即可继续。",
  authRecoveryLinkPlaceholder: "粘贴完整的密码恢复链接",
  authVerifyRecoveryLink: "验证链接并继续",
  authRecoveryLinkRequired: "请先粘贴邮件中的密码恢复链接",
  authResetPasswordTitle: "设置新密码",
  authResetPasswordHint: "恢复链接已验证，请设置新的登录密码。",
  authNewPassword: "新密码",
  authSetNewPassword: "确认修改密码",
  authRecoveryLinkInvalid: "恢复链接无效或已过期，请重新发送找回密码邮件。",
  authPasswordResetSuccess: "密码修改成功",
  authPasswordResetDone: "完成",
  authNotConfigured: "登录服务尚未配置",
  authNotConfiguredHint: "请在 .env.local 中填写 Supabase Project URL 和 publishable/anon key，然后重新启动应用。",
  workspace: "工作台",
  workspaceTitle: "工作台",
  workspaceLoginRequired: "登录后使用工作台",
  workspaceLoginHint: "登录后即可创建或加入多人协作工作台",
  createWorkspace: "创建工作台",
  joinWorkspace: "加入工作台",
  workspaceAlreadyJoined: "已经加入该工作台",
  workspaceName: "工作台名称",
  workspaceNameHint: "仅工作台所有者可以修改名称",
  renameWorkspace: "修改工作台名称",
  saveWorkspaceName: "保存名称",
  inviteCode: "邀请码",
  inviteCodeHint: "将邀请码发送给其他用户即可加入",
  inviteRole: "新成员权限",
  manageWorkspace: "管理工作台",
  shareWorkspace: "分享工作台",
  copyInvite: "复制邀请码",
  copied: "已复制",
  regenerateInvite: "更换邀请码",
  newCloudDocument: "新建云文档",
  newCloudDocumentHint: "在当前工作台开始协作",
  renameCloudDocument: "修改文档名",
  cloudDocumentName: "文档名称",
  workspaceDocuments: "协作文档",
  noWorkspaces: "还没有工作台，创建或加入一个吧",
  noCloudDocuments: "工作台中还没有文档",
  noCloudDocumentsReadOnly: "你在此工作台中为访客，仅可查看已有文档",
  workspaceMembers: "工作台成员",
  roleOwner: "所有者",
  roleEditor: "可编辑",
  roleViewer: "仅查看",
  removeMember: "移除成员",
  confirmRemoveMember: '确定将“{member}”移出“{workspace}”工作台吗？移除后，该成员将无法再访问其中的文档。',
  removedFromWorkspaceTitle: "已被移出工作台",
  removedFromWorkspaceMessage: '你已被移出“{workspace}”工作台，无法再访问其中的文档。',
  acknowledge: "知道了",
  leaveWorkspace: "退出工作台",
  deleteWorkspace: "删除工作台",
  confirmDeleteWorkspace: '是否删除"{workspace}"工作台及其中的所有文档？',
  confirmDeleteCloudDocument: '是否删除"{document}"云文档？',
  collaborationConnecting: "正在连接",
  collaborationConnected: "实时同步",
  collaborationDisconnected: "离线编辑",
  collaborationError: "协作连接失败",
  collaborationNotConfigured: "尚未配置协作服务器地址",
  onlineUsers: "在线",
  userHighlights: "用户高光",
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
  todoLists: "待办事项",
  todoListSummary: "共 {lists} 个清单 · {pending} 项待办",
  newTodoList: "新建清单",
  newTodo: "新建待办",
  defaultTodoList: "我的清单",
  listNamePlaceholder: "输入清单名称",
  renameTodoList: "重命名清单",
  deleteTodoList: "删除清单",
  confirmDeleteTodoListMessage: '删除清单“{list}”及其中的 {count} 项任务？此操作无法撤销。',
  pinTodoList: "置顶清单",
  unpinTodoList: "取消置顶",
  dragTodoList: "拖动清单",
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
  customBackground: "自定义背景",
  customBackgroundHint: "支持 JPG、PNG、WebP，图片将铺满主界面并存储在 img-need 中。",
  backgroundHistory: "历史背景",
  chooseBackground: "选择背景",
  replaceBackground: "更换背景",
  removeBackground: "移除背景",
  backgroundUploadFailed: "背景图片上传失败",
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
  personal: "个人",
  personalSignInTitle: "登录后管理个人资料",
  personalSignInHint: "登录后可以同步昵称和头像，并在不同设备间使用云端工作区。",
  personalOpenSignIn: "登录 / 注册",
  personalSignedIn: "已登录",
  personalProfile: "个人资料",
  personalNickname: "昵称",
  personalNicknamePlaceholder: "输入一个容易记住的昵称",
  personalChangeNickname: "更换昵称",
  personalSaveNickname: "保存昵称",
  personalChangeAvatar: "更换头像",
  personalAvatarHint: "支持 JPG、PNG、WebP；选择后可拖动、缩放并裁剪圆形头像。",
  avatarCropTitle: "编辑头像",
  avatarCropHint: "拖动图片调整位置，缩放后让需要的内容完整落在圆形区域内。",
  avatarCropDragHint: "拖动调整位置",
  avatarCropZoom: "缩放头像",
  avatarCropZoomIn: "放大",
  avatarCropZoomOut: "缩小",
  avatarCropCancel: "取消",
  avatarCropConfirm: "使用此头像",
  avatarCropLoadFailed: "无法读取这张图片，请选择 JPG、PNG 或 WebP 文件。",
  avatarHistory: "历史头像",
  useHistoryAvatar: "使用这个头像",
  useHistoryBackground: "使用这个背景",
  deleteHistoryImage: "删除历史图片",
  personalSecurity: "账号安全",
  personalChangePassword: "修改密码",
  personalNewPassword: "新密码",
  personalConfirmPassword: "确认新密码",
  personalPasswordUpdated: "密码已更新",
  personalPasswordMismatch: "两次输入的新密码不一致",
  personalProfileUpdated: "昵称已更新",
  personalAvatarUpdated: "头像已更新",
  personalSignOutHint: "退出后仍可继续使用本地笔记，云端工作区需要重新登录。",
  personalDataHint: "个人资料会安全地保存在登录账户中，仅用于身份识别和同步展示。",
  personalNotConfigured: "登录服务尚未配置，请先完成 Supabase 配置。",
  personalSaving: "保存中...",
  personalChooseImage: "选择图片",
  close: "关闭",
  defaultFont: "默认字体",
  importFont: "导入字体",
  exportFile: "导出文件",
  collapseSidebar: "收起边栏",
  expandSidebar: "展开边栏",
  enableAlwaysOnTop: "开启全局置顶",
  disableAlwaysOnTop: "关闭全局置顶",
  saved: "已保存",
  unsaved: "未保存",
  save: "保存",
  undo: "撤销",
  redo: "前进",
  tools: "工具",
  portal: "传送门",
  help: "帮助",
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
  quitApp: "退出软件",
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
  updateAvailableTitle: "发现新版本",
  updateAvailableMessage: "Cyan Notepad v{version} 已发布，是否立即更新？",
  currentVersion: "当前版本",
  latestVersion: "最新版本",
  updateNow: "立刻更新",
  updateLater: "稍后更新",
  neverRemind: "不再提醒",
};

const en: TranslationKeys = {
  explorer: "Explorer",
  imageHost: "Image Host",
  canvas: "Canvas",
  canvasSelect: "Select",
  canvasPan: "Pan",
  canvasAddImage: "Add image",
  canvasAddText: "Add text",
  canvasZoomOut: "Zoom out",
  canvasZoomIn: "Zoom in",
  canvasResetZoom: "Reset zoom",
  canvasFit: "Fit canvas",
  canvasMoveLayerUp: "Move layer up",
  canvasMoveLayerDown: "Move layer down",
  canvasDelete: "Delete object",
  canvasExport: "Export",
  canvasExporting: "Exporting…",
  canvasSaved: "Saved",
  canvasSaving: "Saving…",
  canvasEmpty: "Your canvas is empty",
  canvasPasteHint: "Paste a screenshot, drop an image, or add text from the toolbar",
  canvasLoading: "Loading canvas…",
  canvasGuideTitle: "Canvas guide",
  canvasGuideSelect: "Select: drag an object, or drag its bottom-right handle to resize",
  canvasGuidePan: "Pan: choose Pan, or hold Space while dragging",
  canvasGuideAdd: "Add: paste/drop an image, or use Add image and Add text",
  canvasGuideZoom: "Zoom: hold Ctrl/Cmd + wheel for the canvas; wheel a selected image to resize it or selected text to change its size",
  canvasGuideEdit: "Edit: double-click text to edit; Delete removes it, Ctrl/Cmd+Z undoes",
  canvasGuideOverview: "Minimap: see all object positions and the current viewport in the lower-right; click an object to center on it",
  canvasOverview: "Canvas overview",
  canvasNew: "New canvas",
  canvasNamePlaceholder: "Canvas name",
  canvasRename: "Rename canvas",
  canvasDeleteQuestion: "Delete \"{name}\"?",
  canvasDeleteCanvas: "Delete canvas",
  canvasOpenList: "Open canvas list",
  canvasCloseList: "Close canvas list",
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
  authShowPassword: "Show password",
  authHidePassword: "Hide password",
  authPasswordPlaceholder: "At least 6 characters",
  authPasswordTooShort: "Password must be at least 6 characters",
  authPasswordMismatch: "The passwords do not match",
  authCheckEmail: "Account created. Check your email to confirm it before signing in.",
  authWorking: "Working...",
  authAutoSigningIn: "Signing in automatically",
  authRememberPassword: "Remember password",
  authAutoLogin: "Auto login",
  authForgotPassword: "Forgot password?",
  authForgotPasswordTitle: "Recover password",
  authForgotPasswordHint: "Enter your account email and we will send a password recovery link.",
  authSendResetEmail: "Send reset email",
  authResendResetEmail: "Resend",
  authChangeResetEmail: "Change email",
  authResetEmailRequired: "Enter your account email first",
  authResetEmailSent: "Reset email sent. Copy the reset link from the email.",
  authManualRecoveryHint: "Right-click the reset-password button in the email, copy its link, and paste it here.",
  authRecoveryLinkPlaceholder: "Paste the full password recovery link",
  authVerifyRecoveryLink: "Verify link and continue",
  authRecoveryLinkRequired: "Paste the password recovery link from the email first",
  authResetPasswordTitle: "Set a new password",
  authResetPasswordHint: "The recovery link is verified. Enter your new password.",
  authNewPassword: "New password",
  authSetNewPassword: "Update password",
  authRecoveryLinkInvalid: "This recovery link is invalid or expired. Request a new reset email.",
  authPasswordResetSuccess: "Password updated successfully",
  authPasswordResetDone: "Done",
  authNotConfigured: "Sign-in is not configured",
  authNotConfiguredHint: "Add the Supabase Project URL and publishable/anon key to .env.local, then restart the app.",
  workspace: "Workspace",
  workspaceTitle: "Online Workspace",
  workspaceLoginRequired: "Sign in to use workspaces",
  workspaceLoginHint: "Create or join a collaborative workspace after signing in",
  createWorkspace: "Create Workspace",
  joinWorkspace: "Join Workspace",
  workspaceAlreadyJoined: "You have already joined this workspace",
  workspaceName: "Workspace name",
  workspaceNameHint: "Only the workspace owner can change its name",
  renameWorkspace: "Rename Workspace",
  saveWorkspaceName: "Save name",
  inviteCode: "Invite code",
  inviteCodeHint: "Share this code with people you want to invite",
  inviteRole: "New member role",
  manageWorkspace: "Manage Workspace",
  shareWorkspace: "Share Workspace",
  copyInvite: "Copy invite code",
  copied: "Copied",
  regenerateInvite: "Regenerate code",
  newCloudDocument: "New Cloud Document",
  newCloudDocumentHint: "Start collaborating in this workspace",
  renameCloudDocument: "Rename Document",
  cloudDocumentName: "Document name",
  workspaceDocuments: "Shared documents",
  noWorkspaces: "No workspace yet. Create or join one.",
  noCloudDocuments: "No documents in this workspace",
  noCloudDocumentsReadOnly: "You are a viewer in this workspace and can only read existing documents",
  workspaceMembers: "Workspace Members",
  roleOwner: "Owner",
  roleEditor: "Editor",
  roleViewer: "Viewer",
  removeMember: "Remove member",
  confirmRemoveMember: 'Remove “{member}” from the “{workspace}” workspace? They will no longer be able to access its documents.',
  removedFromWorkspaceTitle: "Removed from workspace",
  removedFromWorkspaceMessage: 'You were removed from the “{workspace}” workspace and can no longer access its documents.',
  acknowledge: "Got it",
  leaveWorkspace: "Leave Workspace",
  deleteWorkspace: "Delete Workspace",
  confirmDeleteWorkspace: 'Delete "{workspace}" workspace and all of its documents?',
  confirmDeleteCloudDocument: 'Delete "{document}" cloud document?',
  collaborationConnecting: "Connecting",
  collaborationConnected: "Live sync",
  collaborationDisconnected: "Editing offline",
  collaborationError: "Collaboration failed",
  collaborationNotConfigured: "Collaboration server URL is not configured",
  onlineUsers: "Online",
  userHighlights: "User highlights",
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
  todoLists: "Task Lists",
  todoListSummary: "{lists} lists · {pending} pending",
  newTodoList: "New List",
  newTodo: "New Todo",
  defaultTodoList: "My List",
  listNamePlaceholder: "Enter list name",
  renameTodoList: "Rename List",
  deleteTodoList: "Delete List",
  confirmDeleteTodoListMessage: 'Delete “{list}” and its {count} tasks? This cannot be undone.',
  pinTodoList: "Pin List",
  unpinTodoList: "Unpin List",
  dragTodoList: "Drag List",
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
  customBackground: "Custom Background",
  customBackgroundHint: "Supports JPG, PNG, and WebP. The image fills the main view and is stored in img-need.",
  backgroundHistory: "Background History",
  chooseBackground: "Choose Background",
  replaceBackground: "Replace Background",
  removeBackground: "Remove Background",
  backgroundUploadFailed: "Failed to upload background image",
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
  personal: "Personal",
  personalSignInTitle: "Sign in to manage your profile",
  personalSignInHint: "Sign in to sync your nickname and avatar, and use cloud workspaces across devices.",
  personalOpenSignIn: "Sign in / Create account",
  personalSignedIn: "Signed in",
  personalProfile: "Profile",
  personalNickname: "Nickname",
  personalNicknamePlaceholder: "Choose a nickname people will remember",
  personalChangeNickname: "Change nickname",
  personalSaveNickname: "Save nickname",
  personalChangeAvatar: "Change avatar",
  personalAvatarHint: "JPG, PNG, or WebP. Drag, zoom, and crop after choosing an image.",
  avatarCropTitle: "Edit avatar",
  avatarCropHint: "Drag to reposition, then zoom until the content you want fits inside the circle.",
  avatarCropDragHint: "Drag to reposition",
  avatarCropZoom: "Avatar zoom",
  avatarCropZoomIn: "Zoom in",
  avatarCropZoomOut: "Zoom out",
  avatarCropCancel: "Cancel",
  avatarCropConfirm: "Use this avatar",
  avatarCropLoadFailed: "This image could not be opened. Choose a JPG, PNG, or WebP file.",
  avatarHistory: "Avatar History",
  useHistoryAvatar: "Use this avatar",
  useHistoryBackground: "Use this background",
  deleteHistoryImage: "Delete history image",
  personalSecurity: "Account security",
  personalChangePassword: "Change password",
  personalNewPassword: "New password",
  personalConfirmPassword: "Confirm new password",
  personalPasswordUpdated: "Password updated",
  personalPasswordMismatch: "The new passwords do not match",
  personalProfileUpdated: "Nickname updated",
  personalAvatarUpdated: "Avatar updated",
  personalSignOutHint: "You can keep using local notes after signing out. Cloud workspaces require signing in again.",
  personalDataHint: "Your profile is stored securely with your account and is used only for identity and sync display.",
  personalNotConfigured: "Sign-in is not configured yet. Finish the Supabase setup first.",
  personalSaving: "Saving...",
  personalChooseImage: "Choose image",
  close: "Close",
  defaultFont: "Default Font",
  importFont: "Import Font",
  exportFile: "Export File",
  collapseSidebar: "Collapse",
  expandSidebar: "Expand",
  enableAlwaysOnTop: "Keep window on top",
  disableAlwaysOnTop: "Stop keeping window on top",
  saved: "Saved",
  unsaved: "Unsaved",
  save: "Save",
  undo: "Undo",
  redo: "Redo",
  tools: "Tools",
  portal: "Portal",
  help: "Help",
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
  quitApp: "Quit Application",
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
  updateAvailableTitle: "Update available",
  updateAvailableMessage: "Cyan Notepad v{version} is available. Update now?",
  currentVersion: "Current version",
  latestVersion: "Latest version",
  updateNow: "Update now",
  updateLater: "Later",
  neverRemind: "Don't remind again",
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
