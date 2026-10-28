# Web 右栏全屏霜面底（免透字）实施计划

## 目标

把已批准的设计（`docs/plans/2026-10-28-web-rightbar-fullscreen-frost-base-design.md`，CHECKPOINT B 已批准）落成代码：右栏列在 `data-rightbar-fullscreen` 期间盖 94% 皮色 + frost blur（免透字），停靠态零改动；三皮共享机制零新字段；上游钩子钉子防漂移；`pnpm run check` 全绿。

## 架构快照

- 新共享生成器 `buildFullscreenBaseCss(bodyAttribute, opaqueFills)` 住 `src/client/runtime.js`，紧邻 `buildShellAlignmentCss` 同位同律：纯函数、机制共享、色值由 riding 派生（`opaqueFills` = riding `--dsw-specific-sidebar-fill` 的 rgb 通道，挂载块内既有推导直接复用）。
- 挂载：现有 shell-alignment 事务块内追加随皮 style tag `dsh-skins/<id>.fullscreen.css`（`opaqueFills === null` 时返回空串、跳过挂载）。
- 产出 CSS（字节契约）：注释行 + 明/暗两条规则，选择器 `body[data-dsh-<kebab>] [data-rightbar-fullscreen] [class*="_rightbarCol"]`，声明 `color-mix(in srgb, rgb(R,G,B) 94%, transparent)!important` + `backdrop-filter:blur(14px) saturate(1.3)` 双前缀。
- 上游钩子：`verify-upstream-hooks.mjs` 加三钉子（`data-rightbar-fullscreen` 属性钩子、`*_rightbarCol` 结构钩子、页面级 `*_rightbarCol` 唯一性清单）+ 总结行更新。
- 决策记录：ADR-0020 + GLOSSARY「霜面底」术语（代码注释引用 ADR-0020，故先落文档）。

## 全局约束（自设计文档逐字继承）

- 停靠态零改动：规则仅在全屏属性下命中；frost family、Desktop shell alignment（`buildShellAlignmentCss` 输出字节）、`data-rightbar-col`/`_pane_` 规则一律不动。
- 固定值不随通透度旋钮联动（frost 家族同律）；声明表零新字段；生成器不知道 profile。
- 94% 为装机实测起点；验收见大字残影 → 升 96%（frost tip 先例），定值在验收时裁。
- 全屏过渡动画不加（设计非范围）；属性翻转即变色，实测违和另立议题。
- `bodyAttribute` 入参为 camelCase（如 `dshOpenbmcSkin`），经 `datasetAttribute` 机械转 `data-kebab`。
- 触碰 `src/` 的 checkpoint 必须一并提交重建后的 `lib/`（developers.md ⑥；`check` 末位 lib-sync）。
- 本机为 web 机 Host A（`/home/ubuntu`）；`verify:hooks` 本地金标准：`DSH_RUNTIME_ROOT=/home/ubuntu/.local/share/dsh-runtime`（活 runtime 0.2.1-rc.4）。**基线已验（2026-10-28，判据自证④）**：exit 0，`✓ upstream-hooks: VERIFIED strict-mode (pnpm store layout) — … shell-frame hooks alive (_frame/_sidebarCol/titlebar marker/content-radius); sidebar-root paint NOT JUDGED … (294 @deepseek-ai packages scanned)`。
- 构建/测试命令（esbuild 会 spawn 子进程）在 danger-full-access 会话执行；预计 >90s 的命令用 `run_in_background`。

## 输入工件

- 设计：`docs/plans/2026-10-28-web-rightbar-fullscreen-frost-base-design.md`（已批准）
- 上游实证：`dsh-client-ui-layout@0.2.1-rc.4` frame JSX 挂 `data-rightbar-fullscreen`；`_rightbarCol` 类名全 runtime 唯一；三皮 riding sidebar-fill：openbmc `rgb(238, 246, 251)/rgb(13, 30, 44)`、meirenzhi `rgb(250, 249, 246)/rgb(18, 18, 26)`、uefi `rgb(238, 235, 255)/rgb(25, 20, 48)`

## 文件结构与职责

