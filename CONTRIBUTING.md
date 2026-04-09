# Contributing to EDS QA Helper

Thanks for your interest in contributing! This tool is built by AEM EDS developers, for AEM EDS developers.

## How to Contribute

### Reporting Bugs

1. Open [an issue](https://github.com/YOUR_USERNAME/eds-qa-helper/issues/new?template=bug_report.md)
2. Include: browser, environment (preview/localhost/live), steps to reproduce
3. If possible, paste the console output

### Suggesting Features

1. Open [a feature request](https://github.com/YOUR_USERNAME/eds-qa-helper/issues/new?template=feature_request.md)
2. Describe the problem you're trying to solve
3. If you have an idea for the solution, share it

### Submitting Code

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes in `src/qa-helper.js`
4. Test with `tests/edge-cases.html` — all tests should pass
5. Add edge case tests for new features
6. Submit a PR with a clear description

## Code Guidelines

- **Single file architecture**: everything lives in `src/qa-helper.js` — no build step, no bundler
- **Zero external dependencies** at runtime (html2canvas is loaded on-demand from CDN)
- **Shadow DOM isolation**: the tool's UI must never affect the host page
- **Filter QA Helper elements**: any DOM query must exclude `#qa-helper-root` to avoid self-detection
- **Tolerance over precision**: use thresholds (2px for overflow, 25 for color distance) to avoid false positives
- **Click-to-scroll**: every issue in the panel should scroll to its element when clicked
- **Comments only when they help**: don't comment obvious code, do comment non-obvious decisions

## Testing

1. Open `tests/edge-cases.html` in Chrome
2. (Optional) Paste `src/qa-helper.js` in the console for lifecycle tests
3. Click **"▶ Run Tests"** in the banner
4. Check the console for results — target: 0 FAIL

When adding new detection logic, add corresponding edge cases in `tests/edge-cases.html` with:
- A visual HTML block with `data-testid="EC-XX"`
- A test assertion in the `QATestRunner` class
- Clear expected behavior in the heading

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deep-dive into the module structure.
