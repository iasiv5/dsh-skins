# dsh-skins — Skin pack for DSH Web

[![Release](https://img.shields.io/github/v/release/iasiv5/dsh-skins?label=Release&sort=semver)](../../releases)
[![CI](https://img.shields.io/github/actions/workflow/status/iasiv5/dsh-skins/ci.yml?branch=main&label=CI)](../../actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/iasiv5/dsh-skins?label=License)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@iasiv5/dsh-skins?label=npm)](https://www.npmjs.com/package/@iasiv5/dsh-skins)
[![DSH Web](https://img.shields.io/badge/DSH%20Web-0.2.0--rc.2%20verified-2563eb)](#faq)

English · [中文](./README.md)

Hot-swappable brand skins for DeepSeek Harness Web — with a one-click path back to the official interface.

![凡人修仙传 · 美人志 — factory wallpaper "Yuntai Gathering"](docs/assets/preview-meirenzhi-1.webp)

## Up and running in 30 seconds

This section answers: how to install, how to switch skins.

```sh
dsh plugin --profile web add @iasiv5/dsh-skins
```

1. Run the install command above.
2. Restart DSH Web (for example `systemctl restart` the matching service, depending on your deployment).
3. Refresh the page.
4. Click **Skin Switcher** at the bottom of the sidebar and pick a skin.

On a fresh install with no saved choice, OpenBMC Studio (the `openbmc` skin) is the factory-default skin (since v1.0.6; meirenzhi before that). For reproducible installs, pin the exact version:

```sh
dsh plugin --profile web add @iasiv5/dsh-skins@1.0.0
```

Update and uninstall:

```sh
dsh plugin --profile web update @iasiv5/dsh-skins    # update
dsh plugin --profile web remove @iasiv5/dsh-skins    # uninstall
```

With the [dsh-m](https://github.com/iasiv5/dsh-m) plugin marketplace installed, you can also install / uninstall this plugin with one click inside the DSH Web UI.

<details>
<summary>Hand the install to your Agent (prompt install)</summary>

Copy the whole block below to an Agent inside DSH Web:

```text
Install the DSH skin plugin @iasiv5/dsh-skins for me:
1. Run: dsh plugin --profile web add @iasiv5/dsh-skins
2. Once it succeeds, restart DSH Web (if it runs under systemd, restart the service).
3. Remind me to refresh the page afterwards.
If the install fails, send me the command output verbatim and retry at most once.
```

</details>

## Four appearances

This section answers: which skins exist and what each feels like.

| Choice ID | Kind | Description |
|---|---|---|
| `official` | built-in option | Plain paper & dark ink · breathing white space · naturally itself |
| `openbmc` | full skin · factory default | Ice-silk waves · storm-wing backdrop · ice-blue palette |
| `uefi-harness` | full skin | Violet spark · sunset wash · indigo-blue palette |
| `meirenzhi` | full skin | Jade faces & flowered looks · moonlit silks by night · asking the Dao in mortal dust |

- `official` restores the official DeepSeek Harness branding, backdrop and favicon, while keeping the skin switcher and the official light/dark palettes.
- `openbmc` (OpenBMC Studio): the brand slots reuse the OpenBMC project's official logo letterforms and blue-green brand gradient, used solely for identification; all rights remain with the OpenBMC project. The backdrop is the "Left Wind, Right Thunder" storm artwork, ice-blue in both light and dark, slogan "Govern before the storm" (察于未萌 · 治于未乱).
- `uefi-harness` (UEFI Studio): the brand slots carry the UEFI Forum's official logo (rights note under "Known limits"). The backdrop is the "Integrated Circuits" circuit-board artwork, violet-and-indigo in both light and dark, slogan "Boot before everything" (启于固件 · 行于万象).
- `meirenzhi` (凡人修仙传 · A Mortal's Journey: Beauty Chronicle) is an **unofficial fan work** with no affiliation with or authorization from the copyright holders; the 6 bundled wallpapers are AI-generated fan art, the Reach-for-the-Sky Vial site icon embeds the owner-provided emblem artwork, the BEAUTY badge is rendered with HTML/CSS, and the fireflies use CSS pseudo-elements and radial gradients — no official artwork is bundled. Vermilion-and-gold in both light and dark, slogan "From mortal dust, immortals bloom" (风起凡尘 · 红颜问道).
- Every skin ships one palette per light/dark mode and follows the appearance setting automatically.
- The `tgcf` (Heaven Official's Blessing) skin was removed in v1.4.0: browsers that had selected it fall back to the factory skin automatically, and its leftover personalization settings are cleaned up at load.

## Screenshots

All captures below are real browser screenshots covering all three extension skins, new and old alike; every wallpaper can be swapped any time from the personalization panel (next section).

### 凡人修仙传 · 美人志

| | |
|---|---|
| !["Yuntai Gathering" group shot (factory wallpaper)](docs/assets/preview-meirenzhi-1.webp) | ![Ziling (light)](docs/assets/preview-meirenzhi-2.webp) |
| ![Nangong Que (dark)](docs/assets/preview-meirenzhi-3.webp) | ![Yinyue (light)](docs/assets/preview-meirenzhi-4.webp) |
| ![Mu Peiling (light)](docs/assets/preview-meirenzhi-5.webp) | ![Nangong Wan (light)](docs/assets/preview-meirenzhi-6.webp) |

Solo portraits in order: Ziling, Nangong Que (dark), Yinyue, Mu Peiling and Nangong Wan; the first shot is the factory wallpaper "Yuntai Gathering" (group).

### OpenBMC Studio (factory default)

!["Left Wind, Right Thunder" (factory wallpaper, dark)](docs/assets/preview-openbmc-1.webp)

### UEFI Studio

!["Integrated Circuits" (factory wallpaper)](docs/assets/preview-uefi-1.webp)

## Personalization: wallpaper, slogan and translucency

This section answers: what you can tune, how, and where the settings live.

Every skin's key visuals are open to adjustment. Click the gear button on a skin card and that skin's personalization panel docks beside the switcher (stacked vertically on narrow windows). All three skins (`openbmc` / `uefi-harness` / `meirenzhi`) share the same field set:

| Field | What you can do | Factory value |
|---|---|---|
| **Wallpaper** | Pick from the skin's built-in artwork, or upload your own images into a personal library | Each skin's default artwork |
| **Slogan** | The new-session guidance line, one Chinese and one English copy | The skin's factory slogan |
| **Translucency** | 0–100%, one value driving three visual layers: panel tint, wallpaper scrim and blur. 0% is pure, fully visible wallpaper; 100% hides it completely | meirenzhi 35, openbmc / uefi-harness 55 |

![Personalization panel — meirenzhi shown: built-in wallpaper grid, library upload, zh/en slogans and the translucency knob](docs/assets/preview-personalization.webp)

### Upload your own wallpaper (personal library)

- PNG / JPEG / WebP / GIF are accepted: ≤ 20MB each, GIF ≤ 12MP; animated WebP and SVG are rejected.
- Multi-select is supported — files upload one by one, each announcing its progress and any failure reason.
- The library has no count cap and is shared by all skins.
- Deleting a referenced image, or clearing the library, lists every affected skin and field first and acts only after you confirm.

### Every change applies and persists on its own

- Any change in the panel applies immediately and is written automatically after a brief (~0.5s) debounce.
- Two tabs sync within about a second; while offline, write controls disable themselves so edits are never lost silently.
- Reset-to-default is the one guarded action: it lists the settings it will reset, and after you confirm it returns to factory values and persists automatically.
- While the panel is open, clicking another skin's card moves the panel straight to that skin's settings.

### Where settings live, and whether they survive

- Configuration and the library live under `$DSH_HOME/dsh-skins/`, physically isolated from the plugin install directory: plugin upgrades (via the dsh-m marketplace or `dsh plugin`) only replace the plugin install directory and cannot touch it.
- Only overrides are stored: untouched fields automatically follow the new version's defaults, and leftovers of retired skins or fields are cleaned up at load (the v1.4.0 tgcf removal rides this path).
- A damaged state file triggers recovery mode: indexes are rebuilt and bad files quarantined — your images are never wiped.
- Uploads pass magic-number validation and size caps; concurrent writes merge per field and never clobber each other.

## The skin switcher

This section answers: what lives in the switcher and how to use it.

The **Skin Switcher** popover at the bottom of the sidebar has two sections:

1. **Appearance**: Light, Dark, System. It calls the official theme service and stays in sync with Settings → General → Appearance.
2. **Choose Skin**: the first entry is DeepSeek Harness (Official), followed by the extension skins. Clicking switches instantly and persists the choice; the popover stays open for continuous preview.

![Skin switcher popover — appearance and skin list](docs/assets/preview-switcher.webp)

When the sidebar is collapsed, the entry folds into a round palette icon; multiple `sidebar.footer.action` entries stack vertically without overlapping. Choosing "Official" only undoes the extension skins — your light/dark/system preference is untouched.

The URL switches skins too: `/?skin=official`, `/?skin=openbmc`, `/?skin=uefi-harness`, `/?skin=meirenzhi`.

## Updates

This section answers: how the plugin is updated.

The plugin ships no updater of its own (ADR-0008): update discovery and installation belong to the dsh-m marketplace, or to the DSH CLI — upgrade with `dsh plugin --profile web update @iasiv5/dsh-skins`; roll back by reinstalling an older exact version with `dsh plugin add --profile web @iasiv5/dsh-skins@X.Y.Z`. The `latest` exact version of `@iasiv5/dsh-skins` on npm remains the sole distribution form, and the version policy stays strict `X.Y.Z`.

## FAQ

**How do I get fully back to the official interface?**
Pick "DeepSeek Harness (Official)" in the skin switcher, or open `/?skin=official`. It undoes the extension skin's branding, backdrop and favicon while keeping the switcher and the official light/dark palettes; your light/dark/system preference stays untouched.

**Why is there no "check for updates" button?**
Update duty has moved to the dsh-m marketplace and the DSH CLI (ADR-0008); the skin switcher only handles skins and personalization.

**Which DSH Web versions are supported?**
Verified with DSH Web `0.2.0-rc.2`. Later rc builds of the same series are expected to work, but unverified versions carry no promise.

**Does my appearance preference sync across browsers?**
In the browser on the DSH host machine (loopback), the preference is persisted by the DSH Host and shared naturally. Other remote browsers keep the preference in their own `localStorage` — independent per browser, never overwritten.

**Do personalization settings survive upgrades?**
Yes. Configuration and the library live in the `$DSH_HOME/dsh-skins/` data directory; upgrades only replace the plugin install directory (through any channel) and physically cannot touch it — rollbacks preserve it too. Only disk-level damage can lose configuration, and even then recovery mode keeps the library images.

## Known limits

- Other skin plugins may also touch the body backdrop, brand slots or favicon; avoid enabling multiple visual skin plugins at the same time.
- The `openbmc` brand slots reuse the OpenBMC project's official logo letterforms and brand gradient, used solely for identification; all rights remain with the OpenBMC project.
- The `uefi-harness` mark is the UEFI Forum's official trademark (the red cube, from uefi.org's published uefi_logo_red.gif, embedded as vector paths traced via Wikimedia Commons "Logo of the UEFI Forum.svg"); it is used solely to identify the skin, and all rights remain with the UEFI Forum.

## License

[MIT](./LICENSE)

---

Want to read the source, build your own skin, or contribute? See [docs/developers.md](./docs/developers.md) (how it works, skin authoring guide, local verification and the debug API).
