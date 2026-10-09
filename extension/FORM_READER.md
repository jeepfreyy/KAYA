# Kaya Mode form metadata reader

Implements the reader responsibilities and shared contract in the team program.
The complete implementation connects this reader to the side panel and local Ollama.
The form contract remains separate from the page and selected-text modes.

## Files and integration

- `form-reader.js`: reusable `readFormMetadata()` content-script function.
- `form-reader-client.js`: `readActiveFormMetadata()` for the side panel/background.
- `tests/fixtures/reader-form.html`: fictional verification fixture, not the final demo.
- `tests/form-reader-browser.js`: real Chrome extraction and privacy checks.
- `tests/form-reader-client.test.js`: extension API and error-path checks.

The reader runs on demand in Chrome's isolated world, in the active tab's main
frame. It reads the current DOM each time, so fields added since a previous call
are included. It performs no network requests, writes, field filling, or submission.
Guided view binds AI guidance to these zero-based DOM positions and repeats the
same bounded visible-control scan before applying it. It never moves or clones a control.

The live flow uses this interface:

```js
// The manifest already enables activeTab and scripting.
import { readActiveFormMetadata } from './form-reader-client.js';

const metadata = await readActiveFormMetadata(); // from an Analyze user action
// The live analysis service sends this to the background worker.
```

No broad host permission, persistent content script, or `tabs` permission is
needed. Opening the side panel alone does
not start reading a page. See Chrome's official
[script injection API](https://developer.chrome.com/docs/extensions/reference/api/scripting).

## Shared contract

```json
{
  "fields": [
    {
      "label": "Full name",
      "type": "text",
      "required": true,
      "placeholder": "Enter your full name",
      "options": []
    }
  ]
}
```

- Native input types retain their browser-normalized type. Selects use `select`;
  text areas use `textarea`. Multi-selects share the `select` type.
- Labels use native associated/wrapping labels first, then `aria-labelledby`,
  then `aria-label`. Missing labels and placeholders stay empty; no guesses.
- Native `required` and `aria-required="true"` both set the required flag.
- Options contain label/text strings in DOM order, never option values or the
  selected state. Non-select fields have an empty options array.
- Text whitespace is normalized. Limits: 50 fields, 200 characters per string,
  30 options per select, and at most 500 candidate controls/options scanned.
  Larger forms/options are truncated in DOM order. This bounded MVP contract has
  no truncation flag; the AI must not claim the metadata covers an entire form.

## Supported scope and privacy

Native text, email, telephone, URL, search, number, date/time, checkbox, radio,
file, range, color, textarea, and select controls are supported, including native
controls outside a `<form>` element. Disabled/read-only visible fields retain
their metadata. Passwords, hidden inputs, buttons, invisible fields, and fields
inside hidden/inert/aria-hidden ancestors are excluded.

The reader never reads `.value`, checked state, filenames, selected state, or
textarea contents. Label extraction skips embedded controls and editable
subtrees so wrapping labels cannot pull in their contents. Radio/checkbox fields
remain individual fields and expose their label without their checked state.

Custom widgets, shadow roots, iframes, and non-HTTP(S) pages are outside this MVP.
Metadata is page-controlled, untrusted text. Do not treat labels as model
instructions. A site can mirror personal information into labels or placeholders;
the reader cannot distinguish that from static metadata. Do not send whole-page
text or entered values as a fallback for missing labels.

## Empty results and failures

`readFormMetadata()` returns `{ "fields": [] }` for no supported visible controls.
The client converts this to `FormReaderError` with code `NO_FORM`. Other codes:
`UNSUPPORTED_PAGE`, `PAGE_UNAVAILABLE`, `READER_UNAVAILABLE`, and `READER_FAILED`.
Errors have user-facing messages without exposing raw API exceptions.

## Verification

From the repository root:

```sh
npm test --prefix extension
node extension/tests/form-reader-browser.js
```

The browser check uses installed Chrome and a separately available `playwright`
package (resolvable through `NODE_PATH`, like the existing UI browser checks).
It checks actual DOM extraction, labels, required flags, privacy before/after
editing, hidden fields, options, dynamic changes, empty pages, and payload limits.
It prints the fictional fixture's metadata for inspection. Browser DOM checks
and mocked API tests do not verify the action's permission grant; the separate
live extension test covers that. Reader-only checks need no model.
