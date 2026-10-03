/* Casting Buddy — host configuration.
 *
 * This is the one file to edit if you are running or hosting your own copy.
 * It loads before the app, so everything here is applied on first load.
 * Nothing in it is required: delete a key to get the built-in default.
 *
 * Per-user preferences (theme, units, alerts …) live in the Settings screen
 * and are stored in the browser; the values below are only the *starting*
 * defaults for people who haven't changed them yet.
 */
globalThis.CPT = globalThis.CPT || {};
CPT.config = {
  /** Name shown in the header, page title and calendar exports. */
  appName: 'Casting Buddy',

  /** Character shown beside the name in the header (any text or emoji). */
  logo: '▲',

  /** Who makes it, credited beside the open-source note. Set name to '' to hide. */
  by: { name: 'Fonnwood', url: 'https://fonnwood.com' },

  /** Your privacy policy, linked from sign-in, notifications and About. privacy.html is
   *  castingbuddyapp.com's — write your own if you host a copy for others. '' hides the links. */
  privacyUrl: 'privacy.html',

  /** Where the source code lives, linked from the app ("open source" notes). '' hides the link. */
  sourceUrl: 'https://github.com/fonnwood/lost-resin-casting-buddy',

  /** Starting values for the Settings screen (see js/storage.js DEFAULT_SETTINGS). */
  defaultSettings: {
    // theme: 'dark',            // 'dark' | 'light' | 'auto'
    // tempUnit: 'C',            // 'C' | 'F'
    // clock24h: true,
    // accent: '',               // CSS colour, e.g. '#2dd4bf'; '' = theme default
  },

  /** Extra CSS appended after the app stylesheet — rebrand without touching css/app.css. */
  customCssUrl: '',             // e.g. 'my-theme.css'

  /** Hide the built-in Protocast profiles (ship only your own, see profiles/). */
  hideBuiltInProfiles: false,

  /** Optional accounts & sync (see docs/HOSTING.md). 'auto' offers sign-in only
   *  where the server provides /api; false never shows it. */
  accounts: 'auto',
  /** Where the account API lives, relative to the page. */
  apiBase: 'api',
};
