# Kaya Mode

Understand a web page. Make sense of a confusing paragraph. Take a form one step at a time.

Kaya Mode is a Chrome/Edge extension with a resizable side panel and real local AI
using Qwen 2.5 3B through Ollama. It reads only after you select **Analyze**.

## Three ways to use it

- **Explain this page**: a plain-language overview, important points with original
  source excerpts, and a supported next step.
- **Explain selected text**: highlight a paragraph on a website and simplify that
  passage. Expand the original excerpts to compare them with the explanation.
- **Help me with this form**: the overview, preparation checklist, and first step
  specified in the hackathon program. It reads field metadata, not typed answers.

The separately labeled sample mode works without Ollama and never substitutes for
a failed live analysis. Kaya explains the page in its side panel; it does not
rewrite the website, fill fields, submit forms, or guarantee that AI advice is correct.

## Try it on Windows

Requirements: Chrome/Edge 126+, Node.js 22+, and space for Ollama and the model.
From this folder in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-kaya.ps1
node scripts/serve-kaya-demo.mjs
```

If setup has already completed, use `scripts/start-kaya-ollama.ps1` instead of
`setup-kaya.ps1`. The first setup downloads the runtime and approximately 1.9 GB model.

1. Open `chrome://extensions`, enable Developer mode, and **Load unpacked** → `extension/`.
2. If already installed, select **Reload** on the Kaya Mode extension card.
3. Open `http://localhost:4173` and click Kaya Mode's toolbar icon.
4. Select **Check local AI**, then **Explain this page** → **Analyze**.
5. Try the paragraph beginning “Registration is provisional” with **Explain selected text**.
6. Choose **Help me with this form** for the checklist and first step.

Drag the panel's left edge to adjust its width. Click Kaya's toolbar icon again
when changing websites to grant temporary access. Navigation clears old answers.
Keep the panel open while analysis runs; **Cancel analysis** stops the request.

## Project map

```text
extension/         Side panel, page/form readers, local AI, and automated tests
  tests/           Unit, browser privacy/UI, and real Ollama integration tests
demo/              Fictional workshop page, selection example, and practice form
scripts/           Windows/macOS setup, local demo server, and extension packaging
docs/              Scope, architecture, setup, demo steps, and verification
.github/workflows/ Portable checks for the future repository
```

No build step or cloud API key is needed. Model weights, runtime binaries,
dependencies, test screenshots, and browser profiles stay out of Git.
The project repository is [jeepfreyy/KAYA](https://github.com/jeepfreyy/KAYA).

To get a fresh copy or update an existing checkout:

```sh
git clone https://github.com/jeepfreyy/KAYA.git
cd KAYA
```

For an existing checkout, run `git pull --ff-only`, then reload the extension in
the browser after updating. Commit or otherwise preserve local edits before pulling.

## Documentation and checks

- [Product scope and architecture](docs/kaya-project.md)
- [Windows/macOS setup and troubleshooting](docs/kaya-setup.md)
- [Demo and verification](docs/kaya-verification.md)
- [Extension modules](extension/README.md)
- [Form metadata contract](extension/FORM_READER.md)

```sh
npm ci --prefix extension
npm test --prefix extension
npm run test:browser --prefix extension
npm run test:reader --prefix extension
npm run test:live --prefix extension
```

The first three test suites need no AI model. The live suite requires installed
Chrome and local Ollama/Qwen. See the verification guide for manual checks and limits.

## Privacy and scope

Analysis stays on your computer. Form mode excludes entered values, passwords,
checked states, selected values, and uploaded file contents. Page/selection modes
exclude editable controls, but personal information already printed in page text
may be included. There is no cloud fallback, analytics, account, or saved analysis history.

Supported content is visible HTML in the active tab's main frame. PDFs, images,
embedded frames, shadow roots, custom form widgets, and browser settings pages are
outside this MVP. Long content is shortened; results do not cover an entire website.