- Create: `docs/adr/0020-web-rightbar-fullscreen-frost-base.md` — 决策记录（格式随 ADR-0012：背景/Decision/Considered Options/Consequences/Amendments）
- Modify: `GLOSSARY.md` — 「浮层毛玻璃家族」条目后新增「霜面底（fullscreen base）」
- Modify: `src/client/runtime.js` — ① `buildShellAlignmentCss` 之后新增导出函数 `buildFullscreenBaseCss`；② 挂载块（`// Windows Desktop shell alignment (ADR-0009)` 注释的事务块）内追加 fullscreen tag 挂载
- Create: `tests/fullscreen-base.test.mjs` — 生成器纯契约（字节钉 + 状态限定 + null 空串）
- Modify: `tests/runtime-effects.test.mjs` — import 扩展；「shell-frame alignment: solid chrome rules…」与「A→B switch…」两测试加 fullscreen tag 生命周期断言
- Modify: `tests/upstream-hooks.test.mjs` — 文件尾追加 fullscreen 双串 repo 侧钉（Task 4 Step 1 ⑤，评审 S1）
- Modify: `scripts/verify-upstream-hooks.mjs` — 三钉子 + 总结行
- 随源码重建：`lib/client.js`（入库产物，`pnpm run build`）

## 任务清单

### Task 1: ADR-0020 + GLOSSARY 术语落盘

- 目标：决策先行落盘，供后续代码注释引用。
- 涉及文件：`docs/adr/0020-web-rightbar-fullscreen-frost-base.md`（Create）、`GLOSSARY.md`（Modify）
- 接口契约
  - Consumes: 设计文档（已批准）
  - Produces: ADR 编号 `ADR-0020`（Task 2/3/4 的注释与守卫文案引用）；术语「霜面底」
- 验证范围：文件存在、格式锚点命中、无占位符

- [ ] Step 1: 写 ADR-0020，内容如下（标题行之下按 ADR-0012 体例）

```markdown
# Web 右栏全屏态霜面底（免透字）

---
status: accepted
date: 2026-10-28
---

## 背景

Web 形态下 riding 表把 `--dsw-alias-bg-base` 改写为 rgba（ADR-0013/0017），右栏列（`_rightbarCol`，底色即该 token）在全屏（AppFrame 挂 `data-rightbar-fullscreen`）时整列半透明，叠在 centerCol 聊天内容与 body::before 壁纸上：输入框文字透出、可读性受损。停靠态同一 rgba 窄条浮于壁纸上正是玻璃感来源，必须保留。Desktop 已有同题教义（ADR-0009 `[data-rightbar-col] > *` 与 `_pane_` 实底），但整段被 `html[data-windows-titlebar]` 门控，Web 从不生效。

## Decision

- 新增共享生成器 `buildFullscreenBaseCss(bodyAttribute, opaqueFills)`（`src/client/runtime.js`，与 `buildShellAlignmentCss` 同位同律）：`data-rightbar-fullscreen` 期间给 `[class*="_rightbarCol"]` 盖 94% 皮色 + blur(14px) saturate(1.3)，明暗两套；frost 家族固定值配方，不随通透度联动。
- 色源与 Desktop shell 同源：riding `--dsw-specific-sidebar-fill` 的 rgb 通道（`parseRgbaChannels` 既有推导）；皮未 ride 则返回空串不挂载。声明表零新字段，三皮自动生效。
- 挂载为随皮事务 style tag `dsh-skins/<id>.fullscreen.css`；profile 无关（Web 活跃；Desktop 被既有实底 occupant 规则覆盖，冗余无害）。
- 钩子钉子：`data-rightbar-fullscreen` 属性钩子、`*_rightbarCol` 结构钩子、页面级 `*_rightbarCol` 唯一性清单（verify-upstream-hooks.mjs，ADR-0006/0011 教义）。
- 停靠态零改动：选择器带状态属性，非全屏永不命中。

## Considered Options

- **全屏纯实色**（Desktop `opaqueFills` 规则直接放开到 Web）：最简、教义一字不差——被否：全屏观感退回官方死底，丢失皮肤氛围（2026-10-28 CHECKPOINT A 主人裁定保玻璃语境）。
- **帧级纱幕**（全屏时给 frame 本体盖色）：改动面大于需求、波及动画/拖拽帧——否决（YAGNI）。

## Consequences

- 全屏透字变不可读柔光；壁纸余韵以 94% 浓度隐约保留；浓度 94% 为装机实测起点，见大字残影升 96%（frost tip 先例）。
- `*_rightbarCol` 成为受钉结构面：上游漂移在 check 红灯（fail-closed），运行时不炸。
- 停靠态玻璃感、frost family、Desktop shell alignment、通透度投影核均不受影响。

## Amendments

- 无（首版）。
```

