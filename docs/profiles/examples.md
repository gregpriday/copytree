# Copytree Profile Examples

Profiles in Copytree let you define exactly which files to copy from your project—and even merge in external files or transform file contents on the fly. A profile is a JSON document that may include the following keys:

- **rules** – An array of rule sets that specify which files to include.
- **globalExcludeRules** – An array of rule sets that, if matched, will always exclude a file.
- **always** – An object to explicitly include or exclude files by name.
- **external** – An array of external source definitions whose files are merged into the output.
- **transforms** – An array of transformation configurations that process file contents.  
  **Note:** Images are automatically processed via the ImageDescription transformer; you do not need to include a transforms section for images.

For a complete guide on writing profiles, see [Writing Profiles for Copytree](./profiles.md).

> **Tip:** The `FileLoader` automatically excludes common folders (e.g. `.git`, `node_modules`, `vendor`, etc.) and files (e.g. lock files, hidden files) before applying your profile rules. You can therefore focus your profile on selecting the files that matter to your project without re‑specifying these defaults.

---

## Table of Contents

1. [Basic Web Project](#1-basic-web-project)
2. [Python Data Science Project](#2-python-data-science-project)
3. [Java Maven Project](#3-java-maven-project)
4. [Node.js Express API](#4-nodejs-express-api)
5. [React Native Mobile App](#5-react-native-mobile-app)
6. [Django Web Application](#6-django-web-application)
7. [Golang Microservice](#7-golang-microservice)
8. [Unity Game Project](#8-unity-game-project)
9. [Ruby on Rails Application](#9-ruby-on-rails-application)
10. [Flutter Mobile App](#10-flutter-mobile-app)
11. [Transforming Markdown Files](#11-transforming-markdown-files)
12. [Common Patterns](#12-common-patterns)

---

## 1. Basic Web Project

**Description:**  
A simple profile for a typical web project that includes HTML, CSS, and JavaScript files. This example uses basic filtering and always‑include rules.

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["html", "css", "js"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "contains", "node_modules"],
    ["basename", "oneOf", ["package-lock.json", "yarn.lock"]]
  ],
  "always": {
    "include": ["index.html", "style.css", "script.js", "README.md"]
  }
}
```

---

## 2. Python Data Science Project

**Description:**  
A profile for a Python data science project. It includes Python files, Jupyter notebooks, and data files while excluding sensitive files. In addition, it merges in external documentation from a remote GitHub repository. (Since there isn’t a built‑in transformer for notebooks, no transforms are configured here.)

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["py", "ipynb", "csv", "json"]]
    ],
    [
      ["folder", "startsWith", "data"],
      ["extension", "oneOf", ["csv", "json", "xlsx"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "containsAny", ["__pycache__", ".ipynb_checkpoints"]],
    ["basename", "startsWith", "."],
    ["basename", "=", "large_dataset.csv"]
  ],
  "always": {
    "include": ["requirements.txt", "README.md", "setup.py"],
    "exclude": ["config.ini", "secrets.yaml"]
  },
  "external": [
    {
      "source": "https://github.com/username/datascience-docs/tree/main",
      "destination": "external-docs/",
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ]
    }
  ]
}
```

---

## 3. Java Maven Project

**Description:**  
A profile for a Java Maven project that focuses on Java source files and key Maven configuration files. This example does not include any file transforms.

```json
{
  "rules": [
    [
      ["folder", "startsWith", "src"],
      ["extension", "=", "java"]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["target", ".idea", ".settings"]],
    ["extension", "oneOf", ["class", "jar"]],
    ["basename", "=", "large-test-data.xml"]
  ],
  "always": {
    "include": ["pom.xml", "README.md", "src/main/resources/application.properties"]
  }
}
```

---

## 4. Node.js Express API

**Description:**  
A profile for a Node.js Express API project. It focuses on JavaScript and JSON files from API routes and middleware directories while excluding common debug or sensitive files. No additional transforms are specified.

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["js", "json"]]
    ],
    [
      ["folder", "startsWith", "routes"]
    ],
    [
      ["folder", "startsWith", "middlewares"]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["node_modules", "logs", "coverage"]],
    ["basename", "oneOf", [".env", "npm-debug.log", "secrets.js", "large-data-file.json"]]
  ],
  "always": {
    "include": ["package.json", "app.js", "config/database.js", "README.md"]
  }
}
```

---

## 5. React Native Mobile App

**Description:**  
A profile for a React Native mobile app project. It includes JavaScript/TypeScript source files as well as native configuration files. This example also merges in external configuration files from a local directory.

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["js", "jsx", "ts", "tsx"]]
    ],
    [
      ["folder", "startsWith", "src"]
    ],
    [
      ["folder", "startsWithAny", ["ios", "android"]],
      ["extension", "oneOf", ["swift", "kotlin", "gradle", "pbxproj", "plist", "xml"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["node_modules", "build", ".gradle", "ios/Pods", "android/.idea"]],
    ["extension", "oneOf", ["apk", "ipa"]]
  ],
  "always": {
    "include": ["App.js", "package.json", "metro.config.js", "babel.config.js", "README.md"]
  },
  "external": [
    {
      "source": "./external/native-config",
      "destination": "native-config/",
      "rules": [
        [
          ["extension", "oneOf", ["plist", "xml"]]
        ]
      ]
    }
  ]
}
```

---

## 6. Django Web Application

**Description:**  
A profile for a Django web application. It filters for Python files, HTML templates, and static assets while excluding common temporary or development files. No transforms are configured here.

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["py", "html", "css", "js"]]
    ],
    [
      ["folder", "startsWith", "templates"]
    ],
    [
      ["folder", "startsWith", "static"]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["__pycache__", "migrations", "venv", "media/large_uploads"]],
    ["basename", "oneOf", ["db.sqlite3", "local_settings.py"]]
  ],
  "always": {
    "include": ["manage.py", "requirements.txt", "README.md"]
  }
}
```

---

## 7. Golang Microservice

**Description:**  
A profile for a Golang microservice project that focuses on Go source files and configuration files. No additional transforms are specified.

```json
{
  "rules": [
    [
      ["extension", "=", "go"]
    ],
    [
      ["folder", "startsWithAny", ["cmd", "internal", "pkg"]]
    ],
    [
      ["extension", "oneOf", ["yaml", "toml", "json"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["vendor", "bin"]],
    ["extension", "=", "exe"],
    ["basename", "=", "secrets.yaml"]
  ],
  "always": {
    "include": ["go.mod", "go.sum", "Dockerfile", "Makefile", "README.md"]
  }
}
```

---

## 8. Unity Game Project

**Description:**  
A profile for a Unity game project that includes C# scripts, Unity asset files, and scene files. This example also shows how to merge in shared assets from an external GitHub repository. No transforms are configured here.

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["cs", "unity", "prefab", "mat", "asset"]]
    ],
    [
      ["folder", "startsWith", "Assets"]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["Library", "Temp", "obj", "Builds", "Assets/Plugins/Paid"]],
    ["extension", "oneOf", ["meta", "log"]]
  ],
  "always": {
    "include": ["ProjectSettings/ProjectSettings.asset", "Assets/Scenes/MainScene.unity", "README.md"]
  },
  "external": [
    {
      "source": "https://github.com/username/unity-shared-assets/tree/main",
      "destination": "shared-assets/",
      "rules": [
        [
          ["extension", "oneOf", ["prefab", "mat"]]
        ]
      ]
    }
  ]
}
```

---

## 9. Ruby on Rails Application

**Description:**  
A profile for a Ruby on Rails application. It focuses on Ruby source files, view templates, and important configuration files while excluding logs and temporary files. No transforms are configured here.

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["rb", "erb", "html", "scss", "coffee"]]
    ],
    [
      ["folder", "startsWithAny", ["app", "config", "db", "lib", "test"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["tmp", "log", "public/assets"]],
    ["basename", "oneOf", ["schema.rb", "routes.rb", "master.key", "credentials.yml.enc"]]
  ],
  "always": {
    "include": ["Gemfile", "config/database.yml", "README.md"]
  }
}
```

---

## 10. Flutter Mobile App

**Description:**  
A profile for a Flutter mobile app project that focuses on Dart files and Flutter‑specific configuration. In this example, external assets (such as images) from a local directory are merged into the output.

```json
{
  "rules": [
    [
      ["extension", "=", "dart"]
    ],
    [
      ["folder", "startsWith", "lib"]
    ],
    [
      ["folder", "startsWithAny", ["ios", "android"]],
      ["extension", "oneOf", ["swift", "kotlin", "gradle", "plist", "xml"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWithAny", ["build", ".dart_tool", ".pub-cache"]],
    ["extension", "oneOf", ["apk", "ipa", "jar"]],
    ["basename", "=", "flutter_export_environment.sh"]
  ],
  "always": {
    "include": ["pubspec.yaml", "lib/main.dart", "README.md"]
  },
  "external": [
    {
      "source": "./external/flutter-assets",
      "destination": "flutter-assets/",
      "rules": [
        [
          ["extension", "oneOf", ["png", "jpg", "svg"]]
        ]
      ]
    }
  ]
}
```

---

## 11. Transforming Markdown Files

**Description:**  
If you wish to apply a transformation to Markdown files (for example, to generate a concise summary), you can use the built‑in transformer `"Markdown.FileSummary"`. In this example, any file with the `md` extension will be processed by the transformer. (Remember, images are handled by default so you only need to specify transforms for other file types as necessary.)

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
        "Markdown.FileSummary"
      ]
    }
  ]
}
```

In this configuration, the transformer identifier `"Markdown.FileSummary"` is always prefixed with  
`App\Transforms\Transformers\` and the dot is converted to a namespace separator, so it is resolved as  
`App\Transforms\Transformers\Markdown\FileSummary`.

---

## 12. Common Patterns

Here are some frequently used patterns you can incorporate into any profile:

### Cross-Platform Path Handling
```json
{
  "globalExcludeRules": [
    ["folder", "containsAny", ["bin", "obj", "out", "build", "dist"]],
    ["extension", "oneOf", ["exe", "dll", "so", "dylib"]]
  ]
}
```

### Security-Focused Exclusions
```json
{
  "globalExcludeRules": [
    ["basename", "oneOf", [".env", "secrets.json", "credentials.json"]],
    ["extension", "oneOf", ["pem", "key", "pfx", "p12"]],
    ["folder", "contains", "secrets"]
  ]
}
```

### Development Files Only
```json
{
  "rules": [
    [
      ["extension", "oneOf", ["js", "ts", "jsx", "tsx", "vue"]],
      ["folder", "startsWith", "src"]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "contains", "test"],
    ["extension", "oneOf", ["min.js", "bundle.js"]]
  ]
}
```

### Documentation Files Only
```json
{
  "rules": [
    [
      ["extension", "oneOf", ["md", "rst", "txt"]],
      ["folder", "startsWith", "docs"]
    ],
    [
      ["basename", "=", "README.md"]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "contains", "draft"],
    ["basename", "startsWith", "_"]
  ]
}
```
