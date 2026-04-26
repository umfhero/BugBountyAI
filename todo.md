# BugBountyAI Implementation Plan

1. [ ] Rename project artifacts to BugBountyAI.
2. [ ] Project Storage Setup:
   - Configure a base directory at `~/Desktop/BugBountyAI/`.
   - Setup project metadata file `projects.json`.
3. [ ] Create Dashboard UI:
   - Re-architect `App.tsx` to conditionally render `Dashboard` vs `TerminalView`.
   - Implement project listing: Name, scope, status (e.g., Found Something, Submitted).
   - Implement project creation form (Name, Scope definition).
4. [ ] Terminal View Integration:
   - When a project is opened, spawn the terminal with `cwd` set to `~/Desktop/BugBountyAI/<project_name>/`.
   - Create directories `recon/` and `findings/` inside the project folder.
5. [ ] Implement AI Recon Loop (The core logic from ai-recon-loop.html):
   - Create a "Recon Loop" UI panel or overlay for the active project.
   - Add a toggle for "Autonomous Mode" vs "Manual Gate".
   - Phase 1: Define Context (Scope rules).
   - Phase 2 & 3: Suggest Command based on scope and prior results.
   - Phase 4: Predict Gate (If autonomous is off, wait for human approval. If on, verify scope & safety automatically).
   - Phase 5: Execute command in PTY. Ensure output is saved (e.g. appending `| tee recon/...` or capturing stream).
   - Phase 6: Triage output, write to `findings/`, check for vulnerabilities.
6. [ ] Reporting Engine:
   - Write a script/module to gather markdown drafts from `findings/`.
   - Generate a comprehensive `report.md` detailing reproduction steps for triaged vulnerabilities.
