# Aroma Café — Web

A static website for **Aroma Café**, a fictional specialty coffee house. It was built for *Activity 3 — Git branching workflow (Parts A to G)*. The project shows a full Git Flow cycle: `main`, `develop`, `feature/*` and `hotfix/*` branches, pull requests, and a tagged `v1.0.0` release.

The UI follows a gallery-style design language (see [`docs/DESIGN.md`](docs/DESIGN.md)): full-width sections that alternate between light and dark backgrounds, tight display type, one blue accent for every interactive element (Action Blue `#0066cc`), and almost no visual chrome around the products.

## Pages

| Page | File | Description |
| --- | --- | --- |
| Home | `index.html` | Hero section, alternating product sections, origins and a review |
| Menu | `menu.html` | Filterable, searchable menu with an add-to-bag button on each item |
| Sign in | `login.html` | Sign-in and create-account form with client-side validation |
| Visit / Contact | `contact.html` | Location, opening hours (with a live open/closed status) and a contact form |

## Tech stack

- Semantic HTML5, no build step
- CSS custom properties (design tokens) in `assets/css/styles.css`, plus one stylesheet per page
- Vanilla JavaScript (ES2015+); the bag is saved in `localStorage`
- SVG product illustrations in `assets/img/`
- Accessibility basics: skip link, visible focus ring, ARIA live regions, `prefers-reduced-motion`

## Getting started

```bash
git clone https://github.com/Joshgit4905/hyperlink.git
cd hyperlink
npx http-server . -p 5173
```

Then open <http://localhost:5173>. You can also open `index.html` in a browser directly.

## Project structure

```
.
├── index.html
├── menu.html
├── login.html
├── contact.html
├── assets/
│   ├── css/   styles.css (tokens + shared components), page stylesheets
│   ├── js/    main.js (nav, bag, toast), page scripts
│   └── img/   SVG product illustrations
├── docs/DESIGN.md
├── CONTRIBUTING.md
└── README.md
```

## Branching workflow

```
main ──●────────────────────────────●──────●  v1.0.0 → v1.0.1
        \                          /      /│
develop  ●──●────●────●────●──────●      / │
             \  / \  / \  /             /  ▼
feature/*     ●●   ●●   ●●   hotfix/* ─●───┘ (merged into main and develop)
```

| Branch | Purpose |
| --- | --- |
| `main` | Production. Holds the starter files and receives only releases and hotfixes. |
| `develop` | Integration branch. Every feature is merged here through a pull request. |
| `feature/menu-page` | Menu page with filters, search and the bag |
| `feature/login-form` | Sign-in and create-account form with validation |
| `feature/contact-page` | Visit page with opening hours, location and contact form |
| `hotfix/footer-phone` | Fixes the phone number in the footer. Merged into `main` and back into `develop`. |

Releases are tagged on `main` (`v1.0.0`, `v1.0.1`). See [CONTRIBUTING.md](CONTRIBUTING.md) for the full process.

## Team

| Member | Branch |
| --- | --- |
| Joshua Rodriguez Carrera | `feature/menu-page`, `feature/login-form`, `feature/contact-page`, `hotfix/footer-phone` |

## License

Educational project. Product names and illustrations are fictional.
