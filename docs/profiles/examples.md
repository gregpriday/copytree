# Copytree Profile Examples

Profiles in Copytree let you define exactly which files to copy from your project—and even merge in external files or transform file contents on the fly. A profile is a JSON document that may include the following keys:

- **rules** – An array of rule sets that specify which files to include.
- **globalExcludeRules** – An array of rule sets that, if matched, will always exclude a file.
- **always** – An object to explicitly include or exclude files by name.
- **external** – An array of external source definitions whose files are merged into the output.
- **transforms** – An array of transformation configurations that process file contents.

For a complete guide on writing profiles, see [Writing Profiles for Copytree](./profiles.md) (formerly “Writing Rulesets”).

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
11. [Common Patterns](#11-common-patterns)

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
A profile for a Python data science project. It includes Python files, Jupyter notebooks, and data files while excluding sensitive files. In addition, it merges in external documentation from a remote GitHub repository and applies a transformation to Jupyter notebooks (e.g. converting them to plain text).

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
  ],
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "ipynb"]
        ]
      ],
      "transforms": [
        "NotebookToText"
      ]
    }
  ]
}
```

---

## 3. Java Maven Project

**Description:**  
A profile for a Java Maven project. It focuses on Java source files and key Maven configuration files. This example also includes a transformation step to summarize XML configuration files.

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
  },
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "xml"]
        ]
      ],
      "transforms": [
        "XmlSummary"
      ]
    }
  ]
}
```

---

## 4. Node.js Express API

**Description:**  
A profile for a Node.js Express API project. It focuses on JavaScript and JSON files from API routes and middleware directories, while excluding common debug or sensitive files. A transformation is applied to JSON configuration files for improved readability.

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
  },
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "json"]
        ],
        [
          ["folder", "startsWith", "config"]
        ]
      ],
      "transforms": [
        "JsonFormatter"
      ]
    }
  ]
}
```

---

## 5. React Native Mobile App

**Description:**  
A profile for a React Native mobile app project. It includes JavaScript/TypeScript source files as well as native configuration files. This example shows how to merge in external configuration files from a local directory.

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
A profile for a Django web application. It filters for Python files, HTML templates, and static assets while excluding common temporary or development files. In addition, it applies a transformation to HTML template files (for example, to minify them).

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
  },
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "html"]
        ],
        [
          ["folder", "startsWith", "templates"]
        ]
      ],
      "transforms": [
        "HtmlMinifier"
      ]
    }
  ]
}
```

---

## 7. Golang Microservice

**Description:**  
A profile for a Golang microservice project that focuses on Go source files and configuration files. It also applies a transformation to YAML or TOML configuration files for better readability.

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
  },
  "transforms": [
    {
      "rules": [
        [
          ["extension", "oneOf", ["yaml", "toml"]]
        ]
      ],
      "transforms": [
        "YamlFormatter"
      ]
    }
  ]
}
```

---

## 8. Unity Game Project

**Description:**  
A profile for a Unity game project that includes C# scripts, Unity asset files, and scene files. This example also shows how to merge in shared assets from an external GitHub repository and apply a transformation to summarize C# code.

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
  ],
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "cs"]
        ]
      ],
      "transforms": [
        "CsCodeSummarizer"
      ]
    }
  ]
}
```

---

## 9. Ruby on Rails Application

**Description:**  
A profile for a Ruby on Rails application. It focuses on Ruby source files, view templates, and important configuration files, while excluding logs and temporary files. Additionally, it applies a transformation to ERB template files to generate summaries.

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
  },
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "erb"]
        ]
      ],
      "transforms": [
        "ErbTemplateSummarizer"
      ]
    }
  ]
}
```

---

## 10. Flutter Mobile App

**Description:**  
A profile for a Flutter mobile app project that focuses on Dart files and Flutter-specific configuration. In this example, external assets (such as images) from a local directory are merged into the output.

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

## 11. Common Patterns

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

---

These updated examples cover a wide range of project types and demonstrate how Copytree profiles can be used not only to filter files by type and location but also to merge in external resources and apply content transformations. Adapt these examples to your specific needs or use them as a starting point for creating your own custom profiles. Remember that each rule is applied on a file-by-file basis—ensure your rules are designed to match individual files rather than entire directories.
