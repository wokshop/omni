# Releases

Desktop and iOS releases are cut by release-please and built on GitHub (ADR 0051).

## Shipping a release

1. Merge pull requests with Conventional Commit titles (`feat(ios): ...`, `fix(desktop): ...`).
   `PR title` fails on any other title.
2. `Release` keeps one pull request open, "chore(main): release main", with the next version and
   changelog of every app the merged work touched. Review it like any pull request.
3. Merge it. That tags `desktop-vX.Y.Z` and `ios-vX.Y.Z` for the raised apps, makes their GitHub
   releases, and starts `Desktop release` (signed, notarized, on the update feed in about 25
   minutes) and `iOS release` (in TestFlight once Apple finishes processing).

To retry or rebuild a tag: Actions, `Desktop release` or `iOS release`, Run workflow, with the tag.
To pick a version yourself, put `Release-As: 1.0.0` in the body of a commit to main.

## The `release` environment

Settings, Environments, New environment, `release`. Under Deployment branches and tags, allow only
`main`: every release job runs from main (the release workflow on a push, or Run workflow on main),
so no other branch can read these. Each secret is a file on the Mac today; it goes in once.

### Secrets

| Name                               | What                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ASC_API_KEY_P8`                   | The App Store Connect API key's `.p8` file, as text (Admin role: it makes the iOS App Store profile).  |
| `IOS_DISTRIBUTION_P12_BASE64`      | The Apple Distribution certificate with its private key, exported as `.p12`, then `base64 -i cert.p12` |
| `IOS_DISTRIBUTION_P12_PASSWORD`    | The password that `.p12` was exported with.                                                            |
| `DEVELOPER_ID_P12_BASE64`          | The Developer ID Application certificate with its private key, as `.p12`, base64.                      |
| `DEVELOPER_ID_P12_PASSWORD`        | Its export password.                                                                                   |
| `DESKTOP_APP_PROFILE_BASE64`       | The file `OMNI_APP_PROFILE` names in `apps/desktop/.env`, base64.                                      |
| `DESKTOP_EXTENSION_PROFILE_BASE64` | The file `OMNI_EXTENSION_PROFILE` names, base64.                                                       |
| `DESKTOP_UPDATER_PRIVATE_KEY`      | The file `TAURI_SIGNING_PRIVATE_KEY_PATH` names, as text.                                              |
| `DESKTOP_UPDATER_KEY_PASSWORD`     | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, if the key has one.                                              |
| `CLOUDFLARE_API_TOKEN`             | A token with Workers R2 Storage edit on the account, for uploads to the release bucket.                |

`RELEASE_PLEASE_TOKEN` is a repository secret, optional: a fine-grained token on this repository
with Contents and Pull requests read and write. With it, `Checks` runs on the release pull request
by itself and release tags start workflows.

### Variables

| Name                          | What                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `APPLE_TEAM_ID`               | The Apple team that signs both apps.                                     |
| `ASC_KEY_ID`, `ASC_ISSUER_ID` | The App Store Connect API key's ID and issuer ID.                        |
| `DESKTOP_SIGNING_IDENTITY`    | `APPLE_SIGNING_IDENTITY` from `apps/desktop/.env`.                       |
| `DESKTOP_UPDATER_PUBKEY`      | The contents of `<TAURI_SIGNING_PRIVATE_KEY_PATH>.pub`.                  |
| `OMNI_DESKTOP_ORIGIN`         | The server releases are served from, e.g. `https://omnidirectional.app`. |
| `OMNI_DESKTOP_BUNDLE_ID`      | Optional; default `app.omnidirectional.desktop`.                         |
| `OMNI_DESKTOP_APP_GROUP`      | Optional; default `group.<bundle id>`.                                   |
| `OMNI_DESKTOP_RELEASE_BUCKET` | Optional; default `omni-desktop`.                                        |
| `CLOUDFLARE_ACCOUNT_ID`       | The Cloudflare account that holds the bucket.                            |
| `EXPO_PUBLIC_OMNI_API_URL`    | The origin the iOS app talks to, e.g. `https://omnidirectional.app`.     |
| `OMNI_IOS_BUNDLE_ID`          | The iOS app's bundle ID in App Store Connect.                            |
| `OMNI_IOS_NAME`               | Optional; the app's name under its icon (default `Omni`).                |
| `OMNI_IOS_SCHEME`             | Optional; the app's URL scheme (default `omni`).                         |

## Cost

Both release jobs run on macOS, billed at about ten Linux minutes each (docs/operations/ci-runners.md):
about 25 minutes for the desktop app and 20 for iOS. Nothing else in `Release` uses macOS; the
release pull request job takes seconds on Linux.
