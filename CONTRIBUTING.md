# Contributing to elm327

Thank you for your interest in contributing to elm327! This guide will help you get started.

## Code of Conduct

Please be respectful and considerate of others when participating in this project.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/elm327.git
   cd elm327
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

### Building

```bash
npm run build
```

### Running Tests

```bash
npm test
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Linting

```bash
npm run lint
npm run lint:fix      # Auto-fix issues
```

## Making Changes

1. **Follow the existing code style** — the project uses ESLint and Prettier
2. **Write tests** for new features or bug fixes
3. **Update documentation** if you change the public API
4. **Keep commits focused** — one logical change per commit
5. **Use descriptive commit messages** — explain what and why

### Pull Request Process

1. Ensure your branch is up to date with the main branch
2. Run the full test suite: `npm test`
3. Run the linter: `npm run lint`
4. Build the project: `npm run build`
5. Push your branch and open a Pull Request
6. Wait for review — maintainers will review and provide feedback

### Pull Request Guidelines

- Describe the problem your PR solves
- Include relevant test cases
- Link any related issues
- Update documentation if applicable
- Keep the PR focused — avoid bundling unrelated changes

## Reporting Issues

When reporting a bug, please include:

- Node.js version (`node -v`)
- npm version (`npm -v`)
- Operating system
- OBD2 adapter model and firmware version
- Steps to reproduce the issue
- Expected vs actual behavior
- Any relevant error messages or logs

## Feature Requests

Feature requests are welcome! Please describe:

- The use case for the feature
- How it would improve the library
- Any implementation ideas you have

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
