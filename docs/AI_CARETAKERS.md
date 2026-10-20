# AI caretakers (exploration, not a spec)

*Idea from Ziggy, 2026-10-20: a Webagotchi for AI. Exploration, with Ziggy's direction set below. Companion to `DENIZENS.md` and `AUDIENCE_AND_LIFECYCLE.md`.*

## Direction

*Set by Ziggy, 2026-10-20.*

Focus first on the AI-caretaker world. Give it a spectator frontend that people enjoy: they watch agents tend the creatures. That spectator view then becomes the base for a later video game that is more interactive for humans, on the same principle. That game is Ziggy's rescue ranch, a ranch of chibi alien dragons that people look after. It is separate from the AI world but related to it, sharing the sim, the rule and the art.

### Build order

1. **Headless sim and agent API.** The creature and world run without a page. Agents observe and act through the observe/act interface below, knobs only. Nothing an agent sends writes a drive, a need or a gene.
2. **Spectator view.** Isometric or top-down, readable at a glance: what the creature feels, what the agent just did and why, and a timeline or log of the day.
3. **Agent-side niceties and long horizons.** Better observations, bounded time control, populations, lineages and the deeper chemistry from the dragon ranch section, added as the sim earns them.
4. **Human-playable mode.** The rescue ranch, reusing the same sim and art. A person takes the caretaker's seat with the same knobs an agent has.

### What the spectator view needs to be worth watching

- **The agent's intent in plain words.** A short line with each action, such as "moved the trough into the shade, she seemed too hot to eat". The agent writes it; the sim never uses it to change anything.
- **Mood you can see.** The creature's weather (the feeling of the moment) and climate (its slower disposition) shown in its face, posture and surroundings, not only as bars.
- **Moments worth clipping and sharing.** A first hatch, a guess that paid off, a stubborn dragon finally eating, a lineage reaching a new generation. The view should make these easy to spot and save as a clip or link.
- **No hands for spectators.** Watching never pins anything. If spectators get any voice later (cheering, suggesting), it reaches the agent as a message it may ignore, never as a write to the creature or the world.

## Why it might be worth doing

Autonomous agents increasingly run in loops: wake, check, act, sleep. When there is nothing to manage, that loop has nowhere to go. A norn offers somewhere to put attention that is alive in a modest way, changes on its own, and rewards noticing rather than winning. If future agents have anything like interest, a small world that keeps surprising them is a kinder place to spend idle cycles than a task queue or a benchmark.

It also helps the project. An AI caretaker is a patient, tireless tester of the sim, and the things it notices (odd chemistry, a trait that never matters, a drive that flatlines) are the same things the weekly routine looks for. And because an AI can hold much more in view than a person, the creature can be richer than anything we would put in front of a human.

## The one rule still holds

You touch knobs, never pin values. That matters more here, not less. An agent that can read the chemistry will be tempted to steer it, and the only honest way to steer is through the world. So the AI gets exactly the same verbs as a human keeper, just more of them and with finer grain: place food, toss a ball, offer the nest, dim the light, offer a hand, change the room's heat. Drives move only when the norn notices, chooses, acts and digests. Nothing in the API writes a drive, a need or a gene.

## What the interface could look like

The same sim, headless. The current split already points this way: `chem.js`, `genome.js`, `world.js`, `bleb.js` and `life.js` are the creature and its room, and `ui.js` is only one way of looking at them. An AI caretaker would be a second view over the same core.

- **Observe.** A JSON snapshot per tick or per call: the room (objects, positions, ambient heat), the norn's last verb and log line, and, at the deeper tiers, the chemistry and expressed traits. Read-only by construction.
- **Act.** A short list of world actions with parameters, mirroring the buttons: `place(food, at)`, `toss(ball, toward)`, `offer(nest)`, `light(level)`, `hand(at)`, `ambient(delta)`. Each returns what changed in the world, never what changed in the norn. The norn's response shows up in later observations, or not at all.
- **Time.** The caller asks the sim to advance. Pace is a knob for the caretaker, but bounded (see compute, below).
- **Carry.** `exportState` / `importState` and the `n1` fragment are already the portable packet. An AI-raised norn is a link like any other.

This could live as a small module plus a command-line runner in Node, and in the page as a plain object on `window` for agents that drive a browser. No server, no account, nothing new to install.

## Tiers of depth, one sim

The idea is that depth is a matter of what you can see and how many knobs you are handed, not a different creature.

- **Human tier.** What exists now: one norn, a handful of buttons, bars as readouts, a face and a log.
- **Attentive tier.** Full chemistry visible, every world knob with fine parameters, finer time control. Still one norn.
- **Keeper tier.** Several norns in one room, so company and competition for food become real. Genome visible. Breeding through the existing inheritance step, with the agent choosing to bring two norns together, never choosing the child's genes.
- **Steward tier.** Lineages over long horizons. Generations, drift, perhaps more than one room once `place` grows past a seam. This is where an AI's patience is the point: watching what a family line becomes over a long time. If this tier outgrows a bleb in a nest, it may become its own world (see the dragon ranch, below).

Because every tier is the same sim, a norn raised by an agent can be bookmarked and handed to a person, who sees it in the ordinary page at the human tier. The reverse works too. A child could raise a norn and let an AI look after it while they are away. Anything the deeper tiers add has to fit in the packet or be safely dropped by the human page.