- [ ] Step 2: 在 `GLOSSARY.md` 的「**浮层毛玻璃家族**」条目之后插入：

```markdown
**霜面底（fullscreen base）**:
右栏列在全屏态（`data-rightbar-fullscreen`）的免透字处理：94% 皮肤同族实底叠 frost blur（固定值，不随通透度联动），色源与 Desktop 实底同源（riding sidebar-fill 的 rgb 通道）。停靠态因选择器带状态属性而零命中，玻璃感原样保留（ADR-0020）。
```

- [ ] Step 3: 验证（判据命令逐条跑，禁 `&&` 链吞失败码）
- Run: `grep -c "data-rightbar-fullscreen" /home/ubuntu/workspace/dsh-skins/docs/adr/0020-web-rightbar-fullscreen-frost-base.md`
- Expected: ≥3（草稿正文恰 3 处；判据钉真实内容锚防占位化；0 会 exit 1。评审 P1 裁定：原 `grep -c "ADR-0020"` 判据与草稿内容不闭合——草稿零自引用，照抄必红——已废弃）
- Run: `grep -n "霜面底" /home/ubuntu/workspace/dsh-skins/GLOSSARY.md`
- Expected: 恰 1 处新条目
- Run: `grep -n "TODO\|TBD\|待补充" /home/ubuntu/workspace/dsh-skins/docs/adr/0020-web-rightbar-fullscreen-frost-base.md`
- Expected: 无输出（exit 1 属通过）
- [ ] Step 4: checkpoint commit（纯文档，无需构建）
- Run: `git -C /home/ubuntu/workspace/dsh-skins add docs/adr/0020-web-rightbar-fullscreen-frost-base.md GLOSSARY.md docs/plans/2026-10-28-web-rightbar-fullscreen-frost-base-design.md docs/plans/2026-10-28-web-rightbar-fullscreen-frost-base-implementation-plan.md && git -C /home/ubuntu/workspace/dsh-skins commit -m "docs: ADR-0020 全屏霜面底决策 + GLOSSARY 术语 + 设计与实施计划"`
- Expected: commit 成功

### Task 2: `buildFullscreenBaseCss` 生成器 + 契约测试（TDD）

- 目标：纯函数生成器落地，字节契约钉死。
- 涉及文件：`tests/fullscreen-base.test.mjs`（Create）、`src/client/runtime.js`（Modify，锚点：`export const shellAlignment = …` 之前）、`lib/client.js`（重建）
- 接口契约
  - Consumes: `datasetAttribute`（runtime.js 内部既有）；ADR-0020 编号（Task 1）
  - Produces: 命名导出 `buildFullscreenBaseCss(bodyAttribute, opaqueFills)`；`opaqueFills = { light: "rgb(…)", dark: "rgb(…)" } | null`；null → `""`；Task 3 的挂载与断言消费此导出与字节形状
- 验证范围：`node --test tests/fullscreen-base.test.mjs` 全绿

- [ ] Step 1: 写失败测试 `tests/fullscreen-base.test.mjs`

