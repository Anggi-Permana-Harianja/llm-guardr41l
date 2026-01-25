# GIF Assets for README

Place your demo GIFs here with these exact filenames:

| File | Description | What to Show |
|------|-------------|--------------|
| `01-rules.gif` | Rules setup | Creating rules.yaml, showing different rule types |
| `02-review.gif` | Review/Diff | Pasting forbidden code, seeing violations, clicking Reject or Approve |
| `03-metrics.gif` | Metrics dashboard | Opening metrics, showing approval/rejection rates, trends |
| `04-audit.gif` | Audit logs | Running "View Logs" command, showing rule_update entries |

## Recording Tips

1. Use a clean VS Code window
2. Increase font size for readability
3. Keep GIFs under 10MB (optimize with gifsicle)
4. Aim for 5-15 seconds per GIF
5. Use the demo folder (`/demo`) for recording

## Demo Flow for Each GIF

### 01-rules.gif
1. Show empty project
2. Run "Guardrail: Generate Rules"
3. Pick a template
4. Show the generated rules.yaml

### 02-review.gif
1. Open a code file
2. Paste forbidden code (use demo/PASTE-THIS.txt)
3. Show violations appearing
4. Click "Reject" to revert OR "Approve and update rules"

### 03-metrics.gif
1. Run "Guardrail: Show Metrics Dashboard"
2. Show approval/rejection rates
3. Show violation trends chart
4. Show export option

### 04-audit.gif
1. Run "Guardrail: View Logs"
2. Show log entries with timestamps
3. Highlight a RULE_UPDATE entry showing what changed
