# Copytree

Copytree is a command‑line utility that copies a directory’s structure and file contents to your clipboard (or to a file) in a structured XML format. Built on the Laravel Zero framework, it offers advanced file filtering and transformation features—including AI‑assisted file selection, Git integration, customizable profiles, and external source merging—making it ideal for sharing full project context with AI assistants (such as Claude, ChatGPT, or Gemini).

> **Note:** This tool is designed exclusively for macOS. It uses native tools like `pbcopy` and `osascript` for clipboard operations.

---

## Features

- **macOS Integration:** Uses macOS‑specific commands for clipboard management.
- **AI‑Powered Filtering:** Supports natural language file filtering (via the Gemini API) and smart filename generation.
- **Git & External Source Support:** Includes Git integration (filtering modified or changed files and changes between commits) and GitHub URL handling.
- **Profile‑Based File Selection:** Configure inclusion and exclusion of files using JSON profiles.
- **File Transformation Pipeline:** Built‑in transformers convert images, PDFs, Markdown, and other file types into text.
- **Smart Filename Generation:** Generates descriptive, hyphen‑separated filenames when saving output.
- **Versatile Output Options:** Copy output directly to the clipboard, display it in the console, stream it, or save it to a file.
- **External Sources:** Merge files from remote GitHub repositories or local directories into your output.

---

## Requirements

- **macOS only:** Copytree is built exclusively for macOS (it checks for Darwin and will throw an exception on other operating systems).
- **PHP 8.2 or higher**
- **Git:** Required for GitHub URL handling and repository operations.
- **Composer:** To install PHP dependencies.
- **Pandoc:** For document conversion (used in transforming certain file types).  
  Install via Homebrew:
  ```
  brew install pandoc
  ```
- **Poppler:** For PDF-to-text conversion (used by the PDF transformer).  
  Install via Homebrew:
  ```
  brew install poppler
  ```
- **Gemini API (optional):** Set your `GEMINI_API_KEY` (and optionally `GEMINI_BASE_URL`) in your environment if you plan to use AI‑based features.

---

## Installation

The recommended installation method is via Composer Global Install. Run the following command:

```
composer global require gregpriday/copytree
```

Ensure that your Composer global bin directory is in your PATH. For example, add the following line to your shell profile (e.g. `~/.bash_profile` or `~/.zshrc`):

```
export PATH="$PATH:$HOME/.composer/vendor/bin"
```

Once installed, you can invoke Copytree simply by running the `copytree` command. To make it even more convenient, you can create an alias in `~/.aliases`:

```
alias c="copytree"
```

Before using Copytree, configure your environment by creating a `.env` file in your custom environment folder (typically `~/.copytree`). For example:

```
mkdir -p ~/.copytree
cp ~/.composer/vendor/gregpriday/copytree/.env.example ~/.copytree/.env
```

Then update the `.env` file with your Gemini API credentials (if you plan to use AI‑based features).

---

## Usage

With Copytree installed globally, simply run the command from your terminal.

**Basic Commands:**
- **Copy the Current Directory Structure to the Clipboard:**
  ```
  copytree
  ```
- **Copy a Specific Directory or GitHub Repository:**
  ```
  copytree /path/to/project
  copytree https://github.com/username/repository/tree/main/src
  ```
- **AI‑Based File Filtering:**
  Use the `--ai-filter` option to pass a natural language description. For example:
  ```
  copytree --ai-filter="Find all authentication related files"
  ```
- **Output Options:**
    - **Display in Console:**
      ```
      copytree --display
      ```
    - **Save to a File (with an AI‑generated filename):**
      ```
      copytree --output
      ```
    - **Copy as a Temporary Reference:**
      ```
      copytree --as-reference
      ```
- **Git Filtering:**
  To include only files modified since the last commit or between two commits:
  ```
  copytree --modified
  copytree --changes=commit1:commit2
  ```

**Profiles:**
Copytree uses JSON‑formatted profiles to control file selection, filtering, external merging, and transformation. Place your profile files in a `.ctree` directory within your project or in a designated profiles folder. Profiles are automatically detected based on your project structure, or you can specify a profile using the `--profile` option.

---

## Profile Creation

Copytree also lets you create a new profile interactively. To generate a new profile based on your project’s files and your goals, run the following command:

```
copytree profile:create [path] [--char-limit=1500]
```

**Process:**

1. **Specify the Project Directory (Optional):**  
   If no path is provided, Copytree uses the current working directory. You can also specify a different directory.

2. **Set a Character Limit (Optional):**  
   The `--char-limit` option (default is 1500) limits the number of characters extracted per file for profile creation.

3. **Enter Profile Goals:**  
   The command will prompt you to enter the primary goals for the profile. You can enter multiple goals—press Enter without input to finish.

4. **Name Your Profile:**  
   Next, you will be asked to provide a name for your new profile (without the file extension). If you leave it blank, it defaults to “default.”

5. **Profile Generation and Saving:**  
   Copytree scans your project files, uses the Gemini API to help generate the profile data based on your goals, and then saves the profile JSON to your project’s `.ctree` directory. The generated profile is also automatically revealed in Finder for easy access.

Once created, you can use the new profile in subsequent Copytree commands with the `--profile` option.

---

## Advanced Usage

- **GitHub URL Handling:**  
  Copytree can clone and cache remote GitHub repositories. For example:
  ```
  copytree https://github.com/username/repository/tree/main/src --no-cache
  copytree cache:clear
  ```
- **File Transformation Pipeline:**  
  The system uses a pipeline of transformers (for images, PDFs, Markdown, etc.) to convert file contents as needed. Custom transformers can be added by modifying the configuration.
- **Smart Filename Generation:**  
  When saving output, if no filename is provided, the AI filename generator produces a descriptive hyphen‑separated filename (e.g. `user-authentication-system.txt`).

---

## Troubleshooting

- **macOS Only:**  
  Copytree is built exclusively for macOS. Running it on another OS will raise an exception.
- **Clipboard Issues:**  
  Ensure that `pbcopy` and `osascript` are available in your PATH.
- **Pandoc or Poppler Errors:**  
  Verify that Pandoc and Poppler are correctly installed and available.
- **Gemini API Errors:**  
  Check that your API key is correctly set in your `.env` file.

---

## Contributing

Contributions are welcome! If you’d like to add features or fix bugs:
1. Fork the repository.
2. Create a feature branch.
3. Make your changes and test thoroughly.
4. Submit a pull request with a detailed description of your changes.

---

## License

This project is licensed under the MIT License. See LICENSE.md for further details.

---

## References

- Project details and documentation are available on the GitHub repository: [https://github.com/gregpriday/copytree](https://github.com/gregpriday/copytree)
- Installation instructions for Pandoc and Poppler using Homebrew.
