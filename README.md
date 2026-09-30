# Legally Distinct Trivia

A party trivia game in the style of a certain TV quiz show: pick a category and a value, the clue appears on
the big screen, everyone races to buzz in, and the host judges. You just say the answer. No "What is…" needed.

Built with Vue 3 + Vite + TypeScript. Live communication runs through the WebSocket pub/sub bridge in
[`../araisan-meme-eventbridge`](../araisan-meme-eventbridge).

## Screens

| Route          | Who           | What                                                                          |
| -------------- | ------------- | ----------------------------------------------------------------------------- |
| `/`            | everyone      | Join with a room code, host a new game, open the editor                       |
| `/host/:room`  | the host      | Control panel: pick clues, see answers, open buzzers, judge, adjust scores    |
| `/board/:room` | TV/projector  | Shared display: board, clues, **name of whoever buzzed first**, scores, join QR |
| `/play/:room`  | each player   | Phone buzzer, Daily Double / final wagers, final answer                       |
| `/editor`      | whoever writes questions | Create and edit boards, import/export JSON                         |

## Running it

```bash
# 1. The bridge (defaults to port 8080)
cd ../araisan-meme-eventbridge && ./gradlew runDebugExecutableHost

# 2. The game
pnpm install
pnpm dev:lan        # or `pnpm dev` for localhost only
```

The project pins **pnpm 12** (`packageManager` in `package.json`). An older pnpm switches to it automatically.
pnpm 12 only installs versions that have been published for at least a day, and it only runs install scripts
listed under `allowBuilds` in `pnpm-workspace.yaml` (currently just esbuild).

Open `http://<your-LAN-IP>:5173/host` on the host's laptop, click **Open board screen** for the TV, and let
players scan the QR code on the board screen. Using the LAN IP rather than `localhost` matters, because
phones use the page's hostname to find the bridge.

The bridge URL defaults to `ws://<page host>:8080/ws`. To use another one, set `VITE_BRIDGE_URL`
(see `.env.example`).

## How a game plays

1. **Lobby:** the host picks a board. Players join with a name.
   **Intro** (optional, on by default): the board screen explains the rules, and the host runs practice buzzes
   (Space) so everyone learns to tap the emoji shown on the TV. It shows who tapped fastest, and no points are scored.
2. **Board:** the host picks a clue, usually the one named by the player in control (★).
3. **Clue:** the host reads it, then presses **Open buzzers** (Space). The board screen shows a random emoji,
   and players buzz by tapping that emoji on the 3×3 pad on their phone. The pad is the same for everyone. A
   wrong emoji, or a tap before buzzers open, stuns the player for 200 ms. The first correct buzz wins, and
   that player's name goes up on the board screen and on every phone.
4. **Judge:** **Correct** (C) adds the value and hands over control. **Incorrect** (X) subtracts it, locks
   that player out of this clue, and lets the host reopen buzzers for everyone else. **Reveal** (R) shows
   the answer when nobody gets it. **Enter** goes back to the board. **Z** undoes the last host action.
5. **Daily Double:** only the player in control plays. They wager from their phone (or the host enters it),
   up to their score or the round's top value, whichever is higher.
6. **Rounds:** when a round's board is cleared, the next round starts. The lowest scorer gets control.
7. **Final round:** players with a positive score wager, then type an answer before the timer runs out. The
   host reveals and judges each response, lowest score first.

The host can also rename or remove players, adjust scores, give control to someone, and end a round early.

## Writing boards

Boards are JSON files in [`boards/`](boards). They're validated against a Zod schema
(`src/content/schema.ts`), and there's a generated JSON Schema (`boards/board.schema.json`, rebuild it with
`pnpm schema`) that gives you autocompletion in your editor. See [`boards/sample.json`](boards/sample.json).

