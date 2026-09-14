# Translations

Every Electron controller string lives here. Use one JSON file per language.

Adding a language needs no code changes. Drop a locale JSON file into this
directory and the app discovers it automatically.

## Add a Language

1. Copy `en.json` to `<code>.json` using a BCP-47 code, such as `fr.json`,
   `de.json`, or `pt-PT.json`.
2. Translate values, never keys.
3. Fill `meta.name` with native label shown in language picker.
4. Keep placeholders like `{value}` and `{field}` intact; runtime replaces them.
5. Save UTF-8 without BOM.

## Namespaces

| Key    | Where it shows                                 |
| ------ | ---------------------------------------------- |
| `meta` | Language metadata (`name`)                     |
| `ui`   | Electron Kindle controller interface           |
| `main` | Tray labels and main-process validation/errors |

Missing keys fall back to `en.json`.
