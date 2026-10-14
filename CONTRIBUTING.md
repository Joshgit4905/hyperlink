# Contributing to Aroma Café Web

Thank you for helping build Aroma Café. This guide explains how we use branches, commits and pull requests.

## Branch model

| Branch | Created from | Merged into | Notes |
| --- | --- | --- | --- |
| `main` | — | — | Always deployable. Only receives release and hotfix merges. |
| `develop` | `main` | `main` (release) | Integration branch for finished features. |
| `feature/<name>` | `develop` | `develop` | One branch per feature or team member. |
| `hotfix/<name>` | `main` | `main` **and** `develop` | Urgent production fixes only. |

Do **not** delete `feature/*` or `hotfix/*` branches after merging. They must stay visible for review.

## Workflow

### 1. Start a feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/menu-page
```

### 2. Commit in small steps

Each feature branch must have **at least two commits**. Use the [Conventional Commits](https://www.conventionalcommits.org/) style:

```
feat(menu): add category filter chips
fix(footer): correct phone number
docs: update README with branch table
style(contact): align hours card on mobile
```

### 3. Push and open a pull request

```bash
git push -u origin feature/menu-page
```

Open a pull request **into `develop`** with:

- **Title:** a short summary, for example `feat: menu page with filters and bag`
- **Description:** what changed, why, how to test it, and screenshots for UI changes

Merge with **"Create a merge commit"** so the branch history stays visible in *Insights → Network*.

### 4. Release

1. Open a pull request from `develop` into `main` titled `Release v1.0.0`.
2. After it is merged, tag the merge commit:

   ```bash
   git checkout main && git pull
   git tag -a v1.0.0 -m "Aroma Café v1.0.0"
   git push origin v1.0.0
   ```

3. Publish a GitHub Release from the tag.

### 5. Hotfix

```bash
git checkout main && git pull
git checkout -b hotfix/footer-phone
# fix, commit, push
```

1. Open a pull request `hotfix/footer-phone` → `main` and merge it.
2. Open a second pull request `hotfix/footer-phone` → `develop` (or `main` → `develop`) so the fix also reaches `develop`.
3. Tag the patch release (`v1.0.1`).

## Code style

- HTML: semantic elements, one `<h1>` per page, `alt` text on every image, labels on every form field.
- CSS: use the tokens in `assets/css/styles.css`. Do not hard-code new colors. Action Blue `#0066cc` is the only accent.
- JS: vanilla ES2015+, no global variables except `window.Aroma`, and wrap `localStorage` calls in `try/catch`.
- Accessibility: keyboard reachable, visible focus, tap targets of at least 44 × 44 px.

## Checklist before opening a PR

- [ ] Branch is up to date with its base branch
- [ ] The page works at 375 px, 768 px and 1280 px
- [ ] No console errors
- [ ] PR has a clear title and description
