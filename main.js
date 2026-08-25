/**
 * 发布工作台 wechat-publisher —— Forsion 桌面插件(裸 setup(ctx) 体,宿主 new Function('ctx', code) 装载)。
 *
 * 公众号编辑器按 CSS 属性白名单过滤:`class` 与外联样式表整体丢弃,只有元素上的 `style` 内联属性能活下来。
 * 所以笔记库里的 markdown 直接粘过去必崩。本插件把母稿渲染成**全 inline 化**的 HTML,一键进剪贴板;
 * 并在发之前做一次**本地体检**(纯规则引擎,离线可用),点名哪些块到了公众号会失效。
 *
 * 两个视图:
 *   plugin:wechat-publisher:composer —— 母稿(活动页 / 固定路径草稿)+ 公众号预览白纸卡 + 复制 + 体检。
 *   plugin:wechat-publisher:ledger   —— 发布台账(<工作文件夹>/Ledger/YYYY-MM.md,纯 markdown)。
 *
 * 渲染契约:parseDoc 唯一解析器,两个 emitter —— emitHtml(字节可断言,进剪贴板 / .html 导出)与
 *   emitDom(createElement + textContent + el.style,零 innerHTML,供预览卡与剪贴板路径 B 用)。
 * 安全:模型 / 用户 / 母稿的一切文本都只走 emitDom;全文件不存在把不可信内容拼进 innerHTML 的面。
 * 双语:ctx.getLocale() 取初值 + ctx.subscribeLocale() 跟变化,视图**不重挂**就换语言。
 * 时间:「现在」一律 Date.now();无周期定时器(check 冻钟可测)。
 */
const PLUGIN_ID = 'wechat-publisher'
const APP_ID = 'tangu'
/** 默认工作文件夹 = manifest 的中文 canonical name(跟随宿主约定,切英文不许换目录)。 */
const DEFAULT_WORK_FOLDER = '发布工作台'
const DRAFT_FILE = '草稿.md'
/** Amadeus 块标记行(宿主 shared/amadeus/compiler/markers.ts 的 BLOCK_MARKER_RE 同款)。 */
const MARKER_LINE = /^<!--\s*a\s+[A-Za-z0-9_-]+\s*-->\s*$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
/** ⚠️ 台账文件可能是 CRLF(用户手改 / Windows 编辑器)。行是 split('\n') 切的,
 *  行尾会残留 `\r`;`.` 不匹配 `\r`,所以两条正则都必须显式容忍 `\r?$`,否则整月判死。 */
const FIELD_RE = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]?(.*)\r?$/
const ENTRY_HEAD = /^##[ \t]+(\S+)[ \t]*\r?$/
const BLANK_LINE = /^[ \t]*\r?$/
/** 汉字 / 假名(**不含**全角标点 —— 标点边界不补空格)。 */
const CJK = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
const CJK_RE = new RegExp(`[${CJK}]`)
const LEDGER_STATUS = ['copied', 'exported', 'published']
const AUDIT_CODES = ['mermaid', 'math', 'raw-html', 'iframe-embed', 'remote-image', 'local-image',
  'external-link', 'table', 'wide-code', 'deep-heading', 'nested-list', 'footnote']

// ══ 双语词表(zh / en 两侧键集合必须完全相等 —— check.mjs 断言) ═══════════════
const MSG = {
  zh: {
    'view.composer': '发布工作台',
    'view.ledger': '发布台账',
    'cmd.open': '发布工作台:打开',
    'cmd.copy': '发布工作台:复制到公众号',
    'cmd.ledger': '发布工作台:打开台账',
    'set.styleTheme': '排版风格(classic / serif / compact)',
    'set.styleThemeDesc': 'classic=默认无衬线;serif=衬线正文;compact=紧凑行距',
    'set.fontSize': '正文字号(px)',
    'set.fontSizeDesc': '公众号正文常用 15–17px',
    'set.lineHeight': '行高(百分比)',
    'set.lineHeightDesc': '175 = 1.75 倍行高',
    'set.autoAudit': '母稿变化后自动体检',
    'set.autoAuditDesc': '关掉后只在点「体检」时检查',
    'src.label': '母稿',
    'src.page': '活动页',
    'src.draft': '草稿',
    'src.nopage': '当前没有打开的笔记 —— 切到「草稿」直接写,或先在库里打开一篇。',
    'src.placeholder': '在这里写或粘贴母稿(markdown)。失焦自动存草稿。',
    'src.saveDraft': '存草稿',
    'src.saved': '草稿已保存',
    'src.saveFail': '草稿保存失败:{err}',
    'src.readonly': '活动页只读:改内容请回笔记里改,或切到「草稿」。',
    'draft.conflict': '草稿文件在插件之外被改过,已停止覆盖 —— 请在下面选一边。',
    'draft.conflictBanner': '草稿文件在插件之外被改过。覆盖会丢掉磁盘上的那一版,请选一边:',
    'draft.useDisk': '用磁盘那版(丢弃这里的改动)',
    'draft.overwrite': '用这里这版覆盖磁盘',
    'draft.resolvedDisk': '已载入磁盘上的草稿',
    'tool.pangu': '排版规范化',
    'tool.audit': '体检',
    'tool.ai': 'AI 助手',
    'tool.panguDone': '已在中英文之间补齐空格',
    'tool.panguToDraft': '已把规范化后的正文放进「草稿」(活动页不会被改写)',
    'tool.panguNoop': '没有需要补空格的地方',
    'copy.btn': '复制到公众号',
    'copy.rich': '已复制富文本 —— 到公众号编辑器里 Ctrl/Cmd+V 粘贴',
    'copy.compat': '已复制(兼容模式)—— 到公众号编辑器里 Ctrl/Cmd+V 粘贴',
    'copy.exported': '剪贴板不可用,已导出 .html:{path} —— 用浏览器打开后全选复制',
    'copy.empty': '母稿是空的,没有可复制的内容',
    'copy.fail': '复制失败:{err}',
    'copy.ledgerFail': '内容已复制,但台账写入失败:{err}',
    'preview.title': '公众号预览',
    'preview.empty': '这里会显示母稿渲染成公众号排版后的样子。',
    'audit.title': '发布前体检',
    'audit.clean': '没有发现问题',
    'audit.summary': '{block} 项阻断 · {warn} 项警告 · {info} 项提示',
    'audit.line': '第 {n} 行',
    'audit.toggle': '展开 / 收起',
    'audit.hint': '处理办法',
    'level.block': '阻断',
    'level.warn': '警告',
    'level.info': '提示',
    'audit.mermaid.title': 'mermaid 图表',
    'audit.mermaid.hint': '本插件不渲染 mermaid。请自行截图,再作为图片手工上传到公众号。',
    'audit.math.title': '数学公式',
    'audit.math.hint': '公众号不渲染公式。请截图后手工上传。',
    'audit.raw-html.title': '裸 HTML 标签',
    'audit.raw-html.hint': '会被公众号编辑器整段剥掉(本插件也只会把它转义成可见文字)。请改写成 markdown。',
    'audit.iframe-embed.title': '外部嵌入',
    'audit.iframe-embed.hint': '公众号只认自家卡片。请在编辑器里手工插入对应卡片。',
    'audit.remote-image.title': '外链图片',
    'audit.remote-image.hint': '公众号不收外域图片。请在公众号编辑器里手工上传原图。',
    'audit.local-image.title': '本地图片',
    'audit.local-image.hint': '请在公众号编辑器里手工上传这张图。',
    'audit.external-link.title': '外部链接',
    'audit.external-link.hint': '公众号正文会剥掉外链只留文字。改用「阅读原文」,或在文末列出网址。',
    'audit.table.title': '表格',
    'audit.table.hint': '表格样式会掉。行数多的话建议改成截图。',
    'audit.wide-code.title': '超宽代码行',
    'audit.wide-code.hint': '单行超过 60 字符会横向溢出。请手工折行。',
    'audit.deep-heading.title': '四级及更深标题',
    'audit.deep-heading.hint': '公众号观感上建议标题不超过三级。',
    'audit.nested-list.title': '嵌套列表',
    'audit.nested-list.hint': '本版渲染为单层列表。需要层级请改写成缩进文字。',
    'audit.footnote.title': '脚注',
    'audit.footnote.hint': '不渲染为脚注,会按普通文字输出。',
    'ledger.title': '发布台账',
    'ledger.empty': '这个月还没有发布记录。',
    'ledger.error': '这个月的台账读不动,已停止写入,请手工检查 {path}',
    'ledger.prev': '上个月',
    'ledger.next': '下个月',
    'ledger.col.time': '时间',
    'ledger.col.title': '标题',
    'ledger.col.platform': '平台',
    'ledger.col.source': '来源',
    'ledger.col.status': '状态',
    'ledger.col.words': '字数',
    'ledger.col.checks': '体检',
    'ledger.col.url': '链接',
    'ledger.markPublished': '标记已发布',
    'ledger.openSource': '打开来源',
    'ledger.openMonth': '打开月文件',
    'ledger.urlPrompt': '填入这篇文章的公众号链接',
    'ledger.noPrompt': '当前宿主没有输入框接口,填不了链接 —— 请打开月文件手工改这一条。',
    'ledger.marked': '已标记为已发布',
    'ledger.writeFail': '台账写入失败:{err}',
    'ledger.count': '{n} 条记录',
    'st.copied': '已复制',
    'st.exported': '已导出',
    'st.published': '已发布',
    'ai.title': 'AI 助手',
    'ai.titles': '起标题',
    'ai.summary': '写摘要',
    'ai.rewrite': '改写语气',
    'ai.advice': '体检建议',
    'ai.tone': '语气',
    'ai.tone.wechat': '公众号口语',
    'ai.tone.pro': '专业克制',
    'ai.tone.rednote': '小红书轻快',
    'ai.run': '开始',
    'ai.cancel': '取消',
    'ai.close': '关闭',
    'ai.running': '生成中…',
    'ai.needLogin': 'AI 助手需要已登录的 Forsion 桌面端;其余功能(渲染 / 复制 / 体检 / 台账)不受影响。',
    'ai.raw': '没能解析成结构化结果,下面是模型原文:',
    'ai.empty': '母稿是空的',
    'ai.emptyAudit': '体检没有发现问题,不需要建议',
    'ai.copy': '复制这条',
    'ai.copied': '已复制',
    'ai.fail': '失败:{err}',
    'ai.truncated': '(母稿过长,已截断到前 8000 字)',
    'status.title': '发布前体检(点开发布工作台)',
    'words.count': '{n} 字',
    'common.close': '关闭',
  },
  en: {
    'view.composer': 'Publisher',
    'view.ledger': 'Publish Ledger',
    'cmd.open': 'Publisher: Open',
    'cmd.copy': 'Publisher: Copy for WeChat',
    'cmd.ledger': 'Publisher: Open ledger',
    'set.styleTheme': 'Article style (classic / serif / compact)',
    'set.styleThemeDesc': 'classic = sans-serif default; serif = serif body; compact = tighter spacing',
    'set.fontSize': 'Body font size (px)',
    'set.fontSizeDesc': 'WeChat articles usually use 15-17px',
    'set.lineHeight': 'Line height (percent)',
    'set.lineHeightDesc': '175 = 1.75 line height',
    'set.autoAudit': 'Run pre-flight check automatically',
    'set.autoAuditDesc': 'Turn off to check only when you press the button',
    'src.label': 'Source',
    'src.page': 'Active note',
    'src.draft': 'Draft',
    'src.nopage': 'No note is open — switch to Draft and write here, or open a note in your vault.',
    'src.placeholder': 'Write or paste your markdown here. The draft is saved when this box loses focus.',
    'src.saveDraft': 'Save draft',
    'src.saved': 'Draft saved',
    'src.saveFail': 'Could not save the draft: {err}',
    'src.readonly': 'The active note is read-only here — edit it in the note, or switch to Draft.',
    'draft.conflict': 'The draft file changed outside this plugin. Saving was stopped — pick a side below.',
    'draft.conflictBanner': 'The draft file changed outside this plugin. Overwriting would lose the version on disk, so pick a side:',
    'draft.useDisk': 'Keep the file on disk (discard changes here)',
    'draft.overwrite': 'Overwrite the file with this version',
    'draft.resolvedDisk': 'Loaded the draft from disk',
    'tool.pangu': 'Normalize spacing',
    'tool.audit': 'Pre-flight check',
    'tool.ai': 'AI assistant',
    'tool.panguDone': 'Spaces added between CJK and Latin text',
    'tool.panguToDraft': 'Normalized text placed in Draft (the active note was not rewritten)',
    'tool.panguNoop': 'Nothing needed spacing',
    'copy.btn': 'Copy for WeChat',
    'copy.rich': 'Rich text copied — paste with Ctrl/Cmd+V in the WeChat editor',
    'copy.compat': 'Copied (compatibility mode) — paste with Ctrl/Cmd+V in the WeChat editor',
    'copy.exported': 'Clipboard unavailable, exported .html: {path} — open it in a browser, select all, copy',
    'copy.empty': 'The source is empty, nothing to copy',
    'copy.fail': 'Copy failed: {err}',
    'copy.ledgerFail': 'Copied, but writing the ledger failed: {err}',
    'preview.title': 'WeChat preview',
    'preview.empty': 'Your source rendered the way WeChat will show it appears here.',
    'audit.title': 'Pre-flight check',
    'audit.clean': 'Nothing to fix',
    'audit.summary': '{block} blocking · {warn} warnings · {info} notes',
    'audit.line': 'line {n}',
    'audit.toggle': 'Show / hide',
    'audit.hint': 'What to do',
    'level.block': 'blocking',
    'level.warn': 'warning',
    'level.info': 'note',
    'audit.mermaid.title': 'Mermaid diagram',
    'audit.mermaid.hint': 'This plugin does not render mermaid. Screenshot it yourself and upload the picture by hand.',
    'audit.math.title': 'Math formula',
    'audit.math.hint': 'WeChat does not render formulas. Screenshot it and upload the picture.',
    'audit.raw-html.title': 'Raw HTML tag',
    'audit.raw-html.hint': 'The WeChat editor strips it (this plugin only escapes it into visible text). Rewrite it as markdown.',
    'audit.iframe-embed.title': 'External embed',
    'audit.iframe-embed.hint': 'WeChat only accepts its own cards. Insert the card by hand in the editor.',
    'audit.remote-image.title': 'Remote image',
    'audit.remote-image.hint': 'WeChat does not accept off-site images. Upload the original by hand in the WeChat editor.',
    'audit.local-image.title': 'Local image',
    'audit.local-image.hint': 'Upload this picture by hand in the WeChat editor.',
    'audit.external-link.title': 'External link',
    'audit.external-link.hint': 'WeChat strips links in the body and keeps the text. Use "Read original", or list the URL at the end.',
    'audit.table.title': 'Table',
    'audit.table.hint': 'Table styling is lost. For long tables use a screenshot instead.',
    'audit.wide-code.title': 'Wide code line',
    'audit.wide-code.hint': 'Lines over 60 characters overflow sideways. Wrap them by hand.',
    'audit.deep-heading.title': 'Heading level 4 or deeper',
    'audit.deep-heading.hint': 'WeChat articles read better with at most three heading levels.',
    'audit.nested-list.title': 'Nested list',
    'audit.nested-list.hint': 'This version renders one level only. Use indented text if you need depth.',
    'audit.footnote.title': 'Footnote',
    'audit.footnote.hint': 'Footnotes are not rendered; the marker is emitted as ordinary text.',
    'ledger.title': 'Publish ledger',
    'ledger.empty': 'No entries for this month yet.',
    'ledger.error': 'This month’s ledger could not be parsed. Writing is disabled; please check {path} by hand.',
    'ledger.prev': 'Previous month',
    'ledger.next': 'Next month',
    'ledger.col.time': 'Time',
    'ledger.col.title': 'Title',
    'ledger.col.platform': 'Platform',
    'ledger.col.source': 'Source',
    'ledger.col.status': 'Status',
    'ledger.col.words': 'Words',
    'ledger.col.checks': 'Checks',
    'ledger.col.url': 'URL',
    'ledger.markPublished': 'Mark as published',
    'ledger.openSource': 'Open source',
    'ledger.openMonth': 'Open month file',
    'ledger.urlPrompt': 'Paste the published WeChat article URL',
    'ledger.noPrompt': 'This host has no input dialog, so the URL cannot be filled in — open the month file and edit this entry by hand.',
    'ledger.marked': 'Marked as published',
    'ledger.writeFail': 'Ledger write failed: {err}',
    'ledger.count': '{n} entries',
    'st.copied': 'Copied',
    'st.exported': 'Exported',
    'st.published': 'Published',
    'ai.title': 'AI assistant',
    'ai.titles': 'Title ideas',
    'ai.summary': 'Summary',
    'ai.rewrite': 'Rewrite tone',
    'ai.advice': 'Fix advice',
    'ai.tone': 'Tone',
    'ai.tone.wechat': 'WeChat conversational',
    'ai.tone.pro': 'Professional and restrained',
    'ai.tone.rednote': 'Rednote light',
    'ai.run': 'Run',
    'ai.cancel': 'Cancel',
    'ai.close': 'Close',
    'ai.running': 'Working…',
    'ai.needLogin': 'The AI assistant needs a signed-in Forsion desktop. Everything else (render / copy / check / ledger) still works.',
    'ai.raw': 'Could not parse a structured result. Raw model output:',
    'ai.empty': 'The source is empty',
    'ai.emptyAudit': 'The check found nothing, so there is no advice to give',
    'ai.copy': 'Copy this',
    'ai.copied': 'Copied',
    'ai.fail': 'Failed: {err}',
    'ai.truncated': '(source truncated to the first 8000 characters)',
    'status.title': 'Pre-flight check (opens Publisher)',
    'words.count': '{n} words',
    'common.close': 'Close',
  },
}
const L = () => {
  try { return (ctx.getLocale ? ctx.getLocale() : 'zh') || 'zh' } catch { return 'zh' }
}
function t(k, vars) {
  const d = MSG[L()] || MSG.zh
  let s = d[k] != null ? d[k] : (MSG.zh[k] != null ? MSG.zh[k] : k)
  if (vars) for (const n of Object.keys(vars)) s = s.split('{' + n + '}').join(String(vars[n]))
  return s
}

