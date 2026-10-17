#!/usr/bin/env bash
set -Eeuo pipefail

# Safely update SpeakUp AI and start the local development app without deleting local files.
# Run from any directory: bash scripts/update-and-run.sh

log() { printf '\n[%s] %s\n' "SpeakUp AI" "$*"; }
fail() { printf '\n[SpeakUp AI] ERROR: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "Git is required."
command -v node >/dev/null 2>&1 || fail "Node.js is required (20.9+)."
command -v npm >/dev/null 2>&1 || fail "npm is required (20.9+)."

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "This script must be inside the SpeakUp AI Git repository."

# Never destroy local work. Refuse to update when tracked edits or untracked files exist.
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  fail "Local changes or untracked files are present. Commit or stash them manually, then rerun this script. No local files have been deleted."
fi

BRANCH="$(git branch --show-current)"
[[ -n "$BRANCH" ]] || fail "Could not determine the current Git branch."
log "Updating branch '$BRANCH' from its configured remote..."
git pull --ff-only || fail "Git update failed. Check your network, branch, and local Git state."

[[ -f .env.example ]] || fail ".env.example is missing."
if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  log "Created .env.local from .env.example."
else
  log "Keeping your existing .env.local unchanged."
fi

# Keep .env.local exactly as configured by the user.

# Read only the two expected settings without sourcing the env file as shell code.
OLLAMA_BASE_URL="$(sed -n 's/^OLLAMA_BASE_URL=//p' .env.local | tail -n 1)"
OLLAMA_MODEL="$(sed -n 's/^OLLAMA_MODEL=//p' .env.local | tail -n 1)"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1:8b}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL%/}"

if [[ ! -d node_modules ]]; then
  log "Installing npm dependencies..."
else
  log "Installing/updating npm dependencies..."
fi
npm install

if ! command -v ollama >/dev/null 2>&1; then
  fail "Ollama CLI was not found. Install Ollama from https://ollama.com/download, then rerun this script."
fi

if ! curl --silent --fail "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
  # Only auto-start the standard local Ollama endpoint. Never start a local
  # daemon when the configured endpoint is remote or uses a custom address.
  case "$OLLAMA_BASE_URL" in
    http://127.0.0.1:11434|http://localhost:11434)
      log "Ollama API is not responding; attempting to start 'ollama serve'..."
      nohup ollama serve >/tmp/speakup-ollama.log 2>&1 </dev/null &
      for _ in {1..20}; do
        if curl --silent --fail "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
          break
        fi
        sleep 1
      done
      curl --silent --fail "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1 || fail "Ollama did not start. Check /tmp/speakup-ollama.log and confirm OLLAMA_BASE_URL points to your Ollama server."
      ;;
    *)
      fail "Ollama is not responding at ${OLLAMA_BASE_URL}. Start that Ollama server and verify OLLAMA_BASE_URL before rerunning this script; remote/custom endpoints are not started automatically."
      ;;
  esac
fi

# Respect OLLAMA_BASE_URL for CLI commands too; otherwise a remote endpoint
# can respond to HTTP checks while model checks and pulls accidentally target
# the machine running this script.
if ! OLLAMA_HOST="$OLLAMA_BASE_URL" ollama list | awk 'NR > 1 { print $1 }' | grep -Fxq "$OLLAMA_MODEL"; then
  log "Model '$OLLAMA_MODEL' is not installed at $OLLAMA_BASE_URL; downloading it now..."
  OLLAMA_HOST="$OLLAMA_BASE_URL" ollama pull "$OLLAMA_MODEL" || fail "Could not download model '$OLLAMA_MODEL' from $OLLAMA_BASE_URL. Check the model name, server permissions, and available disk space."
fi

log "Using Ollama model: $OLLAMA_MODEL"
log "Starting SpeakUp AI. Open http://localhost:3000 in your browser."
log "Press Ctrl+C to stop the development server."
exec npm run dev