```js
/**
 * Fullscreen frost base contract (ADR-0020): the fullscreen right sidebar
 * column gets a 94% skin-tone base + frost blur, state-scoped by
 * data-rightbar-fullscreen; the docked column must never match. Byte-level
 * pins on the openbmc fixture mirror the shell-tag discipline in
 * runtime-effects.test.mjs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildFullscreenBaseCss } from "../src/client/runtime.js";

test("fullscreen base: selector shape, 94% frost recipe, light+dark, byte-pinned", () => {
  const css = buildFullscreenBaseCss("dshOpenbmcSkin", {
    light: "rgb(238, 246, 251)",
    dark: "rgb(13, 30, 44)",
  });
  const lines = css.split("\n");
  assert.equal(lines.length, 3, "comment + light rule + dark rule");
  assert.equal(lines[0], "/* dsh-skins fullscreen frost base (ADR-0020): 94% skin-tone column base + frost blur while data-rightbar-fullscreen is set — chat bleed becomes unreadable soft glow; the docked column is untouched */");
  assert.equal(lines[1], 'body[data-dsh-openbmc-skin] [data-rightbar-fullscreen] [class*="_rightbarCol"]{background-color:color-mix(in srgb, rgb(238, 246, 251) 94%, transparent)!important;backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3)}');
  assert.equal(lines[2], 'body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-rightbar-fullscreen] [class*="_rightbarCol"]{background-color:color-mix(in srgb, rgb(13, 30, 44) 94%, transparent)!important}');
});

test("fullscreen base: state-scoped — every rule sits under data-rightbar-fullscreen", () => {
  const css = buildFullscreenBaseCss("dshXSkin", {
    light: "rgb(250, 249, 246)",
    dark: "rgb(18, 18, 26)",
  });
  const rules = css.split("\n").slice(1);
  assert.equal(rules.length, 2);
  for (const line of rules) {
    assert.ok(line.includes("[data-rightbar-fullscreen]"), "rule must be state-scoped");
  }
  assert.equal(rules[0].split("[data-ds-dark-theme]").length - 1, 0, "light rule must not carry the dark attribute");
  assert.equal(rules[1].split("[data-ds-dark-theme]").length - 1, 1, "dark rule carries the dark attribute exactly once");
});

test("fullscreen base: skins without a ridden sidebar-fill ship nothing", () => {
  assert.equal(buildFullscreenBaseCss("dshOpenbmcSkin", null), "");
});
```

- [ ] Step 2: 运行并确认失败
- Run: `cd /home/ubuntu/workspace/dsh-skins && node --test tests/fullscreen-base.test.mjs`
- Expected: 载入即红——`SyntaxError … does not provide an export named 'buildFullscreenBaseCss'`
- [ ] Step 3: 写最小实现——`src/client/runtime.js` 中 `export const shellAlignment = …` 行之前插入：

```js
/** 全屏态右栏列霜面底（ADR-0020）：data-rightbar-fullscreen 期间把右栏列
 * 底色提到 94% 皮色 + frost blur——聊天透字变不可读柔光，停靠态因选择器带
 * 状态属性而零命中。opaqueFills 与 Desktop shell 对齐同源（riding
 * sidebar-fill 的 rgb 通道）；null（皮未 ride sidebar-fill）返回空串，调用
 * 方跳过挂载。固定值不随通透度旋钮联动（frost 家族同律）。blur 只声明在
 * light 规则、暗色经级联继承（frost 家族同构）：勿给 light 规则加
 * :not([data-ds-dark-theme]) 或删其 blur，否则暗色静默丢模糊（评审 S2）。 */
export function buildFullscreenBaseCss(bodyAttribute, opaqueFills) {
  if (opaqueFills === null) return "";
  const body = `body[${datasetAttribute(bodyAttribute)}]`;
  const column = " [data-rightbar-fullscreen] [class*=\"_rightbarCol\"]";
  return [
    "/* dsh-skins fullscreen frost base (ADR-0020): 94% skin-tone column base + frost blur while data-rightbar-fullscreen is set — chat bleed becomes unreadable soft glow; the docked column is untouched */",
    `${body}${column}{background-color:color-mix(in srgb, ${opaqueFills.light} 94%, transparent)!important;backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3)}`,
    `${body}[data-ds-dark-theme]${column}{background-color:color-mix(in srgb, ${opaqueFills.dark} 94%, transparent)!important}`,
  ].join("\n");
}
```

- [ ] Step 4: 运行并确认通过（触碰 src/，一并重建 lib）
- Run: `cd /home/ubuntu/workspace/dsh-skins && pnpm run build && node --test tests/fullscreen-base.test.mjs`
- Expected: build 成功；`# pass 3 / # fail 0`
- [ ] Step 5: checkpoint commit
- Run: `git -C /home/ubuntu/workspace/dsh-skins add src/client/runtime.js lib/client.js tests/fullscreen-base.test.mjs && git -C /home/ubuntu/workspace/dsh-skins commit -m "feat(skins): buildFullscreenBaseCss 生成器与契约测试（ADR-0020）"`
- Expected: commit 成功（lib 与 src 同 checkpoint）

### Task 3: 挂载接线 + 事务生命周期断言（TDD）

