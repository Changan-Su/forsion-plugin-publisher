# 发布工作台 · wechat-publisher

公众号编辑器会剥掉 `class` 与外联 CSS,笔记库里的 markdown 直接粘过去必崩。
发布工作台把母稿渲染成**全 inline 化**的 HTML,一键进剪贴板,粘上去就是排好版的;并在发之前做一次**本地体检**,点名哪些块到了公众号会失效。

- 插件 id:`wechat-publisher` ｜ 版本 1.0.1 ｜ apiVersion 1
- 视图:`composer`(母稿 + 预览 + 复制)、`ledger`(发布台账)
- 命令:`wechat-publisher-open` / `wechat-publisher-copy` / `wechat-publisher-ledger`
- 随包:Space「发布台」(`spaces/wechat-publisher/`)、技能 `skills/wechat-publish/`

## 为什么需要它

微信官方社区置顶帖里的原话是「转载推文,推文直接格式错乱」「2025 年 4 月 2 日开始…格式刷没法用了」。
机制上,公众号编辑器按 CSS 属性白名单过滤粘贴进来的 HTML:**`class` 与外联样式表整体丢弃,只有元素上的 `style` 内联属性能活下来**。
所以任何依赖 class 的排版方案(包括绝大多数 markdown 渲染器的默认产物)贴过去都会掉光。本插件的产物里 `class=` / `<style` / `<link` **一次都不出现**,每个元素自带 `style`。

## 用法

1. **选母稿** — 命令面板「发布工作台:打开」。默认吃你当前打开的那篇笔记(顶部显示路径),frontmatter 与宿主块标记行 `<!-- a N -->` 会自动剥掉,不会被复制进公众号正文。没有打开的笔记就切到「草稿」,在左栏直接写,失焦 800ms 或点「存草稿」自动落盘。
2. **看预览** — 右栏那张白纸卡就是公众号里的样子。**深浅模式下它都是白纸**,因为它模拟的是公众号页面,不是插件界面。
3. **发布前体检** — 底栏摘要条给出「几项阻断 · 几项警告 · 几项提示」,点开看逐条命中与处理指引,点条目跳到左栏对应行。体检是**纯本地规则,离线可用**,不发 Agent。
4. **复制到公众号** — 点「复制到公众号」→ 打开公众号编辑器 → Ctrl/Cmd+V。
5. **台账** — 每次复制 / 导出都会往台账追加一条;发完把链接填回去标记「已发布」。

工具条还有一个「排版规范化」:中英文之间补空格(盘古之白)。它是**本地确定性纯函数**,不走 LLM —— 把整篇母稿送进模型做空格有静默改字风险,对一个卖「保真」的工具是致命的。它改的是母稿文本本身,所以只作为显式按钮,永不在渲染时静默应用;在「活动页」模式下点它,结果会放进「草稿」,**不会改写你的笔记**。

它**不会碰机器可读的片段**:行内代码、markdown 链接/图片的 target(`](…)` 那一段)、`<…>` 自动链接、裸 URL、以及词首的文件名(`报告2026.pdf` 这类常见扩展名)—— 往这些地方补一个空格就等于把链接改坏,和「送 LLM 静默改字」是同一类错误。正文里的普通文字(包括散在句子里的中英混排)才会被补空格。

## 数据存哪

全部在你自己的笔记库里,`<工作文件夹>` 默认 = 插件名「发布工作台」(可在插件详情页改):

```
发布工作台/
├── 草稿.md                       ← 固定路径草稿(一个文件,普通笔记,可直接在 Amadeus 里打开)*
├── Ledger/2026-08.md            ← 发布台账,纯 Markdown + frontmatter
└── Exports/2026-08-14-<标题>.html ← 剪贴板不可用时的兜底导出
```

台账格式(`## <ISO 时间戳>` + 连续 `key: value` 行 + 空行 + 自由备注):

```markdown
## 2026-08-14T09:12:33.000Z
title: 插件生态的护城河是 Agent 纵深
platform: wechat
source: 笔记/护城河.md
status: copied
words: 1820
checks: block=0 warn=2 info=1
url:
```

