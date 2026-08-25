---
name: WeChat Publish Ledger
description: Use when the user asks about publishing notes to a WeChat Official Account (公众号) with the Publisher (发布工作台) plugin — reading or editing the publish ledger, checking why an article renders wrong after pasting, or preparing markdown for the WeChat editor. Teaches the exact ledger file format, the pre-flight finding codes and their manual fixes, and the hard constraints of the WeChat editor (class attributes and external CSS are discarded; only inline style survives).
version: 1.1.0
category: 内容发布
---

# WeChat Publish Ledger

The **Publisher** (发布工作台) desktop plugin turns a markdown source into fully inlined HTML for the WeChat Official Account editor, runs a local pre-flight check, and records every delivery in a plain-markdown ledger inside the user's vault.

This skill teaches you three things: the exact ledger format, the finding codes, and the platform constraints — so you can read, summarise and carefully edit the user's publishing records with the host file tools (`read_file` / `write_file` / `search_files`) without corrupting them.

## 1. Where the files live

All paths are vault-relative, inside the plugin's work folder (default **`发布工作台/`**; every plugin gets a 「工作文件夹」 row on its detail page in the desktop app, so the user may have renamed it and you cannot read that setting from here — if that folder is missing, look for a folder containing `Ledger/20??-??.md`):

```
发布工作台/
├── 草稿.md                  ← the fixed-path draft the composer edits (a normal note)
├── Ledger/
│   ├── 2026-08.md          ← one file per month, one entry per copy/export
│   └── 2026-09.md
└── Exports/
    └── 2026-08-14-<title>.html   ← fallback export when the clipboard is unavailable
```

## 2. Ledger file format (exact contract)

```markdown
---
plugin: wechat-publisher
kind: ledger
month: 2026-08
schema: 1
---

# 2026-08

## 2026-08-14T09:12:33.000Z
title: 插件生态的护城河是 Agent 纵深
platform: wechat
source: 笔记/护城河.md
status: copied
words: 1820
checks: block=0 warn=2 info=1
url:

Free-form notes in markdown, running until the next `## <ISO timestamp>` heading or EOF.
```

Rules — follow them literally:

- **One entry = a `## <ISO-8601 UTC timestamp>` heading + the run of `key: value` lines directly under it + a blank line + free-form notes.** The timestamp is the entry's identity.
- A `##` line whose text is **not** an ISO timestamp is ordinary note text, **not** an entry boundary. Never split on it.
- **Field keys and enum values are ASCII data, never translate them**: `title` / `platform` / `source` / `status` / `words` / `checks` / `url`. `status` is one of `copied` | `exported` | `published`. `platform` is `wechat`.
- **Unknown keys must be preserved verbatim.** If you see a key you do not recognise, leave the line exactly as it is.
- The value may be empty (`url:` with nothing after the colon). Keep that shape.
- Entries are stored in ascending timestamp order. **Never reorder them.**
- Lines that look like `<!-- a 3 -->` are **Amadeus block markers** — host structural data inserted when the user opens the ledger as a note. They are not content: do not interpret them, do not move them, do not delete them, and never append text to such a line.
- **After the user has opened the ledger in Amadeus, the heading and the field run are separate blocks.** The file then looks like `## <ISO>` → blank line → `<!-- a N -->` → blank line → the `key: value` run. Blank lines and marker lines between the heading and the **first** field line are structural padding — the fields still belong to that entry. Read past them. When adding a field, put the new line **after the last existing field line**, never directly under the `## <ISO>` heading (that would create a second, contradictory value the plugin can never read).
- Line endings may be CRLF. Preserve whatever the file already uses; never normalise the whole file.
- Editing an existing entry means replacing the value on **that one field line**. Do not rewrite the whole entry, do not reformat the notes, do not re-indent.

Typical requests you can serve: "how many articles did I ship in August", "which ones are still `copied` and never got a `url`", "add a note to yesterday's entry", "mark the 2026-08-14 entry as published with this link".

## 3. Pre-flight finding codes

The plugin's local rule engine reports `{ code, level, line, excerpt }`. The **code is data — never invent new codes, never translate them.** Levels: `block` (will not survive), `warn` (degrades), `info` (cosmetic).

