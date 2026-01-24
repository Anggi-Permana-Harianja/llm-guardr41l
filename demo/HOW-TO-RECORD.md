# How to Record the Demo GIF

## Pre-Recording Setup

### 1. VSCode Setup
```
1. Press F5 in main window → "Debug Anyway"
2. In Extension Development Host window: File → Open Folder → select `demo` folder
3. Hide sidebar: Ctrl+B
4. Zoom in: Ctrl+= (3-4 times until code is clearly readable)
5. Use dark theme for better contrast
```

### 2. Verify Extension is Working
Check status bar shows:
- `Guardrail: ON`
- `Guardrail: Clean`

If you see `Guardrail: OFF` + `No Rules`, make sure `rules.yaml` is in the demo folder.

### 3. Recording Tool
- Windows: [ScreenToGif](https://www.screentogif.com/) (recommended)
- Mac: QuickTime or Kap
- Set to record just the VSCode window (not full screen)

---

## Recording Script

### GIF 1: "The Core Flow" (15 seconds)

| Time | Action | What Viewer Sees |
|------|--------|------------------|
| 0-2s | Open `app.ts` | Clean file, status bar shows `Clean` |
| 2-4s | Select all (Ctrl+A) | File highlighted |
| 4-6s | Paste from `PASTE-THIS.txt` (Ctrl+V) | AI code appears |
| 6-8s | Wait | Status changes to `2 violations`, red squiggles appear |
| 8-10s | Click on notification "Review Changes" | Diff panel opens |
| 10-13s | Pause on diff view | Show violations highlighted |
| 13-15s | Click "Reject" | Code reverts instantly, status returns to `Clean` |

### What to Paste (copy from PASTE-THIS.txt):
```typescript
import moment from 'moment';  // Forbidden!

export function calculateTotal(items: number[]): number {
  console.log('Calculating total...', items);  // Forbidden!
  const result = items.reduce((sum, item) => sum + item, 0);
  console.log('Result:', result);  // Forbidden!
  return result;
}

export function formatDate(date: Date): string {
  return moment(date).format('YYYY-MM-DD');
}
```

---

## Expected Violations

| Rule | Violation |
|------|-----------|
| Dependencies | `moment` import blocked |
| Content | `console.log` x2 blocked |

---

## Tips for Clear Recording

1. **Keep it simple** - Just show paste → detect → reject
2. **Pause on key moments** - Let viewer read violations
3. **Zoom in enough** - Status bar text should be readable
4. **Trim dead time** - Edit out any delays in post
5. **Loop it** - GIFs look better when they loop smoothly

---

## File Checklist

```
demo/
├── app.ts          ← Clean file (paste target)
├── PASTE-THIS.txt  ← Code to paste (has violations)
├── rules.yaml      ← Rules that catch violations
└── HOW-TO-RECORD.md ← This file
```

---

## After Recording

1. Trim to ~15 seconds
2. Export as GIF (optimize for web)
3. Save to project root as `demo.gif`
4. Add to README.md
