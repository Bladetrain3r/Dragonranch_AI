# Dragonranch

A small artificial-life pen of one chibi alien dragon, looked after through an observe/act interface. People-watching and the rescue-ranch game come later. This is the headless world those will share.

The design note is [`docs/AI_CARETAKERS.md`](docs/AI_CARETAKERS.md). This is a place to spend attention, not a measure of agents. There is no score.

## The rule

You touch knobs, never pin values.

A caretaker places food, a toy, a nest, a warm stone, or a hand, and can change the pen's heat and light. Drives move only when the dragon notices, chooses, eats, digests, sleeps, or otherwise lives. Nothing `act` can call writes a drive, a need, a chemical, or a gene. `import` restores a packet this sim sealed; a casual edit is refused.

Stasis is the default. Left alone, a dragon curls up and waits. Mortality exists only as an explicit opt-in on the sim, and the caretaker handle cannot switch it on.

## Run

Plain Node, no install.

```bash
node js/checks.js
node js/demo.js
```

`js/checks.js` is the contract: no action writes the body, a packet and a `dr1.` seed round-trip, a scripted caretaker keeps a dragon going, and an absent caretaker ends in stasis rather than death.

## Caretaker interface

```js
var Ranch = require("./js/ranch.js");
var pen = Ranch.hatch({ seed: 3 });

pen.observe();
pen.act({ action: "place", kind: "food", x: 54, y: 42, intent: "a trough, where she can find it" });
pen.act({ action: "ambient", heat: 55 });
pen.act({ action: "light", level: 30 });
pen.advance(12);

pen.exportPacket();
pen.exportSeed();
```

`observe()` is JSON. It describes the pen, the dragon's verb and line, the stomach, the drives, and mood as weather over climate. It does not grade. `intent` is stored and echoed; the sim never uses it.

`advance(n)` runs at most 240 ticks per call and 5000 per hatch, so a caller cannot fast-forward without bound.

The same files are browser-safe. Load them in order: `knobs.js`, `chem.js`, `genome.js`, `world.js`, `life.js`, `dragon.js`, `carry.js`, `ranch.js`. They attach `Dragonranch` and the other modules to the global object. There is no page yet.

## Chemistry, small on purpose

Six drives are live: hunger, energy, sleepiness, boredom, loneliness, and chill. The tables in `js/chem.js` have room for about ten to twelve.

- Eating fills a capped stomach. Digestion trickles that buffer into less hunger and more energy. Past the cap, the dragon simply stops.
- Couplings are rows. Sleep restores less energy when hunger is critical. A fed, rested dragon grows bored faster. A starving one grows lonely slower.
- Weather is the fast feeling, fed by relief and shock. Climate is the slow average under it.

Genes scale appetite, play, company, warmth, digestion, sleep, and how stormy the weather is. They are not drives.

## Files

- `js/knobs.js` — the tunable numbers
- `js/chem.js` — decay, reactions, stomach, couplings, mood
- `js/genome.js` — seven genes and the words for them
- `js/world.js` — the pen
- `js/dragon.js` — sense, choose, act
- `js/life.js` — stasis, and mortality if a hatcher opts in
- `js/carry.js` — packet and seed
- `js/ranch.js` — the observe/act handle
- `js/checks.js`, `js/demo.js`

## Choices in this slice

Settled here so the pen could exist. The design note's questions stay open.

- The caretaker sees the chemistry: readings and plain words, with no total. Hiding the raw numbers is a later switch on this same observation.
- Six drives are live. Slots are reserved for thirst, fear, itch, curiosity, bond, and ache, whenever those earn a row.
- Stasis is critical hunger together with spent energy, held for a stretch. Boredom and loneliness get loud on their own and do not end the day.
- `act` and `import` cannot make a dragon mortal. Opt-in is `Life.optIn` for whoever hatches one. Nothing here knows about a human keeper sharing the pen.
- One dragon, one pen. Intent is echoed and left out of the packet. Care does not write habits or drift the genes.
- Time is capped at 240 ticks a call and 5000 a hatch. The packet seal catches a casual edit. It is not a signature; someone who rewrites the seal can still lie. A packet also cannot rewind a dragon who has already lived past it.
