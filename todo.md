## Phase 1: Core Foundation (Complete)

[x] Storage Engine, Dashboard, PTY integration, and Local LLM Recon Loop.
[x] Reporting Engine (generateReport logic in reporting.ts).

## Phase 2: Advanced Bug Bounty Features

1. [ ] Wiring Up the Reporting Engine
   - Expose `generateReport` via IPC in `main.ts`.
   - Add "Generate Final Report" button in `ProjectDetails.tsx`.

2. [ ] Payload & Wordlist Library
   - [x] Create `PayloadLibrary.tsx` component.
   - [ ] Quick-copy cheat sheet for XSS, SQLi, LFI, SSRF.
   - [ ] Wordlist integration (reference SecLists paths).

3. [ ] Settings & Tool Management
   - [ ] Create `Settings.tsx` UI.
   - [ ] LLM Model selection (e.g., llama3, mistral).
   - [ ] Dependency Checker (verify `nmap`, `nuclei`, `subfinder`, etc. are installed).

4. [ ] Visual Recon Integration
   - [ ] Prompts to instruct AI to use `gowitness` or `aquatone`.
   - [ ] "Images" tab in Project Details to view `recon/` screenshots.
