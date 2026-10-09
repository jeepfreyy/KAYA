# Kaya Mode verification

## Guided-view development run — 2026-10-10

- All 24 unit tests passed, including the guided response schema, bounded field
  indexes, and exclusion of caller-provided values.
- Browser UI, form reader, and page reader suites passed on the current checkout.
- The guided-view browser check passed: AI field order was applied, original
  controls remained inside their form, and exiting removed all Kaya page styling.
- The real Chrome/Ollama suite passed all four modes on an Apple M5 MacBook Air:
  page, selection, form guidance, and the new guided view. It also confirmed that
  guided mode retains the original controls and excludes typed sentinels.

## Recorded local run — 2026-10-10

- All 23 unit tests passed.
- Browser UI checks passed for keyboard interaction, loading, sample results,
  error recovery, checklist reset, reduced motion, and widths of 320, 400, and 640 px.
- Form and page reader checks passed, including hidden/editable content exclusion,
  exact selected-text boundaries, payload limits, and native value getters that
  throw if the reader attempts to access them.
- The real Chrome extension test passed against local Ollama/Qwen for all three
  modes: page explanation, selected text, and form guidance. It also checked
  temporary toolbar access, model/source labels, original excerpts, cancellation,
  navigation clearing, missing forms, and localhost-only observed requests.
- Typed fictional name, email, and notes sentinels were absent from model requests
  in every live mode. Screenshots and model results are stored in ignored test-results/.

A real-model run exposed an unnecessary suggestion to contact an organizer. The
prompt was tightened and a regression check now rejects that advice for the
confirmation example. Passing these checks verifies the software flow, not the
truth of every generated sentence. The small local model can still infer unstated
conditions or confuse optional/required details. Compare original excerpts and
use form mode for the preparation checklist.

The headless test invokes the actual toolbar action and tests the production
panel document in a tab; it does not automate the native browser's panel frame.
Native resize behavior, macOS execution, Edge execution, and a physically
disconnected network remain manual checks. Runtime: Ollama 0.40.2, Qwen 2.5 3B
Q4_K_M, Windows, 16 GB RAM, RTX 3050 Laptop GPU (4 GB).

## Repeat the automated checks

From the project root:

```sh
npm ci --prefix extension
npm test --prefix extension
npm run test:browser --prefix extension
npm run test:reader --prefix extension
npm run test:live --prefix extension
```

Installed Chrome is used by default. Unit/UI/reader checks do not require a model.
The live test requires local Ollama/Qwen and recent Chrome with the CDP Extensions
API. CI uses Playwright Chromium for unit/UI/reader checks and does not run a model.

## Demonstration

1. Start local Ollama and `node scripts/serve-kaya-demo.mjs`.
2. Reload the extension at chrome://extensions, open http://localhost:4173,
   and click Kaya Mode's toolbar icon. Drag the panel edge to choose a useful width.
3. Select Check local AI, Explain this page, Analyze. Expect LOCAL AI RESPONSE,
   a model/timing line, an overview, important points, and a next step. Open an
   original excerpt to compare it with the AI explanation.
4. Highlight the “Registration is provisional” paragraph on the website. Choose
   Explain selected text, Analyze. Only that passage should be explained.
5. Choose Help me with this form, Analyze. Expect the overview, preparation
   checklist, and first step. Check an item as you prepare.
6. Choose Simplify this form on the page, Analyze. Use Next and Previous in the
   page guide, confirm the original fields still work, then choose Exit.
7. Use fictional input values. Repeat analysis; typed answers must not be repeated
   because the readers exclude control values.
8. Cancel a request, try the no-form page in form mode, and recover with the practice page.
9. Select Sample: community workshop registration. Expect SAMPLE AI RESPONSE and
   the fictional example notice, with no page read or model request.

## Remaining manual checks before presenting

- [ ] Check resizing and scrolling in the presenter's normal Chrome/Edge profile.
- [ ] Switch websites while the panel is open, click the toolbar icon for access,
      and verify Analyze uses the new page rather than old results.
- [ ] Close the panel during analysis, reopen it, and retry.
- [ ] Stop the project Ollama server, check the unavailable message, restart, retry.
- [ ] Disconnect internet while retaining localhost, then repeat the demo.
- [x] Reproduce macOS setup if a Mac will be used for presentation.

## Limits

Visible HTML in the main frame only. PDFs, image text, embedded frames, shadow
roots, and custom widgets are unsupported. Long pages/forms are shortened, and
navigation resets results. Same-page dynamic changes require another Analyze.

Input values are excluded, but personal details rendered as ordinary page text,
labels, or placeholders may be included. Page content is untrusted; prompt rules
and source IDs cannot guarantee accurate AI reasoning. No filling/submission,
persisted analysis history, cloud fallback, or automatic rewriting of the website.
