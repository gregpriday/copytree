# File Transforms in Copytree

File transforms let you convert, summarize, or otherwise process the contents of files after they are loaded. With transforms you can—for example—summarize Markdown files, strip out Markdown links, or convert PDFs to plain text. Transformations are applied in sequence, meaning the output of one transformer is passed as input to the next.

Copytree supports a range of built‑in transformers and makes it simple to add your own. In addition, some transformations occur automatically (for example, images are processed by the ImageDescription transformer without explicit configuration).

---

## How Transforms Work

1. **Configuration in Profiles:**  
   In your profile JSON, you include a `"transforms"` property. This property is an array of transformation configuration objects. Each object must include:
    - **rules:** An array of rule sets that determine which files should be transformed.
    - **transforms:** An array of transformer identifiers (using dot‑notation) to apply to the file content.

2. **Processing Pipeline:**  
   When Copytree processes a file, it first loads the file’s content (using the default file loader). Then, for each transform configuration where the file meets the rule criteria, the listed transformers are applied in order. The output from one transformer is passed to the next.

3. **Dot‑Notation and Namespace Resolution:**  
   Every transformer must be specified using dot‑notation. Copytree always prefixes the identifier with  
   `App\Transforms\Transformers\` and replaces each dot (`.`) with a namespace separator (`\`). For example:
    - `"Summarizers.FileSummary"` is resolved as  
      `App\Transforms\Transformers\Summarizers\FileSummary`.
    - `"Markdown.MarkdownLinkStripper"` is resolved as  
      `App\Transforms\Transformers\Markdown\MarkdownLinkStripper`.

---

## Available Transforms

Copytree comes with several built‑in transformers. Here are the ones that currently exist in the project:

- **Summarizers.FileSummary**  
  _Usage:_ Summarizes the content of files in a concise way using the OpenAI API.  
  _Example:_ Use this transformer to generate a brief summary of long source code files or documentation.

- **Markdown.MarkdownLinkStripper**  
  _Usage:_ Removes Markdown link syntax and leaves only the link text.  
  _Example:_ Clean up Markdown content for further processing or analysis.

- **Converters.DocumentToText**  
  _Usage:_ Converts documents (such as DOCX or ODT files) into plain text using Pandoc.  
  _Example:_ Turn Microsoft Word files into plain text so they can be included in the output.

- **Converters.PDFToText**  
  _Usage:_ Extracts text from PDF files.  
  _Example:_ Convert PDF documents to plain text for analysis or display.

> **Note:**  
> Some file transforms are applied automatically. For instance, image files are automatically processed using the **ImageDescription** transformer (located at `App\Transforms\Transformers\Images\ImageDescription`), PDF files are automatically converted to text using the **PDFToText** transformer (located at `App\Transforms\Transformers\Converters\PDFToText`), and documents that can be converted via Pandoc are automatically handled by the **DocumentToText** transformer (located at `App\Transforms\Transformers\Converters\DocumentToText`). You do not need to add explicit transforms configurations for these file types because the system automatically delegates to the appropriate transformer based on the file’s MIME type and conversion criteria.

---

## How to Use Transforms in a Profile

To configure transforms, add a `"transforms"` section to your profile. Transformer identifiers must use dot‑notation. For example, to transform Markdown files by generating a summary, you would use the `"Summarizers.FileSummary"` transformer.

### Example: Transforming Markdown Files

```json
{
  "rules": [
    [
      ["extension", "=", "md"]
    ]
  ],
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ],
      "transforms": [
        "Summarizers.FileSummary"
      ]
    }
  ]
}
```

In this example:
- **Rules:** Only files with the `md` extension are considered.
- **Transforms:** The transformer identifier `"Summarizers.FileSummary"` is automatically converted into the fully qualified class name  
  `App\Transforms\Transformers\Summarizers\FileSummary`.

### Extending and Adding Custom Transforms

If you need a transformer that isn’t provided out of the box, you can create your own:

1. **Create a Class:**  
   Place your custom transformer under `App\Transforms\Transformers\YourFolder\YourTransform.php`.

2. **Implement the Interface:**  
   Your transformer must implement the `FileTransformerInterface`.

3. **Reference It Using Dot‑Notation:**  
   For example, if your class is `App\Transforms\Transformers\YourFolder\MyCustomTransform`, then reference it as `"YourFolder.MyCustomTransform"` in your profile.

---

## Automatic Transforms

- **Image Files:**  
  Image files are always processed using the ImageDescription transformer (found at  
  `App\Transforms\Transformers\Images\ImageDescription`). This means you do not need to add a transforms section for image files—they are handled automatically.

- **Default File Loading:**  
  If a file does not match any transform configuration, Copytree simply uses the file content as loaded by the default file loader transformer.

---

## Summary

Transforms in Copytree allow you to post‑process file contents—whether that’s summarizing, reformatting, or converting files—before they are output. You configure transforms in your profile using a dedicated `"transforms"` section. All transformer identifiers must be provided using dot‑notation; Copytree always prefixes these identifiers with  
`App\Transforms\Transformers\` and converts dots into namespace separators. Remember that images are automatically processed, so you only need to define explicit transforms for other file types. This system is both powerful and extensible, allowing you to tailor the output to your exact needs.
