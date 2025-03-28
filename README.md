# Copytree

Copytree is a command‑line utility for macOS that copies a directory's structure and the contents of its files to your clipboard (or to a file) in a structured XML format. Built on the Laravel Zero framework, it offers advanced file filtering and transformation—including AI‑assisted file selection, Git integration, customizable profiles, and external source merging—making it ideal for providing comprehensive project context to AI assistants (such as Claude, ChatGPT, and Gemini).

> **Note:** This tool is designed exclusively for macOS. It uses native tools like `pbcopy` and `osascript` for clipboard operations.

-----

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
    - [Basic Usage](#basic-usage)
    - [Output Options](#output-options)
    - [Filtering Options](#filtering-options)
- [Profiles](#profiles)
    - [Profile Creation](#profile-creation)
- [Advanced Usage](#advanced-usage)
    - [GitHub URL Handling](#github-url-handling)
    - [Conversation History Management](#conversation-history-management)
    - [File Transformation Pipeline](#file-transformation-pipeline)
    - [Smart Filename Generation](#smart-filename-generation)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [References](#references)

-----

## Features

- **macOS Integration:** Uses macOS‑specific commands for clipboard management.
- **AI‑Powered Filtering:** Supports natural language file filtering (via the Gemini API) and smart filename generation.
- **Git & External Source Support:** Includes Git integration (filtering modified or changed files and changes between commits) and GitHub URL handling.
- **Profile‑Based File Selection:** Configure inclusion and exclusion of files using JSON profiles.
- **File Transformation Pipeline:** Built‑in transformers convert images, PDFs, Markdown, and other file types into text.
- **Smart Filename Generation:** Generates descriptive, hyphen‑separated filenames when saving output.
- **Versatile Output Options:** Copy output directly to the clipboard, display it in the console, stream it, or save to a file with an automatically generated or custom filename.
- **External Sources:** Merge files from remote GitHub repositories or local directories into your output.

-----

## Requirements

- **macOS only:** Copytree is built exclusively for macOS (it checks for Darwin and will throw an exception on other operating systems).
- **PHP 8.2 or higher** (with the `fileinfo` extension enabled)
- **Git:** Required for GitHub URL handling and repository operations.
- **Composer:** To install PHP dependencies.
- **Pandoc:** For document conversion (used in transforming certain file types).  
  Install via Homebrew:
  ```bash
  brew install pandoc
  ```
- **Poppler:** For PDF-to-text conversion (used by the PDF transformer).  
  Install via Homebrew:
  ```bash
  brew install poppler
  ```
- **Gemini API (optional):** Set your `GEMINI_API_KEY` (and optionally `GEMINI_BASE_URL`) in your environment if you plan to use AI‑based features.

-----

## Installation

The recommended installation method is via Composer's `global` command. Run the following command:

```bash
composer global require gregpriday/copytree
```

Ensure that your Composer global bin directory is in your PATH. Add the following line to your shell profile (e.g. `~/.bash_profile`, `~/.zshrc`, or `~/.config/fish/config.fish`):

```bash
export PATH="$HOME/.composer/vendor/bin:$PATH"
```

Once installed, you can invoke Copytree by running the `copytree` command.  For convenience, create an alias in `~/.aliases`:

```bash
alias c="copytree"
```

Before using Copytree, configure your environment by creating a `.env` file in the Copytree configuration directory (`~/.copytree`):

```bash
mkdir -p ~/.copytree
cp ~/.composer/vendor/gregpriday/copytree/.env.example ~/.copytree/.env
```

Then update the `.env` file with your Gemini API credentials (if using AI features).

-----

## Usage

### Basic Usage

- **Copy the Current Directory Structure to the Clipboard:**

  ```bash
  copytree
  ```

- **Copy a Specific Directory or GitHub Repository:**

  ```bash
  copytree /path/to/project
  copytree https://github.com/username/repository/tree/main/src
  ```

### Output Options

- **Display in Console:**

  ```bash
  copytree --display
  ```

- **Save to a File (with an AI‑generated filename):**

  ```bash
  copytree --output
  ```

- **Save to a File (with a custom filename):**

  ```bash
  copytree --output my_output_file.txt
  ```

- **Copy as a Temporary Reference:**

  ```bash
  copytree --as-reference
  ```

### Filtering Options

- **AI‑Based File Filtering:** Use the `--ai-filter` option to pass a natural language description.

  ```bash
  copytree --ai-filter="Find all authentication related files"
  ```

- **Git Filtering:**

  To include only files modified since the last commit:

  ```bash
  copytree --modified
  ```

  To include only files changed between two commits:

  ```bash
  copytree --changes commit1:commit2
  ```

-----

## Profiles

Profiles offer granular control over which files are included, how they are processed, and whether external files are merged.

- **Default Profile:** Copytree automatically attempts to detect the project type and use an appropriate profile (e.g., `laravel`, `sveltekit`). You can override this with the `--profile` option.
- **Custom Profiles:** Create custom profiles (JSON files) in a `.ctree` directory within your project or in a designated profiles folder.
- **Specify Profile:** Use the `--profile <profile_name>` option to specify a profile.  For example, `copytree --profile frontend`.
- **Multiple Profiles** It is possible to define multiple profiles for the same project.

For full details on creating and using profiles, see the [Profile Documentation](./docs/profiles/profiles.md).

### Profile Creation

To interactively create a new profile:

```bash
copytree profile:create [path] [--char-limit=1500]
```

This command:

1.  **(Optional) Specifies the Project Directory:** If `[path]` is omitted, Copytree uses the current working directory.
2.  **(Optional) Sets a Character Limit:**  `--char-limit` (default: 1500) restricts the number of characters extracted per file for profile creation.
3.  **Prompts for Profile Goals:** Enter your goals for the profile (one per line, press Enter with no input to finish).
4.  **Prompts for a Profile Name:** Provide a name for the profile (defaults to "default" if no name is provided).
5.  **Generates and Saves the Profile:** Copytree uses the Gemini API to generate a profile based on the project files and your goals.  The profile is saved as a JSON file in the project's `.ctree` directory (e.g., `.ctree/my-profile.json`).  If no profile name is specified it will save the profile as `default.json`.

-----

## Advanced Usage

### GitHub URL Handling

Copytree can clone and cache remote GitHub repositories. It supports several URL formats:

- **Full Repository:** `https://github.com/username/repository` (clones the default branch)
- **Specific Branch:** `https://github.com/username/repository/tree/branch_name`
- **Subdirectory:** `https://github.com/username/repository/tree/branch_name/path/to/directory`

### Conversation History Management

Copytree manages conversation history for the `ask` command using migrations to set up the necessary database tables. 

- **Migrations:** When you run `copytree install:copytree`, it automatically sets up the database using migrations.
- **Using History:** To use conversation history with the `ask` command, use the `--state` option:

  ```bash
  copytree ask "What does this code do?" --state
  ```

  This generates a new state key for tracking the conversation. For subsequent questions, include the state key to continue the same conversation:

  ```bash
  copytree ask "How can I improve it?" --state=a1b2c3d4
  ```

- **Database Management:** The database for conversation history is automatically set up when needed. You don't need to run any separate commands to create or update the database structure.

### File Transformation Pipeline

Copytree uses a pipeline of transformers to process file contents.  Transformers can convert file formats, summarize content, or perform other modifications.

- **How it Works:**  When a file is processed, Copytree checks if any configured transformations apply (based on the profile's `transforms` rules).  If so, the transformers are applied in sequence, with the output of one becoming the input to the next.
- **Built-in Transformers:**
    - **`Loaders.FileLoader`:**  Loads the raw file content (default for most files).
    - **`Images.ImageDescription`:**  Generates a text description of an image using the Gemini API. (Applied automatically to image files).
    - **`Images.SvgDescription`:** Extracts width, height, and title information from SVG files. (Applied automatically to SVG files).
    - **`Converters.PDFToText`:** Converts PDF files to plain text using `pdftotext`. (Applied automatically to PDF files).
    - **`Converters.DocumentToText`:** Converts various document formats (e.g., DOCX, ODT) to plain text using Pandoc.  (Applied automatically to supported document types).
    - **`Summarizers.FileSummary`:** Generates a concise summary of text files using the Gemini API.
    - **`Markdown.MarkdownLinkStripper`:** Removes Markdown link syntax, leaving only the link text.
    - **`Markdown.MarkdownStripper`**: Converts Markdown to plain text.
    - **`HTML.HTMLStripper`:** Removes HTML tags, leaving only the plain text content.
- **Custom Transformers:**  You can add your own transformers by creating classes that implement the `App\Transforms\FileTransformerInterface` and placing them in the `app/Transforms/Transformers` directory.  Reference them in your profile using dot notation (e.g., `MyTransforms.MyCustomTransformer`).

### Smart Filename Generation

When using the `--output` option without specifying a filename, Copytree uses the Gemini API to generate a descriptive, hyphen‑separated filename based on the processed files (e.g. `user-authentication-system.txt`).

-----

## Configuration

Copytree uses a few configuration files to control the behaviour of the application.

- **`.env`**: This is where you will need to add your `GEMINI_API_KEY`.
- **`~/.copytree`**: This is the directory where Copytree stores its cached files, and output files.
- **`config/copytree.php`**: This file allows the customization of global file and directory exclusions.

-----

## Troubleshooting

- **macOS Only:**  
  Copytree is built exclusively for macOS. Running it on another OS will raise an exception.
- **Clipboard Issues:**  
  Ensure that `pbcopy` and `osascript` are available in your PATH.
- **Pandoc or Poppler Errors:**  
  Verify that Pandoc and Poppler are correctly installed and added to your PATH.
- **Gemini API Errors:**  
  Check that your API key is correctly set in your `.env` file.

-----

## Contributing

Contributions are welcome\! If you'd like to add features or fix bugs:

1.  Fork the repository.
2.  Create a feature branch.
3.  Make your changes and test thoroughly.
4.  Submit a pull request with a detailed description of your changes.

It is advisable to create an issue before submitting a pull request.

-----

## License

This project is licensed under the MIT License. See LICENSE.md for further details.

-----

## References

- Project details and documentation are available on the GitHub repository: [https://github.com/gregpriday/copytree](https://github.com/gregpriday/copytree)
- Installation instructions for Pandoc and Poppler using Homebrew.
