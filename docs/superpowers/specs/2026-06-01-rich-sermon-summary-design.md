# Rich Sermon Summary Design

**Date:** 2026-06-01
**Project:** Manna
**Status:** Proposed

## Goal

Make the AI summary generated at the end of a session more useful for church operators, pastors, and congregants. The current summary is helpful but flat: topic, verses, main points, takeaways, and quotes. The new summary should preserve the structure of the sermon and also turn the message into a devotional follow-up that can be copied, exported, or shared after service.

## Research Basis

Common sermon structures emphasize an introduction, body, and conclusion. Sermon outlines typically include a central preaching point, supporting points, illustrations or examples, application, and a concluding call to response. Devotional formats are usually more personal and reflection-oriented. The common SOAP pattern uses Scripture, Observation, Application, and Prayer. Other devotional guides use a three-part flow: scripture, lived reflection or example, and practical takeaway.

Manna should combine both patterns:

- A sermon recap that shows how the message moved from opening to conclusion.
- A devotional follow-up that helps a listener revisit the message personally.
- Structured fields that are easy to render, copy, export, and regenerate.

## Existing Flow

The summary is generated in three layers:

- `src/components/session/end-session-dialog.tsx` and `src/components/layout/toolbar.tsx` trigger summary generation after ending a session.
- `src/lib/summarize.ts` collects transcript segments and presented verses, calls `summarize_sermon`, parses the response, and persists JSON.
- `src-tauri/src/commands/summarize.rs` owns the DeepSeek request and the prompt text in `PROMPT_HEAD`.

Manual regeneration in `src/components/panels/session-detail.tsx` uses the same frontend summarization path.

## Proposed Summary Shape

The response should remain JSON-only. The new structured shape should be:

```ts
interface SermonSummary {
  title: string
  big_idea: string
  key_verses: Array<{
    reference: string
    reason: string
  }>
  sermon_flow: {
    opening: string
    main_points: Array<{
      point: string
      explanation: string
      scripture_refs: string[]
      illustration_or_moment: string
      application: string
    }>
    conclusion: string
    response: string
  }
  devotional: {
    scripture: string
    observation: string
    application: string
    prayer: string
    reflection_questions: string[]
  }
  takeaways: string[]
  quotes: Array<{
    text: string
    speaker?: string
  }>
}
```

## Prompt Direction

Update the summary prompt to ask for:

- `title`: a concise shareable title inferred from the message.
- `big_idea`: one clear sentence capturing the central sermon proposition.
- `key_verses`: references actually preached or operator-confirmed, each with why it mattered.
- `sermon_flow.opening`: the opening tension, question, story, or setup.
- `sermon_flow.main_points`: 3-5 substantial points, each with explanation, scripture references, an illustration or memorable moment when available, and direct application.
- `sermon_flow.conclusion`: how the preacher landed the message.
- `sermon_flow.response`: the invitation, altar call, prayer emphasis, or next step.
- `devotional`: a SOAP-style personal follow-up based on the sermon.
- `takeaways`: exactly 5 short practical bullets.
- `quotes`: 3-5 verbatim share-worthy lines from the transcript, or an empty array if none are safe. Attribute quotes to the session speaker name when known; otherwise use `Pastor`, not `Preacher`.

The prompt should explicitly prevent invented quotes, invented scripture references, and overconfident claims where the transcript is incomplete.

## Backward Compatibility

Existing saved summaries use the old shape. The parser in `src/lib/summarize.ts` should accept both old and new shapes.

Compatibility rules:

- If `title` is missing, derive it from old `topic`.
- If `big_idea` is missing, derive it from old `topic`.
- If old `key_verses` is `string[]`, convert each into `{ reference, reason: "" }`.
- If `sermon_flow` is missing, convert old `main_points` into main-point objects with empty optional details.
- If `devotional` is missing, use empty strings and no reflection questions.
- Keep old `takeaways` and `quotes` behavior.
- If a quote speaker is missing or uses a generic label, normalize it to the session speaker name when known, otherwise `Pastor`.

This avoids breaking archived sessions and lets the UI render old summaries gracefully.

## UI Rendering

Update the Summary tab in `src/components/panels/session-detail.tsx` to render:

1. **Title and Big Idea** at the top.
2. **Key Verses** with short reasons.
3. **Sermon Flow** with opening, main points, conclusion, and response.
4. **Devotional Follow-up** with Scripture, Observation, Application, Prayer, and reflection questions.
5. **Takeaways** as compact action bullets.
6. **Quotes** as the existing quote card pattern.

The Summary tab should remain scannable. Avoid turning it into a long wall of text by keeping each section in separate summary cards.

## Distribution and Copy

Update `formatSummaryAsMarkdown` in `src/components/panels/session-detail.tsx` so copied summaries use the richer structure:

- Title
- Big Idea
- Key Verses
- Sermon Flow
- Devotional Follow-up
- Takeaways
- Quotes

The distribute summary drawer can keep using the persisted summary text. Teaching the drawer to format structured JSON directly is out of scope for this change.

## Error Handling

- If the model returns old-shape JSON, parse it using compatibility rules.
- If the model omits optional strings, normalize them to empty strings.
- If `main_points`, `reflection_questions`, `takeaways`, or `quotes` are not arrays, normalize to empty arrays.
- Keep current behavior for missing API key and empty transcript.
- Preserve JSON response format and DeepSeek model fallback behavior.

## Testing

Add or update tests for:

- Parsing the new summary shape.
- Parsing old saved summaries without losing data.
- Formatting rich summaries as markdown.
- Prompt response normalization for malformed optional fields.

Manual verification:

- End a session with no manual summary and confirm AI summary lands in the Summary tab.
- Regenerate a summary from a completed session.
- Copy summary markdown and confirm the structure reads well.
- Open an older saved session and confirm the old summary still renders.

## Implementation Boundaries

This change should not alter the session lifecycle, transcript storage, DeepSeek API settings, or distribution history. It should only change the summary schema, prompt, parsing, rendering, and copy formatting.
