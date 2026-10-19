# Sophia Central Mobile (React Native + Expo)

This is an Expo + React Native TypeScript starter for the Sophia Central mobile app.

Getting started

1. Install Expo CLI: `npm install -g expo-cli`
2. From this folder: `cd mobile-app`
3. Install dependencies: `npm install`
4. Start the dev server: `npm run start`

Notes
- API client is in `src/api/client.ts` and points to the backend API. Update `API_URL` in `.env` or `app.json`.
- Auth uses SecureStore for storing JWT tokens.

Features included in this scaffold:
- Auth flow (login/register)
- Basic navigation (stack + bottom tabs)
- Home, Search, Resource detail, Upload, Profile screens
- API client with token handling

Contributions welcome.
