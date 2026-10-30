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
| `/play/:room`  | each player   | Phone buzzer, audio clues, Daily Double / final wagers, final answer          |
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

1. **Lobby:** the host picks a board and the buzzer options (below). Players join with a name.
   **Intro** (optional, on by default): the board screen explains the rules, and the host runs practice buzzes
   (Space) so everyone learns how to buzz. It shows who was fastest, and no points are scored or lost.
2. **Board:** the host picks a clue, usually the one named by the player in control (★).
3. **Clue:** the host reads it, then presses **Open buzzers** (Space), and players race to buzz from their
   phones. The first buzz wins, and that player's name goes up on the board screen and on every phone. Audio
   clues also get a player on every phone, so remote players can hear them properly. Pictures and video are
   only on the board screen, unless the host turns on **media on phones**.
4. **Judge:** **Correct** (C) adds the value and hands over control. **Incorrect** (X) subtracts it, locks
   that player out of this clue, and lets the host reopen buzzers for everyone else. **Reveal** (R) shows
   the answer when nobody gets it. **Enter** goes back to the board. **Z** undoes the last host action.
5. **Daily Double:** only the player in control plays. They wager from their phone (or the host enters it),
   up to their score or the round's top value, whichever is higher.
6. **Rounds:** when a round's board is cleared, the next round starts. The lowest scorer gets control.
7. **Final round:** players with a positive score wager, then type an answer before the timer runs out. The
   host reveals and judges each response, lowest score first.
8. **Game over:** the board screen raises a podium (2nd, 1st, 3rd) and hands out awards one by one, each only
   when there's something to give it for: most right answers, fastest average buzz, closest photo finish,
   longest streak, biggest Daily Double won, comeback from the lowest score, most false starts and the
   final-round hero. Each phone shows its place and its own awards. The host can **download the results** as
   JSON (everything, clue by clue) or CSV (one row per player: rank, score, right, wrong, false starts,
   average buzz, best streak).

Along the way:
- **Photo finish:** when others pressed right behind the winner, the board screen and host show by how much
  ("Bob +0.08 s · Cid +0.21 s", measured when the presses reached the host).
- **Scores:** the leader wears a 👑, three or more clues in a row earn a 🔥, and changes float up from the score.

The host can also rename or remove players, adjust scores, give control to someone, and end a round early.

### Buzzer options

Set in the lobby; the host's browser remembers them for next time.

- **Buzzer**
  - **Big button** (default): one big button that lights up when buzzers open. Pressing before that is a
    **false start**: it costs a share of the clue's value (off / 25% / **50%** / 100%) and blocks the
    player for the lockout time. The board screen lists who jumped the gun. Presses while the buzzers are
    closed after a wrong answer don't count either way. The host's undo never refunds a false start.
  - **Emoji pad**: the board screen shows a random emoji when buzzers open, and players tap that emoji on
    the 3×3 pad on their phone (the same pad for everyone). A wrong emoji or a tap before buzzers open
    blocks the player for the lockout time, but costs no points.
    **Emoji on phones** (off by default): phones show the emoji to tap as well. Turn it on when some players
    follow the TV over a video call, since screen sharing lags by a second or two.
- **Pace**
  - **Host opens buzzers** (default): as above, the host reads the clue first.
  - **Quick draw**: buzzers open as soon as the clue appears, and the clue disappears from the board screen
    and phones while someone answers. Buzz early and you answer from memory. After a wrong answer the clue
    comes back and buzzers reopen for everyone else. Daily Doubles play as usual.
- **Lockout** (0.25–3 s, default 1 s): how long a false start or a wrong emoji blocks a player.

Also in the lobby: **Media on phones** (off by default) shows pictures and video on the phones as well as the TV,
including answer media, for players following over a video call. Audio always plays on phones.

