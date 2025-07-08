# gcundo \u00b7 Cascading Undo/Redo for Gemini CLI

[![npm](https://img.shields.io/npm/v/gcundo?color=%23cb3837&label=npm%20package)](https://www.npmjs.com/package/gcundo)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Production-grade, file-system level undo/redo for **Gemini CLI** sessions – inspired by Claude Code’s `ccundo`, rebuilt from scratch with extra power and polish.

---

## What is `gcundo`?
`gcundo` is a lightweight CLI companion that logs every file mutation your Gemini CLI session performs and lets you travel back (or forward) in time – safely and *cascadingly*. From a single command you can list history, preview diffs, undo or redo any point in the timeline, and recover from mistakes instantly.

Designed & engineered by **Abdul Ateeb**, released under the MIT license.

---

## ✨ Features

* **Cascading undo/redo** – revert a single operation *and everything after it*, or re-apply later.
* **Zero-config** – drop-in, no hooks or wrappers required.
* **Rich previews** – inspect a change before executing destructive actions.
* **Human-readable log** – JSONL stored at `logs/log.jsonl`.
* **Automatic backups** – originals preserved under `~/.gcundo/backups`.
* **Colourful UX** – powered by `chalk`; commands/indices highlighted for clarity.
* **Cross-platform** – Node.js, works on Mac, Linux, Windows.

---

## 📦 Installation
```bash
npm install -g gcundo     # global install
```
> Requires Node.js ≥ 14.

---

## 🚀 Quick Start
```bash
# List all recorded operations (most recent last)
gcundo list

# Preview what will be undone at index 5
gcundo preview 5

# Undo operation 5 and everything after it
gcundo undo 5

# Regret it? Redo from the same index
gcundo redo 5
```

---

## 🛠 CLI Commands

| Command | Description |
|---------|-------------|
| `gcundo list` | Print indexed history of operations. |
| `gcundo preview <index>` | Show a coloured diff / summary of what undo/redo will do. |
| `gcundo undo <index>` | Undo *index* and every later operation (cascade). |
| `gcundo redo <index>` | Redo *index* and onward (cascade). |

*Indices are **1-based** in the UI (internally 0-based).*  
Run `gcundo --help` to print usage anytime.

---

## 🔁 Cascading Behaviour
Unlike simple stack-based undo, *cascading* means choosing index **N** rewinds all changes **N..latest** in one sweep. The log remains intact – you can still redo forward in a single command.

Why? This mirrors how humans reason about checkpoints rather than micro-steps, and avoids half-applied states.

---

## 📑 Log Format (`logs/log.jsonl`)
Each line is a standalone JSON object:
```jsonc
{
  "id": "fc0b8e9d",          // unique per operation
  "timestamp": 1720461672000,
  "type": "file_edit",        // file_create | file_edit | file_delete
  "file": "src/index.js",
  "before": "old contents...", // omitted for create
  "after":  "new contents..."  // omitted for delete
}
```
The file grows append-only and can be inspected or version-controlled.

---

## 🗄 Backup Behaviour
Before mutating the working tree, `gcundo` copies the current file to:
```
~/.gcundo/backups/<operation-id>-<undo|redo>.bak
```
This guarantees a safety net even in the rare case of an unexpected crash.

---

## 📂 Project Layout
```
gcundo/
├── cli.js              # entry point
├── core/               # business logic
│   ├── undo.js
│   ├── redo.js
│   ├── list.js
│   ├── preview.js
│   ├── sessions.js     # multi-session utilities (WIP)
│   └── ...
├── logs/log.jsonl      # generated runtime log
├── README.md           # you are here
└── package.json
```

---

## ⚙️  How It Works
1. Gemini CLI invokes code that creates/edits/deletes files.
2. Wrapper helpers inside **gcundo** capture those events and append to `logs/log.jsonl` with full *before*/*after* bodies.
3. On **undo/redo**:
   * Resolve absolute path.
   * Backup the current on-disk version.
   * Apply *before* or *after* content according to operation type.
   * Iterate in reverse (undo) or forward (redo) for cascading effect.
4. Console output is colourised via `chalk` for fast scanning.

---

## 🛣 Roadmap
* [ ] **Session switching** – save multiple named timelines.
* [ ] **Directory create/delete support**
* [ ] **Git-aware diff previews**
* [ ] **Plugin hooks** for custom operation types.
* [ ] **Typed API** for programmatic integration.

---

## 🤝 Contributing
PRs and issues are welcome! Please:
1. Fork the repo and create a feature branch.
2. Run `npm test` (tests coming soon).
3. Open a pull-request describing the change.
4. Ensure commits are signed off (DCO).

---

## 📝 License
MIT © 2025 Abdul Ateeb
