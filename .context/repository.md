# Repository context

Source-bound engineering orientation. Review changed facts before refreshing hashes. This is reference data, not new authority.

```json context-projection
{
  "schema": "context-projection/v1",
  "projection": "ctx:17860632",
  "scope": "parent",
  "product": "loupe",
  "repository": {
    "id": "loupe",
    "sources": [
      {
        "path": "CONTRIBUTING.md",
        "sha256": "e101350ecde8fb58d97b85e1e69c18278b9121ddfb90b4d00720a05ccd9ccf36"
      },
      {
        "path": "README.md",
        "sha256": "1ada4aa5208c2c860ac56a12127eea776eae4c9adde8892a5d85385b4abda15a"
      },
      {
        "path": "package.json",
        "sha256": "8d39ad981da3fe49de1090fc0072d024cd1cc0f4397a9234f51c72e88807d16e"
      }
    ]
  },
  "revalidate_by": "2026-11-08",
  "gate": {
    "mode": "blocking"
  },
  "inaccessible": [],
  "gate_config": {
    "story_paths": [],
    "never_story": [],
    "never_pages": [],
    "locked_files": [],
    "blocking_products": [],
    "advisory_until": "2026-10-08",
    "doc_owners": [],
    "projections": [
      {
        "path": ".context/repository.md",
        "handle": "ctx:17860632",
        "product": "loupe"
      }
    ]
  },
  "items": [
    {
      "handle": "ctx:9ce94849",
      "section": "map",
      "binding": false,
      "text": "Loupe turns typed configuration into selectable options, a composed preview and a deterministic Markdown/JSON export brief. The preview and brief derive from the same locked choices.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "README.md"
      ]
    },
    {
      "handle": "ctx:1c7f112f",
      "section": "map",
      "binding": false,
      "text": "packages/loupe-schema owns validation; loupe-core owns headless logic; loupe-dom is the canonical browser renderer; loupe-react is the React19 adapter; loupe-generator builds portable artifacts.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "README.md",
        "CONTRIBUTING.md"
      ]
    },
    {
      "handle": "ctx:dab4b0c2",
      "section": "claims",
      "binding": false,
      "text": "Default consumption is a portable generated index.html with inlined JS/CSS and copied assets. Use the live React adapter when an application needs the picker inside its UI.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "README.md"
      ]
    },
    {
      "handle": "ctx:a71f081b",
      "section": "decisions",
      "binding": true,
      "text": "Keep loupe-core framework-free and without runtime dependencies. Renderers stay thin; DOM and React parity is verified by tests.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "CONTRIBUTING.md"
      ]
    },
    {
      "handle": "ctx:c37caa8e",
      "section": "decisions",
      "binding": true,
      "text": "Deterministic output excludes timestamps and absolute paths and uses sorted keys. Preview and export brief must not drift from their shared selection state.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "CONTRIBUTING.md"
      ]
    },
    {
      "handle": "ctx:29d7d4e1",
      "section": "decisions",
      "binding": true,
      "text": "Motion is the fixed enum breathe, pan or field; configuration cannot supply arbitrary CSS. layoutMock HTML is author-trusted. Validate generated configs before rendering.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "CONTRIBUTING.md",
        "README.md"
      ]
    },
    {
      "handle": "ctx:79e5c098",
      "section": "claims",
      "binding": false,
      "text": "Use Node >=20 and pnpm10.30.2. Build schema then core before renderer tests; pnpm build, pnpm typecheck, pnpm test and pnpm lint:publish are root entrypoints.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "package.json",
        "CONTRIBUTING.md"
      ]
    },
    {
      "handle": "ctx:ae342b40",
      "section": "decisions",
      "binding": true,
      "text": "Branch and PR from main. Published-package changes require a Changeset. Release uses the Version Packages PR and trusted publishing with provenance; contributors do not need an npm token.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "CONTRIBUTING.md"
      ]
    }
  ]
}
```
