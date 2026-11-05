/**
 * 皮肤装饰族机制（ADR-0016）——三皮共享的装饰不变量收拢于此，与
 * frost-family.js 平级同 doctrine：机制住共享模块，色值/metrics/品牌资源
 * 由各皮肤声明自持（调用方只注入 scope 与 palette）。
 *
 * ── 气泡描边（ADR-0006 谱系）────────────────────────────────────────
 * 用户气泡 + 目标面板气泡的描边与轻投影挂接用 :is() 并集（精确哈希 ∪
 * 结构化）：哈希漂移与 DOM 结构变化两种单点故障各有一支兜底，钩子前提由
 * scripts/verify-upstream-hooks.mjs 在 check 时钉住（该守卫与本模块同源
 * 消费 BUBBLE_HOOKS——哈希重推导的单点编辑处即下方对象，ADR-0011 Q3
 * 递延债就此收账）。失效仅影响描边装饰，token 填充仍然生效；结构分支
 * 不命中 goal 面板气泡（其容器 _stack 不含 userStack 子串，ADR-0006
 * 实测），goal 面板经自己的 _stack 并集描边（ADR-0006 v1.0.4 amendment：
 * 主人目测 goal 无描边观感不佳，裁决扩入）。
 *
 * canonical 字节格式 = minified 单行（ADR-0016 Decision 4）：meirenzhi
 * 收拢前的手抄行即 canonical——tests/meirenzhi-skin.test.mjs 的既有
 * golden 零改动通过是本模块的正确性判据（ADR-0012 frost 家族同款
 * rule-byte-canonical 验收）。
 */

/** 气泡钩子唯一事实对象：哈希漂移重推导（bump runtime-pin 后）只改这里。
 * chat 的 exact 于 2026-11-05（v1.5.29，ADR-0006 amendment）退役为 null：
 * 0.2.2-rc.1 起用户气泡迁往 dsh-web-frontend 的共享原语 UserMessageBubble，
 * 其 css-modules 哈希（_bubble_<hash>_<n>）逐构建漂移、不可 pin——结构分支
 * （userStack 直接子节点）成为 chat 的唯一挂接；goal 的哈希仍在 goal 模块
 * 内，并集保留。 */
export const BUBBLE_HOOKS = {
  chat: { exact: null, container: "userStack" },
  goal: { exact: "oRe1gG_bubble", container: "_stack" },
  bubbleLocal: "_bubble",
};

const unionSelector = (hook) =>
  hook.exact === null
    ? `[class*="${hook.container}"] > [class*="${BUBBLE_HOOKS.bubbleLocal}"]`
    : `:is([class*="${hook.exact}"], [class*="${hook.container}"] > [class*="${BUBBLE_HOOKS.bubbleLocal}"])`;

/** 装饰选择器唯一事实（decorationCss、守卫与测试同源消费）。 */
export const BUBBLE_SELECTORS = {
  chat: unionSelector(BUBBLE_HOOKS.chat),
  goal: unionSelector(BUBBLE_HOOKS.goal),
};

/**
 * 用户+目标气泡描边 4 规则（明暗 × 两表面）。
 * palette = { light: "R, G, B", dark: "R, G, B" }（ADR-0012 tint 同形）；
 * 描边 alpha（0.38/0.10）与投影几何（0 1px 4px / 0 1px 6px）为机制常量
 * （三皮全等，非皮肤自由度）。
 */
export function decorationCss(scope, palette) {
  const chat = BUBBLE_SELECTORS.chat;
  const goal = BUBBLE_SELECTORS.goal;
  return [
    `${scope} ${chat}{border:1px solid rgba(${palette.light}, 0.38);box-shadow:0 1px 4px rgba(${palette.light}, 0.10)}`,
    `${scope}[data-ds-dark-theme] ${chat}{border-color:rgba(${palette.dark}, 0.38);box-shadow:0 1px 6px rgba(${palette.dark}, 0.10)}`,
    `${scope} ${goal}{border:1px solid rgba(${palette.light}, 0.38);box-shadow:0 1px 4px rgba(${palette.light}, 0.10)}`,
    `${scope}[data-ds-dark-theme] ${goal}{border-color:rgba(${palette.dark}, 0.38);box-shadow:0 1px 6px rgba(${palette.dark}, 0.10)}`,
  ].join("\n");
}

