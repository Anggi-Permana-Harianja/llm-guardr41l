# How to Record the Demo GIF

## Setup
1. Install ScreenToGif: https://www.screentogif.com/
2. Open VS Code in this `demo` folder
3. Make sure LLM Guardr41l extension is enabled
4. Make sure `rules.yaml` is in this folder

## Recording Steps (Full Governance Flow)

**The GIF should show: AI code can't sneak through — developer must approve or reject.**

1. **Start ScreenToGif** — set to record your VS Code window

2. **Open `app.ts`** — show the clean file (3 seconds)

3. **Select all the code** (Ctrl+A) and **paste from `PASTE-THIS.txt`** (Ctrl+V)

4. **Wait for notification** — "Guardrail: 3 violations detected"

5. **Click "Review"** on the notification

6. **Diff preview panel opens** — pause here (3 seconds) so viewer can see:
   - Side-by-side diff (original vs new)
   - Violations listed
   - Approve/Reject buttons

7. **Click "Reject"** — code reverts to original

8. **Stop recording**

## What This Shows to EMs

| Step | What EM Sees |
|------|-------------|
| Paste AI code | "Developer uses AI tool" |
| Violations detected | "Guardrail catches issues automatically" |
| Diff preview | "Developer sees exactly what's wrong" |
| Reject | "Bad code blocked — never reaches PR" |

**This is governance, not just linting.**

## Expected Violations
- `moment` import (forbidden dependency)
- `console.log` x2 (forbidden content)

## Tips
- Keep VS Code zoomed in (Ctrl+= a few times) so text is readable
- Use a dark theme for better contrast
- Aim for 15-20 seconds total
- Trim dead time in ScreenToGif editor

## File Locations
- Clean starting file: `app.ts`
- Code to paste: `PASTE-THIS.txt`
- Rules: `rules.yaml`