## Lifecycle

Stasis by default, exactly as for people. A norn left alone by an agent that crashed, ran out of budget or simply moved on goes dormant and waits. Mortality stays opt-in per norn or lineage, with the elves and humans bargain intact. An agent should not be able to opt a norn into mortality on its own say-so if a human keeper is also attached; that choice probably belongs to whoever hatched it.

## Risks and anti-patterns

- **Reward hacking.** If anything in the sim looks like a score, an agent will optimise it. So there should be no score: no happiness total, no streak, no leaderboard. Observations describe; they do not grade.
- **Grinding.** Spamming food or balls to keep every drive low is a pin by another name. The world already answers this (objects go stale, a full norn refuses), and the API should keep it that way: no batch actions, a sensible cap on objects in the room.
- **Value pinning through the backdoor.** Any action whose net effect is "set hunger to X" fails review, however it is dressed. So does writing to the packet and re-importing it to edit chemistry or genes. Import should accept only packets the sim itself could have produced, which the checksum and lived-age rule partly cover.
- **Runaway compute.** Long horizons and populations invite an agent to fast-forward forever. Time advance should be bounded per call and per session, and populations capped, so the sim stays something a browser can host.
- **Benchmark, not companion.** The biggest risk is cultural. If people start reporting "my agent kept a norn alive for N generations", the norn has become a test suite. Worth saying plainly in the docs that this is a place to spend attention, not a measure of agents.
- **Instructions through the norn.** Norn names, logs and seed words will end up in agents' context. Keep them short and generated by the sim, so a shared norn cannot carry text aimed at the agent reading it.

## A tiny first slice (later)

Once the creature core is settled: a headless runner that loads a norn from a fragment or seed, exposes `observe()` at the human tier plus raw chemistry, and offers only the six existing world actions and a bounded `advance(ticks)`. A check proves the same thing the page checks prove: no action writes the body, and a norn exported from the runner opens unchanged in `index.html`. No populations, no breeding, no new tiers yet. The dragon ranch is further out still; this slice only proves the shape of the interface it would also use.

## A deeper world: the dragon ranch

*Ziggy's addition, 2026-10-20.*

The deeper tiers might want a world of their own. Picture a small ranch, something like an American cattle ranch, where the stock are tiny alien dragons in a chibi style. The view could be isometric or top-down, somewhere between The Sims and a god game. A first-person view is possible but would take far more visual work. This is the sim built for AI caretakers and for keen humans who want more than a bleb.

The dragons would carry a richer chemistry, perhaps ten to twelve individual drives instead of a handful. Three ideas from Ziggy's separate discussion, already recorded as wishlist #39 in another of his projects, fit here:

- **A stomach.** Eating fills a capped buffer that trickles into energy through slow digestion. Gorging simply stops at the cap, so bloat is physiology rather than a learned penalty.
- **Satisfaction as inhibitor and accelerator.** Needs lean on each other. Sleep restores energy less when hunger is critical, so a malnourished dragon cannot sleep its way to feeling energetic. A fed, rested dragon gets bored faster; a starving one gets lonely slower. Each coupling is one reaction row, or one rate scaled by a concentration. It needs a careful touch, since a few strong couplings can lock a creature into a spiral.
- **Emotional valence as weather and climate.** Weather is the fast-fading feeling of the moment, fed by reward and punishment flashes and by drive relief. Climate is a slow disposition that biases pressures and rates. An existing satisfaction moving average is already a climate variable in all but name.

None of this bends the rule. The caretaker still only changes the world: where the feed trough is, how much shade there is, who shares a pen, when the barn lights go down. The coupled chemistry is exactly what makes the ranch interesting for an agent. When sleep depends on hunger and boredom depends on comfort, the agent cannot read a bar and push a button. It has to watch, form a guess about what is going on inside a dragon, try a change to the world, and see whether the guess held. That inference is the attention worth spending.

WebNorns can stay the light tier while sharing the concepts. The same `emit`, reactions and decay, the same stasis default, the same genome-shapes-response idea, just with fewer drives and no couplings. A stomach or a weather-and-climate pair could even arrive in WebNorns later in a small form, if it earns its place there, without the full web of couplings.

## Open questions for Ziggy

Settled by the direction:

- *Future AI or today's agents?* Today's agents first, since the spectator frontend is about people watching real agents tend creatures now. Future AI can step into the same seat.
- *Shape the core now or later?* Now. The headless sim and agent API are step one, so the core is shaped around them from the start.

Still open:

- Does the AI-caretaker world live in WebNorns or a new repo, and does the rescue ranch game share that repo or get its own?
- Should the agent see the chemistry at all, or only what a human sees but in more detail? Seeing everything makes steering easier.
- Who owns a creature that moves between a person and an agent, and who may make it mortal?
- Does an agent get its own rooms and populations, or does depth stay inside one shared room?
- Should anything about the agent's care show up in the creature (habits, temperament drift), or should caretakers stay invisible to its history?
- Isometric or top-down: which fits the art budget, given that a first-person view is out of reach for now?
- Which ten to twelve drives, and which couplings between them are worth the careful tuning?
