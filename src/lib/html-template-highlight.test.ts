import { describe, expect, it } from "vitest"

import { highlightHtmlTemplate } from "@/lib/html-template-highlight"

describe("highlightHtmlTemplate", () => {
  it("preserves every character in the source", () => {
    const source = `<!doctype html>\n<style>\n.card { color: #fff; width: 80%; }\n</style>\n<div class="card">{{verse}}</div>`
    const tokens = highlightHtmlTemplate(source)

    expect(tokens.map((token) => token.text).join("")).toBe(source)
  })

  it("recognizes HTML, CSS, comments, and Manna placeholders", () => {
    const source = `<!-- lower third -->\n<style>.card { padding: 24px; }</style>\n<div class="card">{{referencePlain}}</div>`
    const tokens = highlightHtmlTemplate(source)

    expect(tokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "comment" })])
    )
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "tag", text: "style" }),
      ])
    )
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "css-selector", text: ".card" }),
      ])
    )
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "css-property", text: "padding" }),
      ])
    )
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "attribute", text: "class" }),
      ])
    )
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "string", text: '"card"' }),
      ])
    )
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "placeholder",
          text: "{{referencePlain}}",
        }),
      ])
    )
  })
})
