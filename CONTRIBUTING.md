# Contributing

This is the Gelhaus Solutions hard fork of Plane (see the [README](README.md)). Work happens here only: upstream changes are not pulled in, and changes made here are not sent upstream. Do not open issues or pull requests about this fork on any `makeplane` repository.

Work is tracked in Plane, not in GitHub issues. Branch from `main`, name the branch after the work item (`<type>/<work-item-id>-<short-description>`, e.g. `feat/web-1234-board-filters`), and open the pull request against `main`.

## Projects setup and Architecture

### Requirements

- Docker Engine installed and running
- Node.js version 20+ [LTS version](https://nodejs.org/en/about/previous-releases)
- Python version 3.12 and [uv](https://docs.astral.sh/uv/) (only needed to run the API outside Docker)
- Postgres version v14
- Redis version v6.2.7
- **Memory**: Minimum **12 GB RAM** recommended
  > ⚠️ Running the project on a system with only 8 GB RAM may lead to setup failures or memory crashes (especially during Docker container build/start or dependency install). Use cloud environments like GitHub Codespaces or upgrade local RAM if possible.

### Setup the project

The project is a monorepo, with backend api and frontend in a single repo.

The backend is a django project which is kept inside apps/api

1. Clone the repo

```bash
git clone https://github.com/Gelhaus-Solutions/plane.git [folder-name]
cd [folder-name]
chmod +x setup.sh
```

2. Run setup.sh

```bash
./setup.sh
```

3. Start the containers

```bash
docker compose -f docker-compose-local.yml up
```

4. Start web apps:

```bash
pnpm dev
```

5. Open your browser to http://localhost:3001/god-mode/ and register yourself as instance admin
6. Open up your browser to http://localhost:3000 then log in using the same credentials from the previous step

That’s it! You’re all set to begin coding. Remember to refresh your browser if changes don’t auto-reload. Happy contributing! 🎉

## Coding guidelines

To ensure consistency throughout the source code, please keep these rules in mind as you are working:

- All features or bug fixes must be tested by one or more specs (unit-tests).
- We lint with [OxLint](https://oxc.rs/docs/guide/usage/linter) using the shared `.oxlintrc.json` and format with [oxfmt](https://oxc.rs/docs/guide/usage/formatter) using `.oxfmtrc.json`.

## Contributing to language support

This guide is designed to help contributors understand how to add or update translations in the application.

### Understanding translation structure

#### File organization

Translations are organized by language in the locales directory. Each language has its own folder containing JSON files for translations. Here's how it looks:

```
packages/i18n/src/locales/
    ├── en/
    │   ├── core.json       # Critical translations
    │   └── translations.json
    ├── fr/
    │   └── translations.json
    └── [language]/
        └── translations.json
```

#### Nested structure

To keep translations organized, we use a nested structure for keys. This makes it easier to manage and locate specific translations. For example:

```json
{
  "issue": {
    "label": "Work item",
    "title": {
      "label": "Work item title"
    }
  }
}
```

### Translation formatting guide

We use [IntlMessageFormat](https://formatjs.github.io/docs/intl-messageformat/) to handle dynamic content, such as variables and pluralization. Here's how to format your translations:

#### Examples

- **Simple variables**

  ```json
  {
    "greeting": "Hello, {name}!"
  }
  ```

- **Pluralization**
  ```json
  {
    "items": "{count, plural, one {Work item} other {Work items}}"
  }
  ```

### Contributing guidelines

#### Updating existing translations

1. Locate the key in `locales/<language>/translations.json`.

2. Update the value while ensuring the key structure remains intact.
3. Preserve any existing ICU formats (e.g., variables, pluralization).

#### Adding new translation keys

1. When introducing a new key, ensure it is added to **all** language files, even if translations are not immediately available. Use English as a placeholder if needed.

2. Keep the nesting structure consistent across all languages.

3. If the new key requires dynamic content (e.g., variables or pluralization), ensure the ICU format is applied uniformly across all languages.

### Adding new languages

Adding a new language involves several steps to ensure it integrates seamlessly with the project. Follow these instructions carefully:

1.  **Update type definitions**
    Add the new language to the TLanguage type in the language definitions file:

```ts
// packages/i18n/src/types/language.ts
export type TLanguage = "en" | "fr" | "your-lang";
```

1.  **Add language configuration**
    Include the new language in the list of supported languages:

```ts
// packages/i18n/src/constants/language.ts
export const SUPPORTED_LANGUAGES: ILanguageOption[] = [
  { label: "English", value: "en" },
  { label: "Your Language", value: "your-lang" },
];
```

2.  **Create translation files**
    1. Create a new folder for your language under locales (e.g., `locales/your-lang/`).

    2. Add a `translations.json` file inside the folder.

    3. Copy the structure from an existing translation file and translate all keys.

3.  **Update import logic**
    Modify the language import logic to include your new language:

```ts
      private importLanguageFile(language: TLanguage): Promise<any> {
      switch (language) {
          case "your-lang":
          return import("../locales/your-lang/translations.json");
          // ...
      }
      }
```

### Quality checklist

Before submitting your contribution, please ensure the following:

- All translation keys exist in every language file.
- Nested structures match across all language files.
- ICU message formats are correctly implemented.
- All languages load without errors in the application.
- Dynamic values and pluralization work as expected.
- There are no missing or untranslated keys.

#### Pro tips

- When in doubt, refer to the English translations for context.
- Verify pluralization works with different numbers.
- Ensure dynamic values (e.g., `{name}`) are correctly interpolated.
- Double-check that nested key access paths are accurate.

Happy translating! 🌍✨
