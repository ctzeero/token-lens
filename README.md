# TokenLens 🔍

A CLI tool to check token usage for Cursor and other AI providers.
<img width="732" height="305" alt="Screenshot 2026-02-28 at 4 11 03 PM" src="https://github.com/user-attachments/assets/b166254a-2ff3-49dd-879f-3505c7be48c8" />

## Features

- **Cursor**: Checks Pro/Fast request usage via browser cookies.
- **Codex**: Checks session (5h), weekly, and credits via `~/.codex/auth.json` and wham/usage API.
- **Gemini**: Checks usage via CLI OAuth and Code Assist APIs.

## Requirements

- **Homebrew or standalone binary**: No Node.js required (runtime is bundled).
- **From source**: Node.js and npm (to build and run).

## Installation

### Homebrew (macOS)

TokenLens is not in Homebrew’s main repo, so you need to add our tap once, then install:

```bash
brew tap ctzeero/tap
brew install tokenlens
```

The CLI is installed as `tlens`. If you have trouble (e.g. formula not found or outdated), run `brew update` first, then try again.

### From Source

```bash
git clone https://github.com/ctzeero/tokenlens.git
cd tokenlens
npm install
npm run build
npm link
```

Now you can run:
```bash
tlens status
```

### Standalone Binary (Mac/Linux)

Build the binary:
```bash
npm run package
```
This creates binaries in `dist/bin/`. To make `tlens` available globally from the project root:
```bash
npm link
```

## Commands

| Command | Description |
|---------|--------------|
| `tlens status [options]` | Check the status of your AI providers (Cursor, Codex, Gemini) |
| `tlens config` | Configure API keys and preferences |
| `tlens providers` | Manage AI providers |
| `tlens help [command]` | Display help for a command |

Global options: `-V, --version` · `-h, --help`

## Usage

### Check status
```bash
tlens status
```

Sample output:

```
╔╦╗ ╔═╗ ╦╔═ ╔═╗ ╔╗╔      ╦   ╔═╗ ╔╗╔ ╔═╗
 ║  ║ ║ ╠╩╗ ║╣  ║║║      ║   ║╣  ║║║ ╚═╗
 ╩  ╚═╝ ╩ ╩ ╚═╝ ╝╚╝      ╩═╝ ╚═╝ ╝╚╝ ╚═╝
TokenLens v0.1.0

Checking providers...

Note: You may be prompted to allow access to "Chrome Safe Storage" in your Keychain.
      This is required to read encrypted cookies for Cursor.
[Cursor pro]      [█░░░░░░░░░] 10% Used
   └─ Resets:      1/1/2026 (0 days)

[Codex plus]        [░░░░░░░░░░] 0% Session Used
   ├─ Session Reset: 1/1/2026 (0 days)
   └─ Weekly:        3% Used (Resets 1/1/2026 (0 days))
   └─ Credits:       0

[Gemini Code Assist] Free (sample@example.com)
   (CLI / IDE usage only)
   ├─ Pro:   [█░░░░░░░░░] 10% Used (Resets 1/1/2026 (0 days))
   └─ Flash: [░░░░░░░░░░] 1% Used (Resets 1/1/2026 (0 days))
```

### Configure
```bash
tlens config setup
```
Optional browser for Cursor (manual):
```bash
tlens config set browser chrome   # all | chrome | arc | edge | firefox | safari
```
Optional Copilot token (manual):
```bash
tlens config set copilot YOUR-TOKEN
tlens config remove copilot
```

### Providers
```bash
tlens providers list
```

## How it works

- **Cursor**: TokenLens reads session cookies from your local browser (Chrome, Arc, Edge, Safari, Firefox) to authenticate requests. You must be logged in to the Cursor web dashboard. You can optionally choose which browser to check first via `tlens config set browser <name>` or during `tlens config setup`. On macOS you may be prompted to allow Keychain access for Chrome Safe Storage (required to read encrypted cookies).
- **Codex**: Reads `~/.codex/auth.json` (or `$CODEX_HOME`); refreshes OAuth when needed; fetches usage from the wham/usage API. Log in first with the Codex CLI so the auth file exists.
- **Gemini**: Uses CLI OAuth credentials and Code Assist APIs; token refresh is handled automatically. Run `gemini login` first to connect.
- **Copilot** (config only): Optional token in `~/.config/tokenlens-nodejs/` for `tlens config set/remove copilot`.

## License
ISC
