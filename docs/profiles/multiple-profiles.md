# Using Multiple Profiles in Copytree

Copytree now supports profiles—a unified configuration system that combines file‑filtering rules (formerly “rulesets”) with external source integration and content transformation capabilities. You can define multiple profiles within a single project to selectively copy different parts of your codebase. This is particularly useful when you want to share only specific sections of your project, such as templates, admin pages, or configuration files, along with any additional processing or external files you require.

**Related documentation:**

- [Writing Profiles for Copytree](./profiles.md)
- [Profile Examples](./examples.md)
- [Fields and Operations Reference](./fields-and-operations.md)

---

## Why Use Multiple Profiles?

Large projects often have distinct modules or sections that serve different purposes. With multiple profiles you can:

1. **Template System:**  
   Define a `templates` profile that includes only files related to your templating engine (e.g. HTML, CSS, and template-specific JavaScript files). You might also merge in external documentation or apply HTML transformations (such as minification).

2. **Admin Section:**  
   Create an `admin` profile to capture all files related to administrative functionality—such as controllers, views, and models—which can be shared separately from the public-facing code.

3. **Settings and Configuration:**  
   Use a `settings` profile to include configuration files, settings views, and related controllers, isolating these from the main application code.

4. **Enhanced Integration:**  
   Leverage the new external sources and transforms features to merge files from remote repositories or apply automated content transformations (for example, summarizing or formatting files) alongside local filtering.

---

## Defining Multiple Profiles

To define multiple profiles in your project, create separate JSON files for each profile in your project’s `.ctree/` directory. The file names should correspond to the profile names you want to use. For example, to create `templates`, `admin`, and `settings` profiles, your directory might look like this:

```
.ctree/templates.json
.ctree/admin.json
.ctree/settings.json
```

Each JSON file should contain a complete profile definition that uses the new Copytree profile format. For example, a `templates.json` profile might be:

```json
{
  "rules": [
    [
      ["folder", "startsWith", "resources/views"]
    ],
    [
      ["extension", "oneOf", ["html", "blade.php", "twig", "css", "js"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "contains", "node_modules"],
    ["basename", "endsWith", ".min.css"]
  ],
  "always": {
    "include": ["resources/lang"]
  },
  "external": [
    {
      "source": "https://github.com/username/template-docs/tree/main",
      "destination": "external-templates/",
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ]
    }
  ],
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "html"]
        ]
      ],
      "transforms": [
        "HtmlMinifier"
      ]
    }
  ]
}
```

This profile:
- **Includes** all files in the `resources/views` directory that have the extensions `.html`, `.blade.php`, `.twig`, `.css`, or `.js`.
- **Excludes** any files located in folders containing `"node_modules"` or any files whose names end with `.min.css`.
- **Always includes** the `resources/lang` directory.
- **Merges in** external Markdown files from a remote repository (remapped under `external-templates/`).
- **Applies a transformation** (using the `"HtmlMinifier"` transformer) to HTML files.

---

## Using Multiple Profiles

Once you have defined your profiles, use the `--profile` (or `-p`) option with the Copytree command to select which profile to apply. For example, to copy files using the `templates` profile:

```bash
copytree --profile templates
```

This command will process the filtering, external merging, and transformation rules defined in `.ctree/templates.json` and then copy the matching files to your clipboard or designated output.

Likewise, to work with the `admin` and `settings` profiles, run:

```bash
copytree --profile admin
copytree --profile settings
```

Each command processes only the files specified by the corresponding profile, enabling you to share or process targeted subsets of your project.

---

## Summary

Using multiple profiles in Copytree lets you create targeted configurations for different parts of your project. By organizing each profile as a separate JSON file (supporting file filtering, external source merging, and content transformation), you can tailor the output precisely to your needs. Simply create your profile files in the `.ctree` directory and select the desired profile with the `--profile` option when running Copytree.