// ══ 小工具 ═════════════════════════════════════════════════════════════════
const say = (m, o) => { try { if (ctx.notify) ctx.notify(m, o); else ctx.app.notify(m) } catch { /* ignore */ } }
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const getLS = (k, d) => { try { const v = localStorage.getItem(`plugin.${PLUGIN_ID}.${k}`); return v == null ? d : v } catch { return d } }
const setLS = (k, v) => { try { localStorage.setItem(`plugin.${PLUGIN_ID}.${k}`, String(v)) } catch { /* ignore */ } }
const wfRoot = () => { try { return (ctx.app && ctx.app.workFolder ? ctx.app.workFolder() : DEFAULT_WORK_FOLDER) || DEFAULT_WORK_FOLDER } catch { return DEFAULT_WORK_FOLDER } }
const draftPath = () => `${wfRoot()}/${DRAFT_FILE}`
const ledgerPath = (ym) => `${wfRoot()}/Ledger/${ym}.md`
const exportPath = (slug) => `${wfRoot()}/Exports/${today()}-${sanitizeFileName(slug)}.html`
/** 宿主文件面在 web / 老宿主上可能整个缺席(同步抛 TypeError)—— 一律包起来,绝不放飞未捕获的 rejection。 */
async function safeRead(p) {
  try { return await ctx.app.readFile(p) } catch (e) { throw new Error(String((e && e.message) || e)) }
}
async function safeWrite(p, text) { return ctx.app.writeFile(p, text) }
const pad2 = (n) => String(n).padStart(2, '0')
function today() {
  const d = new Date(Date.now())
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const nowIso = () => new Date(Date.now()).toISOString()
const monthOfIso = (iso) => String(iso || '').slice(0, 7)
const fmtDate = (iso) => {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return String(iso || '')
  const d = new Date(ms)
  return `${d.toLocaleDateString(L() === 'zh' ? 'zh-CN' : 'en-US')} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
function clampNum(v, min, max, dflt) {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n)) return dflt
  return Math.max(min, Math.min(max, n))
}
function sanitizeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled'
}
function safeHref(u) {
  const s = String(u || '').trim()
  return /^(https?:\/\/|mailto:|#)/i.test(s) ? s : ''
}
function safeSrc(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  if (/^(https?:\/\/|data:image\/)/i.test(s)) return s
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(s)) return '' // 未知协议(javascript: / vbscript: …)一律拒
  return s // 相对路径
}

// ══ 母稿净化(frontmatter + 宿主块标记行 —— 漏了就会被复制进公众号正文) ═════
function stripFrontmatter(md) {
  const s = String(md == null ? '' : md).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = s.split('\n')
  if (lines[0] == null || lines[0].trim() !== '---') return s
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return lines.slice(i + 1).join('\n').replace(/^\n+/, '')
  }
  return s // 未闭合 → 不当 frontmatter,原样返回
}
function stripHostMarkers(md) {
  return String(md == null ? '' : md).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n').filter((l) => !MARKER_LINE.test(l)).join('\n')
}
/** 净化 + **净化后行号 → 原文行号**映射表。体检的 line 算在净化文本上,
 *  而「点体检条目跳到左栏对应行」量的是原文 textarea —— 没有这张表就会跳错行。
 *  map[i](0-based)= 净化后第 i 行在原文里的 1-based 行号。 */
function cleanSourceMap(md) {
  const s = String(md == null ? '' : md).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = s.split('\n')
  let start = 0
  if (lines[0] != null && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) { if (lines[i].trim() === '---') { start = i + 1; break } }
    // stripFrontmatter 的 replace(/^\n+/,'') —— frontmatter 后的前导空行也被吃掉
    while (start < lines.length && lines[start] === '') start += 1
  }
  const out = []
  const map = []
  for (let i = start; i < lines.length; i++) {
    if (MARKER_LINE.test(lines[i])) continue
    out.push(lines[i])
    map.push(i + 1)
  }
  return { text: out.join('\n'), map }
}
const cleanSource = (md) => cleanSourceMap(md).text

// ══ 转义三部曲(顺序钉死:escapeHtml → nbspRuns → brLines) ═════════════════
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
}
/** 连续空格(2 个及以上)的**每一个**空格 → &nbsp;;单个空格不动。代码块内同样适用。 */
function nbspRuns(s) {
  return String(s == null ? '' : s).replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
}
/** 换行 → 字面 `<br>`(不是 `<br/>`)。 */
function brLines(s) {
  return String(s == null ? '' : s).split('\n').join('<br>')
}
const htmlText = (s) => brLines(nbspRuns(escapeHtml(s)))
/** emitDom 侧的等价语义:真 U+00A0 + 真 <br> 元素(路径 B 的 text/html 由浏览器序列化真 DOM 得到)。 */
const NBSP = String.fromCharCode(160)
function nbspText(s) {
  return String(s == null ? '' : s).replace(/ {2,}/g, (m) => NBSP.repeat(m.length))
}

// ══ 默认样式表(文章配色,不是插件 UI 主题;白底上一律 ≥4.5:1) ═══════════════
const sectionStyle = (fs, lh, theme) =>
  `font-size:${fs}px;line-height:${lh / 100};color:#3f3f3f;letter-spacing:0.034em;word-break:break-word;` +
  (theme === 'serif' ? 'font-family:Georgia,"Songti SC","Noto Serif CJK SC",serif;' : '')
const STYLE = {
  section: sectionStyle(16, 175, 'classic'),
  p: 'margin:0 0 1.2em;',
  h1: 'margin:1.6em 0 0.8em;font-size:20px;font-weight:700;color:#1a1a1a;',
  h2: 'margin:1.6em 0 0.8em;font-size:20px;font-weight:700;color:#1a1a1a;',
  h3: 'margin:1.4em 0 0.6em;font-size:17px;font-weight:600;color:#1a1a1a;',
  h4: 'margin:1.4em 0 0.6em;font-size:17px;font-weight:600;color:#1a1a1a;',
  blockquote: 'margin:1.2em 0;padding:0.6em 1em;border-left:3px solid #0b6f45;background:#f7f7f7;color:#5a5a5a;',
  pre: 'margin:1.2em 0;padding:1em;background:#f7f7f7;border-radius:4px;overflow-x:auto;',
  code: 'padding:0 4px;background:#f2f2f2;border-radius:3px;color:#0b6f45;font-size:14px;',
  a: 'color:#0b6f45;text-decoration:none;',
  li: 'margin:0 0 0.5em;',
  img: 'max-width:100%;height:auto;display:block;margin:1em auto;',
  hr: 'border:none;border-top:1px solid #e5e5e5;margin:2em 0;',
  table: 'border-collapse:collapse;width:100%;',
  th: 'border:1px solid #e5e5e5;padding:6px 10px;text-align:left;',
  td: 'border:1px solid #e5e5e5;padding:6px 10px;text-align:left;',
  // SPEC 表格之外、但「每个生成的元素都带 style」要求补齐的几个:
  ul: 'margin:1.2em 0;padding-left:1.4em;',
  ol: 'margin:1.2em 0;padding-left:1.4em;',
  thead: 'background:#f7f7f7;',
  tbody: 'background:transparent;',
  tr: 'border-bottom:1px solid #e5e5e5;',
  strong: 'font-weight:700;color:#1a1a1a;',
  em: 'font-style:italic;',
  del: 'text-decoration:line-through;color:#6a6a6a;',
}
/** 设置只改 section 与标题的几个数值,**绝不引入 class**。默认参数下逐字节 === STYLE。 */
function buildStyle(o) {
  const opt = o || {}
  const fs = clampNum(opt.fontSize, 14, 20, 16)
  const lh = clampNum(opt.lineHeight, 140, 220, 175)
  const theme = opt.styleTheme === 'serif' || opt.styleTheme === 'compact' ? opt.styleTheme : 'classic'
  const S = Object.assign({}, STYLE)
  S.section = sectionStyle(fs, lh, theme)
  if (theme === 'compact') {
    S.p = 'margin:0 0 0.8em;'
    S.h1 = S.h2 = 'margin:1.1em 0 0.5em;font-size:19px;font-weight:700;color:#1a1a1a;'
    S.h3 = S.h4 = 'margin:1em 0 0.4em;font-size:16px;font-weight:600;color:#1a1a1a;'
  }
  return S
}
/** 预览 / AI 原文用:同一套 emitter,但不刷文章配色(吃宿主 token)。 */
const PLAIN_STYLE = (() => { const o = {}; for (const k of Object.keys(STYLE)) o[k] = ''; return o })()

// ══ parseDoc:唯一解析器 ═══════════════════════════════════════════════════
/** SPEC 封死的行内子集:`**粗**` `*斜*` `` `码` `` `[文字](url)` `![alt](src)` `~~删~~`。
 *  ⚠️ **刻意不认 `_斜_`** —— 技术类稿件里 `snake_case_name` / `__init__` 满地都是,
 *  认下划线 = 把标识符静默改成斜体并吞掉下划线,这是 SPEC 子集之外的自作主张。 */
const INLINE_RE = /\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|`([^`\n]+)`|!\[([^\]]*)\]\(([^)\s]*)\)|\[([^\]\n]+)\]\(([^)\s]*)\)|\*([^*\n]+)\*/
function parseInline(text) {
  const out = []
  let rest = String(text == null ? '' : text)
  let m
  let guard = 0
  while ((m = INLINE_RE.exec(rest)) && guard++ < 5000) {
    if (m.index > 0) out.push({ t: 'text', v: rest.slice(0, m.index) })
    if (m[1] != null) out.push({ t: 'strong', v: m[1] })
    else if (m[2] != null) out.push({ t: 'del', v: m[2] })
    else if (m[3] != null) out.push({ t: 'code', v: m[3] })
    else if (m[4] != null || m[5] != null) out.push({ t: 'img', v: m[4] || '', src: m[5] || '' })
    else if (m[6] != null) out.push({ t: 'link', v: m[6], href: m[7] || '' })
    else if (m[8] != null) out.push({ t: 'em', v: m[8] })
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) out.push({ t: 'text', v: rest })
  return out
}
const TABLE_SEP = /^\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/
const splitRow = (line) => String(line).trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
function parseDoc(md) {
  const lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const nodes = []
  let para = []
  const flushPara = () => { if (para.length) { nodes.push({ type: 'p', inline: parseInline(para.join('\n')) }); para = [] } }
  let i = 0
  while (i < lines.length) {
    const raw = lines[i].replace(/\s+$/, '')
    const s = raw.trim()
    if (/^(```|~~~)/.test(s)) {
      flushPara()
      const lang = s.replace(/^(```|~~~)/, '').trim()
      const buf = []
      i += 1
      while (i < lines.length && !/^(```|~~~)\s*$/.test(lines[i].trim())) { buf.push(lines[i].replace(/\s+$/, '')); i += 1 }
      i += 1
      nodes.push({ type: 'code', lang, text: buf.join('\n') })
      continue
    }
    if (s === '') { flushPara(); i += 1; continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(s)) { flushPara(); nodes.push({ type: 'hr' }); i += 1; continue }
    const h = /^(#{1,6})\s+(.*)$/.exec(s)
    if (h) { flushPara(); nodes.push({ type: 'h', level: Math.min(4, h[1].length), inline: parseInline(h[2]) }); i += 1; continue }
    if (/^>\s?/.test(s)) {
      flushPara()
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i += 1 }
      nodes.push({ type: 'quote', inline: parseInline(buf.join('\n')) })
      continue
    }
    const imgOnly = /^!\[([^\]]*)\]\(([^)\s]*)\)$/.exec(s)
    if (imgOnly) { flushPara(); nodes.push({ type: 'img', alt: imgOnly[1], src: imgOnly[2] }); i += 1; continue }
    if (s.indexOf('|') >= 0 && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim())) {
      flushPara()
      const head = splitRow(s).map(parseInline)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) { rows.push(splitRow(lines[i]).map(parseInline)); i += 1 }
      nodes.push({ type: 'table', head, rows })
      continue
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i].replace(/\s+$/, ''))
    if (li) {
      flushPara()
      const ordered = /\d/.test(li[2])
      const items = []
      while (i < lines.length) {
        const mm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i].replace(/\s+$/, ''))
        if (!mm) break
        if (/\d/.test(mm[2]) !== ordered && !mm[1]) break
        items.push(parseInline(mm[3]))
        i += 1
      }
      nodes.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }
    para.push(raw)
    i += 1
  }
  flushPara()
  return nodes
}

