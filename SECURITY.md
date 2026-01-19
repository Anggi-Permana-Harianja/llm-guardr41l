# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in LLM Guardr41l, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **ae.hertz.dev@gmail.com**

Include the following in your report:

1. **Description** - Clear description of the vulnerability
2. **Steps to Reproduce** - Detailed steps to reproduce the issue
3. **Impact** - What an attacker could achieve
4. **Affected Versions** - Which versions are affected
5. **Suggested Fix** - If you have ideas for remediation

### What to Expect

- **Acknowledgment** - We'll acknowledge receipt within 48 hours
- **Assessment** - We'll assess the severity and impact within 1 week
- **Resolution** - We aim to patch critical vulnerabilities within 2 weeks
- **Credit** - We'll credit you in the release notes (unless you prefer anonymity)

### Scope

The following are in scope:

- Code injection vulnerabilities
- Unauthorized file access or modification
- API key exposure
- Rule bypass vulnerabilities
- Privilege escalation

The following are out of scope:

- Vulnerabilities in dependencies (report these upstream)
- Social engineering attacks
- Physical attacks

## Security Best Practices for Users

### API Keys

- Never commit API keys to version control
- Use environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) instead of VS Code settings for sensitive keys
- Rotate keys if you suspect exposure

### Rules Configuration

- Review your `rules.yaml` before sharing publicly
- Be cautious with regex patterns that could cause ReDoS
- Use specific file patterns rather than broad wildcards

## Security Features

LLM Guardr41l includes several security-focused features:

- **No network calls** for core monitoring (works offline)
- **Local-only processing** - your code never leaves your machine unless you explicitly use LLM generation
- **Configurable logging** - control what gets logged
- **Rule-based restrictions** - prevent dangerous patterns like `eval()` or `exec()`

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

*No security issues reported yet.*
