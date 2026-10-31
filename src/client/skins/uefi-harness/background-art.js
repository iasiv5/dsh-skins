/**
 * UEFI Studio 背景原画数据模块（ADR-0019 Task 6 原画出仓；ADR-0023 通道外置）。
 * 背景原画 · 鎏金电路板微距（480x346 原摄 → 1920x1384 WebP，70KB；4x 虚化
 * 景深读作 bokeh，仅四角微压靛影以保留金色辉光）。为空时无占位（该皮
 * wallpaper.placeholder 为 null，纱即兜底）。
 * ADR-0023: bytes live in assets/uefi-harness/b_uefi-harness_art.webp, served
 * over the host /dsh-skins/assets/ route; this module only carries the URL.
 * Provenance: migrated byte-for-byte from the 1.5.21 inline string —
 *   bytes  70110   sha256  5b4509ce32e5f7b90a1e8456ed1f8aee257c1b629d23b05b6d8d3129b97ce006
 */
import { builtinAssetUrl } from "../../builtin-assets.js";

export const BACKGROUND_ART = builtinAssetUrl("uefi-harness", "art");
