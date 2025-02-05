# Copytree

**Copytree** is a command‑line utility that copies a directory’s structure and file contents to your clipboard (or to a file) in a structured XML format. Built on the Laravel Zero framework, it offers advanced file filtering and transformation features—including AI‑assisted file selection, Git integration, and customizable rulesets—making it ideal for sharing full project context with AI assistants (such as Claude, ChatGPT, or Gemini).

> **Note:** This tool is designed exclusively for macOS. It uses native tools like `pbcopy` and `osascript` for clipboard operations.

---

## Features

- **MacOS Integration:** Uses macOS‑specific commands for clipboard management.
- **AI‑Powered Filtering:** Supports natural language file filtering (via OpenAI API) and smart filename generation.
- **Git & External Source Support:** Includes Git integration (modified/changed files filtering, changes between commits) and GitHub URL handling.
- **Ruleset-Based File Selection:** Configure inclusion and exclusion of files using JSON rulesets.
- **File Transformation Pipeline:** Built-in transformers convert images, PDFs, Markdown, and other file types into text.
- **Versatile Output Options:** Output to the clipboard, display in the console, stream output, or save to a file with an auto‑generated descriptive filename.

---

## Requirements

- **MacOS only:** The Clipboard utility checks for Darwin (macOS) and will throw an exception on other operating systems.
- **PHP 8.2 or higher**
- **Git:** Required for GitHub URL handling and repository operations.
- **Composer:** To install PHP dependencies.
- **Pandoc:** For document conversion (e.g. for transforming files via Pandoc filters)  
  *Installation example:* `brew install pandoc`  
  citeturn0search11
- **Poppler:** For PDF-to-text conversion (used by the PDF transformer)  
  *Installation example:* `brew install poppler`  
  citeturn0search5

---

## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/gregpriday/copy-tree.git
   cd copy-tree
   ```

2. **Install PHP Dependencies via Composer:**

   ```bash
   composer install
   ```

3. **Install Required Tools:**

    - **Pandoc:**  
      Install using Homebrew:
      ```bash
      brew install pandoc
      ```
      citeturn0search11

    - **Poppler:**  
      Install using Homebrew:
      ```bash
      brew install poppler
      ```
      citeturn0search5

    - **Additional Requirements:**  
      Make sure Git is installed and available in your PATH.

4. **Environment Configuration:**

   Copy or create the `.env` file in your custom environment folder (typically `~/.copytree`):

   ```bash
   mkdir -p ~/.copytree
   cp .env.example ~/.copytree/.env
   ```

   Then set your OpenAI API credentials (if you plan to use the AI‑based features):

   ```env
   OPENAI_API_KEY=your-api-key
   OPENAI_API_ORG=your-org-id
   ```

5. **Global Installation (Optional):**

   To use `copytree` as a global command, consider installing it as a PHAR. The repository includes a `box.json` file for packaging:

   ```bash
   vendor/bin/box build
   ```

   Then move the generated PHAR to a directory in your PATH.

---

## Usage

The primary command is `copy` (invoked via the CLI script `copytree`) with a variety of options to tailor its behavior.

### Basic Commands

- **Copy the Current Directory Structure to the Clipboard:**

  ```bash
  php copytree
  ```

- **Copy a Specific Directory or GitHub Repository:**

  ```bash
  php copytree /path/to/project
  php copytree https://github.com/username/repository/tree/main/src
  ```

- **AI‑Based File Filtering:**

  Use the `--ai-filter` option to pass a natural language description. For example:

  ```bash
  php copytree --ai-filter="Find all authentication related files"
  ```

- **Output Options:**

    - **Display in Console:**
      ```bash
      php copytree --display
      ```
    - **Save to a File (with AI‑generated filename):**
      ```bash
      php copytree --output
      ```
    - **Copy as a Temporary Reference:**
      ```bash
      php copytree --as-reference
      ```

- **Git Filtering:**

  To include only files modified since the last commit or between two commits:

  ```bash
  php copytree --modified
  php copytree --changes=commit1:commit2
  ```

### Ruleset and Profile Configuration

Copytree uses JSON‑formatted rulesets (located in the `rulesets/` folder or in a `.ctree` directory in your project) to control which files are included. Use the `--ruleset` option to specify a particular ruleset:

```bash
php copytree --ruleset=laravel
```

Profiles can be automatically detected by the tool based on your project structure (e.g., detecting a Laravel or SvelteKit project).

---

## Advanced Usage

- **GitHub URL Handling:**  
  Copytree can clone and cache remote GitHub repositories. For example:

  ```bash
  php copytree https://github.com/username/repository/tree/main/src --no-cache
  php copytree --clear-cache
  ```

- **File Transformation Pipeline:**  
  The system uses a pipeline of transformers (for images, PDFs, Markdown, etc.) to convert file contents as needed. Custom transformers can be added by modifying the configuration (see `config/profile.php`).

- **Smart Filename Generation:**  
  When saving output, if no filename is provided, the AI filename generator produces a descriptive hyphen‑separated filename (e.g., `user-authentication-system.txt`).

---

## Troubleshooting

- **MacOS Only:**  
  Copytree is explicitly built for macOS. If you attempt to run it on another OS, the Clipboard utility will raise an exception.
- **Clipboard Issues:**  
  Ensure that `pbcopy` and `osascript` are available in your PATH.
- **Pandoc or Poppler Errors:**  
  If file conversion fails, verify that Pandoc and Poppler are correctly installed and available.
- **OpenAI API Errors:**  
  Check that your API key and organization ID are correctly set in your `.env` file.

---

## Contributing

Contributions are welcome! If you’d like to add features or fix bugs:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and test thoroughly.
4. Submit a pull request with a detailed description of your changes.

---

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for further details.

---

## References

- Project details and documentation from [gregpriday/copy-tree on GitHub](https://github.com/gregpriday/copy-tree) citeturn0search0
- Installation instructions for Pandoc using Homebrew citeturn0search11
- Installation instructions for Poppler on macOS using Homebrew citeturn0search5

---

This README should give you a comprehensive guide to installing, setting up, and using Copytree on macOS. Enjoy capturing your project context and empowering your AI‑assisted workflows!

