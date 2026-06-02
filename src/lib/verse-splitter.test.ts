import { describe, it, expect } from "vitest"
import { splitVerseIntoChunks, wordCount } from "./verse-splitter"

describe("wordCount", () => {
  it("counts whitespace-separated tokens, ignoring extras", () => {
    expect(wordCount("hello world")).toBe(2)
    expect(wordCount("  hello   world  ")).toBe(2)
    expect(wordCount("")).toBe(0)
  })
})

describe("splitVerseIntoChunks", () => {
  it("returns input as single chunk when short", () => {
    const text = "For God so loved the world."
    expect(splitVerseIntoChunks(text)).toEqual([text])
  })

  it("splits at sentence boundaries when long", () => {
    const text =
      "He went to the market on Monday morning early. " +
      "She bought bread butter cheese olives and ripe tomatoes. " +
      "They walked home through the park under bright sunshine."
    const out = splitVerseIntoChunks(text, 10, 4)
    expect(out.length).toBe(3)
    expect(out[0]).toMatch(/\.$/)
    expect(out[1]).toMatch(/\.$/)
    expect(out[2]).toMatch(/\.$/)
  })

  it("falls back to comma split when one sentence is too long", () => {
    const text =
      "He walked slowly through the dim alleyway, past the silent shuttered " +
      "shops, around the empty fountain at the square, and toward the " +
      "lighted house beyond."
    const out = splitVerseIntoChunks(text, 12, 4)
    expect(out.length).toBeGreaterThan(1)
    expect(out.join(" ").replace(/\s+/g, " ").trim()).toBe(
      text.replace(/\s+/g, " ").trim(),
    )
  })

  it("falls back to word-count when no punctuation hints exist", () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i + 1}`).join(" ")
    const out = splitVerseIntoChunks(text, 20, 5)
    expect(out.length).toBeGreaterThanOrEqual(3)
    for (const chunk of out) {
      expect(wordCount(chunk)).toBeLessThanOrEqual(25)
    }
  })

  it("honors min-word floor by merging short tails", () => {
    const text =
      "First sentence here with several words leading along. " +
      "Second sentence likewise carries more words along this line. " +
      "Tail only here."
    const out = splitVerseIntoChunks(text, 12, 5)
    expect(out.every((c) => wordCount(c) >= 5)).toBe(true)
  })

  it("is idempotent for already-chunked text", () => {
    const text = "He went to the market on Monday morning early."
    const once = splitVerseIntoChunks(text, 10, 4)
    expect(splitVerseIntoChunks(once[0], 10, 4)).toEqual(once)
  })

  it("returns single empty chunk for empty input", () => {
    expect(splitVerseIntoChunks("")).toEqual([""])
  })
})