- 目标：随皮事务挂载 `dsh-skins/<id>.fullscreen.css`，mount/切换/卸皮全生命周期有钉。
- 涉及文件：`tests/runtime-effects.test.mjs`（Modify）、`src/client/runtime.js`（Modify，锚点：`dsh-skins/${skin.id}.shell.css` styleTag 所在事务块）、`lib/client.js`（重建）
- 接口契约
  - Consumes: Task 2 的 `buildFullscreenBaseCss` 导出与字节形状；挂载块既有 `opaqueFills` 局部变量
  - Produces: 运行时 tag `dsh-skins/<id>.fullscreen.css`（`opaqueFills` 非空时挂载、随皮卸载）；Task 4 的守卫钉的是该表面的上游钩子
- 验证范围：`node --test tests/runtime-effects.test.mjs` 全绿

- [ ] Step 1: 写失败断言——`tests/runtime-effects.test.mjs`：
  - ① 文件头 import 行 `import { createSkinRuntime, shellAlignment, PRODUCTION_FIELDS } from "../src/client/runtime.js";` 改为 `import { createSkinRuntime, shellAlignment, buildFullscreenBaseCss, PRODUCTION_FIELDS } from "../src/client/runtime.js";`
  - ② 测试「shell-frame alignment: solid chrome rules + opaque token + wallpaper-in-content mount with the skin (ADR-0009 v6)」内、`assert.doesNotMatch(tag.textContent, /centerCol[^"]/, …)` 之后、`dispose()` 之前插入：

```js
  const fullscreenTag = dom.styleTag("dsh-skins/openbmc.fullscreen.css");
  assert.ok(fullscreenTag, "fullscreen frost base must mount with the skin");
  assert.equal(
    fullscreenTag.textContent,
    buildFullscreenBaseCss("dshOpenbmcSkin", { light: "rgb(238, 246, 251)", dark: "rgb(13, 30, 44)" }),
    "runtime emission and the exported builder must agree",
  );
```

  并在该测试末尾 `assert.equal(dom.styleTag("dsh-skins/openbmc.shell.css"), null, …)` 之后追加：

```js
  assert.equal(dom.styleTag("dsh-skins/openbmc.fullscreen.css"), null, "fullscreen tag must unmount with the skin");
```

  - ③ 测试「shell-frame alignment: A→B switch swaps the tag; official restores the untouched host paints」内逐行插入（首行 assert 之后）：

```js
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.fullscreen.css"), "meirenzhi fullscreen base must mount");
  runtime.select("openbmc");
  assert.equal(dom.styleTag("dsh-skins/meirenzhi.fullscreen.css"), null, "old skin fullscreen tag must go");
  assert.ok(dom.styleTag("dsh-skins/openbmc.fullscreen.css"), "new skin fullscreen tag must mount");
  runtime.select("official");
  assert.equal(dom.styleTag("dsh-skins/openbmc.fullscreen.css"), null, "official must drop the fullscreen base");
```

  （保留该测试原有 shell tag 断言不动；`runtime.select("openbmc")`/`runtime.select("official")` 若原测试已有则去重，不重复调用。）
- [ ] Step 2: 运行并确认失败
- Run: `cd /home/ubuntu/workspace/dsh-skins && node --test tests/runtime-effects.test.mjs`
- Expected: 两处新断言红——`fullscreen frost base must mount with the skin` / `meirenzhi fullscreen base must mount`（false == false 类失败）
- [ ] Step 3: 写最小实现——`src/client/runtime.js` 挂载块内，`stops.push(() => tag.remove());`（shell tag 那句）之后、块闭 `}` 之前插入：

```js
        // Fullscreen frost base (ADR-0020): state-scoped by the layout's
        // data-rightbar-fullscreen marker — the fullscreen right sidebar
        // covers the chat area, so its column base concentrates to a 94%
        // skin tone + frost blur; the docked column never matches. Same
        // opaqueFills derivation as the Desktop shell rules; profile-neutral
        // (inert-but-harmless under the Desktop opaque occupant rules).
        const fullscreenCss = buildFullscreenBaseCss(effects.bodyAttribute, opaqueFills);
        if (fullscreenCss !== "") {
          const fullscreenTag = styleTag(`dsh-skins/${skin.id}.fullscreen.css`, fullscreenCss);
          stops.push(() => fullscreenTag.remove());
        }
```

