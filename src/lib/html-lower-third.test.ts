import { describe, expect, it } from "vitest"
import {
  applyHtmlLowerThirdValues,
  sanitizeHtmlLowerThird,
  valuesForVerse,
} from "./html-lower-third"

describe("HTML lower thirds", () => {
  it("removes scripts, event handlers, imports, and JavaScript URLs", () => {
    const source = `<script>alert(1)</script><style>@import "bad.css";</style><a onclick="bad()" href="javascript:bad()">Safe</a>`
    const result = sanitizeHtmlLowerThird(source)
    expect(result).not.toMatch(/script|onclick|@import|javascript:/i)
    expect(result).toContain("Safe")
  })

  it("escapes verse content before inserting placeholders", () => {
    const result = applyHtmlLowerThirdValues("<p>{{verse}}</p>", {
      ...valuesForVerse({
        contentType: "scripture",
        reference: "John 3:16 (KJV)",
        segments: [
          { verseNumber: 16, text: `<img src=x onerror="bad()"> & text` },
        ],
      }),
      churchName: "Manna",
      logoUrl: "/logo.png",
    })
    expect(result).toContain("&lt;img")
    expect(result).toContain("&amp; text")
  })

  it("derives all documented verse placeholders", () => {
    expect(
      valuesForVerse({
        contentType: "scripture",
        reference: "John 3:16 (KJV)",
        segments: [{ verseNumber: 16, text: "For God so loved" }],
      })
    ).toMatchObject({
      verse: "For God so loved",
      reference: "John 3:16 (KJV)",
      referencePlain: "John 3:16",
      verseNumber: "16",
      translation: "KJV",
      contentType: "scripture",
      contentLabel: "Scripture",
      translationLabel: "KJV translation",
    })
  })

  it("identifies song lyrics and does not invent a Bible translation", () => {
    expect(
      valuesForVerse({
        contentType: "song",
        reference: "Amazing Grace · Chorus",
        segments: [{ text: "Amazing grace, how sweet the sound" }],
      })
    ).toMatchObject({
      contentType: "song",
      contentLabel: "Song lyrics",
      referencePlain: "Amazing Grace · Chorus",
      verseNumber: "",
      translation: "",
      translationLabel: "Song lyrics",
      contentMarker: "LYRICS",
      contentWatermark: "LYRICS",
    })
  })

  it("marks empty overlays so lower-third content can disappear while branding remains", () => {
    const values = valuesForVerse(null)
    expect(values.verse).toBe("")
    expect(values.reference).toBe("")
    expect(values.churchName).toBe("")
  })
})
