# Contribution

Thank you for your interest in contributing to the Playful Sparkle SEO Audit Extension! We value contributions from the community to enhance this project for all users. Whether you're fixing bugs, adding features, improving documentation, or translating the extension, your efforts are greatly appreciated.

---

## Code of Conduct

By participating in this project, you agree to adhere to our [Code of Conduct](https://github.com/playfulsparkle/.github/blob/main/CODE_OF_CONDUCT.md). Please review it before engaging with the community.

---

## Getting Started

### Prerequisites

To contribute effectively, ensure you have:

- A basic understanding of Git and GitHub workflows
- Familiarity with SEO principles and auditing tools
- Experience with JavaScript, Node.js, and browser extension development
- Access to supported browsers (e.g., Firefox 109+ or Chrome 88+) for testing changes
- Installed dependencies using `npm install`

---

## How to Contribute

### Reporting Issues

To report an issue:

1. Review the [existing issues](https://github.com/playfulsparkle/ps_seo_audit_extension_v3/issues) to avoid duplicates.
2. Provide detailed information, including:
   - Browser and platform details
   - Steps to reproduce the issue
   - Screenshots (if applicable)
   - Relevant error logs (if available)

### Suggesting Features

To propose a new feature, open an issue and include:

- The problem your feature addresses
- A clear and concise description of the proposed solution
- Relevant use cases or examples

### Submitting Pull Requests

To submit a pull request (PR):

1. Fork the repository.
2. Create a descriptive branch:
   `git checkout -b feat/your-feature-name` or `fix/your-bug-name`
3. Commit your changes with meaningful messages.
4. Push your branch:
   `git push origin your-branch-name`
5. Open a PR with a clear title and detailed description.

---

## Pull Request Process

1. Ensure your changes are compatible with supported browsers (e.g., Firefox, Chrome).
2. Update relevant documentation (e.g., README, inline comments) as needed.
3. Test your changes in a browser environment to confirm functionality.
4. Submit your PR for review. Maintainers may request changes.
5. Once approved, your contribution will be merged into the project.

---

## Style Guidelines

### Code Standards

- Follow [JavaScript Standard Style](https://standardjs.com/) for code formatting.
- Use descriptive and meaningful names for variables and functions.
- Add comments to clarify complex logic.

### Commit Messages

- Write in present tense (e.g., "Add feature" instead of "Added feature").
- Limit the first line to 72 characters.
- Provide additional details in the body if necessary.

### Translations

To contribute translations:

1. Update the appropriate language files in `/_locales/`.
2. Test the translations in your browser environment.
3. Submit a PR with the updated language files and specify the locale.

---

## Testing Guidelines

To ensure the quality of your contributions:

- Test changes in a local or test browser environment.
- Validate edge cases, such as different SEO configurations or website structures.
- Confirm that your changes do not conflict with core functionality.
- Use browser developer tools to debug and verify behavior.
- Run `npm run debug` to test the extension in a live browser environment.

---

## Build and Development

### Building the Extension

To build the extension for different browsers:

- **For Firefox**: Run `npm run build:firefox`
- **For Chrome**: Run `npm run build:chrome`

The built files will be located in the `dist/` directory under the respective browser folder.

### Debugging the Extension

To debug the extension in a browser:

1. Run `npm run debug` to start the extension in a live browser environment.
2. Use browser developer tools to inspect and debug the extension.

---

## License Agreement

By contributing to this project, you agree that your work will be licensed under the project's [MIT License](LICENSE).

---

## Contributor Recognition

We value and acknowledge significant contributions. Contributors may be recognized in:

- The project's README
- Release notes
- A dedicated "Contributors" section

---

## Questions or Support?

If you have any questions or need assistance, feel free to reach out via:

- [GitHub Issues](https://github.com/playfulsparkle/ps_seo_audit_extension_v3/issues)
- [support@playfulsparkle.com](mailto:support@playfulsparkle.com)
