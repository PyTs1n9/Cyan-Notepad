/**
 * Todo 新建动作的内部信道。
 *
 * 契约（v0.7 起收敛）：
 * - 本模块**只**服务于「把焦点送到新建待办输入框」这一件事：`TodoSidebar` 的「新建待办」
 *   按钮与 `TodoView` 的空态按钮各派发一次 `"new-todo"`，待办条带监听后聚焦到那个输入框。
 *   两个派发点指向**同一个**输入框，因此没有长出第二套入口，也没有第二条失效路径。
 * - 顶栏原本作为「传送门」的跨视图动作派发（打开便签贴纸、新建画布、工作区邀请等）
 *   已按归属下沉到各自视图：动作由拥有该能力的视图自己实现，不再经由全局事件转发。
 * - 因此 `PortalAction` 联合类型只保留 `"new-todo"`。
 *
 * 为什么要收敛而不是继续保留词汇表：**没人派发的动作词汇，正是重复入口的来源**。
 * 只要联合类型里还留着一个动作名，就总会有第二个地方（菜单项、按钮、快捷键说明）
 * 愿意为它再挂一个入口，同一能力于是长出多套入口、多套失效路径。词汇表与派发点
 * 一一对应时，这类重复入口在类型层面就无法新增。
 */

export const PORTAL_ACTION_EVENT = "qing-notepad:portal-action";

/** 唯一存活的动作：Todo 侧栏请求新建一条待办。 */
export type PortalAction = "new-todo";

/**
 * 派发一个 Todo 信道动作。
 *
 * @param action 要派发的动作，目前只允许 `"new-todo"`。
 */
export function dispatchPortalAction(action: PortalAction): void {
  window.dispatchEvent(new CustomEvent<PortalAction>(PORTAL_ACTION_EVENT, { detail: action }));
}