\* **草稿是两边都能改的同一个文件**,所以插件落盘前一律「现读 → 比对 → 写」:发现磁盘上那份在插件之外被改过(你在 Amadeus 里编辑了它),就**停止写入**并在左栏顶部弹一条冲突提示,由你选「用磁盘那版」还是「用这里这版覆盖」。插件绝不拿内存里的旧副本去整份覆盖你的文件。每次打开工作台、每次切到「草稿」也都会重新读盘。

- 字段键与 `status` 枚举(`copied` / `exported` / `published`)是**数据,不翻译**;**未知键原样保留**。
- 一条台账的身份 = 时间戳。同一时间戳重复写 = 就地更新(幂等),不会长出第二条。
- 你在 Amadeus 里打开台账时宿主会插入 `<!-- a N -->` 块标记行、并把标题与字段拆成两个块(中间隔一个空行)—— 插件**照样读得出字段**,写回时那些标记行与空行**一字不动**。
- 台账文件是 CRLF(Windows 编辑器存的)也照常解析,`\r` 一个不丢。
- 某个月的台账解析不出来(手改坏了 / frontmatter 未闭合)时,台账视图顶部报横幅并**停止对该月的写入**,绝不覆盖。

## 已验证(第一验证假设)

**结论:剪贴板富文本能保住 `text/html`,路径 A 与路径 B 都通。** 因此本插件文案里保留「一键粘贴」的说法。

- 环境:Forsion-Genesis desktop 的真机台架 `harness.html?plugview`(真插件宿主 + 真 UI 壳),Chromium = Google Chrome for Testing 149.0.7827.55,2026-08-14。
- 路径 A `navigator.clipboard.write([ClipboardItem{'text/html','text/plain'}])`:成功。回读剪贴板确认 `types` 含 `text/html`,且内容就是本插件产出的 `<section style="…"><p style="…">…</p></section>`,`class=` 零出现。
- 路径 B 离屏 `contenteditable` + `getSelection().selectAllChildren` + `document.execCommand('copy')`:成功(浏览器序列化真 DOM,内联 style 保留)。
- 端到端:在台架里直接跑 `wechat-publisher-copy` 命令,剪贴板同时拿到 `text/html` 与 `text/plain`。
- ⚠️ 未验证的那一半:**粘进真实公众号编辑器后的观感**不在自动化门禁里(见文末人工验收单)。剪贴板读权限在无头浏览器里需显式授予,桌面 Electron 环境不需要。
- 无论 A/B 通不通,兜底路径 C(导出 `.html` + 台账记 `status: exported`)始终在,永不消失。

## 范围说明(明确不做什么)

- ❌ **外链图片本地化 / 代传图床**:渲染层 `fetch` 跨域被 CORS 挡、`canvas` 会被 taint、`writeFile` 只收 UTF-8 文本。降级为体检点名 + 「在公众号编辑器里手工上传原图」。
- ❌ **Mermaid / 数学公式渲染**:不引第三方库、不外链 CDN。体检报 `block` 并给「自己截图后作为图片上传」的指引。
- ❌ **自动发布 / 调用公众号接口 / 浏览器扩展形态**。插件只负责把内容送进剪贴板,发布这一步由你自己在公众号后台完成。
- ❌ 选题库、爆款拆解卡、链接转脚注、多平台批量导出。「按平台语气改写」只是 AI 助手的一个文本预设,不衍生第二套渲染管线。
- ❌ 嵌套列表按层级渲染:v1 渲染为单层,体检报 `info`。
- ⚠️ 支持的 markdown 子集(v1 封死):`#`~`####` 标题、段落、无序 / 有序列表(各单层)、引用、围栏代码块、分割线、图片、表格;行内 `**粗**` `*斜*` `` `码` `` `[文字](url)` `~~删~~`。**其余语法按普通文字原样渲染**。斜体只认 `*…*`,**不认 `_…_`** —— 技术稿里 `snake_case_name` / `__init__` 太常见,认下划线等于静默吞掉标识符。