**Time to answer** (no timer / 5 / 10 / 15 / 30 s, default no timer): after someone buzzes in (or a Daily
Double clue shows), the board screen shows a shrinking bar and beeps at zero, and the answering phone shows the
seconds. The host still judges; nothing happens automatically.

**Wrong answers cost points** (on by default). Turn it off for kids or casual games: a wrong
answer then only locks the player out of that clue. Wagers still count either way (a wrong Daily Double or
final answer loses the wager), and false starts follow their own setting above.

### Screens stay awake

The host, the board screen and the phones keep the display on while LDTG is open (if the browser refuses at
first, the next tap or key press tries again: some browsers need a gesture first). The Wake Lock API only works
over HTTPS, and LDTG usually runs on plain `http://` on the LAN, so it falls back to a tiny silent looping video
(`src/assets/keep-awake.*`, no audio track) that restarts if something pauses it. The board screen also has a
fullscreen button (or press **F**).

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

### Media, reveals and sources

Clues and the final can have extras (all optional):

```jsonc
{
  "value": 400,
  "clue": "The country where this dish originated",
  "answer": "Japan",
  // Audio and video can play just a part of the file: "start": 30, "end": 45 (seconds).
  "media": {
    "type": "image",
    "src": "https://example.com/dish.jpg",
    // Starts blurred and sharpens while buzzers are open (paused while someone answers).
    // shrinkPoints: buzzing early is worth more, from the full value down to half once it's sharp.
    "reveal": { "style": "blur", "seconds": 10, "shrinkPoints": true }
  },
  "answerMedia": { "type": "image", "src": "https://example.com/map.jpg" },  // replaces the media on reveal
  "source": "Wikipedia",                                                        // shown with the answer
  "sourceUrl": "https://en.wikipedia.org/wiki/Sushi"
}
```

On a Daily Double the picture sharpens from when the clue shows, and the wager never shrinks. The host always
sees the source and what media is coming next to the answer, for disputes. Answer media and sources only
reach the board screen and phones once the answer is revealed.

When a board is loaded, the host lobby loads every picture, sound and video once and shows "Media: 12/12 OK"
or the links that don't load. The board screen usually runs in the same browser as the host, so this also
puts the pictures in its cache. (Media isn't sent to the board screen early: the game state goes to every
phone, and links can give answers away.) The editor has the same check behind a **Check media** button.

You can also use the in-app **editor** (`/editor`). It autosaves drafts in your browser's localStorage, shows
validation problems inline, and exports JSON. It also lists **heads-ups** that don't stop a board from being played:
an answer (or a key word of it) that appears in its own clue or in its media link (`mars.jpg`), duplicate
answers or clues, and text that may be too long for the TV. The host lobby shows how many a board has. Drop that JSON into `boards/` to keep it in the repo. Drafts
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
  is whoever reached the bridge first, and everyone agrees on who that was. With the big button, a `buzz`
  that arrives before the host has seen its own `buzzers_open` echo is a false start: it was sent first.
  One that arrives after the host closed the buzzers is ignored, since it may have been sent while they were open.
- Player identity is a UUID in `sessionStorage`. A reload keeps your score, and separate tabs can be
  separate players, which is handy for testing on one machine.

Trust model: the bridge has no authentication, so this is built for friendly games. Anyone who knows the room
code and the protocol could send fake messages.

## Stories (Histoire)

```bash
pnpm story:dev     # http://localhost:6006
```

Published build: <https://kazie.github.io/legally-distinct-trivia-game/> (deployed from `master` by
`.github/workflows/stories.yml`).

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
pnpm test:coverage # same, plus a coverage report (HTML in coverage/index.html)
pnpm type-check
pnpm build
```

**CI** (`.github/workflows/ci.yml`) runs on every pull request and push to `master`: type check, tests with
coverage, app build, stories build, and a check that `boards/board.schema.json` matches the Zod schema. Coverage
is report only: a comment on the PR (updated on each push) and the run summary, never a failure.

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