/**
 * 防御性根容器清底：上游 #root 现行无背景（0.2.1-rc.2 实测仅 height/margin），
 * 本规则今日 no-op；上游若再给 root 上背景，持有此规则的皮肤同时免疫
 * （鲸吟时代防御遗产的家族化，ADR-0016 Q12 裁定三皮统一持有）。
 */
export function rootClear(scope) {
  return `${scope} [id="root"]{background:0 0}`;
}

/**
 * 反色片徽章（official HARNESS ▐HARNESS▌ 同构、tgcf badge 同源模式）：
 * 壳里不存在 --dsw-alias-label-primary-inverted 令牌（那是官方 BrandWordmark
 * 的内部实现细节），内联 var() 取不到值会让字色整体失效——须皮肤自带明暗
 * 两套显式颜色。圆角 4px：官方 SVG rect 虽是 rx=2，但实测对比需在 14px
 * 高度上取 4px 才有官方观感的弧度（tgcf 徽章同值，主人实测裁决）。
 *
 * colors = { light: {bg,fg}, dark: {bg,fg} }；metrics = { lineHeight,
 * fontWeight } 参数化保留各皮现值（Q7：openbmc 14px/650、meirenzhi
 * 16px/600，不统一——统一属将来目测项）；其余排版为机制常量。输出两条
 * 完整规则：亮规则全量声明、暗规则仅 background/color 覆写（镜像现行
 * 两皮结构）。uefi 描边风徽章是单皮变体、不入族（ADR-0016 Decision 6）。
 */
export function badgeCss(scope, className, colors, metrics) {
  return [
    `${scope} ${className}{display:inline-flex;align-items:center;background:${colors.light.bg};border-radius:4px;padding:0 5px;font-size:10px;line-height:${metrics.lineHeight};font-weight:${metrics.fontWeight};letter-spacing:.08em;color:${colors.light.fg}}`,
    `${scope}[data-ds-dark-theme] ${className}{background:${colors.dark.bg};color:${colors.dark.fg}}`,
  ].join("\n");
}

/**
 * 流式呼吸光条（ADR-0016 唯一视觉窗口，Q10 全员呼吸版裁决）：助手流式
 * 输出时当前块左侧一道品牌色光条 + 呼吸脉冲（box-shadow 不产生布局位移），
 * prefers-reduced-motion 下退化为静态光条。静态骨架走品牌令牌
 * var(--dsw-alias-brand-primary)，palette 只持呼吸「衰减色」一个自由度：
 * openbmc/uefi 取各自暗色态品牌主色 @0.20，meirenzhi 取鎏金
 * rgba(217, 180, 92, 0.20)（Q10 主人裁定例外，与萤火虫同源色）。
 * 家族 keyframes 名 dsh-skins-stream-pulse（openbmc 旧名 obmc-stream-pulse
 * 随收拢统一，无任何测试/外部引用）。
 */
export function streamingCss(scope, palette) {
  const KEYFRAMES = "dsh-skins-stream-pulse";
  return [
    `${scope} [data-streaming]{border-radius:4px;box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}`,
    `@keyframes ${KEYFRAMES}{from{box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}to{box-shadow:inset 3px 0 0 rgba(${palette.decay}, 0.20)}}`,
    `@media (prefers-reduced-motion: no-preference){${scope} [data-streaming]{animation:${KEYFRAMES} 1.6s ease-in-out infinite alternate}}`,
  ].join("\n");
}
