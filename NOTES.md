# Event Horizon: project notes

Read this first. Claude reads it at the start of each session, so keep it current.

## How the site is deployed
- The live site is served from `public/` (Firebase Hosting, project `eventhorizenfps`).
- Every push to `main` deploys automatically in about 40 seconds (`.github/workflows/firebase-deploy.yml`).
- The game code is in `public/js/`. Files in the repository root are not used by the game.
- `server.js`, `Dockerfile` and `fly.toml` belong to an old Fly.io server. The game no longer connects to it.

## Working rules
- Every change is proposed first, and the owner says yes or no before it is committed to `main`.
- Do not add paid services (billing-required Firebase features, paid APIs, paid hosting) without asking.
- Never put secrets (API keys, GitHub tokens, passwords) in files on the public site.

## Multiplayer
- Pilots share one world through Firebase Realtime Database (`public/js/multiplayer.js`).
- Rooms: world-hub (Singularity), aegis-station, mars-outpost, cyber-void, halo-city.
- Admin commands and the Singularity Collapse write to `rooms/{room}/meta/map` and `commands/`. Only the admin account can write there.

## Maps
- Singularity Core, Aegis Station, Mars Outpost, Cyber Void, Halo City, and the shattered floor (used during a collapse). All are built in `public/js/maps.js`.
- Halo City has hollow buildings with doorways, a jump pad at each door, and stairs wrapping the back and right side of each building to the roof.
- Stairs on every map are one colour (cyan). A step rises at most 0.65 units, which `STEP_UP_HEIGHT` in `controls.js` sets.

- Endless landscape: every map has a ground plane and fog, plus props that repeat forever outside the hand-built core (trees on Halo City, boulders on Mars, rocks, crystals and rubble elsewhere). Props are made in 40 m chunks around the player (public/js/maps.js, LANDSCAPE table). Props with a box are solid.
- Halo City has a treehouse at (140, 0), outside the city: stairs up to a hut on a platform.
- The radar zooms out to fit every pilot on the map, and its canvas always matches its frame.

## Movement and combat
- Right mouse aims down sights (zoom, slower mouse, scope overlay). R reloads with an animation.
- F fires the grappling hook. C crouches while held, and tapping C dashes or slides.
- After dying you see your own body fall in third person for 2 seconds (only you can see it), then a RESPAWN button. Other pilots see you disappear and cannot shoot you while you are dead. It respawns you at a random spawn point with no living pilot within 15 metres. Shield lasts 2.5 seconds.
- Abilities: E and Q slots, chosen in the Armory. Level abilities unlock with level; Remote Car, Blink, Turret, Proximity Mine and Decoy cost 20,000 CR each (public/js/abilities.js, public/js/gadgets.js).
- Airstrike: overhead targeting view; left click calls a strike that lands after 3 seconds (150 damage within 12 m). Right click or Escape cancels. Cooldown starts only when a strike is called in.
- Gadgets (car, turret, mine, decoy) are drawn for the player who placed them only. Their damage still reaches other pilots. Other players cannot see the models yet.

## Open items
- Firestore is not created, so profile sync to Firestore fails. Create it in the Firebase console (Native mode).
- The admin password is still hardcoded in `public/js/auth.js`. Remove it and rely on Firebase sign-in.
- The admin console says "Authenticated as HACKER@gmail.com". It should match the admin account.
- Untested in game: the Halo stairs wrapping, the slide, and the Mars and Station stairs. Report anything that is unreachable or sticks.
- Shattered floor has no stairs, because its tiles move.

## Change log
- `public/changelog.html` shows the commit history of `main`, read from GitHub's public API.
