#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ollama >/dev/null || { echo 'Install Ollama from https://ollama.com/download first.'; exit 1; }
command -v node >/dev/null || { echo 'Install Node.js 22 or later first.'; exit 1; }
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_ORIGINS="chrome-extension://$(node scripts/extension-id.mjs)"
export OLLAMA_MODELS="$PWD/.kaya-runtime/models"
export OLLAMA_NO_CLOUD=1
export OLLAMA_NUM_PARALLEL=1
mkdir -p "$OLLAMA_MODELS"
echo 'Starting local Ollama. Leave this terminal open; use a second terminal to pull the model and start the demo.'
exec ollama serve