// ══ emitter ①:emitHtml —— 字节可断言,进剪贴板 / .html 导出 ═══════════════
function inlineHtml(spans, S) {
  const out = []
  for (const sp of spans || []) {
    if (sp.t === 'text') out.push(htmlText(sp.v))
    else if (sp.t === 'strong') out.push(`<strong style="${S.strong}">${htmlText(sp.v)}</strong>`)
    else if (sp.t === 'em') out.push(`<em style="${S.em}">${htmlText(sp.v)}</em>`)
    else if (sp.t === 'del') out.push(`<del style="${S.del}">${htmlText(sp.v)}</del>`)
    else if (sp.t === 'code') out.push(`<code style="${S.code}">${htmlText(sp.v)}</code>`)
    else if (sp.t === 'img') {
      const src = safeSrc(sp.src)
      out.push(`<img style="${S.img}"${src ? ` src="${escapeHtml(src)}"` : ''} alt="${escapeHtml(sp.v)}">`)
    } else if (sp.t === 'link') {
      // 两个 emitter 的属性面必须一致(check 有断言);target/rel 同时挡住预览卡里点链接把宿主窗口导航走
      const href = safeHref(sp.href)
      out.push(`<a style="${S.a}"${href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : ''}>${htmlText(sp.v)}</a>`)
    }
  }
  return out.join('')
}
function blockHtml(n, S) {
  if (n.type === 'p') return `<p style="${S.p}">${inlineHtml(n.inline, S)}</p>`
  if (n.type === 'h') { const tag = `h${n.level}`; return `<${tag} style="${S[tag]}">${inlineHtml(n.inline, S)}</${tag}>` }
  if (n.type === 'quote') return `<blockquote style="${S.blockquote}">${inlineHtml(n.inline, S)}</blockquote>`
  if (n.type === 'code') return `<pre style="${S.pre}">${htmlText(n.text)}</pre>`
  if (n.type === 'hr') return `<hr style="${S.hr}">`
  if (n.type === 'img') {
    const src = safeSrc(n.src)
    return `<img style="${S.img}"${src ? ` src="${escapeHtml(src)}"` : ''} alt="${escapeHtml(n.alt)}">`
  }
  if (n.type === 'ul' || n.type === 'ol') {
    const tag = n.type
    return `<${tag} style="${S[tag]}">` + (n.items || []).map((it) => `<li style="${S.li}">${inlineHtml(it, S)}</li>`).join('') + `</${tag}>`
  }
  if (n.type === 'table') {
    const head = `<thead style="${S.thead}"><tr style="${S.tr}">` + (n.head || []).map((c) => `<th style="${S.th}">${inlineHtml(c, S)}</th>`).join('') + '</tr></thead>'
    const body = `<tbody style="${S.tbody}">` + (n.rows || []).map((r) => `<tr style="${S.tr}">` + r.map((c) => `<td style="${S.td}">${inlineHtml(c, S)}</td>`).join('') + '</tr>').join('') + '</tbody>'
    return `<table style="${S.table}">${head}${body}</table>`
  }
  return ''
}
function emitHtml(nodes, style) {
  const S = style || STYLE
  return `<section style="${S.section}">` + (nodes || []).map((n) => blockHtml(n, S)).join('') + '</section>'
}
/** 导出 .html 的外壳(编译期字面量;字节承诺只约束 emitHtml 本身)。 */
const htmlDocument = (inner) => '<!doctype html><meta charset="utf-8"><title>publisher export</title>' + String(inner || '')

// ══ emitter ②:emitDom —— createElement + textContent + el.style,零 innerHTML ══
function domText(parent, s, doc) {
  const parts = nbspText(s).split('\n')
  for (let i = 0; i < parts.length; i++) {
    if (i) parent.appendChild(doc.createElement('br'))
    if (parts[i]) parent.appendChild(doc.createTextNode(parts[i]))
  }
}
function mkEl(doc, tag, css) {
  const el = doc.createElement(tag)
  if (el.style) el.style.cssText = css == null ? '' : css
  return el
}
function inlineDom(parent, spans, S, doc) {
  for (const sp of spans || []) {
    if (sp.t === 'text') { domText(parent, sp.v, doc); continue }
    if (sp.t === 'img') {
      const el = mkEl(doc, 'img', S.img)
      const src = safeSrc(sp.src)
      if (src) el.setAttribute('src', src)
      el.setAttribute('alt', String(sp.v || ''))
      parent.appendChild(el)
      continue
    }
    if (sp.t === 'link') {
      const el = mkEl(doc, 'a', S.a)
      const href = safeHref(sp.href)
      if (href) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
      domText(el, sp.v, doc)
      parent.appendChild(el)
      continue
    }
    const tag = sp.t === 'strong' ? 'strong' : sp.t === 'em' ? 'em' : sp.t === 'del' ? 'del' : sp.t === 'code' ? 'code' : null
    if (!tag) continue
    const el = mkEl(doc, tag, S[tag])
    domText(el, sp.v, doc)
    parent.appendChild(el)
  }
}
function blockDom(n, S, doc) {
  if (n.type === 'p') { const el = mkEl(doc, 'p', S.p); inlineDom(el, n.inline, S, doc); return el }
  if (n.type === 'h') { const tag = `h${n.level}`; const el = mkEl(doc, tag, S[tag]); inlineDom(el, n.inline, S, doc); return el }
  if (n.type === 'quote') { const el = mkEl(doc, 'blockquote', S.blockquote); inlineDom(el, n.inline, S, doc); return el }
  if (n.type === 'code') { const el = mkEl(doc, 'pre', S.pre); domText(el, n.text, doc); return el }
  if (n.type === 'hr') return mkEl(doc, 'hr', S.hr)
  if (n.type === 'img') {
    const el = mkEl(doc, 'img', S.img)
    const src = safeSrc(n.src)
    if (src) el.setAttribute('src', src)
    el.setAttribute('alt', String(n.alt || ''))
    return el
  }
  if (n.type === 'ul' || n.type === 'ol') {
    const el = mkEl(doc, n.type, S[n.type])
    for (const it of n.items || []) { const li = mkEl(doc, 'li', S.li); inlineDom(li, it, S, doc); el.appendChild(li) }
    return el
  }
  if (n.type === 'table') {
    const el = mkEl(doc, 'table', S.table)
    const thead = mkEl(doc, 'thead', S.thead)
    const hr = mkEl(doc, 'tr', S.tr)
    for (const c of n.head || []) { const th = mkEl(doc, 'th', S.th); inlineDom(th, c, S, doc); hr.appendChild(th) }
    thead.appendChild(hr)
    el.appendChild(thead)
    const tbody = mkEl(doc, 'tbody', S.tbody)
    for (const r of n.rows || []) {
      const tr = mkEl(doc, 'tr', S.tr)
      for (const c of r) { const td = mkEl(doc, 'td', S.td); inlineDom(td, c, S, doc); tr.appendChild(td) }
      tbody.appendChild(tr)
    }
    el.appendChild(tbody)
    return el
  }
  return null
}
function emitDom(nodes, style, doc) {
  const d = doc || (globalThis.document)
  const S = style || STYLE
  const root = mkEl(d, 'section', S.section)
  for (const n of nodes || []) { const el = blockDom(n, S, d); if (el) root.appendChild(el) }
  return root
}
/** 模型原文 / 任意不可信 markdown → 安全 DOM(同一解析器,不刷文章配色)。 */
function renderPlain(container, md, doc) {
  const d = doc || globalThis.document
  container.textContent = ''
  container.appendChild(emitDom(parseDoc(md), PLAIN_STYLE, d))
}

