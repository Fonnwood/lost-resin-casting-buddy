# Customising

Three levels, depending on who you are.

## As a user (Settings screen, saved in your browser)

Theme (dark / light / system), accent colour, text size, °C / °F, 12 / 24-hour clock, keep-screen-awake, every alert individually, and your own **Custom CSS**. Profiles are fully editable — see [PROFILES.md](PROFILES.md).

## As a host (edit `config.js`)

For a copy you run or host for others:

| Key | Effect |
|---|---|
| `appName`, `logo` | Header, page title, home-screen name. |
| `sourceUrl` | The "open source" link in the app (Settings → About and the home screen). `''` hides it. |
| `defaultSettings` | Starting values for anyone who hasn't chosen their own (e.g. `{ tempUnit: 'F' }`). |
| `profiles` | Extra profiles shown to everyone. |
| `hideBuiltInProfiles` | Don't ship the Protocast examples. |
| `customCssUrl` | A stylesheet loaded after the app's. |
| `accounts` | `'auto'` (default) offers optional sign-in where the server provides `/api`; `false` hides it. See [HOSTING.md](HOSTING.md). |

Also change `name`/`short_name` in `manifest.webmanifest` and the icons in `icons/` for a fully rebranded install.

## As a developer (fork it)

There's no build step; edit and reload. See [ARCHITECTURE.md](ARCHITECTURE.md).

### Theme variables

All colours and sizes are CSS variables on `:root` in `css/app.css`. Override them in Custom CSS or `customCssUrl`:

```css
:root {
  --bg: #0b0c0e;  --card: #17191d;  --text: #f3f1ec;  --muted: #a3a7b0;
  --accent: #ff9a3c;  --accent-ink: #1a0f00;      /* primary buttons */
  --ok: #4fd18b;  --warn: #ffd23f;  --danger: #ff5d5d;  --info: #7cc4ff;
  --radius: 14px;  --tap: 56px;                   /* corner radius, minimum tap size */
}
:root[data-theme="light"] { /* light-theme equivalents */ }
```
