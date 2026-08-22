/**
 * `explorer` namespace dictionaries: the activity-strip icon tooltip and the
 * file-tree panel (header actions, tree rows, empty/loading/error states).
 * Runtime failure messages (wire error strings) pass through untranslated by
 * policy.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'activity.explorer': '资源管理器',
  'panel.title': '资源管理器',
  'panel.refresh': '刷新',
  'panel.hidden.show': '显示隐藏文件',
  'panel.hidden.hide': '不显示隐藏文件',
  'panel.loading': '正在加载…',
  'panel.truncated': '条目过多，仅显示部分内容',
  'empty.noWorkspace': '没有可用的工作区',
  'empty.hint': '打开或新建一个会话后，这里会显示其工作目录。',
  'empty.directory': '此文件夹为空',
  'error.retry': '重试',
} satisfies Record<string, string>

/** The explorer namespace key union. */
export type ExplorerKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'activity.explorer': 'Explorer',
  'panel.title': 'Explorer',
  'panel.refresh': 'Refresh',
  'panel.hidden.show': 'Show hidden files',
  'panel.hidden.hide': 'Hide hidden files',
  'panel.loading': 'Loading…',
  'panel.truncated': 'Too many entries; showing a partial listing',
  'empty.noWorkspace': 'No workspace available',
  'empty.hint': 'Open or start a session to browse its working directory here.',
  'empty.directory': 'This folder is empty',
  'error.retry': 'Retry',
} satisfies Record<ExplorerKey, string>