// ══ 发布前体检(纯本地规则引擎,离线可用) ═════════════════════════════════
const BLOCK_MATH = /\$\$[^$\n]*\$\$/
const INLINE_MATH = /(?:^|[^$\\])\$(?!\s)([^$\n]*[\\^_{}=+/a-zA-Z][^$\n]*?)(?<!\s)\$(?!\$)/
const RAW_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/
const IMG_RE = /!\[([^\]]*)\]\(([^)\s]*)\)/g
const LINK_RE = /(^|[^!])\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g
function auditBlocks(md) {
  const src = String(md == null ? '' : md)
  if (!src.trim()) return []
  const lines = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out = []
  const push = (code, level, line, excerpt) => out.push({ code, level, line, excerpt: String(excerpt == null ? '' : excerpt).trim().slice(0, 80) })
  let inFence = false
  let inMath = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const s = raw.trim()
    const ln = i + 1
    const fence = /^(```|~~~)(.*)$/.exec(s)
    if (fence) {
      if (!inFence) { inFence = true; if (/^mermaid\b/i.test(fence[2].trim())) push('mermaid', 'block', ln, raw) } else inFence = false
      continue
    }
    if (inFence) { if (raw.length > 60) push('wide-code', 'warn', ln, raw); continue }
    if (inMath) { if (s === '$$') inMath = false; continue }
    if (s === '$$') { inMath = true; push('math', 'block', ln, raw); continue }
    if (BLOCK_MATH.test(raw) || INLINE_MATH.test(raw)) push('math', 'block', ln, raw)
    const embed = /<iframe\b/i.test(raw) || /!\[\[[^\]]+\]\]/.test(raw)
    if (embed) push('iframe-embed', 'block', ln, raw)
    else if (RAW_TAG.test(raw)) push('raw-html', 'block', ln, raw)
    IMG_RE.lastIndex = 0
    let m
    while ((m = IMG_RE.exec(raw))) {
      if (/^https?:\/\//i.test(m[2])) push('remote-image', 'warn', ln, m[0])
      else push('local-image', 'warn', ln, m[0])
    }
    LINK_RE.lastIndex = 0
    while ((m = LINK_RE.exec(raw))) push('external-link', 'warn', ln, m[0])
    if (/^#{4,}\s/.test(s)) push('deep-heading', 'info', ln, raw)
    if (/^(\s{2,}|\t)([-*+]|\d+[.)])\s/.test(raw)) push('nested-list', 'info', ln, raw)
    if (/\[\^[^\]\s]+\]/.test(raw)) push('footnote', 'info', ln, raw)
    if (s.indexOf('|') >= 0 && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim())) push('table', 'warn', ln, raw)
  }
  return out.sort((a, b) => a.line - b.line)
}
function auditCounts(findings) {
  const c = { block: 0, warn: 0, info: 0 }
  for (const f of findings || []) if (c[f.level] != null) c[f.level] += 1
  return c
}
const checksField = (c) => `block=${c.block} warn=${c.warn} info=${c.info}`

// ══ 盘古之白(本地确定性纯函数,不走 Agent) ═══════════════════════════════
const PANGU_A = new RegExp(`([${CJK}])([A-Za-z0-9])`, 'g')
const PANGU_B = new RegExp(`([A-Za-z0-9])([${CJK}])`, 'g')
const panguSeg = (s) => String(s).replace(PANGU_A, '$1 $2').replace(PANGU_B, '$1 $2')
/** 机器可读、**一个空格就会失效**的片段:补空格 = 把链接改坏。整段跳过,和跳行内码同一手法。
 *  ①行内码 ②markdown 链接/图片的 target `](…)`(alt 与链接文字仍会被规范化)
 *  ③尖括号自动链接 / 裸 HTML 标签 ④裸 URL ⑤词首的文件名(白名单扩展名,如 `报告2026.pdf`)。
 *  ⑤用 lookbehind 钉在词首,避免把 `见图1.png` 整串吞掉;`pangu` 已先按 `\n` 切行,故 `^` = 行首。
 *  **必须只有一个捕获组** —— String.split 会把每个捕获组都插回结果里。 */
const PANGU_SKIP = new RegExp(
  '(`[^`]*`'
  + '|\\]\\([^)\\n]*\\)'
  + '|<[^>\\s]*>'
  + '|(?:https?:\\/\\/|www\\.)[^\\s)\\]]+'
  + '|(?<=^|[\\s(\\[{（【「])[^\\s()（）\\[\\]【】「」]*\\.(?:png|jpe?g|gif|webp|svg|pdf|md|html?|css|js|json|zip|mp4|mp3|txt|csv)\\b'
  + ')',
)
/** 跳过围栏代码块、行内码、链接 target 与裸 URL;标点边界不补;已有空格不重复补;幂等。
 *  split 出来的**奇数下标**恒是那个唯一捕获组的命中(受保护段),偶数下标才补空格。 */
function pangu(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  const out = lines.map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; return l }
    if (inFence) return l
    return l.split(PANGU_SKIP).map((seg, i) => (i % 2 === 1 || seg == null ? (seg == null ? '' : seg) : panguSeg(seg))).join('')
  })
  return out.join('\n')
}

