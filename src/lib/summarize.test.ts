import { describe, expect, test } from "vitest"
import {
  formatSummaryAsMarkdown,
  parseSummary,
  summaryFromJson,
} from "./summarize"

describe("parseSummary", () => {
  test("parses the rich sermon summary shape", () => {
    const summary = parseSummary(`\`\`\`json
{
  "title": "Hope That Holds",
  "big_idea": "Christ anchors the church in every storm.",
  "key_verses": [
    { "reference": "Hebrews 6:19", "reason": "Anchor image for hope" }
  ],
  "sermon_flow": {
    "opening": "A story about a storm at sea.",
    "main_points": [
      {
        "point": "Hope is anchored in Christ",
        "explanation": "The sermon tied hope to Jesus' finished work.",
        "scripture_refs": ["Hebrews 6:19", "Romans 5:5"],
        "illustration_or_moment": "The anchor illustration",
        "application": "Pray before panic."
      }
    ],
    "conclusion": "Hope outlasts the storm.",
    "response": "Trust Christ again."
  },
  "devotional": {
    "scripture": "Hebrews 6:19",
    "observation": "Hope is sure and steadfast.",
    "application": "Name one fear and surrender it.",
    "prayer": "Lord, steady my heart.",
    "reflection_questions": ["Where do I need hope today?"]
  },
  "takeaways": ["Hope has an anchor."],
  "quotes": [{ "text": "Faith does not deny the storm.", "speaker": "Pastor Kwame" }]
}
\`\`\``)

    expect(summary).toEqual({
      title: "Hope That Holds",
      big_idea: "Christ anchors the church in every storm.",
      key_verses: [
        { reference: "Hebrews 6:19", reason: "Anchor image for hope" },
      ],
      sermon_flow: {
        opening: "A story about a storm at sea.",
        main_points: [
          {
            point: "Hope is anchored in Christ",
            explanation: "The sermon tied hope to Jesus' finished work.",
            scripture_refs: ["Hebrews 6:19", "Romans 5:5"],
            illustration_or_moment: "The anchor illustration",
            application: "Pray before panic.",
          },
        ],
        conclusion: "Hope outlasts the storm.",
        response: "Trust Christ again.",
      },
      devotional: {
        scripture: "Hebrews 6:19",
        observation: "Hope is sure and steadfast.",
        application: "Name one fear and surrender it.",
        prayer: "Lord, steady my heart.",
        reflection_questions: ["Where do I need hope today?"],
      },
      takeaways: ["Hope has an anchor."],
      quotes: [
        { text: "Faith does not deny the storm.", speaker: "Pastor Kwame" },
      ],
    })
  })

  test("normalizes old saved summaries into the rich shape", () => {
    const summary = parseSummary(
      JSON.stringify({
        topic: "Faith Under Pressure",
        key_verses: ["James 1:2-4"],
        main_points: ["Trials reveal trust"],
        takeaways: ["Endure with joy"],
        quotes: ["Testing is not abandonment."],
      })
    )

    expect(summary.title).toBe("Faith Under Pressure")
    expect(summary.big_idea).toBe("Faith Under Pressure")
    expect(summary.key_verses).toEqual([
      { reference: "James 1:2-4", reason: "" },
    ])
    expect(summary.sermon_flow.main_points).toEqual([
      {
        point: "Trials reveal trust",
        explanation: "",
        scripture_refs: [],
        illustration_or_moment: "",
        application: "",
      },
    ])
    expect(summary.devotional).toEqual({
      scripture: "",
      observation: "",
      application: "",
      prayer: "",
      reflection_questions: [],
    })
    expect(summary.quotes).toEqual([
      { text: "Testing is not abandonment.", speaker: "Pastor" },
    ])
  })

  test("normalizes malformed optional fields to empty strings and arrays", () => {
    const summary = parseSummary(
      JSON.stringify({
        title: 42,
        big_idea: null,
        key_verses: "John 3:16",
        sermon_flow: {
          opening: ["bad"],
          main_points: "bad",
          conclusion: false,
          response: {},
        },
        devotional: {
          scripture: 10,
          observation: null,
          application: [],
          prayer: {},
          reflection_questions: "not an array",
        },
        takeaways: "bad",
        quotes: [
          { text: 99, speaker: "Speaker" },
          { text: "Good word", speaker: "Preacher" },
        ],
      })
    )

    expect(summary).toEqual({
      title: "",
      big_idea: "",
      key_verses: [],
      sermon_flow: {
        opening: "",
        main_points: [],
        conclusion: "",
        response: "",
      },
      devotional: {
        scripture: "",
        observation: "",
        application: "",
        prayer: "",
        reflection_questions: [],
      },
      takeaways: [],
      quotes: [{ text: "Good word", speaker: "Pastor" }],
    })
  })
})

describe("summaryFromJson", () => {
  test("returns null for invalid persisted JSON", () => {
    expect(summaryFromJson("{not json")).toBeNull()
  })
})

describe("formatSummaryAsMarkdown", () => {
  test("includes rich summary sections and quote attribution", () => {
    const summary = parseSummary(
      JSON.stringify({
        title: "Hope That Holds",
        big_idea: "Christ anchors the church.",
        sermon_flow: {
          opening: "Opening moment",
          main_points: [{ point: "Anchor", explanation: "Christ holds us" }],
        },
        devotional: {
          scripture: "Hebrews 6:19",
          observation: "Hope is steady.",
          application: "Trust Christ.",
          prayer: "Lord, help us.",
        },
        quotes: [{ text: "Hold fast.", speaker: "Pastor Kwame" }],
      })
    )

    const markdown = formatSummaryAsMarkdown(summary)

    expect(markdown).toContain("# Hope That Holds")
    expect(markdown).toContain("## Big Idea")
    expect(markdown).toContain("Christ anchors the church.")
    expect(markdown).toContain("## Sermon Flow")
    expect(markdown).toContain("### Devotional Follow-up")
    expect(markdown).toContain("> Hold fast.")
    expect(markdown).toContain("- Pastor Kwame")
  })
})
