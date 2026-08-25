/**
 * 发布工作台 wechat-publisher 自检:宿主同款 new Function('ctx', src) 求值 main.js。
 * 覆盖:①贡献点齐全(2 视图 / 3 命令 / 4 设置 / 状态栏项)②disposer 是函数且执行不抛
 * ③渲染三承诺逐字节(&nbsp; / <br> / 全 inline 化)④两 emitter 一致 ⑤XSS ⑥pangu ⑦体检规则
 * ⑧台账契约(逐字节往返 / upsert 幂等 / 三态 / error 月拒写)⑨剪贴板梯子降级 ⑩双语词表两侧对齐
 * ⑪mock ctx 切 en 后视图**不重挂**就变英文 ⑫旧宿主 ctx(无 notify/activity/workFolder/
 * registerStatusItem/getLocale/subscribeLocale)下 setup 不抛、文案回退中文、状态栏项不出现。
 * ⑬2026-08-14 评审回归向量(每条都做过变异测试,把修复改回去必红):
 *   宿主 compile 真实产物的台账(标题块/字段块之间恒有空行+标记行)/ CRLF 台账 / 首行空行往返 /
 *   草稿「现读→比对→写」不覆盖用户文件 + 每次挂载重读 / 防抖体检不重建 textarea /
 *   点体检条目跳到**原文**行 / pangu 不碰链接 target 与裸 URL / `_` 不当斜体 /
 *   两 emitter 的 <a> 属性面一致 / POST body 无 model_id / 语气键→固定英文 /
 *   items 非字符串落兜底 / 围栏内 # 不当标题 / 状态栏装载即有真值 / 无 prompt 不许标 published /
 *   引擎缺席 notify(warning) + 文案可达 / 同页击键只增量刷新。
 * 跑法:node check.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as A } from 'node:assert'

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8')

// ── 极简 DOM 垫片(照 bluebird,加 style/value/className) ──
function mkText(t) {
  let v = String(t)
  const n = { tag: '#text', children: [], attrs: {}, appendChild() {}, setAttribute() {}, addEventListener() {}, remove() {} }
  Object.defineProperty(n, 'textContent', { get: () => v, set: (x) => { v = String(x) } })
  return n
}
function mkEl(tag) {
  const n = { tag, children: [], attrs: {}, on: {}, style: { cssText: '', setProperty() {} }, focus() {}, sel: null, scrollTop: 0, isConnected: false }
  n.setSelectionRange = (a, b) => { n.sel = [a, b] }
  n.addEventListener = (ev, fn) => { (n.on[ev] = n.on[ev] || []).push(fn) }
  let own = ''
  n.appendChild = (c) => { if (c && c.tag === '#frag') for (const k of c.children) n.children.push(k); else n.children.push(c); return c }
  n.setAttribute = (k, val) => { n.attrs[k] = String(val) }
  n.remove = () => {}
  Object.defineProperty(n, 'textContent', {
    get: () => own + n.children.map((c) => c.textContent || '').join(''),
    set: (x) => { n.children.length = 0; own = String(x) },
  })
  return n
}
const body = mkEl('body')
globalThis.document = { body, createElement: mkEl, createTextNode: mkText, createDocumentFragment: () => mkEl('#frag'), addEventListener() {} }
const _ls = new Map()
globalThis.localStorage = { getItem: (k) => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: (k) => _ls.delete(k) }
// 冻钟:今天固定 2026-08-14(导出路径 / 台账月份 / ISO 时间戳都据此断言)
const FIXED = Date.parse('2026-08-14T09:12:33.000Z')
Date.now = () => FIXED

const walkAll = (node, fn) => { for (const c of node.children || []) { fn(c); walkAll(c, fn) } }
const findAll = (node, tag) => { const out = []; walkAll(node, (c) => { if (c.tag === tag) out.push(c) }); return out }
const tagSeq = (node) => { const out = []; walkAll(node, (c) => { if (c.tag !== '#text') out.push(c.tag) }); return out }
const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, String.fromCharCode(160)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')

// ── 求值 main.js(新宿主 ctx) ──
globalThis.__PUBLISHER_TEST__ = {}
const reg = { views: [], commands: [], settings: [], status: [], series: [], tracks: [], acts: [], notes: [], stUpdates: [] }
let LOCALE = 'zh'
let localeCb = null
let pageCb = null
const V = new Map()
const writes = []
let PAGE = { token: 'tk', path: '笔记/护城河.md', status: 'ready', blocks: { b1: '# 标题\n\n正文一段' }, order: ['b1'], fmExtra: '' }
const ctx = {
  registerView: (v) => reg.views.push(v),
  registerCommand: (c) => reg.commands.push(c),
  registerSetting: (s) => reg.settings.push(s),
  registerStatusItem: (s) => { reg.status.push(s); return { update: (o) => reg.stUpdates.push(o), dispose() {} } },
  registerSlashItem() {}, registerTheme() {}, registerFileType() {}, registerFileCreator() {}, registerEmbedRenderer() {},
  openView() {},
  notify: (m, o) => reg.notes.push([m, o]),
  activity: { log: (e, d) => reg.acts.push([e, d]) },
  achievements: { registerSeries: (s) => reg.series.push(s), track: (e, n) => reg.tracks.push([e, n]) },
  getLocale: () => LOCALE,
  subscribeLocale: (cb) => { localeCb = cb; return () => { localeCb = null } },
  app: {
    notify() {},
    workFolder: () => '发布工作台',
    getPage: () => PAGE,
    subscribePage: (cb) => { pageCb = cb; return () => { pageCb = null } },
    prompt: async () => 'https://mp.weixin.qq.com/s/abc',
    openFile() {},
    readFile: async (p) => (V.has(p) ? V.get(p) : null),
    writeFile: async (p, text) => { V.set(p, text); writes.push(p) },
  },
}
const dispose = new Function('ctx', src)(ctx)
const T = globalThis.__PUBLISHER_TEST__

// ══ ① 贡献点齐全 ══════════════════════════════════════════════════════════
A.equal(typeof dispose, 'function', 'setup 应返回 disposer')
A.equal(reg.views[0].id, 'composer', 'composer 必须**第一个**注册(真机台架默认开 views[0])')
A.ok(reg.views.find((v) => v.id === 'composer' && typeof v.mount === 'function'), '应注册 composer 视图')
A.ok(reg.views.find((v) => v.id === 'ledger' && typeof v.mount === 'function'), '应注册 ledger 视图')
A.deepEqual(reg.commands.map((c) => c.id).sort(), ['wechat-publisher-copy', 'wechat-publisher-ledger', 'wechat-publisher-open'], '三个命令 id 按 SPEC 钉死')
A.deepEqual(reg.settings.map((s) => s.key).sort(), ['autoAudit', 'fontSize', 'lineHeight', 'styleTheme'], '四个设置')
A.equal(reg.status.length, 1, '新宿主应注册状态栏项')
A.equal(reg.status[0].id, 'audit')
// P3-f:装载即给一次真值,别等 composer 被打开过才刷(命令面板直接复制的人永远看不到 composer)
A.ok(reg.stUpdates.length >= 1, '注册状态栏项后应立刻刷一次真值,而不是恒显示占位')
A.equal(reg.stUpdates[reg.stUpdates.length - 1].text, '⚑ 0/0', `状态栏应显示当前母稿体检:${JSON.stringify(reg.stUpdates)}`)
A.equal(reg.series.length, 1, '应注册一个成就系列')
A.deepEqual(reg.series[0].achievements.map((a) => a.event).sort(), ['clean', 'copy', 'copy'])
for (const api of ['registerSlashItem', 'registerFileType', 'registerFileCreator', 'registerEmbedRenderer']) {
  A.ok(!new RegExp(`ctx\\.${api}`).test(src), `本插件不引入新文件类型 / 斜杠项(不该调 ${api})`)
}

// ══ ⑩ 双语词表两侧键集合相等 ══════════════════════════════════════════════
A.deepEqual(Object.keys(T.MSG.zh).sort(), Object.keys(T.MSG.en).sort(), 'MSG 两侧键集合必须完全相等')
for (const code of ['mermaid', 'math', 'raw-html', 'iframe-embed', 'remote-image', 'local-image', 'external-link', 'table', 'wide-code', 'deep-heading', 'nested-list', 'footnote']) {
  A.ok(T.MSG.zh[`audit.${code}.title`] && T.MSG.zh[`audit.${code}.hint`], `audit.${code} 中文文案缺失`)
  A.ok(T.MSG.en[`audit.${code}.title`] && T.MSG.en[`audit.${code}.hint`], `audit.${code} 英文文案缺失`)
}
A.equal(T.t('audit.line', { n: 7 }), '第 7 行', '占位符 {n} 应被替换')

// ══ ③ 渲染三承诺(逐字节) ════════════════════════════════════════════════
A.equal(T.nbspRuns('a b'), 'a b', '单个空格不动')
A.equal(T.nbspRuns('a  b'), 'a&nbsp;&nbsp;b', '2 空格 → 2 个 &nbsp;')
A.equal(T.nbspRuns('a   b'), 'a&nbsp;&nbsp;&nbsp;b', '3 空格 → 3 个 &nbsp;')
A.equal(T.nbspRuns('    x'), '&nbsp;&nbsp;&nbsp;&nbsp;x', '行首 4 空格缩进 → 4 个 &nbsp;')
A.equal(T.htmlText('a &  b'), 'a &amp;&nbsp;&nbsp;b', '转义顺序:escapeHtml → nbspRuns → brLines')
A.equal(T.brLines('a\nb'), 'a<br>b')
const softWrap = T.emitHtml(T.parseDoc('a\nb'))
A.ok(softWrap.includes('a<br>b'), '段内软换行应是 <br>')
A.ok(!softWrap.includes('<br/>'), '必须是字面 <br>,不是 <br/>')
const codeHtml = T.emitHtml(T.parseDoc('```\nx\n  y\n```'))
A.ok(codeHtml.includes('x<br>&nbsp;&nbsp;y'), `代码块内空格与换行同样处理:${codeHtml}`)

const SAMPLE = [
  '---', 'title: 前置元数据不该被复制走', '---', '',
  '<!-- a 1 -->', '# 一级标题', '', '正文有 **粗** 与 *斜* 与 `码` 与 [链接](https://example.com) 与 ~~删~~。', '',
  '> 引用一句', '', '- 甲', '- 乙', '', '1. 一', '2. 二', '', '```js', 'const a = 1', '```', '',
  '| 表头 | 值 |', '| --- | --- |', '| 甲 | 1 |', '', '![图](pic.png)', '', '---', '', '结尾一段',
].join('\n')
const clean = T.cleanSource(SAMPLE)
const nodes = T.parseDoc(clean)
const html = T.emitHtml(nodes, T.STYLE)
A.ok(!html.includes('class='), '产物里绝不许出现 class=')
A.ok(!html.includes('<style'), '产物里绝不许出现 <style')
A.ok(!html.includes('<link'), '产物里绝不许出现 <link')
A.ok(html.startsWith('<section style="'), '根节点必须是 <section style="')
for (const tag of html.match(/<[a-z][a-z0-9]*[^>]*>/g) || []) {
  if (tag === '<br>') continue
  A.ok(/^<[a-z][a-z0-9]*\sstyle="/.test(tag), `每个生成的开标签都要紧跟 style=":${tag}`)
}
A.ok(!html.includes('前置元数据'), 'frontmatter 内容不许进产物')
A.ok(!html.includes('<!-- a'), '宿主块标记行不许进产物')
A.ok(html.includes('<h1 style=') && html.includes('<blockquote style=') && html.includes('<ul style=') && html.includes('<ol style=') && html.includes('<pre style=') && html.includes('<table style=') && html.includes('<img style=') && html.includes('<hr style='), '支持的 markdown 子集都要出现在产物里')

// 默认样式表逐字节
A.equal(T.STYLE.p, 'margin:0 0 1.2em;')
A.equal(T.STYLE.h2, 'margin:1.6em 0 0.8em;font-size:20px;font-weight:700;color:#1a1a1a;')
A.equal(T.STYLE.code, 'padding:0 4px;background:#f2f2f2;border-radius:3px;color:#0b6f45;font-size:14px;')
A.equal(T.STYLE.section, 'font-size:16px;line-height:1.75;color:#3f3f3f;letter-spacing:0.034em;word-break:break-word;')
A.deepEqual(T.buildStyle({}), T.STYLE, '默认设置下 buildStyle 逐字节 === STYLE')
A.ok(T.buildStyle({ fontSize: 18, lineHeight: 200 }).section.includes('font-size:18px;line-height:2;'), '设置只改数值')
A.ok(!JSON.stringify(T.buildStyle({ styleTheme: 'compact' })).includes('class'), '风格切换不引入 class')

// ══ ④ 两 emitter 一致 ═════════════════════════════════════════════════════
const dom = T.emitDom(nodes, T.STYLE, globalThis.document)
A.equal(dom.tag, 'section')
A.deepEqual([dom.tag].concat(tagSeq(dom)), (html.match(/<([a-z][a-z0-9]*)[^>]*>/g) || []).map((s) => /<([a-z][a-z0-9]*)/.exec(s)[1]), '两 emitter 的元素标签序列必须一致')
A.equal(dom.textContent, decode(html), '两 emitter 的可见文本必须一致')
walkAll(dom, (n) => {
  A.ok(!('class' in n.attrs), 'emitDom 产物不许有 class 属性')
  A.ok(!n.className, 'emitDom 产物不许设 className')
  for (const k of Object.keys(n.attrs)) A.ok(!/^on/i.test(k), `emitDom 产物不许有 ${k} 属性`)
})

// ══ ⑤ XSS ════════════════════════════════════════════════════════════════
const EVIL = '正文 <img src=x onerror=alert(1)> 结束'
const evilHtml = T.emitHtml(T.parseDoc(EVIL))
A.ok(evilHtml.includes('&lt;img src=x onerror=alert(1)&gt;'), `裸 HTML 必须被转义:${evilHtml}`)
const evilDom = T.emitDom(T.parseDoc(EVIL), T.STYLE, globalThis.document)
A.equal(findAll(evilDom, 'img').length, 0, 'emitDom 树里绝不能出现 img 元素')
walkAll(evilDom, (n) => A.ok(!('onerror' in n.attrs), '绝不能设 onerror 属性'))
A.ok(T.auditBlocks(EVIL).some((f) => f.code === 'raw-html'), '同一输入体检应报 raw-html')
const rawBox = mkEl('div')
T.renderPlain(rawBox, '**hi** <img src=x onerror=alert(1)> `code`', globalThis.document)
A.equal(findAll(rawBox, 'img').length, 0, 'Agent 原文渲染器同样不许造 img')
walkAll(rawBox, (n) => A.ok(!('onerror' in n.attrs), 'Agent 原文渲染器不许设 onerror'))
A.ok(rawBox.textContent.includes('<img') && rawBox.textContent.includes('onerror'), '注入串应作为字面文字保留')
A.equal(T.safeHref('javascript:alert(1)'), '', 'javascript: 应被拒')
A.equal(T.safeSrc('javascript:alert(1)'), '', 'javascript: 图片源应被拒')
A.equal(T.safeSrc('pic.png'), 'pic.png', '相对路径放行')
// P2-7:`_` 不是 SPEC 行内子集 —— 标识符不许被吃成斜体
const under = T.emitHtml(T.parseDoc('变量 snake_case_name 与 __init__ 都要原样'))
A.ok(under.includes('snake_case_name'), `snake_case 标识符不许被拆:${under}`)
A.ok(under.includes('__init__'), `__init__ 不许被拆:${under}`)
A.ok(!under.includes('<em'), '`_..._` 不在 SPEC 子集里,不许当斜体')
A.ok(T.emitHtml(T.parseDoc('这里 *是* 斜体')).includes('<em style='), '`*..*` 仍然是斜体')
// P3-e:两个 emitter 的 <a> 属性面必须一致(check 原来只比标签序列与可见文本,抓不到)
const linkHtml = T.emitHtml(T.parseDoc('见 [文档](https://example.com) 结束'), T.STYLE)
A.ok(linkHtml.includes('href="https://example.com"') && linkHtml.includes('target="_blank"') && linkHtml.includes('rel="noopener noreferrer"'),
  `emitHtml 的 <a> 应带 href/target/rel:${linkHtml}`)
const linkDom = T.emitDom(T.parseDoc('见 [文档](https://example.com) 结束'), T.STYLE, globalThis.document)
const aNode = findAll(linkDom, 'a')[0]
A.ok(aNode, 'emitDom 应造出 <a>')
A.deepEqual(Object.keys(aNode.attrs).sort(), ['href', 'rel', 'target'], `两个 emitter 的 <a> 属性面必须一致:${JSON.stringify(aNode.attrs)}`)

// ══ ⑥ pangu ══════════════════════════════════════════════════════════════
A.equal(T.pangu('用Forsion写'), '用 Forsion 写')
A.equal(T.pangu('用 Forsion 写'), '用 Forsion 写', '已有空格不重复补')
A.equal(T.pangu('第3章'), '第 3 章')
A.equal(T.pangu('hello world'), 'hello world')
A.equal(T.pangu('他说"Hi"'), '他说"Hi"', '标点边界不补')
const px = '用Forsion写第3章'
A.equal(T.pangu(T.pangu(px)), T.pangu(px), 'pangu 幂等')
A.equal(T.pangu('```\n用Forsion写\n```'), '```\n用Forsion写\n```', '围栏代码块内容原样不动')
A.equal(T.pangu('看 `用Forsion写` 这段'), '看 `用Forsion写` 这段', '行内码原样不动')
// P1-3:补空格会把机器可读的链接改坏 —— 对一个卖「保真」的工具是同一类错误
A.equal(T.pangu('![封面](图1.png)'), '![封面](图1.png)', '图片 target 不许被补空格(补了链接就失效)')
A.equal(T.pangu('见 [文档](https://a.com/中文X) 结束'), '见 [文档](https://a.com/中文X) 结束', '链接 target 不许被补空格')
A.equal(T.pangu('见 https://zh.wikipedia.org/wiki/中文Wiki 结束'), '见 https://zh.wikipedia.org/wiki/中文Wiki 结束', '裸 URL 不许被补空格')
A.equal(T.pangu('文件 报告2026.pdf 在这'), '文件 报告2026.pdf 在这', '词首的文件名不许被补空格')
A.equal(T.pangu('<https://a.com/中文X>'), '<https://a.com/中文X>', '尖括号自动链接不许被补空格')
const pLink = '![封面](图1.png) 见 https://a.com/中文X 与 报告2026.pdf,正文用Forsion写'
A.equal(T.pangu(T.pangu(pLink)), T.pangu(pLink), '含链接 / URL / 文件名的样本上 pangu 仍幂等')
A.ok(T.pangu(pLink).includes('用 Forsion 写'), '保护段之外该补的空格还是要补')

// ══ ⑦ 体检规则 ═══════════════════════════════════════════════════════════
A.deepEqual(T.auditBlocks(''), [], '空输入 → []')
A.deepEqual(T.auditBlocks('就是一段普通文字,没有任何特殊语法。'), [], '纯文字 → []')
const f1 = T.auditBlocks('![](https://x/a.png)')
A.equal(f1[0].code, 'remote-image'); A.equal(f1[0].level, 'warn'); A.equal(f1[0].line, 1)
A.equal(T.auditBlocks('```mermaid\ngraph TD\n```')[0].code, 'mermaid')
A.equal(T.auditBlocks('```mermaid\ngraph TD\n```')[0].level, 'block')
A.equal(T.auditBlocks('$$x$$')[0].code, 'math')
A.equal(T.auditBlocks('<div>x</div>')[0].code, 'raw-html')
A.ok(T.auditBlocks('段内有 <br> 换行').some((f) => f.code === 'raw-html'), '<br> 不设豁免')
A.ok(T.auditBlocks('```\n' + 'x'.repeat(70) + '\n```').some((f) => f.code === 'wide-code'), '代码块单行 > 60 字符')
A.ok(T.auditBlocks('#### 四级标题').some((f) => f.code === 'deep-heading'))
A.ok(T.auditBlocks('- 甲\n  - 乙').some((f) => f.code === 'nested-list'))
A.ok(T.auditBlocks('正文[^1]').some((f) => f.code === 'footnote'))
A.ok(T.auditBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |').some((f) => f.code === 'table'))
A.ok(T.auditBlocks('见 [文档](https://example.com)').some((f) => f.code === 'external-link'))
A.ok(T.auditBlocks('<iframe src="x"></iframe>').some((f) => f.code === 'iframe-embed'))
A.ok(!T.auditBlocks('```\n<div>代码里的标签不该报</div>\n```').some((f) => f.code === 'raw-html'), '围栏内不判裸 HTML')
A.ok(!T.auditBlocks('定价 $5 和 $6').some((f) => f.code === 'math'), '$5 和 $6 不该被当公式')
A.equal(T.auditBlocks('第一行\n第二行\n第三行\n第四行\n![](a.png)')[0].line, 5, '行号 1-based')
A.deepEqual(
  T.auditBlocks('第一行\r\n第二行\r\n第三行\r\n第四行\r\n![](a.png)').map((f) => f.line),
  T.auditBlocks('第一行\n第二行\n第三行\n第四行\n![](a.png)').map((f) => f.line),
  'CRLF 输入行号与 LF 一致',
)
const many = T.auditBlocks('<div>x</div>\n\n![](https://x/a.png)\n\n#### 深标题')
A.deepEqual(many.map((f) => f.line), many.map((f) => f.line).slice().sort((a, b) => a - b), '多命中按 line 升序')
A.equal(T.checksField(T.auditCounts(many)), 'block=1 warn=1 info=1')

// ══ 其它纯函数 ═══════════════════════════════════════════════════════════
A.equal(T.countWords('你好 world'), 3, '中文按字 + 英文按词')
A.equal(T.deriveTitle(''), 'Untitled', '空标题回退 ASCII Untitled(语言无关)')
A.equal(T.deriveTitle('# 护城河\n正文'), '护城河')
// P3-h:围栏里的 `#` 不是文章标题(它会被写进台账 title 与导出文件名)
A.equal(T.deriveTitle('```\n# 不是标题\n```\n\n真正的正文'), '真正的正文', '围栏内的 # 不许被当标题')
A.equal(T.deriveTitle('```js\nconst a = 1\n```\n\n# 真标题'), '真标题', '围栏之后的真标题仍要认')
// P2-6:体检行号算在净化文本上,跳转量的是原文 —— 必须有映射表
const SRC6 = '---\ntitle: fm\n---\n\n<!-- a 1 -->\n正文一\n<!-- a 2 -->\n![](https://x/a.png)\n'
A.equal(T.cleanSource(SRC6), T.cleanSourceMap(SRC6).text, 'cleanSource 必须与 cleanSourceMap 同源')
const cm6 = T.cleanSourceMap(SRC6)
const f6 = T.auditBlocks(cm6.text)
A.equal(f6[0].code, 'remote-image')
A.equal(f6[0].line, 2, '净化后行号')
A.equal(cm6.map[f6[0].line - 1], 8, `净化后第 2 行 = 原文第 8 行(frontmatter 4 行 + 两条标记行):${JSON.stringify(cm6.map)}`)
A.deepEqual(cm6.map, [6, 8, 9], '映射表应逐行给出原文行号')
A.ok(!/[\\/:*?"<>|]/.test(T.sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')), 'sanitizeFileName 去掉非法字符')
A.equal(T.stripFrontmatter('---\na: 1\n---\n正文'), '正文')
A.equal(T.stripFrontmatter('正文---'), '正文---', '不是 frontmatter 就别动')
A.equal(T.stripHostMarkers('<!-- a 3 -->\n正文\n<!-- a 4 -->'), '正文')
// parseAgentBlock 四态,都不抛
A.deepEqual(T.parseAgentBlock('前言\n```publisher-json\n{"task":"titles","items":["A","B"]}\n```\n后记'), { task: 'titles', items: ['A', 'B'] })
A.equal(T.parseAgentBlock('没有围栏的一段话'), null)
A.equal(T.parseAgentBlock('```publisher-json\n这不是 JSON\n```'), null)
A.equal(T.parseAgentBlock('```publisher-json\n{"task":"titles"}\n```'), null, '缺 items 应判失败')
A.equal(T.parseAgentBlock('```publisher-json\n{"task":"titles","items":[{"a":1}]}\n```'), null,
  'items 元素不是字符串时必须落到「渲染原文」兜底,不许 String(x) 成 [object Object]')
A.ok(T.buildAgentMessage('titles', { text: 'x' }).includes('Respond in Chinese.'), '指令段英文 + 显式输出语言')
// P3-c:语气是**数据键**,指令段里必须是固定英文描述 —— 不许把界面上那个本地化串塞进去
const rewriteMsg = T.buildAgentMessage('rewrite', { text: 'x', tone: 'rednote' })
A.ok(rewriteMsg.includes(T.TONE_EN.rednote), `rewrite 指令段应含固定英文语气描述:${rewriteMsg}`)
A.ok(!/[一-鿿]/.test(rewriteMsg), `发给模型的指令段一律英文,不许出现中文:${rewriteMsg}`)
A.deepEqual(T.TONE_KEYS.slice().sort(), Object.keys(T.TONE_EN).sort(), '语气键表与英文描述表必须一一对应')
// P3-a:真正的不变量在 POST body 的键集合上(旧断言量的是提示词文本,恒真)
{
  const posted = []
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/agent/runs')) { posted.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ runId: 'r1' }) } }
    const chunks = [new TextEncoder().encode('data: {"seq":1,"type":"done","payload":{"content":"hi"}}\n')]
    let i = 0
    return { ok: true, body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) }) } }
  }
  const agentOut = await T.runAgent({ backendUrl: 'http://x/api', token: 'tk' }, 'msg', null, undefined)
  globalThis.fetch = origFetch
  A.equal(agentOut, 'hi', 'SSE done 应收尾')
  A.deepEqual(Object.keys(posted[0]).sort(), ['app_id', 'attachments', 'message', 'session_id'],
    `POST /agent/runs 的 body 键集合钉死,绝不含 model_id:${JSON.stringify(posted[0])}`)
  A.equal(posted[0].app_id, 'tangu')
}

// ══ ⑧ 台账契约 ═══════════════════════════════════════════════════════════
const LEDGER = [
  '---', 'plugin: wechat-publisher', 'kind: ledger', 'month: 2026-08', 'schema: 1', '---', '',
  '# 2026-08', '',
  '<!-- a 3 -->',
  '## 2026-08-14T09:12:33.000Z',
  'title: 插件生态的护城河是 Agent 纵深',
  'platform: wechat',
  'source: 笔记/护城河.md',
  'status: copied',
  'words: 1820',
  'checks: block=0 warn=2 info=1',
  'url:',
  'foo: bar',
  '',
  '备注正文,自由 markdown。',
  '## 小节标题(这行不是条目边界)',
  '继续备注。',
  '<!-- a 3 -->',
  '',
  '## 2026-08-15T02:00:00.000Z',
  'title: 第二篇',
  'platform: wechat',
  'status: copied',
  'url:',
  '<!-- a 3 -->',
  '',
].join('\n')
const parsed = T.parseLedgerMonth(LEDGER)
A.equal(T.serializeLedgerMonth('2026-08', ...parsed), LEDGER, '台账往返必须逐字节相等')
A.equal(parsed[0].length, 2, '## 后不是 ISO 时间戳的行不是边界')
A.equal(parsed[0][0].fields.foo, 'bar', '未知键原样保留')
A.equal(parsed[0][0].fields.title, '插件生态的护城河是 Agent 纵深')
A.equal(parsed[0][0].fields.url, '', '空值字段')
// upsert 幂等
let entries = parsed[0]
entries = T.upsertEntry(entries, { ts: '2026-08-14T09:12:33.000Z', fields: { status: 'published', url: 'https://mp.weixin.qq.com/s/x' } })
const n1 = entries.length
entries = T.upsertEntry(entries, { ts: '2026-08-14T09:12:33.000Z', fields: { status: 'published', url: 'https://mp.weixin.qq.com/s/x' } })
A.equal(entries.length, n1, 'upsert 同 ts 幂等:长度不变')
A.equal(entries[0].fields.status, 'published')
const after = T.serializeLedgerMonth('2026-08', entries, parsed[1])
A.ok(after.includes('status: published') && after.includes('url: https://mp.weixin.qq.com/s/x'), '字段应就地更新')
A.ok(after.includes('foo: bar'), '未知键不许丢')
A.ok(after.includes('## 小节标题'), '备注正文不许丢')
A.equal((after.match(/<!-- a 3 -->/g) || []).length, 3, '三处块标记行一字不动')
A.ok(!/<!-- a 3 --> /.test(after), '绝不能往块标记行上追加内容')
// 新 ts 追加后按升序
entries = T.upsertEntry(entries, { ts: '2026-08-01T00:00:00.000Z', fields: { title: '更早的一篇', status: 'copied' } })
A.equal(entries.length, 3)
A.deepEqual(entries.map((e) => e.ts), entries.map((e) => e.ts).slice().sort(), '新条目按 ts 升序稳定排序')

// ══ P1-1 宿主 compile 真实产物:标题块与字段块之间**恒有**空行 + 块标记行 ═════
//  shared/amadeus/compiler/compile.ts:`${blockMarker(ref)}\n\n${content}` 再 join('\n\n')。
//  `## <ISO>` 是 heading 节点、连续的 `key: value` 是 paragraph 节点 → 必然分属两个块。
//  用户在 Amadeus 里打开过一次台账,「遇空行就停」的老规则会把每条条目读成零字段。
const HOSTLEDGER = [
  '---', 'plugin: wechat-publisher', 'kind: ledger', 'month: 2026-08', 'schema: 1', '---', '',
  '<!-- a 1 -->', '', '# 2026-08', '',
  '<!-- a 2 -->', '',
  '## 2026-08-14T09:12:33.000Z', '',
  '<!-- a 3 -->', '',
  'title: 护城河', 'platform: wechat', 'source: 笔记/护城河.md', 'status: copied', 'words: 1820', 'checks: block=0 warn=2 info=1', 'url:', '',
  '<!-- a 4 -->', '', '备注一段。', '',
].join('\n')
const hp = T.parseLedgerMonth(HOSTLEDGER)
A.equal(hp[0].length, 1, '宿主产物里也只有一条条目')
A.equal(hp[0][0].fields.title, '护城河', '宿主写回过的台账必须仍读得出字段(否则台账整列空白)')
A.equal(hp[0][0].fields.status, 'copied')
A.equal(hp[0][0].fields.url, '')
A.deepEqual(hp[0][0].keys, ['title', 'platform', 'source', 'status', 'words', 'checks', 'url'], '字段顺序原样')
A.equal(T.serializeLedgerMonth('2026-08', ...hp), HOSTLEDGER, '宿主产物往返仍逐字节相等')
// 补字段的插入点必须与 parse 同规则 —— 否则会插进 `## <ISO>` 那个块里
T.setEntryField(hp[0][0], 'note', 'x')
const hl = hp[0][0].rawLines
A.equal(hl.indexOf('note: x'), hl.indexOf('url:') + 1, `新字段应插在最后一条字段行之后:${JSON.stringify(hl)}`)
T.setEntryField(hp[0][0], 'status', 'published')
A.equal(hp[0][0].rawLines.filter((l) => /^status:/.test(l)).length, 1, '绝不能出现两条互相矛盾的 status')
A.equal(hp[0][0].rawLines.filter((l) => /^status: published$/.test(l)).length, 1, '就地改的是原来那一行')
A.ok(hp[0][0].rawLines.indexOf('status: published') > hp[0][0].rawLines.indexOf('## 2026-08-14T09:12:33.000Z') + 1, '绝不能插进标题块')
// 「见到第一条字段之前空行透明」不许把自由备注当字段:没有字段的条目仍然是零字段
const NOFIELD = ['## 2026-08-20T00:00:00.000Z', '', '这条只有备注,没有字段。', ''].join('\n')
A.deepEqual(T.parseLedgerMonth(NOFIELD)[0][0].keys, [], '中文备注不该被当成字段')
A.equal(T.serializeLedgerMonth('2026-08', ...T.parseLedgerMonth(NOFIELD)), NOFIELD, '零字段条目也逐字节往返')

// ══ P2-5 CRLF 台账:整月不许判死 ═══════════════════════════════════════════
const CRLF_LEDGER = LEDGER.replace(/\n/g, '\r\n')
const pc = T.parseLedgerMonth(CRLF_LEDGER)
A.equal(pc[0].length, 2, 'CRLF 台账也要能切出条目(否则该月新记录全写不进去)')
A.equal(pc[0][0].fields.title, '插件生态的护城河是 Agent 纵深', 'CRLF 台账字段要读得出来')
A.equal(pc[0][0].fields.foo, 'bar', 'CRLF 下未知键同样保留')
A.equal(T.serializeLedgerMonth('2026-08', ...pc), CRLF_LEDGER, 'CRLF 台账往返逐字节(\\r 一个不许丢)')
T.setEntryField(pc[0][0], 'status', 'published')
A.ok(pc[0][0].rawLines.some((l) => l === 'status: published\r'), `CRLF 文件里改出来的行也要带 \\r:${JSON.stringify(pc[0][0].rawLines)}`)
V.set('发布工作台/Ledger/2026-05.md', CRLF_LEDGER)
A.equal((await T.readMonth('2026-05')).state, 'ok', 'CRLF 月文件必须判 ok,不是 error')

// ══ P2-8 首行是空行的台账:往返不许吞掉那一行 ═════════════════════════════
const LEAD = '\n## 2026-08-14T09:12:33.000Z\ntitle: x\n'
A.equal(T.serializeLedgerMonth('2026-08', ...T.parseLedgerMonth(LEAD)), LEAD, '文件开头的空行不许被吞(每写一次少一行)')
const NOPRE = '## 2026-08-14T09:12:33.000Z\ntitle: x\n'
A.equal(T.serializeLedgerMonth('2026-08', ...T.parseLedgerMonth(NOPRE)), NOPRE, '没有 preamble 时不许凭空多出空行')

// monthSeq
A.deepEqual(T.monthSeq('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02'], '跨年安全')
A.deepEqual(T.monthSeq('2026-03', '2026-01'), [], '倒序区间给空')
// 三态
A.equal((await T.readMonth('2026-01')).state, 'missing', 'readFile → null = missing')
V.set('发布工作台/Ledger/2026-02.md', '---\nplugin: x\n没有闭合的 frontmatter')
A.equal((await T.readMonth('2026-02')).state, 'error', 'frontmatter 未闭合 = error')
V.set('发布工作台/Ledger/2026-03.md', '# 2026-03\n\n一段没有任何条目的正文')
A.equal((await T.readMonth('2026-03')).state, 'error', '有内容但解析不出条目 = error(不是 missing、不是 ok 带空数组)')
V.set('发布工作台/Ledger/2026-04.md', LEDGER)
A.equal((await T.readMonth('2026-04')).state, 'ok')
// error 月拒写(绝不覆盖用户可能手改坏的文件)
const wBefore = writes.length
let refused = false
await T.writeLedgerEntry('2026-02-01T00:00:00.000Z', { title: 'x', status: 'copied' }).catch(() => { refused = true })
A.ok(refused, 'error 月份必须拒写')
A.equal(writes.length, wBefore, 'error 月份不许调用 writeFile')
A.ok(!writes.includes('发布工作台/Ledger/2026-02.md'))

// ══ ⑨ 剪贴板梯子降级(A 抛错、B 返回 false → 落 C) ═══════════════════════
A.equal(await T.runCopyLadder({ rich: async () => true, compat: () => false, exportFile: async () => {} }), 'rich')
A.equal(await T.runCopyLadder({ rich: async () => false, compat: () => true, exportFile: async () => {} }), 'compat')
A.equal(T.statusOfCopy('rich'), 'copied')
A.equal(T.statusOfCopy('exported'), 'exported')
const ladderHtml = T.emitHtml(T.parseDoc('# 标题\n\n正文'), T.STYLE)
const res = await T.copyAndLog(
  { title: '护城河', source: '笔记/护城河.md', words: 1820, checks: 'block=0 warn=2 info=1' },
  {
    rich: () => { throw new Error('剪贴板不可用') },
    compat: () => false,
    exportFile: () => T.exportHtmlFile('护城河', ladderHtml),
  },
)
A.equal(res.kind, 'exported', 'A 抛错 + B 假 → 必须落到 C')
A.equal(res.ledgerError, null, '台账写成功时不该报错')
A.ok(V.has('发布工作台/Exports/2026-08-14-护城河.html'), `应写出 .html 导出:${[...V.keys()].join(',')}`)
A.ok(V.get('发布工作台/Exports/2026-08-14-护城河.html').startsWith('<!doctype html><meta charset="utf-8">'), '导出文件要带 charset,否则中文乱码')
const ledgerFile = V.get('发布工作台/Ledger/2026-08.md')
A.ok(ledgerFile && ledgerFile.includes('status: exported'), `台账应记 status: exported:${ledgerFile}`)
A.ok(ledgerFile.includes('platform: wechat') && ledgerFile.includes('source: 笔记/护城河.md') && ledgerFile.includes('words: 1820'))
A.ok(ledgerFile.startsWith('---\nplugin: wechat-publisher\nkind: ledger\nmonth: 2026-08\nschema: 1\n---\n\n# 2026-08\n'), '新月文件用 canonical 头')
A.equal(_ls.get('plugin.wechat-publisher.firstMonth'), '2026-08', '首次写台账应记 firstMonth')
// 数据契约往返:写 → 读 → 再写,不丢字段
const rt = T.parseLedgerMonth(ledgerFile)
A.equal(T.serializeLedgerMonth('2026-08', ...rt), ledgerFile, '刚写出的台账再往返一次也必须逐字节相等')
await T.patchLedgerEntry(rt[0][0].ts, { status: 'published', url: 'https://mp.weixin.qq.com/s/zz' })
const after2 = V.get('发布工作台/Ledger/2026-08.md')
A.ok(after2.includes('status: published') && after2.includes('url: https://mp.weixin.qq.com/s/zz'))
A.ok(after2.includes('title: 护城河'), '改状态不许丢别的字段')
// 台账写失败**不许冒充「复制失败」**:内容已在剪贴板里,只单独回报台账的错
V.set('发布工作台/Ledger/2026-08.md', '---\n没有闭合的 frontmatter\n\n## 2026-08-14T09:12:33.000Z\ntitle: x')
const degraded = await T.copyAndLog(
  { title: 'x', source: 's.md', words: 1, checks: 'block=0 warn=0 info=0' },
  { rich: async () => true, compat: () => false, exportFile: async () => { throw new Error('不该走到 C') } },
)
A.equal(degraded.kind, 'rich', '剪贴板成功就是成功')
A.ok(degraded.ledgerError, '台账写失败要单独回报,不许吞')

// ══ ⑪ 视图不重挂就切英文 ═════════════════════════════════════════════════
const host = mkEl('div')
const offView = reg.views.find((v) => v.id === 'composer').mount(host)
A.ok(host.textContent.includes('公众号预览'), `中文界面应有中文文案:${host.textContent.slice(0, 120)}`)
A.ok(host.textContent.includes('复制到公众号'))
// P3-i:引擎缺席 = 按钮置灰 **+** notify(warning),且 needLogin 那条文案必须可达(title 悬浮)
A.ok(reg.notes.some((n) => n[0] === T.MSG.zh['ai.needLogin'] && n[1] && n[1].level === 'warning'),
  `window.tangu 缺席时必须 ctx.notify(…, {level:'warning'}):${JSON.stringify(reg.notes)}`)
const aiBtn = (() => { let hit = null; walkAll(host, (c) => { if (!hit && c.tag === 'button' && c.textContent === 'AI 助手') hit = c }); return hit })()
A.ok(aiBtn && aiBtn.disabled, 'AI 按钮应置灰')
A.equal(aiBtn.attrs.title, T.MSG.zh['ai.needLogin'], 'needLogin 文案必须在 UI 上可达,不能只存在于代码里')
A.ok(typeof localeCb === 'function', '必须订阅了 ctx.subscribeLocale')
LOCALE = 'en'
localeCb('en')
A.ok(host.textContent.includes('WeChat preview'), `切 en 后(不重挂)应出现英文串:${host.textContent.slice(0, 160)}`)
A.ok(host.textContent.includes('Copy for WeChat'))
A.ok(!host.textContent.includes('复制到公众号'), '切英文后中文按钮文案应消失')
LOCALE = 'zh'
localeCb('zh')
A.ok(host.textContent.includes('复制到公众号'), '切回中文应还原')
// manifest.events 声明的两个事件都要真的发得出来:audit 在用户点「体检」时上报
const findBtn = (node, label) => { let hit = null; walkAll(node, (c) => { if (!hit && c.tag === 'button' && c.textContent === label) hit = c }); return hit }
const auditBtn = findBtn(host, '体检')
A.ok(auditBtn && auditBtn.on.click, '体检按钮应有 click 处理')
auditBtn.on.click[0]()
A.ok(reg.acts.some((a) => a[0] === 'audit'), 'manifest.events 声明的 audit 事件必须真的 ctx.activity.log 得出来')
A.equal(typeof offView, 'function', '视图 mount 应返回清理函数')
offView()
// ledger 视图也要挂得起来(⑨ 末尾把当月文件弄坏了,先放回一份能解析的)
V.set('发布工作台/Ledger/2026-08.md', LEDGER)
const host2 = mkEl('div')
const offView2 = reg.views.find((v) => v.id === 'ledger').mount(host2)
A.ok(host2.textContent.includes('发布台账'))
await new Promise((r) => setTimeout(r, 10))
// P3-g:宿主没有 prompt 时,「取不到输入」不许被当成「用户填了空」而把条目标成 published
const beforeMark = V.get('发布工作台/Ledger/2026-08.md')
const savedPrompt = ctx.app.prompt
delete ctx.app.prompt
const markBtn = findBtn(host2, '标记已发布')
A.ok(markBtn && markBtn.on.click, '台账应有「标记已发布」按钮')
markBtn.on.click[0]()
await T.enqueueWrite(() => {})
await new Promise((r) => setTimeout(r, 10))
A.equal(V.get('发布工作台/Ledger/2026-08.md'), beforeMark, '拿不到输入时绝不许改台账')
A.ok(reg.notes.some((n) => n[0] === T.MSG.zh['ledger.noPrompt']), '拿不到输入要如实告诉用户')
ctx.app.prompt = savedPrompt
offView2()

// ══ P1-2 草稿:现读 → 比对 → 写(绝不用内存旧副本整份覆盖用户文件) ══════════
const DRAFTP = '发布工作台/草稿.md'
V.set(DRAFTP, '第一版')
T.state.source = 'draft'
T.state.draft = '第一版'
T.state.draftBase = '第一版'
T.state.draftConflict = null
const host5 = mkEl('div')
const off5 = reg.views.find((v) => v.id === 'composer').mount(host5)
await new Promise((r) => setTimeout(r, 10))
const ta5 = findAll(host5, 'textarea')[0]
A.ok(ta5 && ta5.on.input && ta5.on.blur, '草稿模式应有可编辑 textarea')
V.set(DRAFTP, '第二版')                       // ← 用户在 Amadeus 里改了草稿
ta5.value = '第一版 + 我的补充'
ta5.on.input[0]()
ta5.on.blur[0]()                              // ← 常走的静默保存路径
await T.enqueueWrite(() => {})
await new Promise((r) => setTimeout(r, 10))
A.equal(V.get(DRAFTP), '第二版', '磁盘上的版本绝不许被内存里的旧副本整份覆盖')
A.equal(T.state.draftConflict, '第二版', '外部改动要被截获成冲突')
A.ok(host5.textContent.includes(T.MSG.zh['draft.conflictBanner']), `静默保存路径上也要弹冲突条:${host5.textContent.slice(0, 160)}`)
const keepDisk = findBtn(host5, T.MSG.zh['draft.useDisk'])
A.ok(keepDisk, '冲突条要给用户选边的按钮')
keepDisk.on.click[0]()
A.equal(T.state.draft, '第二版', '选「用磁盘那版」后应载入磁盘内容')
A.equal(T.state.draftConflict, null)
off5()
// 重新挂载 = 重新读盘(模块级只读一次 = 下次打开还是旧副本)
V.set(DRAFTP, '第三版')
const host6 = mkEl('div')
const off6 = reg.views.find((v) => v.id === 'composer').mount(host6)
await new Promise((r) => setTimeout(r, 10))
A.equal(T.state.draft, '第三版', '每次挂载都要重读磁盘,不许用模块级缓存的旧副本')
off6()

// ══ P1-4 防抖体检不许整屏重建(光标与选区会一起没) ═════════════════════════
const DRAFT4 = '![](https://x/a.png)\n\n正文'
V.set(DRAFTP, DRAFT4)
T.state.draft = DRAFT4
T.state.draftBase = DRAFT4
T.state.showFindings = true
T.state.source = 'draft'
const host4 = mkEl('div')
const off4 = reg.views.find((v) => v.id === 'composer').mount(host4)
await new Promise((r) => setTimeout(r, 10))
const ta4 = findAll(host4, 'textarea')[0]
A.ok(ta4, '草稿模式应有 textarea')
A.ok(host4.textContent.includes('外链图片'), 'showFindings 时 findings 列表应在')
ta4.value = DRAFT4 + '继'
ta4.on.input[0]()
await new Promise((r) => setTimeout(r, 320))   // > 220ms 防抖
A.equal(findAll(host4, 'textarea')[0], ta4, '防抖回调只许增量刷预览/摘要/findings,正在编辑的 textarea 必须还是同一个节点')
A.ok(host4.textContent.includes('外链图片'), '增量刷新后 findings 仍在')
off4()

// ══ P2-6 点体检条目要跳到**原文**的对应行(findings 的行号算在净化文本上) ═════
const DRAFT6 = '---\ntitle: fm\n---\n\n<!-- a 1 -->\n正文一\n<!-- a 2 -->\n![](https://x/a.png)\n'
V.set(DRAFTP, DRAFT6)
T.state.draft = DRAFT6
T.state.draftBase = DRAFT6
T.state.showFindings = true
T.state.source = 'draft'
const host8 = mkEl('div')
const off8 = reg.views.find((v) => v.id === 'composer').mount(host8)
await new Promise((r) => setTimeout(r, 10))
const ta8 = findAll(host8, 'textarea')[0]
const findRow = (() => { let hit = null; walkAll(host8, (c) => { if (!hit && c.className === 'wp-find') hit = c }); return hit })()
A.ok(findRow && findRow.on.click, 'findings 列表的条目应可点')
findRow.on.click[0]()
A.ok(ta8.sel, '点条目应在左栏选中对应行')
A.equal(String(ta8.value).slice(ta8.sel[0], ta8.sel[1]), '![](https://x/a.png)',
  `跳转必须落在原文那一行上(frontmatter / 块标记行会让净化后的行号偏移):选中了 ${JSON.stringify(String(ta8.value).slice(ta8.sel[0], ta8.sel[1]))}`)
off8()

// ══ P3-j 同一篇笔记里的击键只做增量刷新;换笔记才整屏重建 ═══════════════════
T.state.source = 'page'
const host7 = mkEl('div')
const off7 = reg.views.find((v) => v.id === 'composer').mount(host7)
await new Promise((r) => setTimeout(r, 10))
const ta7 = findAll(host7, 'textarea')[0]
A.ok(ta7, '活动页模式应有只读 textarea')
A.equal(typeof pageCb, 'function', '必须订阅了 ctx.app.subscribePage')
PAGE = { ...PAGE, blocks: { b1: '# 标题\n\n正文一段又一段' } }
pageCb(PAGE)
A.equal(findAll(host7, 'textarea')[0], ta7, '同一篇笔记里的每次击键不该整屏重建')
A.equal(ta7.value, '# 标题\n\n正文一段又一段', '增量刷新也要把新内容灌进只读框')
PAGE = { path: '笔记/另一篇.md', status: 'ready', blocks: { b1: '# 另一篇' }, order: ['b1'], fmExtra: '' }
pageCb(PAGE)
A.notEqual(findAll(host7, 'textarea')[0], ta7, '换笔记要整屏重建(路径显示 / 只读提示都得换)')

// ══ P3-k v4/unified 笔记(2026-08-20 起的默认载体):正文在 pg.text,块表恒空 ══════════
//    ⚠️ 去重判据必须跟着换:v4 的 blocks 是**同一个冻结空对象**,继续比它的引用 = 预览一次都不刷新。
const V4A = { token: 'v4#1', path: '笔记/v4.md', status: 'ready', text: '# v4 标题\n\nv4 正文', model: 'text', blocks: {}, order: [], fmExtra: '' }
PAGE = V4A
pageCb(PAGE)
A.equal(T.activePageMd(), '# v4 标题\n\nv4 正文', 'v4 笔记的正文取 pg.text(不是拼 order/blocks)')
const ta7v4 = findAll(host7, 'textarea')[0]
A.equal(ta7v4.value, '# v4 标题\n\nv4 正文', 'v4 正文要灌进只读框')
// ⚠️ 展开保留的是**同一个** blocks 引用(v4 的块表恒空)—— 旧去重判据在这里必判「没变」。
PAGE = { ...V4A, text: '# v4 标题\n\nv4 正文改过了' }
pageCb(PAGE)
A.equal(findAll(host7, 'textarea')[0].value, '# v4 标题\n\nv4 正文改过了', '⚠️v4 上正文变了必须刷新(块表恒空,比引用永远判「没变」)')
A.equal(findAll(host7, 'textarea')[0], ta7v4, '同一篇 v4 笔记里仍是增量刷新,不整屏重建')
off7()

// ══ ② disposer ═══════════════════════════════════════════════════════════
dispose()
A.equal(localeCb, null, 'disposer 必须退掉语言订阅')

// ══ ⑫ 旧宿主 ctx(07-18 之后的 API 全缺席,且没有 getLocale/subscribeLocale) ══
globalThis.__PUBLISHER_TEST__ = {}
const oldReg = { views: [], commands: [], settings: [], status: [] }
const oldCtx = {
  registerView: (v) => oldReg.views.push(v),
  registerCommand: (c) => oldReg.commands.push(c),
  registerSetting: (s) => oldReg.settings.push(s),
  openView() {},
  app: {
    notify() {},
    getPage: () => ({ token: 'tk', path: '', status: 'ready', blocks: {}, order: [], fmExtra: '' }),
    subscribePage: () => () => {},
    readFile: async () => null,
    writeFile: async () => {},
  },
}
let oldDispose = null
A.doesNotThrow(() => { oldDispose = new Function('ctx', src)(oldCtx) }, '旧宿主 ctx 下 setup 不许抛')
const T2 = globalThis.__PUBLISHER_TEST__
A.equal(oldReg.status.length, 0, '旧宿主没有 registerStatusItem → 状态栏项不出现')
A.equal(oldReg.views.length, 2)
A.equal(T2.wfRoot(), '发布工作台', '旧宿主没有 workFolder → 回退插件中文名')
A.equal(T2.L(), 'zh', '旧宿主没有 getLocale → 回退中文')
A.equal(T2.t('copy.btn'), '复制到公众号', '旧宿主文案回退中文')
const oldHost = mkEl('div')
let oldOff = null
A.doesNotThrow(() => { oldOff = oldReg.views[0].mount(oldHost) }, '旧宿主下 composer 也要挂得起来')
A.ok(oldHost.textContent.includes('复制到公众号'))
oldOff()
A.equal(typeof oldDispose, 'function')
A.doesNotThrow(() => oldDispose(), 'disposer 执行不许抛')

console.log(`check ok — ${reg.views.length} views / ${reg.commands.length} cmds / ${reg.settings.length} settings;`
  + `渲染三承诺 + 双 emitter + XSS + pangu(含链接保护)+ 体检 12 码 + 台账逐字节往返(宿主产物 / CRLF / 首行空行)`
  + ` + 草稿防覆盖 + 防抖不重建 + 行号映射 + 梯子降级 + 双语切换 + 旧宿主 断言通过`)
