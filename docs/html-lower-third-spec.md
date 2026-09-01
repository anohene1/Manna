# HTML lower-third templates

Manna accepts a complete `.html` file or an HTML fragment as a camera lower-third theme. Import it from **Theme Designer → Import**, edit the source in the designer, save it, then select it in the Camera panel.

## Canvas and safety

- Design at **1920 × 1080**. The result scales with the output.
- The page background should stay transparent.
- Templates are static HTML and CSS. Scripts, iframes, embedded objects, event-handler attributes, `javascript:` URLs, and CSS imports are removed.
- Fonts must be installed on the presentation computer or declared with an embedded data URL. For the most portable result, embed image assets as data URLs. Absolute app paths such as `/ag-logo.png` also work for bundled assets.
- External web assets may fail offline or make the composed canvas unavailable to NDI capture, so they should not be used.

## Placeholders

Manna HTML-escapes and replaces these tokens before rendering:

| Token                  | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| `{{verse}}`            | Combined verse text                                             |
| `{{reference}}`        | Full reference, such as `John 3:16 (KJV)`                       |
| `{{referencePlain}}`   | Reference without the trailing translation, such as `John 3:16` |
| `{{verseNumber}}`      | Verse number or range                                           |
| `{{translation}}`      | Translation parsed from the reference                           |
| `{{contentType}}`      | `scripture` or `song`                                           |
| `{{contentLabel}}`     | `Scripture` or `Song lyrics`                                    |
| `{{translationLabel}}` | Translation label for scripture, or `Song lyrics`               |
| `{{contentMeta}}`      | Compact adaptive metadata, such as `KJV / Scripture`            |
| `{{contentMarker}}`    | Verse number for scripture, or `LYRICS`                         |
| `{{contentWatermark}}` | `WORD` for scripture, or `LYRICS`                               |
| `{{churchName}}`       | Church name from Branding settings                              |
| `{{logoUrl}}`          | Church logo URL from Branding settings                          |

The root also receives these CSS custom properties:

- `--manna-width`, `--manna-height`
- `--manna-safe-left`, `--manna-safe-right`, `--manna-safe-bottom`
- `--manna-ticker-offset` (`0px` normally, `110px` while a ticker is live)

Add `data-manna-lower-third` to the element anchored near the bottom. Manna will automatically lift that element above an active ticker. Keep logos or other fixed branding outside that marked element if they should remain stationary.

The root receives `manna-content-scripture` or `manna-content-song`. Elements marked `data-manna-translation` are automatically hidden for songs or when no translation is available. You can also mark conditional elements with `data-manna-scripture-only` or `data-manna-song-only`.

## Minimal example

```html
<!doctype html>
<html>
  <head>
    <style>
      .brand {
        position: absolute;
        top: 54px;
        left: var(--manna-safe-left);
        width: 96px;
      }

      .lower-third {
        position: absolute;
        left: var(--manna-safe-left);
        right: var(--manna-safe-right);
        bottom: var(--manna-safe-bottom);
        padding: 28px 36px;
        border-left: 10px solid #f5b942;
        border-radius: 14px;
        background: linear-gradient(
          90deg,
          rgba(8, 12, 22, 0.94),
          rgba(8, 12, 22, 0.38)
        );
        color: white;
        font-family: Inter, Arial, sans-serif;
      }

      .verse {
        font-size: 46px;
        line-height: 1.22;
      }
      .reference {
        margin-top: 14px;
        font-size: 25px;
        color: #f5b942;
      }
    </style>
  </head>
  <body>
    <img class="brand" src="{{logoUrl}}" alt="" />
    <section class="lower-third" data-manna-lower-third>
      <div class="verse">{{verse}}</div>
      <div class="reference">{{reference}}</div>
    </section>
  </body>
</html>
```

Use normal browser layout techniques such as `max-width`, flexbox, grid, and wrapping. Avoid fixed-height text containers unless you also define an overflow strategy; letting the lower-third section grow with its content is the safest option for long verses.