| code | level | what it means | the manual fix |
|---|---|---|---|
| `mermaid` | block | a ```` ```mermaid ```` fence | not rendered; screenshot the diagram yourself and upload the picture in the WeChat editor |
| `math` | block | `$$…$$` or inline `$…$` | WeChat renders no formulas; screenshot and upload |
| `raw-html` | block | any raw HTML tag, `<br>` included | the editor strips it wholesale (the plugin only escapes it into visible text); rewrite as markdown |
| `iframe-embed` | block | `<iframe`, or an `![[…]]` transclusion | WeChat only accepts its own cards; insert the card by hand |
| `remote-image` | warn | `![](https://…)` | WeChat does not fetch off-site images; upload the original by hand |
| `local-image` | warn | `![](relative/path)` | upload the picture by hand in the editor |
| `external-link` | warn | `[text](https://…)` | body links are stripped to plain text; use "阅读原文" or list URLs at the end |
| `table` | warn | a markdown table | table styling is lost; for long tables use a screenshot |
| `wide-code` | warn | a code line longer than 60 characters | it overflows sideways; wrap it by hand |
| `deep-heading` | info | `####` or deeper | WeChat articles read better with at most three heading levels |
| `nested-list` | info | an indented list item | v1 renders one level only |
| `footnote` | info | `[^1]` | emitted as ordinary text, not a footnote |

## 4. WeChat editor constraints (why the plugin exists)

- The editor filters pasted HTML against a **CSS property allow-list**. `class` attributes and external/embedded style sheets are discarded entirely; **only `style` attributes on the elements themselves survive.**
- Runs of two or more spaces collapse unless each one is a `&nbsp;`; line breaks need literal `<br>`.
- Therefore every element the plugin emits carries its own inline `style`, and the output contains no `class=`, no `<style>` and no `<link>`.

## 5. Hard limits on what you may do

- **Never invent new field keys** in the ledger, and never rename existing ones.
- **Never reorder entries** and never rewrite a month file wholesale when the user asked for a single change.
- **Never drop or modify `<!-- a N -->` marker lines.**
- **Never write outside the plugin work folder** unless the user names another path explicitly.
- If a month file looks corrupted (unclosed frontmatter, no parsable entries), **report it and stop** — do not "repair" it by rewriting; the user may have hand-edits in there.

Out of scope for this toolchain — if asked, give the manual steps instead of attempting it:

- **Converting remote images to local files, or uploading images to any image host.** The renderer runs in a browser context: cross-origin `fetch` is blocked, `canvas` gets tainted, and the vault write API accepts UTF-8 text only. The answer is always "upload the picture by hand in the WeChat editor".
- **Rendering mermaid or math.** No third-party libraries, no CDN. Screenshot instead.
- **Publishing for the user / calling WeChat APIs.** The plugin copies to the clipboard; the user pastes and presses publish.

## 6. Routing: do it yourself, or send them to the workbench

The ledger is ordinary markdown you can read and edit; the *rendering* half is not yours at all.

**① Do it yourself — the ledger, and only the ledger.** "八月发了几篇", "哪些还是 copied 没填 url",
"把 8-14 那条标成 published 并填上链接" — read and edit month files with `read_file` / `write_file`,
line by line, under the field discipline in §2 and the hard limits in §5.

For pre-flight findings, your job is **explaining, not detecting**: take the codes the plugin already
reported and give the manual fixes from §3. Without the desktop app you may, at most, do one rough
scan of the markdown and **label it explicitly as a rough scan that is not the plugin's result** —
`auditBlocks` is a stateful detector (fence/math state machine, embed-before-raw-html ordering,
width thresholds measured on the raw line), so anything you count by hand will disagree with it.
**Never write a hand-counted finding into an entry's `checks` field, and never create a ledger entry
yourself** — entries are appended by the copy action, and a hand-written one claims a delivery that
never happened.

**② Send them to the workbench — anything that renders, copies or pastes.** Command palette
「发布工作台:打开」 ("Publisher: Open") to pick a source and see the preview, or
「发布工作台:复制到公众号」 ("Publisher: Copy for WeChat") to put the inlined HTML on the clipboard,
then paste into the WeChat editor. Say why: fully inlined HTML is only useful once it is *in the
system clipboard*, which exists on the desktop side. Do not hand-assemble an HTML file as a
substitute — the stylesheet lives in the plugin and your copy of it would drift.

**③ Neither is available** (cloud session, or the plugin is not installed here): say plainly that
there is no publishing workbench on this machine. You can still review the markdown and list the
external images and mermaid blocks that will need manual handling, but the typesetting has to happen
where the plugin runs.
