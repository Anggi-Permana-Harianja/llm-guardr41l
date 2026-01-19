# LLM Guardr41l Presets

**Your AI seatbelt. Pick a preset and go.**

Don't write rules from scratch. Start with an opinionated preset that matches your project.

## Quick Start

```bash
# Copy a preset to your project root
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/safe-default.yaml
```

That's it. You're protected.

---

## Available Presets

### Core Presets (Start Here)

| Preset | Best For | Why It Spreads |
|--------|----------|----------------|
| **[safe-default](safe-default.yaml)** | Everyone | Stops "AI went wild". Zero config. **Start here.** |
| **[no-surprises](no-surprises.yaml)** | Burned by Copilot | "I asked for one function. Why did it touch 12 files?" |
| **[no-bad-practices](no-bad-practices.yaml)** | Code quality | Everyone hates `console.log` and `// TODO` in PRs |
| **[dependency-lockdown](dependency-lockdown.yaml)** | Enterprise/Backend | This preset alone is worth the install. |
| **[ai-on-leash](ai-on-leash.yaml)** | Cautious devs | Perfect for legacy codebases and **Fridays**. |

### Domain-Specific Presets

| Preset | Best For | Key Features |
|--------|----------|--------------|
| **[web-app](web-app.yaml)** | React, Vue, Angular | XSS protection, bundle control, TypeScript safety |
| **[backend-api](backend-api.yaml)** | Node, Python, Go | No secrets, no SQL injection, no PII in logs |
| **[enterprise-safe](enterprise-safe.yaml)** | SOC2, HIPAA, PCI | Maximum safety, full audit trail, clean PRs |

---

## Preset Details

### safe-default.yaml
**THE RECOMMENDED STARTING POINT**

Install → Protected. Zero config needed.

- Blocks new dependencies unless explicitly allowed
- Blocks edits touching more than 3 files
- Blocks edits exceeding 100 lines
- Blocks formatting-only changes
- Blocks renaming public exports

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/safe-default.yaml
```

**Why it works:** Stops "AI went wild" instantly. Zero debate.

---

### no-surprises.yaml
**For developers burned by Copilot**

"I asked for one function. Why did it touch 12 files?"

- No edits outside the active file (1 file max)
- No file creation without confirmation
- No test snapshot rewrites
- No surprise imports
- No JSDoc spam

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/no-surprises.yaml
```

---

### no-bad-practices.yaml
**Extremely popular. People hate AI clutter.**

- No `console.log`, `print`, `debugger`
- No `TODO` / `FIXME` comments
- No commented-out code
- No unused imports
- No TypeScript escape hatches (`: any`, `@ts-ignore`)

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/no-bad-practices.yaml
```

**Why it spreads:** Everyone hates reviewing PRs with `console.log("here")`.

---

### dependency-lockdown.yaml
**For backend and enterprise devs**

This preset alone is worth the install.

- No new dependencies
- No version bumps
- No `package.json` / lockfile edits
- Flags all new external imports

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/dependency-lockdown.yaml
```

**Perfect for:** Supply chain security, regulated industries, "we just audited our deps"

---

### ai-on-leash.yaml
**Keep your AI on a short leash**

"AI may help — but only surgically."

- Max 25 lines per change
- Max 1 file per operation
- No renames, no refactors
- No auto-imports
- No whitespace noise

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/ai-on-leash.yaml
```

**Perfect for:**
- Legacy codebases
- Risky deployments
- **Fridays**
- Mercury in retrograde

---

### web-app.yaml
**For frontend projects**

- Blocks XSS: `innerHTML`, `eval()`, `dangerouslySetInnerHTML`
- Blocks bloat: `moment`, `lodash`, `jquery`
- Enforces TypeScript: no `: any`, no `@ts-ignore`

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/web-app.yaml
```

---

### backend-api.yaml
**For server-side code**

- Blocks hardcoded secrets
- Prevents SQL injection patterns
- No PII in logs
- No stack traces to clients

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/backend-api.yaml
```

---

### enterprise-safe.yaml
**Maximum safety for regulated environments**

- Every change requires approval
- Full audit trail
- No PII exposure
- Clean PRs (no whitespace noise)
- SOC2 / HIPAA / PCI ready

```bash
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/enterprise-safe.yaml
```

---

## Combining Presets

Copy multiple presets and merge them:

```bash
# Start with safe-default, add no-bad-practices rules
cat safe-default.yaml no-bad-practices.yaml > rules.yaml
```

Or manually merge the `rules:` sections.

---

## Customizing Presets

Presets are starting points. Add your approved packages:

```yaml
- type: dependencies
  allowed:
    - react
    - axios
    - date-fns
```

---

## Contributing Presets

Have a preset for a specific use case? Open a PR!

Ideas:
- `nextjs.yaml`, `fastapi.yaml` (framework-specific)
- `healthcare.yaml`, `fintech.yaml` (industry-specific)
- `python-strict.yaml`, `rust-safe.yaml` (language-specific)

---

**Questions?** [Open a discussion](https://github.com/Anggi-Permana-Harianja/llm-guardr41l/discussions)