## AI 助手(可选)

工具条的「AI 助手」用你**已登录的 Forsion 后端**(默认助手,不指定模型、不带 agentSlug、不开 host 模式工具)做四件事:起标题 / 写摘要(≤120 字,平台上限)/ 改写语气 / 把体检命中列表翻译成人话步骤。

- 未登录 / 非桌面端 → 按钮置灰,**其余功能(渲染 / 复制 / 体检 / 台账)完全不受影响**。
- 模型只回结构化围栏;解析失败时**不静默**,把模型原文渲染出来让你自己取用。
- Agent **不写文件**,一切落盘由插件自己完成。「体检建议」只发命中列表 JSON,不发全文。

## 旧宿主兼容

`ctx.notify` / `ctx.activity` / `ctx.app.workFolder` / `ctx.registerStatusItem` / `ctx.getLocale` / `ctx.subscribeLocale` / `ctx.achievements` 全部可选链。缺席时优雅降级:回退 `ctx.app.notify`、工作文件夹回退插件名、状态栏项不出现、界面回退中文。**setup 绝不抛错**,check.mjs 有专门的「旧宿主 ctx」用例。

## 双语说明

界面中英双语,跟随宿主设置里的语言:视图内部靠 `ctx.subscribeLocale()` **不重挂就换语言**。

**已知缺口**:宿主贡献点的标题目前是单字符串(`registerCommand.title` / `registerView.title` / `registerSetting.label`),没有运行时重解析 —— 插件在注册时取当时的语言,所以**用户切语言后,命令面板 / 设置页 / 标签页标题要等重启才跟上**。这是宿主侧的已知缺口;插件**故意不**为它做重注册或自我 teardown(那会打断已打开的视图与写队列)。

不翻译的东西是数据不是文案:母稿与草稿内容、台账字段键与 `status` 枚举值、体检 `code`、`platform` 值、localStorage 键、Space id、插件 id、默认工作文件夹名「发布工作台」(切英文也不换目录)、`STYLE` 里的 CSS 串、空标题回退 `Untitled`。

## 自检与门禁

```bash
node check.mjs                       # 契约层:渲染三承诺逐字节 / 双 emitter 一致 / XSS / pangu / 体检 12 码 /
                                     # 台账逐字节往返 / 梯子降级 / 双语词表对齐 / 旧宿主 ctx
# 真机 UIUX(在 Forsion-Genesis/desktop 下跑)
node scripts/plugin-view.e2e.cjs ../../Forsion-Instrumentality-Project/forsion-plugin-publisher \
  --expect-views composer,ledger \
  --expect-commands wechat-publisher-open,wechat-publisher-copy,wechat-publisher-ledger
```

## 人工验收单:粘贴到公众号后逐项对照

自动化门禁量不到「真实公众号编辑器里长什么样」。发第一篇前请照这张单子过一遍:

| 项 | 期望 |
|---|---|
| 标题层级 | 一级 / 二级标题字号与加粗有区分,不塌成正文 |
| 段落间距 | 段与段之间有空隙,不是紧挨着的一坨 |
| 引用块 | 左侧竖线 + 浅灰底还在 |
| 代码块 | 灰底还在,行与行分开,行首缩进没被吃掉 |
| 行内码 | 有浅色底,不是纯文字 |
| 列表 | 项目符号 / 序号在,每项之间有间距 |
| 图片 | 位置对得上(内容本身要在公众号编辑器里手工上传) |
| 链接 | 正文里只剩文字(公众号行为,不是 bug);需要跳转请用「阅读原文」 |
| 首行缩进 | 没有莫名其妙的多余缩进(连续空格已转成 `&nbsp;`) |

## 安装

```bash
sh install.sh dev     # ~/.forsion-dev/plugins/wechat-publisher/
sh install.sh prod    # ~/.forsion/plugins/wechat-publisher/
```

重开 Forsion 后:命令面板「发布工作台:打开」,或工作台切到「发布台」Space。
