# Kaya Mode setup

Requires Chrome/Edge 126+, Node.js 22+, and space for Ollama plus the approximately
1.9 GB model. Download before the demo. No API keys or cloud inference.

## Windows

From PowerShell in the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-kaya.ps1
```

This downloads official Ollama 0.40.2, verifies SHA-256 release checksums, extracts
it inside ignored .kaya-runtime/, starts a hidden loopback-only server, downloads
qwen2.5:3b, and warms it up. The execution-policy override applies only to that
process. Download progress is in .kaya-runtime/model-pull.log.

On later launches:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-kaya-ollama.ps1
node scripts/serve-kaya-demo.mjs
```

Leave the demo terminal open; Ctrl+C stops it. Ollama keeps running until stopped
or Windows restarts. To stop the project server, use Task Manager to end the
ollama.exe whose path is inside this project's .kaya-runtime/ollama/. Do not end
unrelated instances. If another server already occupies port 11434, the scripts
preserve it. Quit it yourself and rerun the start script if the extension reports
an origin-access problem.

## macOS

Install [Ollama](https://ollama.com/download) and Node.js 22+. Quit the Ollama
menu-bar application if it is already serving. From the repo root:

```sh
bash scripts/start-kaya-ollama.sh
```

Leave that terminal open. In another terminal:

```sh
ollama pull qwen2.5:3b
ollama run qwen2.5:3b ""
node scripts/serve-kaya-demo.mjs
```

The project server owns .kaya-runtime/models; CLI pull requests use that server.
Ctrl+C stops each terminal's service. These steps are provided for reproduction;
Mac execution remains unverified because this session's machine is Windows.

## Load and use

1. Open chrome://extensions (or edge://extensions); enable Developer mode.
2. Choose Load unpacked, select extension/, and pin Kaya Mode.
3. After pulling/editing files, click Reload on the extension card.
4. Open http://localhost:4173 and click the Kaya Mode toolbar icon.
5. Choose **Explain this page**, **Explain selected text**, or **Help me with this form**.
6. Select **Check local AI**, then **Analyze**. For selected text, highlight a paragraph on the practice page first.

The toolbar action grants temporary page access. Keep the side panel open during
analysis. Cancel or close it to abort. Real results say LOCAL AI RESPONSE and
show model, elapsed time, and field or excerpt count. Samples never replace live failures.
Nothing fills/submits the form or saves results after panel closure. Navigation and tab changes clear previous answers.

## Configuration and troubleshooting

The start scripts set:

```text
OLLAMA_HOST=127.0.0.1:11434
OLLAMA_ORIGINS=chrome-extension://ojmclkkncanmfmkkbilgmcmcfbnfaoid
OLLAMA_NO_CLOUD=1
OLLAMA_NUM_PARALLEL=1
OLLAMA_MODELS=<repository>/.kaya-runtime/models
```

The extension calls localhost:11434. Its manifest public key stabilizes its ID.
Ollama also permits its built-in localhost origins; no network-wide bind or
wildcard extension origin is added.

- Unavailable: start the server and select Check local AI.
- Missing model: finish setup/pull before retrying.
- Origin blocked: restart Ollama with the exact origin above. A running process
  does not inherit another shell's new settings.
- Slow first request: warm up Qwen, close heavy apps, retry. Response headers
  have a 25-second limit; the entire streamed request has a 120-second limit.
- No form: try the practice page. Native visible main-frame fields only.
- Invalid output: retry. Incomplete JSON/token-limited output is rejected.
- Busy: wait for the other request; the worker runs one inference at a time.

The side panel's Setup guide is available offline.

## Verification

```sh
npm ci --prefix extension
npm test --prefix extension
npm run test:browser --prefix extension
npm run test:reader --prefix extension
npm run test:live --prefix extension
```

Installed Chrome is used by browser tests; live testing needs its recent CDP
Extensions testing API. CI runs unit/UI/reader tests with Playwright Chromium,
not a local model. After downloads, disconnect internet while retaining localhost
and repeat Analyze before presenting. Use fictional data.

References: [Windows](https://docs.ollama.com/windows),
[Ollama configuration](https://docs.ollama.com/faq),
[chat API](https://docs.ollama.com/api/chat),
[worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

Click the Kaya toolbar icon when switching websites to grant temporary access. Drag the side panel edge to resize. Page explanations include expandable original excerpts. Page text may contain personal details already printed on the website; editable control contents are excluded.