// ══ 字数 / 标题 ═══════════════════════════════════════════════════════════
const CJK_G = new RegExp(`[${CJK}]`, 'g')
/** 中文按字 + 英文按词(口径钉死:'你好 world' === 3)。 */
function countWords(md) {
  const s = String(md == null ? '' : md)
  const cjk = (s.match(CJK_G) || []).length
  const latin = (s.replace(CJK_G, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length
  return cjk + latin
}
/** 空标题回退 'Untitled'(ASCII,与语言无关 —— 否则同一篇稿在两种语言下写进台账的 title 会不一样)。
 *  ⚠️ **围栏代码块内的 `# xxx` 不是标题** —— 它会被写进台账 title 与导出文件名。 */
function deriveTitle(md) {
  const lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let inFence = false
  let head = ''
  let firstText = ''
  for (const l of lines) {
    const s = l.trim()
    if (/^(```|~~~)/.test(s)) { inFence = !inFence; continue }
    if (inFence || !s) continue
    const m = /^#{1,6}\s+(.+)$/.exec(s)
    if (m) { head = m[1]; break }
    if (!firstText) firstText = s
  }
  return String(head || firstText).replace(/[*`#>[\]()~]/g, '').trim().slice(0, 60) || 'Untitled'
}

// ══ 台账:parse / serialize 逐字节往返 ═════════════════════════════════════
const ledgerHeader = (ym) => ['---', `plugin: ${PLUGIN_ID}`, 'kind: ledger', `month: ${ym}`, 'schema: 1', '---', '', `# ${ym}`, ''].join('\n')
const isEntryHead = (line) => { const m = ENTRY_HEAD.exec(line); return m && ISO_RE.test(m[1]) ? m[1] : '' }
/** 字段区扫描(parse 与 setEntryField **必须共用**,否则补字段会插错块)。
 *  规则:见到第一条字段行**之前**,空行与块标记行是透明的;见过 ≥1 条字段之后,
 *  空行或任何非字段行终止字段区。
 *  ⚠️ 为什么不能「遇空行就停」:宿主 compiler(shared/amadeus/compiler/compile.ts)写回时是
 *  `${blockMarker(ref)}\n\n${content}` 再 join('\n\n') —— `## <ISO>` 是 heading 节点、
 *  连续的 `key: value` 是 paragraph 节点,必然分属两个块,中间恒有空行 + 标记行。
 *  用户在 Amadeus 里打开过一次台账,老规则就会把每条条目读成「零字段」。
 *  返回 { fields, keys, index(键→行下标), last(最后一条字段行下标,没有则 0) }。 */
function scanFields(rawLines) {
  const fields = {}
  const keys = []
  const index = {}
  let last = 0
  let seen = false
  for (let i = 1; i < rawLines.length; i++) {
    const l = rawLines[i]
    if (MARKER_LINE.test(l)) continue
    const m = FIELD_RE.exec(l)
    if (!m) { if (!seen && BLANK_LINE.test(l)) continue; break }
    if (!(m[1] in fields)) { keys.push(m[1]); index[m[1]] = i }
    fields[m[1]] = m[2]
    seen = true
    last = i
  }
  return { fields, keys, index, last }
}
/** 一条台账 = `## <ISO>` + 紧随其后的连续 `key: value` 行 + 空行 + 自由备注。
 *  `##` 后不是 ISO 时间戳的行属于备注正文,不算边界。块标记行不算正文、不吃字段、写回时一字不动。
 *  返回 [entries, preamble] —— preamble 是**行数组**(不是字符串):`[]` = 首行就是条目、
 *  `['']` = 文件以一个空行开头,两者必须分得开(折叠成 '' 会每写一次就吞掉那个空行)。
 *  serializeLedgerMonth(ym, ...parseLedgerMonth(raw)) 逐字节 === raw。 */
function parseLedgerMonth(text) {
  const raw = String(text == null ? '' : text)
  const lines = raw.split('\n')
  const heads = []
  for (let i = 0; i < lines.length; i++) { if (isEntryHead(lines[i])) heads.push(i) }
  if (!heads.length) return [[], lines]
  const preamble = lines.slice(0, heads[0])
  const entries = []
  for (let k = 0; k < heads.length; k++) {
    const from = heads[k]
    const to = k + 1 < heads.length ? heads[k + 1] : lines.length
    const rawLines = lines.slice(from, to)
    const ts = isEntryHead(rawLines[0])
    const sc = scanFields(rawLines)
    entries.push({ ts, fields: sc.fields, keys: sc.keys, rawLines })
  }
  return [entries, preamble]
}
function serializeLedgerMonth(ym, entries, preamble) {
  const parts = []
  if (preamble == null) parts.push(ledgerHeader(ym))
  else if (Array.isArray(preamble)) { if (preamble.length) parts.push(preamble.join('\n')) }
  else if (preamble !== '') parts.push(preamble) // 兼容早期字符串形态
  for (const e of entries || []) parts.push((e.rawLines || []).join('\n'))
  return parts.join('\n')
}
const FIELD_ORDER = ['title', 'platform', 'source', 'status', 'words', 'checks', 'url']
const fieldLine = (k, v) => (v ? `${k}: ${v}` : `${k}:`)
function makeEntry(ts, fields) {
  const keys = FIELD_ORDER.filter((k) => k in fields).concat(Object.keys(fields).filter((k) => FIELD_ORDER.indexOf(k) < 0))
  const rawLines = [`## ${ts}`].concat(keys.map((k) => fieldLine(k, fields[k]))).concat([''])
  const f = {}
  for (const k of keys) f[k] = String(fields[k] == null ? '' : fields[k])
  return { ts, fields: f, keys, rawLines }
}
/** 就地改一个字段:命中的那一行原地替换,其余(备注 / 未知键 / 块标记行)一字不动。
 *  插入点扫描**必须与 parse 共用 scanFields** —— 否则宿主写回过的台账会把新字段插进
 *  `## <ISO>` 那个块里,和下面读不到的旧值形成两条互相矛盾的 `status:`。 */
function setEntryField(e, key, value) {
  const v = String(value == null ? '' : value)
  e.fields[key] = v
  if (e.keys.indexOf(key) < 0) e.keys.push(key)
  const lines = e.rawLines.slice()
  const cr = /\r$/.test(lines[0] || '') ? '\r' : '' // CRLF 文件里补出来的行也要带 \r
  const sc = scanFields(lines)
  if (sc.index[key] != null) lines[sc.index[key]] = fieldLine(key, v) + cr
  else lines.splice(sc.last + 1, 0, fieldLine(key, v) + cr)
  e.rawLines = lines
  return e
}
/** 身份 = ts。同 ts → 就地更新字段(幂等);新 ts → 追加并按 ts 升序稳定排序。 */
function upsertEntry(entries, incoming) {
  const list = (entries || []).slice()
  const idx = list.findIndex((x) => x.ts === incoming.ts)
  if (idx >= 0) {
    for (const k of Object.keys(incoming.fields || {})) setEntryField(list[idx], k, incoming.fields[k])
    return list
  }
  list.push(incoming.rawLines ? incoming : makeEntry(incoming.ts, incoming.fields || {}))
  list.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  return list
}
/** 月序列自枚举(纯 y/m 整数推进,跨年安全)。 */
function monthSeq(fromYm, toYm) {
  const pf = YM_RE.exec(String(fromYm || ''))
  const pt = YM_RE.exec(String(toYm || ''))
  if (!pf || !pt) return []
  let y = +pf[1]
  let m = +pf[2]
  const ey = +pt[1]
  const em = +pt[2]
  const out = []
  let guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard++ < 1200) {
    out.push(`${y}-${pad2(m)}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}
const frontmatterUnclosed = (text) => {
  const lines = String(text || '').split('\n')
  if (!lines[0] || lines[0].trim() !== '---') return false
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return false
  return true
}
/** 三态读:readFile → null = missing(静默跳过);内容在但解析不出条目 / frontmatter 未闭合 = error。
 *  宿主抛错也算 error —— 「读不到却要整月重写」没有正当场景。 */
async function readMonth(ym) {
  let text = null
  try { text = await safeRead(ledgerPath(ym)) } catch (e) { return { state: 'error', entries: [], raw: '', preamble: null, reason: String((e && e.message) || e) } }
  if (text == null || !String(text).trim()) return { state: 'missing', entries: [], raw: '', preamble: null }
  if (frontmatterUnclosed(text)) return { state: 'error', entries: [], raw: String(text), preamble: null, reason: 'frontmatter' }
  const parsed = parseLedgerMonth(text)
  if (!parsed[0].length) return { state: 'error', entries: [], raw: String(text), preamble: null, reason: 'no-entry' }
  return { state: 'ok', entries: parsed[0], raw: String(text), preamble: parsed[1] }
}
/** 已知的最早月份(首次写台账时记 YYYY-MM);缺席时只读当月。 */
const firstMonth = () => { const v = getLS('firstMonth', ''); return YM_RE.test(v) ? v : '' }
function knownMonths() {
  const nowYm = monthOfIso(nowIso())
  const from = firstMonth() || nowYm
  return monthSeq(from <= nowYm ? from : nowYm, nowYm)
}

// ══ 串行写队列(队列内部每次都是「现读 → 改 → 写」,不缓存文件内容) ═══════
let writeChain = Promise.resolve()
function enqueueWrite(job) {
  const p = writeChain.then(job)
  writeChain = p.then(() => {}, () => {})
  return p
}
async function writeLedgerEntry(ts, fields) {
  const ym = monthOfIso(ts)
  return enqueueWrite(async () => {
    const m = await readMonth(ym)
    if (m.state === 'error') throw new Error(t('ledger.error', { path: ledgerPath(ym) }))
    const entries = upsertEntry(m.entries, makeEntry(ts, fields))
    await safeWrite(ledgerPath(ym), serializeLedgerMonth(ym, entries, m.state === 'ok' ? m.preamble : null))
    if (!firstMonth() || ym < firstMonth()) setLS('firstMonth', ym)
    return ym
  })
}
async function patchLedgerEntry(ts, patch) {
  const ym = monthOfIso(ts)
  return enqueueWrite(async () => {
    const m = await readMonth(ym)
    if (m.state !== 'ok') throw new Error(t('ledger.error', { path: ledgerPath(ym) }))
    const entries = upsertEntry(m.entries, { ts, fields: patch })
    await safeWrite(ledgerPath(ym), serializeLedgerMonth(ym, entries, m.preamble))
    return ym
  })
}

// ══ 剪贴板梯子 A → B → C ══════════════════════════════════════════════════
/** A:navigator.clipboard.write(ClipboardItem{text/html,text/plain})。 */
async function clipboardRich(html, plain) {
  const nav = globalThis.navigator
  if (!nav || !nav.clipboard || !nav.clipboard.write || typeof globalThis.ClipboardItem === 'undefined' || typeof globalThis.Blob === 'undefined') return false
  await nav.clipboard.write([new globalThis.ClipboardItem({
    'text/html': new globalThis.Blob([html], { type: 'text/html' }),
    'text/plain': new globalThis.Blob([plain], { type: 'text/plain' }),
  })])
  return true
}
/** B:离屏 contenteditable(emitDom 填充)→ selectAllChildren → execCommand('copy')。 */
function clipboardSelection(nodes, style, doc) {
  const d = doc || globalThis.document
  if (!d || !d.body || !d.execCommand || !globalThis.getSelection) return false
  const host = d.createElement('div')
  host.setAttribute('contenteditable', 'true')
  if (host.style) host.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;white-space:pre-wrap'
  host.appendChild(emitDom(nodes, style, d))
  d.body.appendChild(host)
  let ok = false
  try {
    const sel = globalThis.getSelection()
    sel.removeAllRanges()
    sel.selectAllChildren(host)
    ok = !!d.execCommand('copy')
    sel.removeAllRanges()
  } finally { host.remove() }
  return ok
}
/** C:兜底导出 .html(无论 A/B 通不通都在)。 */
async function exportHtmlFile(slug, html) {
  const p = exportPath(slug)
  await safeWrite(p, htmlDocument(html))
  return p
}
/** 降级选择器:A 抛错/不可用 → B;B 假 → C。返回 'rich' | 'compat' | 'exported'。 */
async function runCopyLadder(steps) {
  try { if (await steps.rich()) return 'rich' } catch { /* 落 B */ }
  try { if (await steps.compat()) return 'compat' } catch { /* 落 C */ }
  await steps.exportFile()
  return 'exported'
}
const statusOfCopy = (kind) => (kind === 'exported' ? 'exported' : 'copied')
/** 复制 + 写台账(一次动作 = 一条新 ts 的台账条目)。
 *  ⚠️台账写失败**不吞也不冒充复制失败** —— 内容已经在剪贴板里了,只把台账的错单独回报。 */
async function copyAndLog(payload, steps) {
  const kind = await runCopyLadder(steps)
  const ts = nowIso()
  let ledgerError = null
  try {
    await writeLedgerEntry(ts, {
      title: payload.title,
      platform: 'wechat',
      source: payload.source,
      status: statusOfCopy(kind),
      words: String(payload.words),
      checks: payload.checks,
      url: '',
    })
  } catch (e) { ledgerError = String((e && e.message) || e) }
  return { kind, ts, ledgerError }
}

// ══ Agent(默认助手,无 agentSlug / 无 execMode / 不传 model_id) ═══════════
const hasEngine = () => !!(globalThis.window && window.tangu && window.tangu.getConfig)
/** SPEC:引擎缺席 = 按钮置灰 **+** notify(warning)。每个会话只报一次,别每次重渲都弹。 */
let engineWarned = false
function warnNoEngineOnce() {
  if (engineWarned || hasEngine()) return
  engineWarned = true
  say(t('ai.needLogin'), { level: 'warning' })
}
async function getCfg() {
  try {
    const c = await (hasEngine() ? window.tangu.getConfig() : null)
    if (c && c.backendUrl) return { backendUrl: c.backendUrl, token: c.token || '' }
  } catch { /* web 回退 */ }
  try { return { backendUrl: location.origin + '/api', token: localStorage.getItem('forsion_token') || '' } } catch { /* ignore */ }
  return { backendUrl: '', token: '' }
}
async function runAgent(cfg, message, onTick, signal) {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` }
  const start = await fetch(`${cfg.backendUrl}/agent/runs`, {
    method: 'POST', headers: h, signal,
    body: JSON.stringify({ session_id: uuid(), app_id: APP_ID, message, attachments: [] }),
  })
  if (!start.ok) throw new Error((await start.text().catch(() => '')) || `HTTP ${start.status}`)
  const started = await start.json()
  const runId = started && started.runId
  if (!runId) throw new Error('no runId')
  const res = await fetch(`${cfg.backendUrl}/agent/runs/${encodeURIComponent(runId)}/events?fromSeq=0`, { headers: h, signal })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let lastSeq = 0
  let content = ''
  for (;;) {
    const r = await reader.read()
    if (r.done) break
    buf += dec.decode(r.value, { stream: true })
    const parts = buf.split('\n')
    buf = parts.pop() || ''
    for (const line of parts) {
      const s = line.trim()
      if (!s || s.charAt(0) === ':' || s.slice(0, 5) !== 'data:') continue
      const data = s.slice(5).replace(/^ /, '')
      if (!data) continue
      let ev
      try { ev = JSON.parse(data) } catch { continue }
      if (typeof ev.seq === 'number') { if (ev.seq <= lastSeq) continue; lastSeq = ev.seq }
      if (ev.type === 'token') { const d = ev.payload && ev.payload.delta; if (d) { content += d; if (onTick) onTick(content) } continue }
      if (ev.type === 'done') return (ev.payload && ev.payload.content) || content
      if (ev.type === 'error') throw new Error((ev.payload && ev.payload.error) || 'agent error')
    }
  }
  throw new Error('stream ended without done')
}
/** 抓最后一个 ```publisher-json 围栏 → JSON.parse → 校验 task 与 items。四态都不抛。 */
function parseAgentBlock(text) {
  const s = String(text == null ? '' : text)
  const re = /```publisher-json\s*\n([\s\S]*?)```/g
  let m
  let last = null
  while ((m = re.exec(s))) last = m[1]
  if (last == null) return null
  let j
  try { j = JSON.parse(String(last).trim()) } catch { return null }
  if (!j || typeof j !== 'object' || typeof j.task !== 'string' || !Array.isArray(j.items)) return null
  // 逐元素校验:模型回 items:[{...}] 时必须落到「渲染原文」兜底,而不是给用户看一排 [object Object]
  if (!j.items.every((x) => typeof x === 'string')) return null
  return { task: j.task, items: j.items.slice() }
}
const TRUNC = 8000
/** 语气键(数据,不翻译)→ **固定英文**描述。⚠️ 绝不能把界面上那个本地化串塞进指令段:
 *  那样英文指令里会冒出中文、且同一个功能的提示词会随界面语言漂移。 */
const TONE_EN = {
  wechat: 'conversational, warm WeChat Official Account voice',
  pro: 'professional and restrained',
  rednote: 'light and lively Rednote (Xiaohongshu) voice',
}
const TONE_KEYS = ['wechat', 'pro', 'rednote']
/** 指令段一律英文;按 ctx.getLocale() 显式追加输出语言要求。 */
function buildAgentMessage(task, payload) {
  const lang = L() === 'zh' ? 'Respond in Chinese.' : 'Respond in English.'
  const shape = `Reply with exactly one fenced block and nothing else:\n\`\`\`publisher-json\n{"task":"${task}","items":["…"]}\n\`\`\``
  if (task === 'advice') {
    return [
      'You are helping an author prepare a markdown article for the WeChat Official Account editor.',
      'Below is a JSON list of pre-flight findings produced by a local rule engine. For EACH finding, give one short, concrete manual fix step (the editor strips class/style sheets, so remote images, embeds, math and mermaid must be handled by hand).',
      'Keep each item under 60 words. Keep the same order as the input.',
      `Findings JSON:\n${payload.json}`,
      shape, lang,
    ].join('\n\n')
  }
  const body = payload.text.length > TRUNC ? `${payload.text.slice(0, TRUNC)}\n\n[TRUNCATED]` : payload.text
  if (task === 'titles') {
    return ['You are an editor for a WeChat Official Account.', 'Read the article below and propose 5 candidate titles. Each under 30 characters, concrete, no clickbait punctuation spam.', `Article:\n${body}`, shape, lang].join('\n\n')
  }
  if (task === 'summary') {
    return ['You are an editor for a WeChat Official Account.', 'Write ONE summary of the article below for the article abstract field. Hard limit: 120 characters (platform limit). Return it as a single item.', `Article:\n${body}`, shape, lang].join('\n\n')
  }
  return [
    'You are an editor for a WeChat Official Account.',
    `Rewrite the markdown below in this tone: ${TONE_EN[payload.tone] || TONE_EN.wechat}. Keep the markdown structure and all facts; do not invent content. Return the rewritten markdown as a single item.`,
    `Markdown:\n${body}`, shape, lang,
  ].join('\n\n')
}

// ══ 设置 ═══════════════════════════════════════════════════════════════════
ctx.registerSetting({ key: 'styleTheme', label: t('set.styleTheme'), type: 'text', default: 'classic', description: t('set.styleThemeDesc') })
ctx.registerSetting({ key: 'fontSize', label: t('set.fontSize'), type: 'number', default: 16, min: 14, max: 20, description: t('set.fontSizeDesc') })
ctx.registerSetting({ key: 'lineHeight', label: t('set.lineHeight'), type: 'number', default: 175, min: 140, max: 220, description: t('set.lineHeightDesc') })
ctx.registerSetting({ key: 'autoAudit', label: t('set.autoAudit'), type: 'boolean', default: true, description: t('set.autoAuditDesc') })
const currentStyle = () => buildStyle({
  styleTheme: getLS('styleTheme', 'classic'),
  fontSize: clampNum(getLS('fontSize', '16'), 14, 20, 16),
  lineHeight: clampNum(getLS('lineHeight', '175'), 140, 220, 175),
})
const autoAuditOn = () => getLS('autoAudit', 'true') !== 'false'

// ══ 视图层:样式 + DOM 小helper ═══════════════════════════════════════════
const CSS = `
.wp-root{height:100%;min-height:0;display:flex;flex-direction:column;color:inherit;background:var(--bg,#fff);font-size:13px;line-height:1.5}
.wp-root *{box-sizing:border-box}
.wp-hd{flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--border,#e5e5e5)}
.wp-title{font-weight:600;font-size:14px;color:var(--text,#222)}
.wp-path{font-size:11.5px;color:var(--text-muted,#6b6b6b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
.wp-spacer{flex:1}
.wp-seg{display:flex;gap:4px;padding:3px;border-radius:10px;background:var(--bg-card,#f4f4f4);border:1px solid var(--border,#e5e5e5)}
.wp-seg button{padding:4px 10px;font:inherit;border:0;border-radius:7px;background:transparent;color:var(--text-muted,#6b6b6b);cursor:pointer}
.wp-seg button.on{background:var(--accent-light,rgba(0,0,0,.06));color:var(--accent,#1c1c1c);font-weight:600}
.wp-btn{padding:6px 12px;font:inherit;color:var(--text,#222);background:var(--bg-card,#fdfdfc);border:1px solid var(--border,#e5e5e5);border-radius:10px;cursor:pointer;white-space:nowrap}
.wp-btn:hover:not(:disabled){border-color:var(--accent,#1c1c1c)}
.wp-btn:disabled{opacity:.6;cursor:default}
.wp-btn.primary{color:var(--on-accent,#fff);background:var(--accent,#1c1c1c);border-color:transparent;font-weight:600}
.wp-btn.sm{padding:3px 9px;font-size:12px;border-radius:8px}
.wp-body{flex:1;min-height:0;display:flex;gap:12px;padding:12px 14px;overflow:hidden}
.wp-col{flex:1 1 50%;min-width:0;display:flex;flex-direction:column;gap:8px}
.wp-tools{display:flex;gap:6px;flex-wrap:wrap}
.wp-src{flex:1;min-height:0;width:100%;resize:none;font:inherit;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.7;padding:10px 12px;color:var(--text,#222);background:var(--bg-card,#fdfdfc);border:1px solid var(--border,#e5e5e5);border-radius:10px;outline:none}
.wp-src:focus{border-color:var(--accent,#1c1c1c)}
.wp-note{font-size:11.5px;color:var(--text-muted,#6b6b6b)}
.wp-paperwrap{flex:1;min-height:0;overflow:auto;border:1px solid var(--border,#e5e5e5);border-radius:10px;background:#ffffff}
.wp-paper{background:#ffffff;color:#3f3f3f;padding:18px 20px;min-height:100%}
.wp-paper-empty{color:#6a6a6a;font-size:13px}
.wp-ft{flex:0 0 auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-top:1px solid var(--border,#e5e5e5)}
.wp-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;color:var(--text,#222);background:var(--bg-card,#f4f4f4);border:1px solid var(--border,#e5e5e5);cursor:pointer}
.wp-findings{max-height:170px;overflow:auto;border:1px solid var(--border,#e5e5e5);border-radius:10px;background:var(--bg-card,#fdfdfc)}
.wp-find{display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border-bottom:1px solid var(--border,#eee);cursor:pointer}
.wp-find:last-child{border-bottom:0}
.wp-lv{flex:0 0 auto;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--accent-light,rgba(0,0,0,.06));color:var(--accent,#1c1c1c)}
.wp-lv.block{background:var(--danger-light,rgba(163,80,63,.1));color:var(--danger,#a3503f)}
.wp-find .mid{flex:1;min-width:0}
.wp-find .ttl{font-size:12.5px;color:var(--text,#222)}
.wp-find .hint{font-size:11.5px;color:var(--text-muted,#6b6b6b);margin-top:2px}
.wp-find .ln{flex:0 0 auto;font-size:11px;color:var(--text-muted,#6b6b6b);font-variant-numeric:tabular-nums}
.wp-banner{margin:10px 14px 0;padding:8px 12px;border-radius:10px;font-size:12.5px;background:var(--danger-light,rgba(163,80,63,.1));color:var(--danger,#a3503f);border:1px solid var(--danger,#a3503f)}
.wp-tablewrap{flex:1;min-height:0;overflow:auto;margin:0 14px 14px;border:1px solid var(--border,#e5e5e5);border-radius:10px}
.wp-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.wp-tbl th{position:sticky;top:0;text-align:left;padding:8px 10px;background:var(--bg-card,#f4f4f4);color:var(--text-muted,#6b6b6b);font-weight:600;border-bottom:1px solid var(--border,#e5e5e5);white-space:nowrap}
.wp-tbl td{padding:8px 10px;border-bottom:1px solid var(--border,#eee);color:var(--text,#222);vertical-align:top}
.wp-tbl tr:last-child td{border-bottom:0}
.wp-st{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:var(--accent-light,rgba(0,0,0,.06));color:var(--accent,#1c1c1c)}
.wp-empty{padding:26px 14px;text-align:center;color:var(--text-muted,#6b6b6b);font-size:12.5px}
.wp-layer{position:fixed;inset:0;z-index:9999;pointer-events:none;font-size:13px;line-height:1.5;color:var(--text,#222)}
.wp-modal{pointer-events:auto;position:absolute;left:50%;top:12%;transform:translateX(-50%);width:min(560px,92vw);max-height:76vh;overflow:auto;padding:14px 16px;border-radius:14px;background:var(--bg-card,#fff);border:1px solid var(--border,#e5e5e5);box-shadow:var(--card-shadow,0 8px 30px rgba(0,0,0,.18))}
.wp-modal h3{margin:0 0 10px;font-size:14px;color:var(--text,#222)}
.wp-out{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--bg,#fafafa);border:1px solid var(--border,#e5e5e5);color:var(--text,#222);font-size:12.5px;line-height:1.65;word-break:break-word}
.wp-out p{margin:0 0 .6em}
.wp-item{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border,#eee)}
.wp-item:last-child{border-bottom:0}
.wp-item .txt{flex:1;min-width:0;color:var(--text,#222)}
.wp-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
`
function h(tag, opts, kids) {
  const o = opts || {}
  const el = document.createElement(tag)
  if (o.cls) el.className = o.cls
  if (o.text != null) el.textContent = String(o.text)
  if (o.css) el.style.cssText = o.css
  if (o.attrs) for (const k of Object.keys(o.attrs)) el.setAttribute(k, String(o.attrs[k]))
  if (o.on) for (const k of Object.keys(o.on)) el.addEventListener(k, o.on[k])
  if (o.disabled) el.disabled = true
  for (const c of kids || []) if (c) el.appendChild(c)
  return el
}
let _layer = null
function layer() {
  if (!globalThis.document || !document.body) return null
  if (_layer && _layer.isConnected) return _layer
  _layer = h('div', { cls: 'wp-layer' })
  document.body.appendChild(_layer)
  return _layer
}
function closeLayer() { if (_layer) { _layer.textContent = '' } }

// ══ 共享状态 + 跨视图小总线 ═══════════════════════════════════════════════
/** draftBase = **上一次从磁盘读到 / 刚写进磁盘**的那份内容(null = 还没读过盘)。
 *  draftConflict = 磁盘上那份与 draftBase 不一致时截获的磁盘内容(非 null 即冻结写入)。
 *  ⚠️ 没有这两格,`草稿.md` 会被内存里的旧副本整份覆盖 —— 用户在 Amadeus 里改的那版无声消失。 */
const state = { source: 'page', draft: '', draftBase: null, draftConflict: null, findings: [], showFindings: false, lineMap: [] }
const bus = (() => {
  const subs = new Set()
  return { on: (f) => (subs.add(f), () => subs.delete(f)), emit: (e) => subs.forEach((f) => { try { f(e) } catch { /* ignore */ } }) }
})()
function safeGetPage() {
  try { return ctx.app.getPage ? ctx.app.getPage() : null } catch { return null }
}
function activePageMd() {
  const pg = safeGetPage()
  if (!pg || !pg.path) return ''
  // v4/unified 笔记(2026-08-20 起的默认载体)没有块表:正文在 pg.text 里,order/blocks 恒空。
  // `?? 拼块` 是老宿主兜底(那时没有 text 字段),别改成 `||` —— 空正文是合法值。
  if (pg.text != null) return pg.text
  return (pg.order || []).map((id) => (pg.blocks ? pg.blocks[id] : '')).filter((x) => x != null).join('\n\n')
}
const sourcePath = () => {
  if (state.source === 'draft') return draftPath()
  const pg = safeGetPage()
  return (pg && pg.path) || ''
}
const rawSource = () => (state.source === 'draft' ? state.draft : activePageMd())
const currentClean = () => cleanSourceMap(rawSource())
const currentMd = () => currentClean().text
function refreshFindings() {
  const cm = currentClean()
  state.lineMap = cm.map
  state.findings = auditBlocks(cm.text)
  const c = auditCounts(state.findings)
  if (statusHandle && statusHandle.update) { try { statusHandle.update({ text: `⚑ ${c.block}/${c.warn}` }) } catch { /* ignore */ } }
  return c
}

// ══ 草稿:现读 → 比对 → 写(与台账同一条纪律,不缓存文件内容整份覆盖) ═══════
const draftBaseOf = () => (state.draftBase == null ? '' : state.draftBase)
const draftDirty = () => state.draft !== draftBaseOf()
/** 读盘。force=true 无条件采用磁盘版;否则:本地没改动 → 采用磁盘版;
 *  本地有未存改动且磁盘也变了 → 记冲突(不覆盖任何一边,交给用户选)。
 *  返回 true 表示这个宿主有文件面(读不动 = 没有文件面,静默降级)。 */
async function loadDraft(force) {
  let txt
  try { txt = await safeRead(draftPath()) } catch { return false }
  const disk = txt == null ? '' : String(txt)
  if (force || !draftDirty()) {
    state.draft = disk
    state.draftBase = disk
    state.draftConflict = null
    return true
  }
  if (disk !== draftBaseOf()) state.draftConflict = disk
  else state.draftBase = disk
  return true
}

// ══ 视图 ①:composer ══════════════════════════════════════════════════════
function mountComposer(el) {
  el.textContent = ''
  el.appendChild(h('style', { text: CSS }))
  const root = h('div', { cls: 'wp-root' })
  el.appendChild(root)
  let saveTimer = null
  let disposed = false

  const setSource = (s) => {
    state.source = s
    render()
    if (s === 'draft') loadDraft(false).then((ok) => { if (ok && !disposed) render() }).catch(() => { /* 无文件面 */ })
  }
  function render() {
    if (disposed) return
    root.textContent = ''
    const md = currentMd()
    if (autoAuditOn() || !state.findings.length) refreshFindings()
    const c = auditCounts(state.findings)

    // 顶栏:来源选择器 + 路径
    const seg = h('div', { cls: 'wp-seg' }, [
      h('button', { cls: state.source === 'page' ? 'on' : '', text: t('src.page'), on: { click: () => setSource('page') } }),
      h('button', { cls: state.source === 'draft' ? 'on' : '', text: t('src.draft'), on: { click: () => setSource('draft') } }),
    ])
    const path = sourcePath()
    root.appendChild(h('div', { cls: 'wp-hd' }, [
      h('span', { cls: 'wp-title', text: t('view.composer') }),
      seg,
      h('span', { cls: 'wp-path', text: path, attrs: { title: path } }),
      h('div', { cls: 'wp-spacer' }),
      // 引擎缺席 → 按钮置灰,但 needLogin 那条文案必须**可达**(title 悬浮)+ 一次性 notify(SPEC 要求两者都有)
      hasEngine()
        ? h('button', { cls: 'wp-btn sm', text: t('tool.ai'), on: { click: () => openAiModal() } })
        : h('button', { cls: 'wp-btn sm', text: t('tool.ai'), disabled: true, attrs: { title: t('ai.needLogin') } }),
    ]))
    warnNoEngineOnce()

    // 左栏:母稿
    const left = h('div', { cls: 'wp-col' })
    left.appendChild(h('div', { cls: 'wp-tools' }, [
      h('button', { cls: 'wp-btn sm', text: t('tool.pangu'), on: { click: doPangu } }),
      h('button', {
        cls: 'wp-btn sm',
        text: t('tool.audit'),
        // manifest.events 声明的 audit 只在**用户显式点体检**时上报;autoAudit 那条防抖路径不报(会刷屏活动日志)
        on: { click: () => { state.showFindings = true; const c = refreshFindings(); if (ctx.activity && ctx.activity.log) ctx.activity.log('audit', { block: c.block, warn: c.warn, info: c.info }); render() } },
      }),
      state.source === 'draft' ? h('button', { cls: 'wp-btn sm', text: t('src.saveDraft'), on: { click: () => saveDraft(true) } }) : null,
    ]))
    if (state.source === 'draft') {
      if (state.draftConflict != null) {
        left.appendChild(h('div', { cls: 'wp-banner', css: 'margin:0' }, [
          h('div', { text: t('draft.conflictBanner') }),
          h('div', { cls: 'wp-row', css: 'margin-top:8px' }, [
            h('button', { cls: 'wp-btn sm', text: t('draft.useDisk'), on: { click: () => resolveDraftConflict(true) } }),
            h('button', { cls: 'wp-btn sm', text: t('draft.overwrite'), on: { click: () => resolveDraftConflict(false) } }),
          ]),
        ]))
      }
      const ta = h('textarea', { cls: 'wp-src', attrs: { placeholder: t('src.placeholder'), spellcheck: 'false' } })
      ta.value = state.draft
      ta.addEventListener('input', () => {
        state.draft = ta.value
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => { saveTimer = null; saveDraft(false) }, 800)
        schedulePreview()
      })
      ta.addEventListener('blur', () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null } saveDraft(false) })
      left.appendChild(ta)
      srcBox = ta
    } else {
      const ro = h('textarea', { cls: 'wp-src', attrs: { readonly: 'readonly', spellcheck: 'false' } })
      ro.value = rawSource()
      left.appendChild(ro)
      srcBox = ro
      left.appendChild(h('div', { cls: 'wp-note', text: path ? t('src.readonly') : t('src.nopage') }))
    }

    // 右栏:公众号预览白纸卡(自刷不透明白底 —— 它模拟的是公众号页面,不是插件 UI)
    const right = h('div', { cls: 'wp-col' })
    right.appendChild(h('div', { cls: 'wp-note', text: t('preview.title') }))
    const wrap = h('div', { cls: 'wp-paperwrap' })
    const paper = h('div', { cls: 'wp-paper' })
    if (md.trim()) paper.appendChild(emitDom(parseDoc(md), currentStyle(), document))
    else paper.appendChild(h('div', { cls: 'wp-paper-empty', text: t('preview.empty') }))
    wrap.appendChild(paper)
    right.appendChild(wrap)
    paperBox = paper

    root.appendChild(h('div', { cls: 'wp-body' }, [left, right]))

    // 底栏:复制(一屏唯一 primary)+ 体检摘要
    summaryChip = h('span', {
      cls: 'wp-chip',
      text: summaryText(c),
      attrs: { title: t('audit.toggle') },
      on: { click: () => { state.showFindings = !state.showFindings; syncFindings() } },
    })
    wordsChip = h('span', { cls: 'wp-note', text: t('words.count', { n: countWords(md) }) })
    root.appendChild(h('div', { cls: 'wp-ft' }, [
      h('button', { cls: 'wp-btn primary', text: t('copy.btn'), on: { click: doCopy } }),
      summaryChip,
      wordsChip,
    ]))
    // findings 有自己的常驻容器 —— 展开/收起与防抖体检都只换它,绝不整屏重建(会换掉正在打字的 textarea)
    findingsHost = h('div')
    root.appendChild(findingsHost)
    syncFindings()
  }

  let srcBox = null
  let paperBox = null
  let summaryChip = null
  let wordsChip = null
  let findingsHost = null
  const summaryText = (c) => (c.block + c.warn + c.info === 0 ? t('audit.clean') : t('audit.summary', c))
  function syncFindings() {
    if (!findingsHost) return
    findingsHost.textContent = ''
    if (state.showFindings && state.findings.length) findingsHost.appendChild(findingsBox())
  }
  /** 增量刷新:预览卡 + 摘要条 + findings 列表。**不碰 textarea**。 */
  function syncPreview() {
    if (disposed) return
    const md = currentMd()
    if (paperBox) {
      paperBox.textContent = ''
      if (md.trim()) paperBox.appendChild(emitDom(parseDoc(md), currentStyle(), document))
      else paperBox.appendChild(h('div', { cls: 'wp-paper-empty', text: t('preview.empty') }))
    }
    if (autoAuditOn()) {
      const c = refreshFindings()
      if (summaryChip) summaryChip.textContent = summaryText(c)
      syncFindings()
    }
    if (wordsChip) wordsChip.textContent = t('words.count', { n: countWords(md) })
  }
  function findingsBox() {
    const box = h('div', { cls: 'wp-findings', css: 'margin:0 14px 12px' })
    for (const f of state.findings) {
      box.appendChild(h('div', {
        cls: 'wp-find',
        on: { click: () => gotoLine(f.line) },
      }, [
        h('span', { cls: `wp-lv ${f.level}`, text: t(`level.${f.level}`) }),
        h('div', { cls: 'mid' }, [
          h('div', { cls: 'ttl', text: t(`audit.${f.code}.title`) }),
          h('div', { cls: 'hint', text: t(`audit.${f.code}.hint`) }),
        ]),
        h('span', { cls: 'ln', text: t('audit.line', { n: f.line }) }),
      ]))
    }
    return box
  }
  /** findings 的 line 算在净化文本上,textarea 里是原文 —— 必须查 state.lineMap 换算。 */
  function gotoLine(line) {
    if (!srcBox) return
    const raw = state.lineMap && state.lineMap[line - 1] ? state.lineMap[line - 1] : line
    const lines = String(srcBox.value || '').split('\n')
    let pos = 0
    for (let i = 0; i < Math.min(lines.length, Math.max(0, raw - 1)); i++) pos += lines[i].length + 1
    try {
      srcBox.focus()
      srcBox.setSelectionRange(pos, pos + (lines[raw - 1] || '').length)
      const lh = 21
      srcBox.scrollTop = Math.max(0, (raw - 3) * lh)
    } catch { /* ignore */ }
  }
  let previewTimer = null
  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(() => { previewTimer = null; syncPreview() }, 220)
  }
  /** 草稿落盘:队列内**现读 → 比对 → 写**。磁盘与上次读到的不一致 = 有人在插件之外改过,
   *  一律冻结写入并弹冲突条(loud 与否都要报 —— 常走的 blur / 800ms 防抖路径都是静默的)。 */
  async function saveDraft(loud) {
    if (state.draftConflict != null) { say(t('draft.conflict'), { level: 'warning' }); return }
    try {
      await enqueueWrite(async () => {
        const mine = state.draft
        let cur
        let readable = true
        try { cur = await safeRead(draftPath()) } catch { readable = false }
        if (readable) {
          const disk = cur == null ? '' : String(cur)
          if (state.draftBase != null && disk !== state.draftBase) {
            state.draftConflict = disk
            throw new Error(t('draft.conflict'))
          }
        }
        await safeWrite(draftPath(), mine)
        state.draftBase = mine
      })
      if (loud) say(t('src.saved'), { level: 'success' })
    } catch (e) {
      if (state.draftConflict != null) { say(t('draft.conflict'), { level: 'warning' }); render(); return }
      if (loud) say(t('src.saveFail', { err: (e && e.message) || e }), { level: 'error' })
    }
  }
  function resolveDraftConflict(useDisk) {
    const disk = state.draftConflict == null ? '' : state.draftConflict
    state.draftConflict = null
    if (useDisk) { state.draft = disk; state.draftBase = disk; render(); say(t('draft.resolvedDisk'), { level: 'success' }); return }
    state.draftBase = disk // 让「现读 → 比对」这一关放行,用内存里这版覆盖
    render()
    saveDraft(true)
  }
  function doPangu() {
    const before = rawSource()
    const after = pangu(before)
    if (after === before) { say(t('tool.panguNoop')); return }
    state.draft = after
    if (state.source === 'page') { state.source = 'draft'; say(t('tool.panguToDraft'), { level: 'success' }) } else say(t('tool.panguDone'), { level: 'success' })
    render()
    saveDraft(false)
  }
  async function doCopy() { await copyCurrent() }

  // 母稿变即重渲预览(blocks 引用稳定,按引用去重)。**换笔记才整屏重建**,
  // 同一篇里的每次击键只走增量刷新 —— 整屏 render 是长文里最贵的一档浪费。
  let lastBlocks = null
  let lastPath = sourcePath()
  let offPage = null
  try {
    offPage = ctx.app.subscribePage ? ctx.app.subscribePage((pg) => {
      if (state.source !== 'page') return
      // 去重判据:v3 靠 blocks 的引用稳定,v4 的块表恒空(同一个冻结对象)→ 必须比正文本身,
      // 否则 v4 上「引用没变」永远成立,预览一次都不刷新。
      const key = pg && (pg.model === 'text' || pg.text != null ? pg.text : pg.blocks)
      if (pg && key === lastBlocks) return
      lastBlocks = key
      const p = (pg && pg.path) || ''
      if (p !== lastPath) { lastPath = p; render(); return }
      if (srcBox) srcBox.value = rawSource()
      schedulePreview()
    }) : null
  } catch { offPage = null }
  const offBus = bus.on((e) => { if (e && e.type === 'locale') render() })

  // 草稿:固定路径、一个文件、不需要枚举(读失败=当前环境不支持文件面,静默降级)。
  // **每次挂载都重读** —— 模块级缓存一次读盘 + 全量覆盖写 = 用内存旧副本抹掉用户在库里的改动。
  const draftBefore = state.draft
  const sourceBefore = state.source
  loadDraft(false).then((ok) => {
    if (disposed || !ok) return
    if (!sourcePath()) state.source = 'draft'
    // 磁盘与内存一致就别重渲 —— 无谓的整屏重建同样会换掉用户正在编辑的输入框
    if (state.draft !== draftBefore || state.source !== sourceBefore || state.draftConflict != null) render()
  }).catch(() => { /* 无文件面:草稿留空 */ })
  if (!activePageMd().trim() && state.draft) state.source = 'draft'
  render()

  return () => {
    disposed = true
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null }
    if (offPage) { try { offPage() } catch { /* ignore */ } }
    offBus()
  }
}