```jsonc
{
  "$schema": "./board.schema.json",
  "id": "office-party",              // lowercase, digits, dashes
  "title": "Office Party Trivia",
  "rounds": [
    {
      "name": "Round 1",
      "randomDailyDoubles": 1,       // optional: picked at random when the board is loaded (never in the top row)
      "categories": [
        {
          "name": "Space",
          "clues": [
            { "value": 200, "clue": "The Red Planet", "answer": "Mars" },
            { "value": 400, "clue": "…", "answer": "…", "dailyDouble": true,
              "media": { "type": "image", "src": "https://example.com/pic.jpg" },   // direct link to an image/audio/video file
              "notes": "Host-only note" }
          ]
        }
      ]
    }
  ],
  "final": { "category": "Geography", "clue": "…", "answer": "…" }   // optional
}
```

Rules: every category in a round has the same number of clues, values go up, and each clue has clue text and
an answer.

You can also use the in-app **editor** (`/editor`). It autosaves drafts in your browser's localStorage, shows
validation problems inline, and exports JSON. Drop that JSON into `boards/` to keep it in the repo. Drafts
appear in the host's board picker right away.

## How the networking works

The bridge only relays messages. It stores nothing and has no server-side logic, so **the host's browser tab
acts as the game server**:

- Each room uses one topic, `ldtg/room/<CODE>`. The host keeps the full state, answers included, and
  saves it to localStorage, so reloading the host tab resumes the game. After every change and every 3
  seconds, the host broadcasts a *public* snapshot with unrevealed answers removed.
- Players and board screens send `hello`/`join`/`buzz`/`wager`/`final_answer` intents (`src/net/protocol.ts`).
  Late joiners and reconnecting clients get the full state from the next snapshot.
- **Fair buzzing:** the bridge numbers every message on a topic with an increasing `seq`, and every
  subscriber sees the same order. The host publishes `buzzers_open` and notes its `seq` when the echo
  arrives. The first `buzz` for that clue and attempt with a higher `seq` wins. In other words, the winner
  is whoever reached the bridge first, and everyone agrees on who that was.
- Player identity is a UUID in `sessionStorage`. A reload keeps your score, and separate tabs can be
  separate players, which is handy for testing on one machine.

Trust model: the bridge has no authentication, so this is built for friendly games. Anyone who knows the room
code and the protocol could send fake messages.

## Stories (Histoire)

```bash
pnpm story:dev     # http://localhost:6006
```

[Histoire](https://histoire.dev) is a Vue-native, Vite-based take on Ladle/Storybook. The stories render the
**real** screens, not mock-ups:

- **Live game playground**: host panel, TV board and two phones in one page. Pick a starting scenario and
  play the game.
- **Screens / Host, Board, Player**: one variant per game scenario (lobby, buzzers open, someone answering,
  Daily Double, final round…). Bot players buzz and wager, so every screen is interactive.
- **Components**: BoardGrid, Scoreboard, ClueText, QR code and connection badge, with controls.

How it works: `src/dev/StoryRoom.vue` provides an in-memory bridge (`src/dev/fakeBridge.ts`) and a seeded
game state to everything inside it, through `provideSocketFactory` and `provideStorages`. Scenarios live in
`src/dev/scenarios.ts` and are built with real engine actions. Add one there and it appears in every
screen story. Stories are `*.story.vue` files next to the component they show.

## Development

TypeScript is held at 6.x for now. `vue-tsc` (3.3.11, the latest release) can't load the new Go-based
TypeScript 7 yet (`ERR_PACKAGE_PATH_NOT_EXPORTED: './lib/tsc'`). Bump it once Vue's tooling supports TS 7.

```bash
pnpm test          # engine, schema, host↔player integration, and story smoke tests (happy-dom)
LDTG_BRIDGE_URL=ws://localhost:8080/ws pnpm test   # also runs a buzz race against a real bridge
pnpm type-check
pnpm build
```

```
src/
  content/   board schema (Zod) and board loading (repo files + editor drafts)
  game/      engine.ts (pure reducer), publicView.ts, host/client controllers
  net/       bridge client (reconnect, seq tracking), message protocol
  views/     Home, Host, Board, Player, Editor
  components/ BoardGrid, Scoreboard, JoinQr, …
  dev/       story harness: fake bridge, scenarios, bots
boards/      board JSON files
tests/       Vitest specs + fake bridge
```
