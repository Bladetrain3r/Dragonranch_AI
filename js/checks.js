/* Runnable checks for the headless ranch.
   node js/checks.js */
(function () {
  "use strict";

  var fs = require("fs");
  var path = require("path");
  var Chem = require("./chem.js");
  var Genome = require("./genome.js");
  var World = require("./world.js");
  var Life = require("./life.js");
  var Dragon = require("./dragon.js");
  var Carry = require("./carry.js");
  var Ranch = require("./ranch.js");
  var Knobs = require("./knobs.js");

  var ok = 0;
  var fail = 0;
  var notes = [];

  function check(name, cond, detail) {
    if (cond) {
      ok += 1;
      console.log("ok   " + name);
    } else {
      fail += 1;
      console.log("FAIL " + name + (detail ? " — " + detail : ""));
    }
  }

  function note(line) {
    notes.push(line);
    console.log("note " + line);
  }

  function geneAt(index, value) {
    var genes = Genome.neutral();
    genes[index] = value;
    return genes;
  }

  function forbidden(value, pathName) {
    if (!value || typeof value !== "object") return "";
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var inner = forbidden(value[i], pathName + "[" + i + "]");
        if (inner) return inner;
      }
      return "";
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      if (/^(score|reward|fitness|happiness|grade|streak|points|wellbeing)$/i.test(keys[k])) {
        return pathName + "." + keys[k];
      }
      var deeper = forbidden(value[keys[k]], pathName + "." + keys[k]);
      if (deeper) return deeper;
    }
    return "";
  }

  function drivesOf(pen) {
    return JSON.stringify(pen.observe().drives);
  }

  function stomachOf(pen) {
    return pen.observe().stomach.reading;
  }

  check("decay tables are 32 entries", Chem.EVERY.length === 32 && Chem.MULTIPLIERS.length === 32);
  check("molecule decay 200 → 190", Chem.decayChemical(200, 6 << 3, 0) === 190);
  check("saturating arithmetic", Chem.addSat(250, 10) === 255 && Chem.subSat(3, 9) === 0 && Chem.mulSat(20, 20) === 255);

  var conc = new Uint8Array(Chem.SLOTS);
  conc[Chem.NOVELTY] = 100;
  conc[Chem.BOREDOM] = 100;
  Chem.runReaction(conc, [1, Chem.NOVELTY, 1, Chem.BOREDOM, 2 << 3, 0, 0, 0, 0], 1);
  check("novelty cancels boredom to 44/44", conc[Chem.NOVELTY] === 44 && conc[Chem.BOREDOM] === 44);

  var names = Chem.DRIVES.map(function (row) { return row.name; });
  check("drive table starts with six coupled needs", names.join(",") === "hunger,energy,sleepiness,boredom,loneliness,chill");
  check("chemistry has spare slots past the first drives", Chem.SLOTS >= 32 && Chem.DRIVES.length >= 6 && Chem.DRIVES.length <= 12 && Chem.DISTRESS < 16);
  var couplingNames = Chem.COUPLINGS.map(function (row) { return row.name; });
  check(
    "couplings are data: sleep, boredom, loneliness",
    couplingNames.indexOf("sleep-restores-less-energy-when-hungry") >= 0 &&
      couplingNames.indexOf("boredom-accelerates-when-fed-and-rested") >= 0 &&
      couplingNames.indexOf("loneliness-slows-when-starving") >= 0
  );

  var capped = new Chem.Body();
  var took = capped.emit(Chem.STOMACH, 500, "eat");
  var tookAgain = capped.emit(Chem.STOMACH, 40, "eat");
  check(
    "stomach fill stops at the cap",
    took === Knobs.stomach.cap && capped.conc[Chem.STOMACH] === Knobs.stomach.cap && tookAgain === 0
  );

  function twin(stomach, hunger) {
    var body = new Chem.Body();
    body.conc[Chem.STOMACH] = stomach;
    body.conc[Chem.HUNGER] = hunger;
    body.conc[Chem.ENERGY] = 40;
    return body;
  }
  var digesting = twin(60, 100);
  var emptyGut = twin(0, 100);
  for (var d = 0; d < 6; d++) {
    digesting.tick();
    emptyGut.tick();
  }
  check("digestion spends the stomach", digesting.conc[Chem.STOMACH] < 60 && digesting.conc[Chem.STOMACH] === 60 - 6 * Knobs.stomach.digest);
  check(
    "digestion eases hunger and feeds energy",
    digesting.conc[Chem.HUNGER] < emptyGut.conc[Chem.HUNGER] && digesting.conc[Chem.ENERGY] > emptyGut.conc[Chem.ENERGY]
  );

  function sleeper(hunger) {
    var body = new Chem.Body();
    body.asleep = 30;
    body.conc[Chem.HUNGER] = hunger;
    body.conc[Chem.ENERGY] = 40;
    body.conc[Chem.SLEEPINESS] = 120;
    return body;
  }
  var rested = sleeper(0);
  var starvedSleep = sleeper(255);
  for (var s = 0; s < 10; s++) {
    rested.tick();
    starvedSleep.tick();
  }
  check(
    "sleep restores less energy when hunger is critical",
    rested.conc[Chem.ENERGY] > starvedSleep.conc[Chem.ENERGY] + 15,
    "fed " + rested.conc[Chem.ENERGY] + " starved " + starvedSleep.conc[Chem.ENERGY]
  );

  function moodBody(hunger, sleepiness) {
    var body = new Chem.Body();
    body.conc[Chem.HUNGER] = hunger;
    body.conc[Chem.SLEEPINESS] = sleepiness;
    return body;
  }
  var satisfied = moodBody(0, 0);
  var deprived = moodBody(255, 255);
  for (var b = 0; b < 80; b++) {
    satisfied.tick();
    deprived.tick();
  }
  check(
    "a fed, rested dragon grows bored faster",
    satisfied.conc[Chem.BOREDOM] > deprived.conc[Chem.BOREDOM] + 20,
    "satisfied " + satisfied.conc[Chem.BOREDOM] + " deprived " + deprived.conc[Chem.BOREDOM]
  );

  var lonelyFed = moodBody(0, 40);
  var lonelyStarved = moodBody(255, 40);
  for (var lon = 0; lon < 80; lon++) {
    lonelyFed.tick();
    lonelyStarved.tick();
  }
  check(
    "a starving dragon grows lonely slower",
    lonelyStarved.conc[Chem.LONELINESS] < lonelyFed.conc[Chem.LONELINESS],
    "starved " + lonelyStarved.conc[Chem.LONELINESS] + " fed " + lonelyFed.conc[Chem.LONELINESS]
  );

  var flash = new Chem.Body();
  flash.conc[Chem.BOREDOM] = 200;
  flash.conc[Chem.NOVELTY] = 80;
  flash.tick();
  var weatherSpike = Math.abs(flash.weather);
  var climateSpike = Math.abs(flash.climate);
  check(
    "weather jumps ahead of climate",
    weatherSpike > climateSpike * 4 && weatherSpike > 1,
    "weather " + flash.weather + " climate " + flash.climate
  );
  for (var q = 0; q < 8; q++) flash.tick();
  for (var quiet = 0; quiet < 30; quiet++) flash.tick();
  check(
    "climate lingers after weather fades",
    Math.abs(flash.weather) < weatherSpike * 0.2 && Math.abs(flash.climate) > Math.abs(flash.weather),
    "weather " + flash.weather + " climate " + flash.climate
  );

  var worldSrc = fs.readFileSync(path.join(__dirname, "world.js"), "utf8");
  check("the pen module never mentions a body write", !/\bemit\b|\bconc\b|genome|biotick/.test(worldSrc));

  var pen = Ranch.hatch({ seed: 1, genes: "neutral", noise: 0 });
  var forbiddenHit = forbidden(pen.observe(), "observe");
  check("an observation is JSON a model can read", JSON.parse(JSON.stringify(pen.observe())).dragon.name === pen.observe().dragon.name);
  check("an observation does not grade the dragon", forbiddenHit === "", forbiddenHit);
  var leaked = ["emit", "setDrive", "setGene", "score", "reward", "kill", "optIn", "setMortal"];
  var leakedHit = leaked.filter(function (name) { return typeof pen[name] === "function"; });
  check("the caretaker handle has no body writer", leakedHit.length === 0, leakedHit.join(","));

  var snapshot = drivesOf(pen);
  var genesBefore = pen.observe().traits.genes.join(",");
  var ageBefore = pen.observe().dragon.age;
  var actions = [
    { action: "place", kind: "food", x: 60, y: 40, intent: "she looked ready\nto eat" },
    { action: "place", kind: "toy", x: 20, y: 70 },
    { action: "place", kind: "nest", x: 30, y: 30 },
    { action: "place", kind: "warmth", x: 80, y: 20 },
    { action: "place", kind: "hand", x: 28, y: 50 },
    { action: "ambient", heat: 80 },
    { action: "light", level: 15 }
  ];
  var actionNotes = [];
  for (var a = 0; a < actions.length; a++) {
    var before = drivesOf(pen);
    var stomachBefore = stomachOf(pen);
    var result = pen.act(actions[a]);
    actionNotes.push(result.ok ? result.note : result.error);
    var graded = forbidden(result, "act");
    check(
      "act " + (actions[a].kind || actions[a].action) + " does not write the body",
      result.ok === true && drivesOf(pen) === before && stomachOf(pen) === stomachBefore && pen.observe().dragon.age === ageBefore && graded === "",
      result.ok ? graded : result.error
    );
  }
  check("those acts changed the pen, not the genes", pen.observe().room.objects.length === 5 && pen.observe().room.heat === 80 && pen.observe().room.light === 15 && pen.observe().traits.genes.join(",") === genesBefore);
  check("a second trough is refused", pen.act({ action: "place", kind: "food", x: 10, y: 10 }).ok === false && pen.observe().room.objects.length === 5 && drivesOf(pen) === snapshot);
  check("intent is kept and truncated, and it is not chemistry", pen.observe().caretaker.said.indexOf("she looked ready") === 0 && pen.observe().caretaker.said.indexOf("\n") < 0 && pen.observe().caretaker.said.length <= Knobs.intentMax);

  var blocked = ["setHunger", "setDrive", "setGene", "reward", "score", "kill", "optIn", "mortality", "import", "emit"];
  blocked.forEach(function (name) {
    var beforeBlock = drivesOf(pen);
    var denied = pen.act({ action: name, hunger: 0, value: 0, gene: 0 });
    check("act " + name + " is refused", denied.ok === false && drivesOf(pen) === beforeBlock, denied.error);
  });

  var runaway = Ranch.hatch({ seed: 3, genes: "neutral", noise: 0 });
  var huge = runaway.advance(1000000);
  check(
    "one advance cannot run away",
    huge.ok === true && huge.advanced === Knobs.time.maxTicksPerCall && huge.capped === true && huge.requested === 1000000,
    "advanced " + huge.advanced
  );
  var spent = huge.advanced;
  var guard = 0;
  while (spent < Knobs.time.maxTicksPerSession && guard < 100) {
    var chunk = runaway.advance(Knobs.time.maxTicksPerCall);
    if (!chunk.ok || chunk.advanced <= 0) break;
    spent += chunk.advanced;
    guard += 1;
  }
  var stopped = runaway.advance(10);
  check(
    "a session advance is bounded",
    spent === Knobs.time.maxTicksPerSession && stopped.ok === false && stopped.advanced === 0 && stopped.error === "session bound" && runaway.observe().phase !== "dead",
    "spent " + spent + " phase " + runaway.observe().phase + " err " + stopped.error
  );

  var carried = Ranch.hatch({ seed: 4, genes: "neutral", noise: 0 });
  carried.advance(25);
  var packet = carried.exportPacket();
  var packed = JSON.stringify(packet);
  check(
    "a packet is a compact creature, not the pen",
    packet.v === 1 && packet.kind === "dragonranch" && !packet.room && !packet.world && !packet.log && !packet.intent && packed.length < 1800,
    "bytes " + packed.length
  );
  packet.chem[String(Chem.HUNGER)] = 3;
  check("export does not share the live chemistry", carried.observe().drives.hunger.reading !== 3);
  var tampered = carried.importPacket(packet);
  check("a tampered packet is refused", tampered.ok === false && carried.observe().drives.hunger.reading !== 3, tampered.error);

  var again = carried.exportPacket();
  var younger = Ranch.hatch({ seed: 9, genes: "neutral", noise: 0 });
  var loaded = younger.importPacket(again);
  check("a sealed packet loads", loaded.ok === true, loaded.error);
  check(
    "a packet round-trips the body",
    younger.observe().drives.hunger.reading === carried.observe().drives.hunger.reading &&
      younger.observe().drives.energy.reading === carried.observe().drives.energy.reading &&
      younger.observe().stomach.reading === carried.observe().stomach.reading &&
      younger.observe().dragon.age === carried.observe().dragon.age &&
      younger.observe().dragon.weather.reading === carried.observe().dragon.weather.reading &&
      younger.observe().dragon.climate.reading === carried.observe().dragon.climate.reading &&
      younger.observe().traits.genes.join(",") === carried.observe().traits.genes.join(",") &&
      younger.observe().room.objects.length === 0 &&
      younger.observe().room.heat === Knobs.birth.ambient
  );
  carried.advance(8);
  younger.advance(8);
  check(
    "loaded chemistry keeps the same trajectory",
    younger.observe().drives.hunger.reading === carried.observe().drives.hunger.reading &&
      younger.observe().drives.energy.reading === carried.observe().drives.energy.reading &&
      younger.observe().dragon.age === carried.observe().dragon.age
  );

  var seedPen = Ranch.hatch({ seed: 6, genes: "neutral", noise: 0 });
  seedPen.act({ action: "place", kind: "food", x: 10, y: 10 });
  seedPen.advance(12);
  var seed = seedPen.exportSeed();
  var fromSeed = Ranch.hatch({ seed: 8, genes: "neutral", noise: 0 });
  var seeded = fromSeed.importSeed(seed);
  check("a seed is one portable string", typeof seed === "string" && seed.indexOf("dr1.") === 0 && seed.length < 2400, "length " + seed.length);
  check(
    "a seed round-trips and leaves the trough behind",
    seeded.ok === true &&
      fromSeed.observe().dragon.name === seedPen.observe().dragon.name &&
      fromSeed.observe().drives.hunger.reading === seedPen.observe().drives.hunger.reading &&
      fromSeed.observe().dragon.age === seedPen.observe().dragon.age &&
      fromSeed.observe().room.objects.length === 0,
    seeded.error
  );
  var brokenSeed = fromSeed.importSeed(seed.slice(0, seed.length - 4) + "AAAA");
  check("a broken seed does not apply", brokenSeed.ok === false && fromSeed.observe().dragon.age === seedPen.observe().dragon.age);

  var rewind = Ranch.hatch({ seed: 11, genes: "neutral", noise: 0 });
  rewind.advance(20);
  var save = rewind.exportPacket();
  rewind.advance(15);
  var rewindAge = rewind.observe().dragon.age;
  var rewound = rewind.importPacket(save);
  check("a younger packet cannot rewind a dragon", rewound.ok === false && rewind.observe().dragon.age === rewindAge, rewound.error);

  var mortalAsk = Ranch.hatch({ seed: 12, genes: "neutral", noise: 0, mortality: true });
  var mortalPacket = mortalAsk.exportPacket();
  mortalPacket.mortal = true;
  mortalPacket.seal = Carry.sealOf(mortalPacket);
  var mortalLoad = mortalAsk.importPacket(mortalPacket);
  check("import cannot opt a pen into mortality", mortalLoad.ok === false, mortalLoad.error);

  function placeAt(sim, kind, x, y) {
    return World.place(sim.world, kind, x, y);
  }

  var walker = Dragon.createSim({ seed: 1, genes: "neutral", noise: 0 });
  walker.dragon.body.conc[Chem.HUNGER] = 160;
  walker.dragon.x = 20;
  walker.dragon.y = 40;
  placeAt(walker, "food", 70, 40);
  var droppedEarly = false;
  var ate = false;
  for (var step = 0; step < 12; step++) {
    var hungerNow = walker.dragon.body.conc[Chem.HUNGER];
    var stomachNow = walker.dragon.body.conc[Chem.STOMACH];
    Dragon.step(walker);
    if (stomachNow === 0 && walker.dragon.body.conc[Chem.STOMACH] === 0 && walker.dragon.body.conc[Chem.HUNGER] < hungerNow) {
      droppedEarly = true;
    }
    if (walker.dragon.verb === "eat") ate = true;
  }
  check("a hungry dragon walks before it eats", ate && walker.dragon.body.conc[Chem.STOMACH] > 0);
  check("hunger does not fall before the stomach is working", !droppedEarly);

  var dainty = Dragon.createSim({ seed: 1, genes: geneAt(0, 0), noise: 0 });
  var greedy = Dragon.createSim({ seed: 1, genes: geneAt(0, 255), noise: 0 });
  dainty.dragon.body.conc[Chem.HUNGER] = 50;
  greedy.dragon.body.conc[Chem.HUNGER] = 50;
  placeAt(dainty, "food", dainty.dragon.x, dainty.dragon.y);
  placeAt(greedy, "food", greedy.dragon.x, greedy.dragon.y);
  Dragon.step(dainty);
  Dragon.step(greedy);
  check("a dainty dragon leaves a mild hunger", dainty.dragon.body.conc[Chem.STOMACH] === 0 && /not hungry/.test(dainty.dragon.line));
  check("a greedy dragon eats that same hunger", greedy.dragon.body.conc[Chem.STOMACH] > 0 && /mouthful/.test(greedy.dragon.line));

  var full = Dragon.createSim({ seed: 1, genes: "neutral", noise: 0 });
  full.dragon.body.conc[Chem.HUNGER] = 220;
  full.dragon.body.conc[Chem.STOMACH] = Knobs.stomach.cap;
  placeAt(full, "food", full.dragon.x, full.dragon.y);
  Dragon.step(full);
  check(
    "a full stomach refuses another mouthful",
    full.dragon.verb !== "eat" &&
      full.dragon.body.conc[Chem.STOMACH] === Knobs.stomach.cap - Knobs.stomach.digest &&
      /no more|too full/.test(full.dragon.line),
    "verb " + full.dragon.verb + " stomach " + full.dragon.body.conc[Chem.STOMACH] + " line " + full.dragon.line
  );

  var quick = Dragon.createSim({ seed: 1, genes: geneAt(4, 255), noise: 0 });
  var slow = Dragon.createSim({ seed: 1, genes: geneAt(4, 0), noise: 0 });
  quick.dragon.body.conc[Chem.STOMACH] = 80;
  slow.dragon.body.conc[Chem.STOMACH] = 80;
  for (var gut = 0; gut < 15; gut++) {
    Dragon.step(quick);
    Dragon.step(slow);
  }
  check(
    "a quick gut digests faster than a slow one",
    quick.dragon.body.conc[Chem.STOMACH] < slow.dragon.body.conc[Chem.STOMACH],
    "quick " + quick.dragon.body.conc[Chem.STOMACH] + " slow " + slow.dragon.body.conc[Chem.STOMACH]
  );

  var intentA = Ranch.hatch({ seed: 5, genes: "neutral", noise: 0 });
  var intentB = Ranch.hatch({ seed: 5, genes: "neutral", noise: 0 });
  intentA.act({ action: "place", kind: "food", x: 70, y: 48, intent: "moved the trough into the open" });
  intentB.act({ action: "place", kind: "food", x: 70, y: 48, intent: "a completely different sentence" });
  for (var same = 0; same < 40; same++) {
    intentA.advance(1);
    intentB.advance(1);
  }
  check(
    "intent words do not change what the dragon does",
    drivesOf(intentA) === drivesOf(intentB) &&
      intentA.observe().stomach.reading === intentB.observe().stomach.reading &&
      intentA.observe().dragon.verb === intentB.observe().dragon.verb &&
      intentA.observe().caretaker.said !== intentB.observe().caretaker.said
  );

  function hasKind(observe, kind) {
    var objects = observe.room.objects;
    for (var i = 0; i < objects.length; i++) if (objects[i].kind === kind) return true;
    return false;
  }

  function decide(pen) {
    var view = pen.observe();
    var drives = view.drives;
    var x = view.dragon.x;
    var y = view.dragon.y;
    var tx = x < 50 ? Math.min(92, Math.round(x + 26)) : Math.max(8, Math.round(x - 26));
    var ty = Math.max(8, Math.min(92, Math.round(y + (y < 50 ? 12 : -12))));
    if (drives.hunger.reading >= 70 && !hasKind(view, "food")) {
      return pen.act({ action: "place", kind: "food", x: tx, y: ty, intent: "the trough, a little way off" });
    }
    if (drives.sleepiness.reading >= 80 && !hasKind(view, "nest")) {
      return pen.act({ action: "place", kind: "nest", x: Math.round(x), y: Math.round(y) });
    }
    if (drives.boredom.reading >= 90 && !hasKind(view, "toy")) {
      return pen.act({ action: "place", kind: "toy", x: tx, y: ty });
    }
    if (drives.loneliness.reading >= 110 && !hasKind(view, "hand")) {
      return pen.act({ action: "place", kind: "hand", x: Math.round(x), y: ty });
    }
    if (drives.chill.reading >= 70 && !hasKind(view, "warmth")) {
      return pen.act({ action: "place", kind: "warmth", x: tx, y: ty });
    }
    if (view.room.heat < 40 || view.room.heat > 70) return pen.act({ action: "ambient", heat: 55 });
    return null;
  }

  var cared = Ranch.hatch({ seed: 7, genes: "neutral", noise: 0 });
  var caredTicks = 1200;
  var sawEat = false;
  var sawSleep = false;
  var minEnergy = 999;
  var maxHunger = 0;
  var caredPhase = "awake";
  for (var tick = 0; tick < caredTicks; tick++) {
    if (tick % 12 === 0) decide(cared);
    var stepped = cared.advance(1);
    if (!stepped.ok) {
      caredPhase = "advance failed";
      break;
    }
    var seen = cared.observe();
    if (forbidden(seen, "observe")) caredPhase = "graded";
    if (seen.phase !== "awake") caredPhase = seen.phase;
    if (seen.dragon.verb === "eat" || /mouthful/.test(seen.dragon.line)) sawEat = true;
    if (seen.dragon.asleep || seen.dragon.verb === "sleep") sawSleep = true;
    if (seen.drives.energy.reading < minEnergy) minEnergy = seen.drives.energy.reading;
    if (seen.drives.hunger.reading > maxHunger) maxHunger = seen.drives.hunger.reading;
  }
  var caredEnd = cared.observe();
  check(
    "a scripted caretaker keeps a dragon going",
    caredPhase === "awake" && sawEat && sawSleep && maxHunger < Knobs.life.stasisHunger && minEnergy > Knobs.life.stasisEnergy && caredEnd.phase === "awake",
    "phase " + caredPhase + " eat " + sawEat + " sleep " + sawSleep + " maxHunger " + maxHunger + " minEnergy " + minEnergy
  );
  note("cared run " + caredTicks + " ticks, end hunger " + caredEnd.drives.hunger.reading + " (" + caredEnd.drives.hunger.word + "), energy " + caredEnd.drives.energy.reading + " (" + caredEnd.drives.energy.word + "), age " + caredEnd.dragon.age);

  var absent = Ranch.hatch({ seed: 7, genes: "neutral", noise: 0, mortality: true });
  var absentTicks = 0;
  var absentCap = 1200;
  while (absent.observe().phase === "awake" && absentTicks < absentCap) {
    var hop = absent.advance(Knobs.time.maxTicksPerCall);
    absentTicks += hop.advanced;
    if (!hop.ok || hop.advanced <= 0) break;
  }
  var dormant = absent.observe();
  check(
    "an absent caretaker leads to stasis",
    dormant.phase === "dormant" && absentTicks < absentCap,
    "phase " + dormant.phase + " at " + absentTicks
  );
  check("stasis is not death", dormant.phase !== "dead" && dormant.dragon.line.indexOf("waits") >= 0);
  var frozenHunger = dormant.drives.hunger.reading;
  var frozenEnergy = dormant.drives.energy.reading;
  var frozenAge = dormant.dragon.age;
  var frozenStomach = dormant.stomach.reading;
  absent.advance(Knobs.time.maxTicksPerCall);
  var still = absent.observe();
  check(
    "a waiting dragon does not keep aging",
    still.phase === "dormant" &&
      still.drives.hunger.reading === frozenHunger &&
      still.drives.energy.reading === frozenEnergy &&
      still.stomach.reading === frozenStomach &&
      still.dragon.age === frozenAge
  );
  var wakeAct = absent.act({ action: "place", kind: "food", x: 40, y: 50, intent: "something is here again" });
  var mid = absent.observe();
  check(
    "waking starts in the pen, not in the body",
    wakeAct.ok === true && mid.phase === "dormant" && mid.drives.hunger.reading === frozenHunger && mid.dragon.age === frozenAge
  );
  var woke = false;
  for (var w = 0; w < 5; w++) {
    absent.advance(1);
    if (absent.observe().phase === "awake") woke = true;
  }
  check("a tended dragon stirs again", woke && absent.observe().phase === "awake" && /stirs/.test(absent.observe().log.join(" ")));
  note("absent run reached stasis at age " + frozenAge + " after " + absentTicks + " ticks, hunger " + frozenHunger + ", energy " + frozenEnergy);

  var opted = Dragon.createSim({ seed: 7, genes: "neutral", noise: 0 });
  Life.optIn(opted);
  var diedAt = 0;
  for (var life = 0; life < absentCap; life++) {
    Dragon.step(opted);
    diedAt += 1;
    if (opted.phase !== "awake") break;
  }
  check(
    "mortality is opt-in and ends the life only then",
    opted.phase === "dead" && diedAt < absentCap,
    "phase " + opted.phase + " at " + diedAt
  );
  var afterDeath = opted.dragon.body.biotick;
  Dragon.step(opted);
  Dragon.step(opted);
  check("a mortal ending does not keep ticking", opted.phase === "dead" && opted.dragon.body.biotick === afterDeath);

  var crowded = Dragon.createSim({ seed: 1, genes: "neutral", noise: 0 });
  while (crowded.world.objects.length < Knobs.objects.cap) {
    crowded.world.objects.push({ id: "x" + crowded.world.objects.length, kind: "marker", x: 1, y: 1, age: 0, life: 10 });
  }
  var overflow = World.place(crowded.world, "food", 12, 12);
  check("the pen refuses another object when it is full", overflow.ok === false && crowded.world.objects.length === Knobs.objects.cap);

  console.log("");
  console.log(ok + " passed, " + fail + " failed");
  if (fail > 0) process.exit(1);
})();
