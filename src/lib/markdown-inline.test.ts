import { describe, it, expect } from "vitest"
import { tokenizeInlineMarkdown } from "./markdown-inline"

describe("tokenizeInlineMarkdown", () => {
  it("returns single plain token for unformatted text", () => {
    expect(tokenizeInlineMarkdown("hello world")).toEqual([
      { text: "hello world", bold: false, italic: false },
    ])
  })

  it("tokenizes bold", () => {
    expect(tokenizeInlineMarkdown("a **bold** b")).toEqual([
      { text: "a ", bold: false, italic: false },
      { text: "bold", bold: true, italic: false },
      { text: " b", bold: false, italic: false },
    ])
  })

  it("tokenizes italic", () => {
    expect(tokenizeInlineMarkdown("a *italic* b")).toEqual([
      { text: "a ", bold: false, italic: false },
      { text: "italic", bold: false, italic: true },
      { text: " b", bold: false, italic: false },
    ])
  })

  it("treats unmatched markers as literal", () => {
    expect(tokenizeInlineMarkdown("a * b")).toEqual([
      { text: "a * b", bold: false, italic: false },
    ])
  })

  it("does not parse triple-asterisk as nested", () => {
    expect(tokenizeInlineMarkdown("**a *b* c**")).toEqual([
      { text: "a *b* c", bold: true, italic: false },
    ])
  })

  it("handles empty string", () => {
    expect(tokenizeInlineMarkdown("")).toEqual([])
  })
})
