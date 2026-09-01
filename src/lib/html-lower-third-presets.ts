export interface HtmlLowerThirdPreset {
  id: string
  name: string
  source: string
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}body{background:transparent;color:#fff;overflow:hidden}
.frame{position:relative;width:1920px;height:1080px;overflow:hidden}
`

function makePreset(
  id: string,
  name: string,
  css: string,
  markup: string
): HtmlLowerThirdPreset {
  return {
    id,
    name,
    source: `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>${name}</title><style>${BASE_CSS}${css}</style></head><body><div class="frame">${markup}</div></body></html>`,
  }
}

export const HTML_LOWER_THIRD_PRESETS: HtmlLowerThirdPreset[] = [
  makePreset(
    "builtin-html-gilded-editorial",
    "Gilded Editorial",
    `body{font-family:"Geist Variable",Arial,sans-serif}.lower{position:absolute;bottom:72px;left:72px;width:min(1350px,calc(100% - 144px))}.meta{display:flex;align-items:center;gap:22px;margin-bottom:12px}.ref{padding:7px 15px;background:#c5a059;color:#000;font-size:18px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.meta>span:last-child{color:#aaa;font-size:17px;letter-spacing:2px;text-transform:uppercase}.box{padding:32px 42px;background:rgba(10,10,10,.92);border-left:5px solid #c5a059}.verse{color:#f4f4f0;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:46px;line-height:1.25}.footer{margin-top:18px;color:#777;font-size:16px;letter-spacing:1.5px;text-transform:uppercase}`,
    `<section class="lower" data-manna-lower-third><div class="meta"><span class="ref">{{referencePlain}}</span><span>{{contentLabel}}</span></div><div class="box"><p class="verse">{{verse}}</p><div class="footer" data-manna-translation>{{translation}} translation</div></div></section>`
  ),
  makePreset(
    "builtin-html-slate-split",
    "Slate Split",
    `body{font-family:"Geist Mono",monospace}.lower{position:absolute;bottom:0;left:0;width:100%;display:grid;grid-template-columns:480px 1fr;background:rgba(13,14,17,.95);border-top:3px solid #e2e8f0}.side{padding:38px 54px;background:#18191f;border-right:1px solid #30323d;display:flex;flex-direction:column;justify-content:center}.label{color:#94a3b8;font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.ref{margin:16px 0 10px;color:#fff;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:40px;line-height:1.1}.translation{align-self:flex-start;padding:5px 11px;background:#e2e8f0;color:#0d0e11;font-size:15px;font-weight:700;letter-spacing:1px}.passage{display:flex;align-items:center;padding:38px 66px}.verse{color:#f1f5f9;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:35px;line-height:1.42}`,
    `<section class="lower" data-manna-lower-third><aside class="side"><span class="label">{{contentLabel}}</span><h2 class="ref">{{referencePlain}}</h2><span class="translation" data-manna-translation>{{translation}}</span></aside><div class="passage"><p class="verse">{{verse}}</p></div></section>`
  ),
  makePreset(
    "builtin-html-ochre-ribbon",
    "Ochre Ribbon",
    `body{font-family:"Inter Variable",Arial,sans-serif}.ribbon{position:absolute;bottom:0;left:0;width:100%;padding:34px 90px 42px;background:rgba(0,0,0,.94);border-top:1px solid #3a3a3a}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;margin-bottom:18px;border-bottom:1px solid #242424}.anchor{display:flex;align-items:center;gap:18px}.dot{width:9px;height:9px;background:#d97706}.ref{font-size:19px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.context{color:#777;font-size:16px;letter-spacing:1.5px;text-transform:uppercase}.verse{max-width:1740px;color:#e5e5e5;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:36px;line-height:1.4}`,
    `<section class="ribbon" data-manna-lower-third><div class="header"><div class="anchor"><i class="dot"></i><span class="ref">{{referencePlain}}</span></div><span class="context">{{translationLabel}}</span></div><p class="verse">{{verse}}</p></section>`
  ),
  makePreset(
    "builtin-html-amber-spine",
    "Amber Spine",
    `body{font-family:"Geist Variable",Arial,sans-serif}.display{position:absolute;bottom:54px;left:72px;right:72px;display:flex}.spine{width:12px;flex:0 0 12px;background:#f59e0b}.main{flex:1;padding:30px 54px 34px;background:rgba(18,19,24,.95);border:1px solid #2b2e38;border-left:0}.header{display:flex;justify-content:space-between;align-items:baseline;gap:30px;margin-bottom:16px}.ref{color:#f59e0b;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.translation{color:#7f8da3;font-size:17px;letter-spacing:1px}.verse{color:#e2e8f0;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:34px;line-height:1.48}`,
    `<section class="display" data-manna-lower-third><i class="spine"></i><div class="main"><div class="header"><span class="ref">{{referencePlain}}</span><span class="translation">{{translationLabel}}</span></div><p class="verse">{{verse}}</p></div></section>`
  ),
  makePreset(
    "builtin-html-concrete-grid",
    "Concrete Grid",
    `body{font-family:"Geist Mono",monospace}.grid{position:absolute;bottom:0;left:0;width:100%;display:grid;grid-template-columns:390px 1fr;background:#f4f4f0;color:#0d0d0d;border-top:6px solid #0d0d0d}.side{padding:38px 42px;background:#0d0d0d;color:#f4f4f0;border-right:6px solid #0d0d0d;display:flex;flex-direction:column;justify-content:space-between}.number{margin:8px 0 24px;font-family:"Geist Variable",sans-serif;font-size:90px;font-weight:800;line-height:.9}.ref{padding-top:15px;border-top:1px solid #444;font-size:17px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.translation{color:#888}.passage{position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:40px 70px}.watermark{position:absolute;right:22px;bottom:-28px;color:rgba(0,0,0,.045);font-family:"Geist Variable",sans-serif;font-size:170px;font-weight:800;line-height:1}.verse{position:relative;color:#0d0d0d;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:36px;font-weight:600;line-height:1.38}`,
    `<section class="grid" data-manna-lower-third><aside class="side"><div class="number">{{contentMarker}}</div><div class="ref">{{referencePlain}}<br/><span class="translation" data-manna-translation>{{translation}} translation</span></div></aside><div class="passage"><div class="watermark">{{contentWatermark}}</div><p class="verse">{{verse}}</p></div></section>`
  ),
  makePreset(
    "builtin-html-terracotta-studio",
    "Terracotta Studio",
    `body{font-family:"Inter Variable",Arial,sans-serif}.layout{position:absolute;bottom:66px;left:81px;right:81px;display:flex;align-items:stretch}.plaque{flex:0 0 430px;padding:38px 48px;background:#c25e2e;color:#fff;display:flex;flex-direction:column;justify-content:center}.tag{font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;opacity:.9}.ref{margin-top:16px;font-family:"Geist Variable",sans-serif;font-size:42px;font-weight:800;line-height:1.08}.translation{margin-top:14px;font-size:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:.8}.content{flex:1;display:flex;align-items:center;padding:38px 58px;background:rgba(28,30,36,.96);border:2px solid #353944;border-left:0}.verse{color:#f1ede8;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:34px;line-height:1.45}`,
    `<section class="layout" data-manna-lower-third><aside class="plaque"><span class="tag">{{contentLabel}}</span><div class="ref">{{referencePlain}}</div><div class="translation" data-manna-translation>{{translation}} translation</div></aside><div class="content"><p class="verse">{{verse}}</p></div></section>`
  ),
  makePreset(
    "builtin-html-monochrome-masthead",
    "Monochrome Masthead",
    `body{font-family:"Geist Variable",Arial,sans-serif}.masthead{position:absolute;bottom:0;left:0;width:100%;display:flex;align-items:stretch;background:rgba(0,0,0,.96);border-top:3px solid #fff}.stamp{flex:0 0 480px;display:flex;flex-direction:column;justify-content:center;padding:42px 66px;background:#fff;color:#000}.ref{font-size:44px;font-weight:800;line-height:1;letter-spacing:-.03em;text-transform:uppercase}.translation{margin-top:14px;color:#333;font-size:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}.content{flex:1;display:flex;align-items:center;padding:42px 78px}.verse{max-width:1260px;color:#eaeaea;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:37px;line-height:1.38}`,
    `<section class="masthead" data-manna-lower-third><aside class="stamp"><h2 class="ref">{{referencePlain}}</h2><span class="translation">{{contentMeta}}</span></aside><div class="content"><p class="verse">{{verse}}</p></div></section>`
  ),
  makePreset(
    "builtin-html-cathedral-rule",
    "Cathedral Rule",
    `body{font-family:"Inter Variable",Arial,sans-serif}.lower{position:absolute;bottom:0;left:0;width:100%;padding:34px 96px 42px;background:rgba(0,0,0,.76);border-top:1px solid rgba(255,255,255,.16)}.meta{display:flex;align-items:center;gap:22px;margin-bottom:17px}.ref{font-family:"Source Serif 4 Variable",Georgia,serif;font-size:23px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.rule{flex:1;height:1px;background:rgba(255,255,255,.2)}.translation{color:rgba(255,255,255,.56);font-size:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase}.verse{color:#f3f4f6;font-size:35px;line-height:1.42}`,
    `<section class="lower" data-manna-lower-third><div class="meta"><span class="ref">{{referencePlain}}</span><i class="rule"></i><span class="translation">{{translationLabel}}</span></div><p class="verse">{{verse}}</p></section>`
  ),
  makePreset(
    "builtin-html-quiet-anchor",
    "Quiet Anchor",
    `body{font-family:"Inter Variable",Arial,sans-serif}.anchor{position:absolute;bottom:48px;left:72px;right:72px;padding:32px 54px;background:rgba(14,15,18,.88);border-left:3px solid #fff}.verse{margin-bottom:18px;font-family:"Source Serif 4 Variable",Georgia,serif;font-size:44px;line-height:1.32}.meta{display:flex;justify-content:flex-end;align-items:center;gap:16px;color:rgba(255,255,255,.62);font-size:16px;letter-spacing:2px;text-transform:uppercase}.ref{color:#fff;font-weight:700}.sep{color:rgba(255,255,255,.32)}`,
    `<section class="anchor" data-manna-lower-third><p class="verse">{{verse}}</p><div class="meta"><span class="ref">{{referencePlain}}</span><span class="sep">•</span><span>{{translationLabel}}</span></div></section>`
  ),
  makePreset(
    "builtin-html-ghost-scrim",
    "Ghost Scrim",
    `body{font-family:"Inter Variable",Arial,sans-serif}.ghost{position:absolute;bottom:0;left:0;width:100%;padding:34px 84px 40px;background:rgba(0,0,0,.58);border-top:1px solid rgba(255,255,255,.13)}.meta{margin-bottom:14px}.badge{display:inline-block;padding:6px 14px;border-radius:5px;background:rgba(255,255,255,.14);font-size:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}.verse{color:rgba(255,255,255,.94);font-size:32px;line-height:1.48}`,
    `<section class="ghost" data-manna-lower-third><div class="meta"><span class="badge">{{reference}}</span></div><p class="verse">{{verse}}</p></section>`
  ),
]
