# Contributing to Workflow AI for VS Code

Thank you for your interest in contributing to Workflow AI! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setting Up Development Environment](#setting-up-development-environment)
- [Development Workflow](#development-workflow)
  - [Branching Strategy](#branching-strategy)
  - [Commit Messages](#commit-messages)
- [Testing](#testing)
  - [Running Tests](#running-tests)
  - [Writing Tests](#writing-tests)
- [Code Style](#code-style)
  - [TypeScript Guidelines](#typescript-guidelines)
  - [Linting](#linting)
- [Making Contributions](#making-contributions)
  - [Finding Issues](#finding-issues)
  - [Creating Pull Requests](#creating-pull-requests)
- [Code Review Process](#code-review-process)
- [Internationalization (i18n)](#internationalization-i18n)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.0.0 or later
- **npm**: Version 9.0.0 or later (comes with Node.js)
- **VS Code**: Version 1.96.0 or later
- **Git**: For version control

### Setting Up Development Environment

1. **Fork the repository**

   ```bash
   # Clone your fork
   git clone https://github.com/YOUR_USERNAME/wf-vscode.git
   cd wf-vscode
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Install the wf CLI tool**

   ```bash
   npm install -g workflow-ai
   ```

4. **Build the extension**

   ```bash
   npm run build
   ```

5. **Run the extension in development mode**

   - Open the project in VS Code
   - Press `F5` to start debugging
   - This opens a new VS Code window with the extension loaded

6. **Run the extension tests**

   ```bash
   npm run test:unit
   npm run test:e2e
   ```

## Development Workflow

### Branching Strategy

We use a simple branching model:

- **`main`** — Stable release branch
- **`develop`** — Development branch (if exists)
- **`feature/*`** — Feature branches (e.g., `feature/i18n-support`)
- **`fix/*`** — Bug fix branches (e.g., `fix/kanban-rendering`)
- **`docs/*`** — Documentation branches

**Naming conventions:**

- Use lowercase with hyphens
- Include issue number if applicable: `feature/IMPL-001-add-filter`

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning (white-space, formatting, etc.)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

**Examples:**

```
feat(i18n): add Italian and Portuguese translations

- Add package.nls.it.json and package.nls.pt.json
- Add bundle.l10n.it.json and bundle.l10n.pt.json
- Update i18n.ts to support new locales

Closes #123
```

```
fix(kanban): correct TreeItem icon rendering for blocked tickets

Fixes incorrect icon shown for tickets in blocked status.
```

## Testing

### Running Tests

The project has two types of tests:

**Unit Tests** — Test individual modules and functions:

```bash
npm run test:unit
```

**E2E Tests** — Test the extension in a real VS Code environment:

```bash
npm run test:e2e
```

**All Tests:**

```bash
npm test
```

### Writing Tests

**Unit Tests:**

- Location: `src/test/unit/**/*.test.ts`
- Framework: Mocha with TDD interface
- Coverage target: >80% for core modules

Example:

```typescript
suite('i18n - t() function', () => {
  test('should return key if translation not found', () => {
    const result = t('non.existent.key');
    assert.strictEqual(result, 'non.existent.key');
  });

  test('should substitute placeholders correctly', () => {
    const result = t('greeting', 'John');
    assert.strictEqual(result, 'Hello, John!');
  });
});
```

**E2E Tests:**

- Location: `src/test/e2e/**/*.test.ts`
- Framework: VS Code Test API
- Focus: User workflows and integration

Example:

```typescript
test('should create a new ticket via command', async () => {
  await executeCommand('workflow.newTicket');
  // ... verify ticket creation
});
```

## Code Style

### TypeScript Guidelines

We follow strict TypeScript guidelines:

1. **Strict mode enabled** — No `any` types without justification
2. **Explicit return types** — Always specify function return types
3. **Interface over type aliases** — For object shapes
4. **Const over let** — Prefer immutability
5. **Async/await over promises** — For asynchronous code

**Example:**

```typescript
// ✅ Good
export function formatTicketId(id: string): string {
  return id.toUpperCase();
}

export async function loadTicket(filePath: string): Promise<Ticket | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  // ...
}

// ❌ Avoid
function formatTicketId(id) {  // No type annotations
  return id.toUpperCase();
}
```

### Linting

We use ESLint with TypeScript support:

```bash
# Run linter
npm run lint

# Run i18n validation
npm run i18n:lint
```

**Pre-commit Hook:**

A Husky pre-commit hook automatically runs `i18n:lint` before each commit to ensure translation files are synchronized.

## Making Contributions

### Finding Issues

1. Check the [Issues page](https://github.com/workflow-ai/wf-vscode/issues)
2. Look for labels:
   - `good first issue` — Good for newcomers
   - `help wanted` — Extra attention needed
   - `bug` — Something isn't working
   - `enhancement` — New feature or improvement

### Creating Pull Requests

1. **Create a branch** from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Run tests and linter:**

   ```bash
   npm run lint
   npm run test
   ```

4. **Commit your changes** using conventional commit format

5. **Push to your fork:**

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request:**
   - Use the PR template
   - Link related issues
   - Describe your changes clearly
   - Add screenshots if UI changed

## Code Review Process

All PRs are reviewed by maintainers:

1. **Automated checks** — CI runs tests and linter
2. **Code review** — At least one maintainer reviews
3. **Feedback** — Address comments and push fixes
4. **Approval** — PR is merged after approval

**Review checklist:**

- [ ] Code follows style guidelines
- [ ] Tests pass (unit + E2E)
- [ ] i18n keys are synchronized (if applicable)
- [ ] Documentation is updated
- [ ] No security issues introduced

## Internationalization (i18n)

The extension supports multiple locales. When adding new user-facing strings:

1. **Add to base locale** (`package.nls.json`):

   ```json
   {
     "command.myCommand.title": "My Command",
     "command.myCommand.description": "Description of my command"
   }
   ```

2. **Add to bundle files** (`l10n/bundle.l10n.json`):

   ```json
   {
     "My Command": "My Command",
     "Description of my command": "Description of my command"
   }
   ```

3. **Run i18n lint** to ensure all locales are synchronized:

   ```bash
   npm run i18n:lint
   ```

4. **Update other locales** (or let translators handle it via PR)

**Supported locales:**

- `en` — English (base)
- `ru` — Russian
- `de` — German
- `fr` — French
- `es` — Spanish
- `it` — Italian
- `pt` — Portuguese
- `zh` — Chinese
- `ja` — Japanese
- `ko` — Korean

---

## Questions?

If you have questions, feel free to:

- Open an issue with the `question` label
- Join our community discussions
- Ask in the existing Discord/Slack channel (if available)

Thank you for contributing to Workflow AI! 🎉