/** 命令与按钮共用:取当前来源 → 渲染 → 梯子 A→B→C → 写台账 → 通知。 */
async function copyCurrent() {
  const md = currentMd()
  if (!md.trim()) { say(t('copy.empty'), { level: 'warning' }); return null }
  const nodes = parseDoc(md)
  const style = currentStyle()
  const html = emitHtml(nodes, style)
  const title = deriveTitle(md)
  // 走 refreshFindings 而不是自己 auditBlocks:命令面板直接复制时状态栏项也要跟着刷
  const c = refreshFindings()
  let exported = ''
  try {
    const r = await copyAndLog(
      { title, source: sourcePath(), words: countWords(md), checks: checksField(c) },
      {
        rich: () => clipboardRich(html, md),
        compat: () => clipboardSelection(nodes, style, document),
        exportFile: async () => { exported = await exportHtmlFile(title, html) },
      },
    )
    if (ctx.activity && ctx.activity.log) ctx.activity.log('copy', { title, status: statusOfCopy(r.kind) })
    if (ctx.achievements && ctx.achievements.track) {
      ctx.achievements.track('copy', 1)
      if (c.block === 0) ctx.achievements.track('clean', 1)
    }
    if (r.ledgerError) say(t('copy.ledgerFail', { err: r.ledgerError }), { level: 'warning' })
    else say(r.kind === 'rich' ? t('copy.rich') : r.kind === 'compat' ? t('copy.compat') : t('copy.exported', { path: exported }), { level: 'success' })
    bus.emit({ type: 'ledger' })
    return r
  } catch (e) {
    say(t('copy.fail', { err: (e && e.message) || e }), { level: 'error' })
    return null
  }
}

