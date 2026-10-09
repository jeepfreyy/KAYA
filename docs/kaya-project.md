# Kaya Mode project scope

## Purpose

Kaya helps people understand web content and prepare to complete forms with less
confusion. The original hackathon PDF defines the form assistant. This rebuild
keeps that complete flow and adds page explanations, selected-text explanations,
a persistent side panel, and a reversible guided view over the website's original fields.

## Program coverage

- Interface: Analyze, loading/cancel, errors/retry, labeled samples, readable results.
- Form reader: native visible field labels, types, required flags, placeholders,
  and options, excluding entered values and passwords.
- Local AI: Qwen 2.5 3B through Ollama, bounded prompts, structured JSON validation,
  timeout and connection handling, model name and timing.
- Guided view: AI-generated plain labels, help text, and field order bound to the
  extracted field indexes. It highlights and focuses original controls without moving them.
- Delivery: fictional practice page/form, Windows/macOS instructions, automated
  privacy and integration checks, reproducible demonstration.

The new page modes use a separate contract; they do not change the PDF's form
metadata or overview/preparationChecklist/firstStep response contract.

## How AI is used

1. The user clicks the toolbar icon to grant temporary access to a website.
2. The side panel reads nothing until the user selects Analyze.
3. An isolated reader takes a bounded snapshot of page text, selected text, or
   form metadata. It never changes or submits the website.
4. The background worker sends that snapshot to local Ollama's chat API.
5. Qwen generates a new explanation based on the snapshot. The extension checks
   the response shape, length, and referenced source IDs before showing it.
6. The result displays LOCAL AI RESPONSE, model, elapsed time, and source/field count.

Page results include original excerpts for verification. Valid source IDs confirm
that an excerpt exists, not that every AI claim is accurate. Users should compare
important claims against the original website. Samples are hard-coded fictional
examples, explicitly labeled, and never used as a fallback for live failures.

## Modules and data

`panel.html` / `panel.js` / `styles.css` render the responsive side panel.
`analysis-service.js` routes the selected mode and translates errors.
`form-reader*` and `page-reader*` perform on-demand main-frame extraction.
`guided-view*` applies and removes the field-by-field guide in the active page.
`local-ai-client.js` uses a runtime port with cancellation and a request heartbeat.
`background.js` validates the extension sender and permits one request at a time.
`ollama.js` handles bounded input, streaming, timeouts, and form output validation.
`page-analysis.js` defines bounded page input and source-linked output.

Form input: `{fields: [{label, type, required, placeholder, options}]}`.
Form output: `{overview, preparationChecklist, firstStep}`.
Guided output adds `{fieldGuidance: [{fieldIndex, plainLabel, helpText}]}`.
Page input: `{kind: "page" | "selection", blocks: [{id, text}]}`.
Page output: `{summary, keyPoints: [{text, sourceId}], nextStep, nextStepSourceId}`.
An empty nextStepSourceId means the text specifies no supported next action.
The client also receives source excerpts, model/timing, and shortening metadata.

All content is untrusted, placed in the model's user message, and rendered through
textContent. There is no HTML rendering of model output. Navigation or tab changes
clear results and cancel requests so another page's answer is not shown as current.

## Boundaries

- No cloud model, backend database, accounts, analytics, or stored result history.
- No autofill or automatic submission. Guided view adds a removable overlay and
  highlight; it does not replace, relocate, or rewrite the website's controls.
- No PDFs, OCR, images, iframes, shadow DOM, or custom-widget interpretation.
- Main page/selection text: at most 40 blocks, 700 characters per block, 6,000 total.
- Form reader: 50 fields, 200 characters per string, 30 select options; the model
  adapter further caps the metadata JSON at 8,000 characters.
- Page text may include personal details already rendered by the website. Form
  labels/placeholders may also contain personal information. Editable values are excluded.
- AI may miss context or make mistakes. Excerpts, bounded scope, and explicit errors
  make limitations visible; they do not make generation infallible.

## Repository

[jeepfreyy/KAYA](https://github.com/jeepfreyy/KAYA) contains the Kaya source, tests,
setup scripts, and documentation. The publication builds on this repository's
initial commit without importing the previous project's history. Local recovery
branches and backups remain on the development machine. Downloaded binaries,
model weights, dependencies, and generated test output are excluded from Git.