- [ ] Step 4: 运行并确认通过
- Run: `cd /home/ubuntu/workspace/dsh-skins && pnpm run build && node --test tests/runtime-effects.test.mjs`
- Expected: 全绿（`# fail 0`）
- [ ] Step 5: checkpoint commit
- Run: `git -C /home/ubuntu/workspace/dsh-skins add src/client/runtime.js lib/client.js tests/runtime-effects.test.mjs && git -C /home/ubuntu/workspace/dsh-skins commit -m "feat(skins): 全屏霜面底随皮事务挂载与生命周期断言（ADR-0020）"`
- Expected: commit 成功

### Task 4: verify-upstream-hooks 三钉子 + repo 侧钉 + 判据自证

- 目标：上游漂移 fail-closed。
- 涉及文件：`scripts/verify-upstream-hooks.mjs`（Modify，锚点：`// 7. shell-frame surface hooks` 段与文件尾 report 段）；`tests/upstream-hooks.test.mjs`（Modify，文件尾追加 repo 侧钉，评审 S1）
- 接口契约
  - Consumes: ADR-0020 编号（文案引用）；基线绿（见全局约束，2026-10-28 已录）；Task 2/3 产物 lib/client.js（repo 侧钉断言对象）
  - Produces: 三钉子（属性钩子 / 结构钩子 / 页面清单）+ 总结行新 token（CI 真跑面）；repo 侧钉（built client 含 `data-rightbar-fullscreen` 与 `[class*="_rightbarCol"]` 两串，与 ：67 right-panel 钉同律）
- 验证范围：金标准重跑 exit 0 且总结行含新 token；无 runtime 时仍 SKIPPED exit 0；repo 侧钉测试绿

- [ ] Step 1: 五处编辑：
  - ① section 7 的循环 `for (const name of ["frame", "sidebarCol"]) {` 改为 `for (const name of ["frame", "sidebarCol", "rightbarCol"]) {`
  - ② 同一 `else` 块内、`data-rightbar-col` 检查之后追加：

```js
	if (!layout.includes("data-rightbar-fullscreen")) {
		problems.push('fullscreen hook dead: "data-rightbar-fullscreen" no longer in dsh-client-ui-layout — the fullscreen-state marker drifted, re-derive the ADR-0020 selectors');
	}
```

  - ③ `const SHELL_LOCAL_NAMES = ["frame", "sidebarCol", "centerCol"];` 改为 `const SHELL_LOCAL_NAMES = ["frame", "sidebarCol", "centerCol", "rightbarCol"];`
  - ④ 文件尾总结行中 `shell-frame hooks alive (_frame/_sidebarCol/titlebar marker/content-radius)` 改为 `shell-frame hooks alive (_frame/_sidebarCol/_rightbarCol/titlebar marker/content-radius/fullscreen marker)`
  - ⑤ `tests/upstream-hooks.test.mjs` 文件末尾追加 repo 侧钉（builder 源码内两钩子串为纯文本常量，esbuild 原样保留，`client.includes` 直钉即可）：

```js
test("fullscreen frost base hooks ship in the built client (ADR-0020)", () => {
  assert.ok(client.includes("[data-rightbar-fullscreen]"), "fullscreen-state marker ships");
  assert.ok(client.includes('[class*="_rightbarCol"]'), "rightbar column structural hook ships");
});
```
- [ ] Step 2: 判据 grep + repo 侧钉测试（逐条跑，`grep -c` 计 0 会 exit 1，禁入 `&&` 链）
- Run: `grep -c "rightbarCol" /home/ubuntu/workspace/dsh-skins/scripts/verify-upstream-hooks.mjs`
- Expected: ≥3（①③④ 三处）
- Run: `grep -c "data-rightbar-fullscreen" /home/ubuntu/workspace/dsh-skins/scripts/verify-upstream-hooks.mjs`
- Expected: ≥2（includes 参数 + 文案）
- Run: `cd /home/ubuntu/workspace/dsh-skins && node --test tests/upstream-hooks.test.mjs`
- Expected: 全绿（lib 已含两钩子串——Task 2/3 产物；钉为确定性常量串断言，无 late-discovery 风险）
- [ ] Step 3: 金标准重跑（慢，>60s，用 run_in_background 或 timeoutMs ≥ 180000）
- Run: `cd /home/ubuntu/workspace/dsh-skins && DSH_RUNTIME_ROOT=/home/ubuntu/.local/share/dsh-runtime node scripts/verify-upstream-hooks.mjs; echo "exit=$?"`
- Expected: `exit=0`，且 VERIFIED 行 shell-frame 段变为 `(_frame/_sidebarCol/_rightbarCol/titlebar marker/content-radius/fullscreen marker)`
- [ ] Step 4: 无 runtime 本地形态复核
- Run: `cd /home/ubuntu/workspace/dsh-skins && node scripts/verify-upstream-hooks.mjs; echo "exit=$?"`
- Expected: 打印 `upstream-hooks: SKIPPED` 后 `exit=0`
- [ ] Step 5: checkpoint commit
- Run: `git -C /home/ubuntu/workspace/dsh-skins add scripts/verify-upstream-hooks.mjs tests/upstream-hooks.test.mjs && git -C /home/ubuntu/workspace/dsh-skins commit -m "guard: 上游钩子三钉子（rightbarCol/全屏标记/页面清单）、总结行与 client 侧双串钉（ADR-0020）"`
- Expected: commit 成功