// ══ 视图 ②:ledger ════════════════════════════════════════════════════════
function mountLedger(el) {
  el.textContent = ''
  el.appendChild(h('style', { text: CSS }))
  const root = h('div', { cls: 'wp-root' })
  el.appendChild(root)
  let disposed = false
  let ym = monthOfIso(nowIso())
  let month = { state: 'missing', entries: [] }

  async function load() {
    month = await readMonth(ym)
    if (!disposed) render()
  }
  function render() {
    if (disposed) return
    root.textContent = ''
    const months = knownMonths()
    const idx = months.indexOf(ym)
    root.appendChild(h('div', { cls: 'wp-hd' }, [
      h('span', { cls: 'wp-title', text: t('ledger.title') }),
      h('button', { cls: 'wp-btn sm', text: '‹', attrs: { title: t('ledger.prev') }, disabled: idx <= 0, on: { click: () => { ym = months[idx - 1] || ym; load() } } }),
      h('span', { cls: 'wp-path', text: ym }),
      h('button', { cls: 'wp-btn sm', text: '›', attrs: { title: t('ledger.next') }, disabled: idx < 0 || idx >= months.length - 1, on: { click: () => { ym = months[idx + 1] || ym; load() } } }),
      h('div', { cls: 'wp-spacer' }),
      h('span', { cls: 'wp-note', text: t('ledger.count', { n: month.entries.length }) }),
      h('button', { cls: 'wp-btn sm', text: t('ledger.openMonth'), on: { click: () => { try { if (ctx.app.openFile) ctx.app.openFile(ledgerPath(ym)) } catch { /* ignore */ } } } }),
    ]))
    if (month.state === 'error') root.appendChild(h('div', { cls: 'wp-banner', text: t('ledger.error', { path: ledgerPath(ym) }) }))
    if (!month.entries.length) { root.appendChild(h('div', { cls: 'wp-empty', text: t('ledger.empty') })); return }
    const cols = ['time', 'title', 'platform', 'source', 'status', 'words', 'checks', 'url']
    const thead = h('thead', {}, [h('tr', {}, cols.map((k) => h('th', { text: t(`ledger.col.${k}`) })).concat([h('th', { text: '' })]))])
    const tbody = h('tbody')
    for (const e of month.entries.slice().reverse()) {
      const f = e.fields || {}
      const stKey = LEDGER_STATUS.indexOf(f.status) >= 0 ? f.status : ''
      tbody.appendChild(h('tr', {}, [
        h('td', { text: fmtDate(e.ts) }),
        h('td', { text: f.title || '' }),
        h('td', { text: f.platform || '' }),
        h('td', { text: f.source || '' }),
        h('td', {}, [h('span', { cls: 'wp-st', text: stKey ? t(`st.${stKey}`) : (f.status || '') })]),
        h('td', { text: f.words || '' }),
        h('td', { text: f.checks || '' }),
        h('td', { text: f.url || '' }),
        h('td', {}, [h('div', { cls: 'wp-row' }, [
          h('button', { cls: 'wp-btn sm', text: t('ledger.markPublished'), disabled: month.state !== 'ok', on: { click: () => markPublished(e) } }),
          f.source ? h('button', { cls: 'wp-btn sm', text: t('ledger.openSource'), on: { click: () => { try { if (ctx.app.openFile) ctx.app.openFile(f.source) } catch { /* ignore */ } } } }) : null,
        ])]),
      ]))
    }
    const wrap = h('div', { cls: 'wp-tablewrap' }, [h('table', { cls: 'wp-tbl' }, [thead, tbody])])
    root.appendChild(wrap)
  }
  async function markPublished(e) {
    // 「取不到输入」≠「用户填了空」:宿主没有 prompt 就不许把条目标成 published + 空 url
    if (!ctx.app.prompt) { say(t('ledger.noPrompt'), { level: 'warning' }); return }
    let url = ''
    try { url = await ctx.app.prompt(t('ledger.urlPrompt'), e.fields.url || '') } catch { return }
    if (url == null) return
    try {
      await patchLedgerEntry(e.ts, { status: 'published', url: String(url).trim() })
      say(t('ledger.marked'), { level: 'success' })
      await load()
    } catch (err) { say(t('ledger.writeFail', { err: (err && err.message) || err }), { level: 'error' }) }
  }
  const offBus = bus.on((ev) => { if (!ev) return; if (ev.type === 'locale') render(); else if (ev.type === 'ledger') load() })
  render()
  load().catch(() => { /* 无文件面:空态 */ })
  return () => { disposed = true; offBus() }
}

