# Changelog

## v1.1.0
- Feature: `auth-service` microservice with register, login, logout, JWKS and login rate limiting. It issues JWT access tokens (RS256, 15 min) and rotating refresh tokens (HttpOnly cookie, 7 days) with reuse detection.
- Feature: `orders-api` protected backend. It validates JWTs locally via JWKS and adds role-based access and server-side prices.
- Feature: the website now uses real authentication (in-memory access token, silent refresh) and places orders through the API.
- Fix: the `hidden` attribute now always hides components.
- Docs: authentication report in `docs/auth-report.md`, with test and HTTP evidence.

## v1.0.1
- Fix: corrected the footer phone number on all pages (`+1 (555) 014-3720`).

## v1.0.0
- First release: home, menu (search, filters, bag), login / sign-up and contact pages.
