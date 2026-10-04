# Ember & Ash

A small, original fantasy beat ’em up inspired by the arcade classics. Play as **Lyra, the Emberbound**, a female warrior with a sword, a crimson cape, and a little fire left in her heart. Survive three waves in a moonlit temple and defeat the Hollow Warden.

The demo uses TypeScript, Canvas 2D, and Vite. The environment is an original generated illustration; the characters, animation, particles, and combat effects are drawn with smooth vector paths. Sound effects are synthesized with Web Audio. Fonts and artwork ship locally, so gameplay needs no external services or credentials.

## Run

Use Node.js 22.12 or later; this cloud environment has Node.js 24.

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

The development server listens on all interfaces. In the cloud, use the product’s supported app/port viewing mechanism if available. This repository does not deploy or publish the game automatically.

## Play

| Action | Keyboard | Mouse / touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Onscreen directional buttons on touch devices |
| Sword combo | J (hold or tap) | Hold the left mouse button / Strike |
| Dodge | Space | Dodge |
| Ember burst | K | Right mouse button / Magic |
| Pause / resume | Escape | Pause button |

Chain three sword swings for a stronger finisher. The golden ground warning shows an enemy preparing an attack; dodge through or away from it. Magic spends one of three charges and disperses nearby projectiles. Charges regenerate over time and on hits and kills. Between waves, some health and magic are restored. Narrow screens use a camera that follows the heroine. The sound and fullscreen buttons are in the arena toolbar; sound starts muted.

## Verify

```sh
npm run build
```

The production files are written to `dist/`. Run `npm run preview` to serve them locally.

The browser smoke test requires the development server to be running. It exercises the real controls, including a complete three-wave playthrough, pause, magic, dodge, replay, sound toggling, and mobile touch movement. Read-only game telemetry is available only in development builds; the test never changes game state directly.

```sh
# In this cloud environment:
CHROMIUM_PATH=/usr/bin/chromium npm run test:smoke

# On a machine using Playwright's browser:
npx playwright install chromium
npm run test:smoke
```

Set `GAME_URL` if the development server uses a different address. Test screenshots go to the ignored `.playwright/` directory. The smoke test can take up to a few minutes because it plays the battle in real time.

## Publish with GitHub Pages

The included `.github/workflows/pages.yml` builds and deploys pushes to `main`.
Before the first deployment, open the repository on GitHub, then **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**. Commit and push the game files and workflow to `main`. The completed workflow's deployment output provides the actual playable URL. Relative asset paths support hosting under the repository's project path.

## Project map

- `src/game.ts` — simulation, enemy behavior, combat, and wave progression
- `src/renderer.ts` — original vector characters, animation, camera, and effects
- `src/main.ts` — menus, HUD, keyboard, mouse, and touch input
- `src/audio.ts` — synthesized sound effects
- `src/style.css` — responsive interface
- `public/art/sanctum.png` — original illustrated arena
- `scripts/smoke.mjs` — browser gameplay validation

This is a compact single-player demo: one arena, three enemy types, and three waves. It has no accounts, backend, multiplayer, or save system.
