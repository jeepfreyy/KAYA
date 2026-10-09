# Kaya Mode extension

Chrome/Edge Manifest V3 extension. Load this directory unpacked; no build step.
See [project scope](../docs/kaya-project.md) and [setup](../docs/kaya-setup.md).

## Files

- `panel.html`, `panel.js`, `styles.css`: responsive side panel and all result modes.
- `image-ocr.js`, `vendor/tesseract/`: local screenshot capture/upload, crop, OCR runtime, and English text data.
- `form-reader.js`, `form-reader-client.js`: isolated native form metadata extraction.
- `page-reader.js`, `page-reader-client.js`: visible page/selected-text extraction.
- `guided-view.js`, `guided-view-client.js`: reversible navigation over the
  website's original controls, using index-bound local-AI guidance.
- `page-analysis.js`: page input/output validation with original source IDs.
- `analysis-service.js`: live/sample routing and actionable errors.
- `ollama.js`: local Qwen prompts, schema-constrained streaming, limits, timeouts.
- `background.js`: toolbar entry point, authorized sender, one active model request.
- `local-ai-client.js`: runtime messaging, request heartbeat, cancellation.
- `setup.html`, `setup.css`: offline setup instructions.
- `tests/`: unit, UI, reader privacy, and real local inference checks.

## Permissions

`activeTab` grants temporary page access when the toolbar action is clicked;
`scripting` runs the reader in the main frame's isolated world; `sidePanel` hosts
the persistent interface. The toolbar event opens the panel explicitly so the
page-access grant is retained. A button inside the panel cannot grant new site access.

The only persistent host permission is `http://localhost:11434/*`. No broad website
permission or persistent content script is installed. Opening the panel does not
read a website. The public manifest key stabilizes the extension ID
`ojmclkkncanmfmkkbilgmcmcfbnfaoid`; it is not a secret.

## Checks

From the project root, run the commands in the [verification guide](../docs/kaya-verification.md).
The real integration test loads this production manifest in a disposable Chrome
profile and invokes the actual toolbar action. Because headless Chrome does not
expose its native side-panel surface as a Playwright page, it exercises the same
panel document in a tab while the practice page remains active. It does not stub
the readers, worker, permissions, or model response. Native panel resizing remains
a manual browser check.