// ══ AI 助手弹层 ═══════════════════════════════════════════════════════════
let aiController = null
function openAiModal() {
  const lay = layer()
  if (!lay) return
  lay.textContent = ''
  const box = h('div', { cls: 'wp-modal' })
  box.appendChild(h('h3', { text: t('ai.title') }))
  const out = h('div', { cls: 'wp-out' })
  const toneSel = h('select', { cls: 'wp-btn sm' })
  // option.value 存**语气键**(数据),显示串才走 MSG —— 切语言不许改写发给模型的指令段
  for (const key of TONE_KEYS) { const o = h('option', { text: t(`ai.tone.${key}`) }); o.value = key; toneSel.appendChild(o) }
  const tasks = [['titles', t('ai.titles')], ['summary', t('ai.summary')], ['rewrite', t('ai.rewrite')], ['advice', t('ai.advice')]]
  const row = h('div', { cls: 'wp-row' })
  for (const tk of tasks) row.appendChild(h('button', { cls: 'wp-btn sm', text: tk[1], on: { click: () => run(tk[0]) } }))
  row.appendChild(h('span', { cls: 'wp-note', text: t('ai.tone') }))
  row.appendChild(toneSel)
  box.appendChild(row)
  box.appendChild(out)
  box.appendChild(h('div', { cls: 'wp-row', css: 'margin-top:10px' }, [
    h('button', { cls: 'wp-btn sm', text: t('ai.cancel'), on: { click: () => { if (aiController) aiController.abort() } } }),
    h('button', { cls: 'wp-btn sm', text: t('common.close'), on: { click: closeLayer } }),
  ]))
  lay.appendChild(box)
  if (!hasEngine()) { out.textContent = t('ai.needLogin'); return }

  async function run(task) {
    const md = currentMd()
    if (task !== 'advice' && !md.trim()) { out.textContent = t('ai.empty'); return }
    const findings = auditBlocks(md)
    if (task === 'advice' && !findings.length) { out.textContent = t('ai.emptyAudit'); return }
    out.textContent = t('ai.running')
    if (aiController) aiController.abort()
    aiController = new AbortController()
    try {
      const cfg = await getCfg()
      if (!cfg.backendUrl || !cfg.token) { out.textContent = t('ai.needLogin'); return }
      const payload = task === 'advice'
        ? { json: JSON.stringify(findings.map((f) => ({ code: f.code, level: f.level, line: f.line, excerpt: f.excerpt }))) }
        : { text: md, tone: toneSel.value }
      const raw = await runAgent(cfg, buildAgentMessage(task, payload), null, aiController.signal)
      const parsed = parseAgentBlock(raw)
      out.textContent = ''
      if (md.length > TRUNC && task !== 'advice') out.appendChild(h('div', { cls: 'wp-note', text: t('ai.truncated') }))
      if (!parsed) {
        out.appendChild(h('div', { cls: 'wp-note', text: t('ai.raw') }))
        const holder = h('div')
        renderPlain(holder, raw, document)
        out.appendChild(holder)
        return
      }
      for (const item of parsed.items) {
        out.appendChild(h('div', { cls: 'wp-item' }, [
          h('div', { cls: 'txt', text: item }),
          h('button', {
            cls: 'wp-btn sm',
            text: t('ai.copy'),
            on: {
              click: async () => {
                try { await navigator.clipboard.writeText(item); say(t('ai.copied'), { level: 'success' }) } catch { /* ignore */ }
              },
            },
          }),
        ]))
      }
    } catch (e) {
      out.textContent = t('ai.fail', { err: (e && e.message) || e })
    } finally { aiController = null }
  }
}

// ══ 注册(composer 先注册 —— 真机台架默认开 views[0]) ═══════════════════
ctx.registerView({ id: 'composer', title: t('view.composer'), mount: mountComposer, singleton: true })
ctx.registerView({ id: 'ledger', title: t('view.ledger'), mount: mountLedger, singleton: true })
ctx.registerCommand({ id: 'wechat-publisher-open', title: t('cmd.open'), keywords: 'wechat publisher 公众号 发布 排版 inline', run: () => ctx.openView('composer') })
ctx.registerCommand({ id: 'wechat-publisher-copy', title: t('cmd.copy'), keywords: 'wechat copy 复制 公众号 富文本', run: () => { copyCurrent().catch(() => {}) } })
ctx.registerCommand({ id: 'wechat-publisher-ledger', title: t('cmd.ledger'), keywords: 'wechat ledger 台账 发布记录', run: () => ctx.openView('ledger') })
const statusHandle = ctx.registerStatusItem ? ctx.registerStatusItem({ id: 'audit', side: 'right', text: '⚑ —', title: t('status.title'), onClick: () => ctx.openView('composer') }) : null
// 装载即给一次真值:否则 composer 没被打开过时状态栏恒显示 '⚑ —'(⚠️ 必须在 statusHandle 之后,它是 const)
if (statusHandle) { try { refreshFindings() } catch { /* 没有活动页 / 旧宿主:留占位 */ } }
if (ctx.achievements && ctx.achievements.registerSeries) {
  ctx.achievements.registerSeries({
    id: 'publish',
    title: t('view.composer'),
    achievements: [
      { id: 'first-copy', title: L() === 'zh' ? '第一次交付' : 'First delivery', desc: L() === 'zh' ? '首次成功复制到公众号' : 'Copied an article for WeChat', event: 'copy', goal: 1, points: 10 },
      { id: 'ten-copy', title: L() === 'zh' ? '十篇起步' : 'Ten out the door', desc: L() === 'zh' ? '累计复制 10 篇' : 'Copied 10 articles', event: 'copy', goal: 10, points: 20 },
      { id: 'clean-five', title: L() === 'zh' ? '零阻断交付' : 'Clean delivery', desc: L() === 'zh' ? '体检零阻断交付 5 次' : 'Delivered 5 times with zero blocking findings', event: 'clean', goal: 5, points: 30 },
    ],
  })
}
/** 语言变更:只广播,视图**不重挂**就换语言。 */
const offLocale = ctx.subscribeLocale ? ctx.subscribeLocale(() => bus.emit({ type: 'locale' })) : null

if (globalThis.__PUBLISHER_TEST__) {
  Object.assign(globalThis.__PUBLISHER_TEST__, {
    MSG, t, L, STYLE, PLAIN_STYLE, buildStyle, sectionStyle,
    stripFrontmatter, stripHostMarkers, cleanSource, cleanSourceMap,
    escapeHtml, nbspRuns, brLines, htmlText, nbspText,
    parseInline, parseDoc, emitHtml, emitDom, renderPlain, htmlDocument, safeHref, safeSrc,
    auditBlocks, auditCounts, checksField, pangu, countWords, deriveTitle, sanitizeFileName,
    parseLedgerMonth, serializeLedgerMonth, makeEntry, setEntryField, upsertEntry, monthSeq, scanFields,
    readMonth, writeLedgerEntry, patchLedgerEntry, ledgerPath, exportPath, draftPath, wfRoot,
    runCopyLadder, statusOfCopy, copyAndLog, exportHtmlFile, clipboardRich, clipboardSelection, runAgent,
    parseAgentBlock, buildAgentMessage, frontmatterUnclosed, knownMonths, TONE_EN, TONE_KEYS,
    mountComposer, mountLedger, bus, state, enqueueWrite, loadDraft, activePageMd,
  })
}

return () => {
  if (offLocale) { try { offLocale() } catch { /* ignore */ } }
  if (statusHandle && statusHandle.dispose) { try { statusHandle.dispose() } catch { /* ignore */ } }
  if (aiController) { try { aiController.abort() } catch { /* ignore */ } aiController = null }
  if (_layer) { try { _layer.remove() } catch { /* ignore */ } _layer = null }
}