### Task 5: 全量门禁 + 收尾

- 目标：仓库门禁全绿，工作树干净。
- 涉及文件：无新改动（验证 + 可能的收尾 commit）
- 接口契约
  - Consumes: Task 2/3 的 src+lib 同步、Task 4 的守卫
  - Produces: 可交付的 main HEAD
- 验证范围：`pnpm run check` 全绿

- [ ] Step 1: 全量门禁（>90s，用 run_in_background；check 自带 check:lockfile/build/lint/test/readme/bundle/hooks/lib-sync）
- Run: `cd /home/ubuntu/workspace/dsh-skins && pnpm run check`
- Expected: 末位 `git diff --exit-code -- lib/index.js lib/client.js` 通过，整体 exit 0（verify:hooks 本地走 SKIPPED，金标准已在 Task 4 真跑）
- [ ] Step 2: 工作树清点
- Run: `git -C /home/ubuntu/workspace/dsh-skins status --porcelain && git -C /home/ubuntu/workspace/dsh-skins log --oneline -5`
- Expected: 无未提交残留；5 个 checkpoint commit 在案
- [ ] Step 3: 输出修改摘要（文件清单 + 关键字节契约 + 门禁结果），进入「装机验收（用户门）」

## 执行纪律

- 开始实现前先批判性复查整份计划；发现缺项/矛盾/验证命令失效先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；每任务跑完其定义的验证再前进。
- 当前在 `main`（仓库惯例 main 直接迭代，历次实施同）；工作树现状仅两份未跟踪 docs（Task 1 一并入库）。开工前 `git status --porcelain` 复核，出现非预期脏文件先停下说明。
- 构建/测试在 danger-full-access 会话执行（esbuild spawn EPERM 教训）；>90s 命令用 `run_in_background`。
- 触碰 `src/` 的 checkpoint 必须携带重建后 `lib/`（developers.md ⑥）。
- 遇阻、重复失败或计划与仓库现实不符，立即停下说明，不猜。

## 最终验证

- `pnpm run check` exit 0（全门禁，含 lib-sync）。
- 金标准 `DSH_RUNTIME_ROOT=/home/ubuntu/.local/share/dsh-runtime node scripts/verify-upstream-hooks.mjs` exit 0 且总结行含 `_rightbarCol` 与 `fullscreen marker`（Task 4 Step 3）。
- 交付后**装机验收（用户门，不在本计划内自动执行）**：按 developers.md 发版序列发版（或 know-how 024 热部署备份法装机）后，Web profile 按设计 §7.3 验收——①停靠态玻璃感与改前一致（图三基准）；②全屏后聊天输入框文字与壁纸文字不可辨（图二修复）；③明/暗 × 三皮各一遍；④官方皮不受影响；⑤全屏↔停靠往返无残留底色。据实裁定 94% 浓度（见大字残影 → 96%，改 `buildFullscreenBaseCss` 内常量 + 契约测试两处字节）。

## 审阅 Checkpoint

- 计划正文到此为止。请审阅；批准前不进入实现。批准后默认由普通编码 agent 或人工按任务顺序执行。
