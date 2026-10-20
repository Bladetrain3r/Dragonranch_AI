/* Sense, choose, act, then the body ticks. Keeper code must not call emit.
   A verb fires it only after the dragon commits to the act. */
(function (root, factory) {
  var Chem = root.DragonChem || (typeof require === "function" ? require("./chem.js") : null);
  var World = root.DragonWorld || (typeof require === "function" ? require("./world.js") : null);
  var Genome = root.DragonGenome || (typeof require === "function" ? require("./genome.js") : null);
  var Life = root.DragonLife || (typeof require === "function" ? require("./life.js") : null);
  var Knobs = root.DragonKnobs || (typeof require === "function" ? require("./knobs.js") : null);
  var api = factory(Chem, World, Genome, Life, Knobs);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DragonSim = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chem, World, Genome, Life, Knobs) {
  "use strict";

  var NAMES = ["Pip", "Moth", "Ember", "Nyx", "Peb", "Lumen", "Soot", "Chirp", "Vesper", "Bramble", "Nib", "Quill", "Moss", "Flick", "Puff"];
  var COLORS = ["#e07a5f", "#81b29a", "#f2cc8f", "#7eb8d4", "#c08497", "#8e7dbe", "#e6a57e"];

  var INNATE = {
    hunger: { eat: 1, move: 0.7 },
    boredom: { play: 1, move: 0.55 },
    loneliness: { nuzzle: 0.95, move: 0.5 },
    sleepiness: { sleep: 1, move: 0.45 },
    chill: { bask: 1, move: 0.6 }
  };

  var SALIENCE = {
    hunger: "food",
    boredom: "toy",
    loneliness: "hand",
    sleepiness: "nest",
    chill: "warmth"
  };

  var LABEL = {
    food: "trough",
    toy: "toy",
    nest: "nest",
    warmth: "warm stone",
    hand: "hand"
  };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function applyTraits(body, traits) {
    var key;
    body.scales = {};
    for (key in traits.scales) {
      if (Object.prototype.hasOwnProperty.call(traits.scales, key)) body.scales[key] = traits.scales[key];
    }
    body.comfort = { low: traits.comfort.low, high: traits.comfort.high };
  }

  function createDragon(opts, rng) {
    var traits = Genome.express(opts.genes);
    var body = new Chem.Body();
    applyTraits(body, traits);
    var birth = Knobs.birth;
    body.conc[Chem.HUNGER] = birth.hunger;
    body.conc[Chem.ENERGY] = birth.energy;
    body.conc[Chem.SLEEPINESS] = birth.sleepiness;
    body.conc[Chem.BOREDOM] = birth.boredom;
    body.conc[Chem.LONELINESS] = birth.loneliness;
    body.conc[Chem.CHILL] = birth.chill;
    body.conc[Chem.HEAT] = Math.round(birth.ambient * 255 / 100);
    var name = NAMES[Math.floor(rng() * NAMES.length)];
    var color = COLORS[Math.floor(rng() * COLORS.length)];
    return {
      name: name,
      color: color,
      genome: traits.genes.slice(),
      traits: traits,
      body: body,
      x: birth.x,
      y: birth.y,
      heatAcc: 0,
      verb: "idle",
      detail: "settle",
      sig: "",
      line: name + " looks about the pen.",
      noticed: {},
      flags: { hot: false, cold: false, bloated: false }
    };
  }

  function createSim(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 1 : (opts.seed >>> 0);
    var rng = mulberry32(seed);
    var genes = Genome.neutral();
    if (opts.genes === "neutral") genes = Genome.neutral();
    else if (Array.isArray(opts.genes)) genes = Genome.normalize(opts.genes);
    else genes = Genome.roll(rng);
    var dragon = createDragon({ genes: genes }, rng);
    return {
      world: World.createWorld(),
      dragon: dragon,
      rng: rng,
      noise: opts.noise == null ? 0.05 : opts.noise,
      // Hatch ignores a mortality flag. Opt-in is Life.optIn, which the
      // caretaker handle never calls. An agent passing mortality here
      // still gets stasis.
      mortality: false,
      phase: "awake",
      neglect: 0,
      careSeen: 0,
      sessionTicks: 0,
      clock: 0,
      log: [dragon.line]
    };
  }

  function clampPos(n) {
    if (n < 2) return 2;
    if (n > 98) return 98;
    return n;
  }

  function distance(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function senseWorld(sim) {
    var dragon = sim.dragon;
    var found = { food: null, toy: null, nest: null, warmth: null, hand: null };
    var objects = sim.world.objects;
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      if (!found.hasOwnProperty(obj.kind)) continue;
      var dist = distance(dragon.x, dragon.y, obj.x, obj.y);
      var felt = {
        id: obj.id,
        kind: obj.kind,
        x: obj.x,
        y: obj.y,
        dist: dist,
        visible: dist <= Knobs.move.sight,
        ref: obj
      };
      if (!found[obj.kind] || dist < found[obj.kind].dist) found[obj.kind] = felt;
    }
    return found;
  }

  function inReach(senseObj) {
    return !!(senseObj && senseObj.visible && senseObj.dist <= Knobs.move.reach);
  }

  function stomachRoom(body) {
    return Knobs.stomach.cap - body.conc[Chem.STOMACH];
  }

  function wantsFood(drives, traits, body) {
    return drives.hunger >= traits.refuseEatBelow && stomachRoom(body) >= 8;
  }

  function wantsToy(drives, traits) {
    if (drives.boredom < traits.playMin) return false;
    if (drives.sleepiness >= Knobs.choose.tiredIgnorePlay) return false;
    if (drives.hunger >= Knobs.choose.hungryIgnorePlay) return false;
    return true;
  }

  function wantsNest(drives, traits) {
    return drives.sleepiness >= traits.sleepMin;
  }

  function wantsHand(drives, traits) {
    return drives.loneliness >= traits.companyMin;
  }

  function wantsWarmth(drives, traits) {
    return drives.chill >= traits.baskMin;
  }

  function topDrive(drives) {
    var names = ["hunger", "boredom", "loneliness", "sleepiness", "chill"];
    var top = names[0];
    for (var i = 1; i < names.length; i++) {
      if (drives[names[i]] > drives[top]) top = names[i];
    }
    return top;
  }

  function moveTarget(sim, sense, drives) {
    var traits = sim.dragon.traits;
    var options = [];
    function maybe(senseObj, drive, wants) {
      if (senseObj && senseObj.visible && senseObj.dist > Knobs.move.reach && wants) {
        options.push({ kind: senseObj.kind, x: senseObj.x, y: senseObj.y, drive: drive });
      }
    }
    maybe(sense.food, "hunger", wantsFood(drives, traits, sim.dragon.body));
    maybe(sense.toy, "boredom", wantsToy(drives, traits));
    maybe(sense.nest, "sleepiness", wantsNest(drives, traits));
    maybe(sense.hand, "loneliness", wantsHand(drives, traits));
    maybe(sense.warmth, "chill", wantsWarmth(drives, traits));
    if (!options.length) return null;
    var top = topDrive(drives);
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var sal = traits.salience[SALIENCE[opt.drive]] || 1;
      var score = (drives[opt.drive] / 255) * sal + (opt.drive === top ? 0.75 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }
    return best;
  }

  function affordance(verb, sim, sense, drives) {
    var traits = sim.dragon.traits;
    var sal = traits.salience;
    if (verb === "eat") return inReach(sense.food) && wantsFood(drives, traits, sim.dragon.body) ? sal.food : 0;
    if (verb === "play") return inReach(sense.toy) && wantsToy(drives, traits) ? sal.toy : 0;
    if (verb === "nuzzle") return inReach(sense.hand) && wantsHand(drives, traits) ? sal.hand : 0;
    if (verb === "sleep") return inReach(sense.nest) && wantsNest(drives, traits) ? sal.nest : 0;
    if (verb === "bask") return inReach(sense.warmth) && wantsWarmth(drives, traits) ? sal.warmth : 0;
    if (verb === "move") return moveTarget(sim, sense, drives) ? 1 : 0;
    return 0;
  }

  function weight(drive, verb) {
    var row = INNATE[drive];
    if (row && Object.prototype.hasOwnProperty.call(row, verb)) return row[verb];
    return 0.12;
  }

  function choose(sim, sense) {
    var drives = sim.dragon.body.drives();
    var traits = sim.dragon.traits;
    if (drives.hunger >= Knobs.choose.starve && inReach(sense.food) && stomachRoom(sim.dragon.body) >= 8) {
      return { verb: "eat", drive: "hunger" };
    }
    var top = topDrive(drives);
    if (drives[top] < Knobs.choose.idleBelow) return { verb: "idle", drive: top };
    var verbs = ["eat", "play", "nuzzle", "sleep", "bask", "move"];
    var names = ["hunger", "boredom", "loneliness", "sleepiness", "chill"];
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < verbs.length; i++) {
      var verb = verbs[i];
      var gate = affordance(verb, sim, sense, drives);
      if (gate <= 0) continue;
      var score = (drives[top] / 255) * weight(top, verb);
      for (var d = 0; d < names.length; d++) {
        if (names[d] === top) continue;
        score += Knobs.choose.arbitration * (drives[names[d]] / 255) * weight(names[d], verb);
      }
      score *= gate;
      if (verb === "sleep" && sim.world.light <= Knobs.choose.dimLight) score *= Knobs.choose.dimSleepBias;
      if (sim.noise > 0) score += sim.rng() * sim.noise;
      if (score > bestScore) {
        bestScore = score;
        best = verb;
      }
    }
    return { verb: best || "idle", drive: top };
  }

  function pack(verb, detail, msg) {
    return { verb: verb, detail: detail, sig: verb + "|" + detail, msg: msg || "" };
  }

  function describeIdle(sim, sense, drives) {
    var name = sim.dragon.name;
    var traits = sim.dragon.traits;
    var body = sim.dragon.body;
    var top = topDrive(drives);
    if (inReach(sense.food) && stomachRoom(body) < 8) {
      return pack("idle", "refuse-full", name + " noses the trough, too full to swallow.");
    }
    if (inReach(sense.food) && !wantsFood(drives, traits, body)) {
      return pack("idle", "refuse-full", name + " noses the trough, not hungry enough.");
    }
    if (inReach(sense.toy) && !wantsToy(drives, traits)) {
      if (drives.sleepiness >= Knobs.choose.tiredIgnorePlay) {
        return pack("idle", "glance-tired", name + " glances at the toy, too drowsy to play.");
      }
      if (drives.hunger >= Knobs.choose.hungryIgnorePlay) {
        return pack("idle", "glance-hungry", name + " glances at the toy and looks for food instead.");
      }
      return pack("idle", "glance-toy", name + " glances at the toy, not in the mood.");
    }
    if (inReach(sense.nest) && !wantsNest(drives, traits)) {
      return pack("idle", "refuse-sleep", name + " isn't drowsy enough for the nest.");
    }
    if (inReach(sense.hand) && !wantsHand(drives, traits)) {
      return pack("idle", "glance-hand", name + " barely notices the hand.");
    }
    if (drives[top] < Knobs.choose.idleBelow) return pack("idle", "content", name + " potters, content.");
    if (top === "hunger") return pack("idle", "want-food", name + " looks around for a bite.");
    if (top === "boredom") return pack("idle", "want-play", name + " fidgets, nothing fun in reach.");
    if (top === "sleepiness") return pack("idle", "want-sleep", name + " is drowsy, and there's nowhere soft.");
    if (top === "chill") return pack("idle", "want-warmth", name + " shuffles, looking for warmth.");
    return pack("idle", "want-company", name + " looks around for company.");
  }

  function moveToward(dragon, x, y) {
    var dx = x - dragon.x;
    var dy = y - dragon.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var speed = Knobs.move.speed;
    if (dist <= speed || dist === 0) {
      dragon.x = clampPos(x);
      dragon.y = clampPos(y);
      return;
    }
    dragon.x = clampPos(dragon.x + dx / dist * speed);
    dragon.y = clampPos(dragon.y + dy / dist * speed);
  }

  function act(sim, choice, sense) {
    var dragon = sim.dragon;
    var body = dragon.body;
    var name = dragon.name;
    var drives = body.drives();
    if (choice.verb === "idle") return describeIdle(sim, sense, drives);

    if (choice.verb === "move") {
      var target = moveTarget(sim, sense, drives);
      if (!target) return pack("idle", "content", name + " potters, content.");
      moveToward(dragon, target.x, target.y);
      return pack("move", "approach-" + target.kind, name + " pads toward the " + (LABEL[target.kind] || target.kind) + ".");
    }

    if (choice.verb === "eat") {
      var room = stomachRoom(body);
      if (room < 8) {
        body.shock(8);
        dragon.flags.bloated = true;
        return pack("idle", "refuse-full", name + " turns from the trough. The stomach will take no more.");
      }
      var bite = Knobs.stomach.bite;
      if (bite > room) bite = room;
      var took = body.emit(Chem.STOMACH, bite, "eat");
      if (took <= 0) {
        body.shock(8);
        return pack("idle", "refuse-full", name + " turns from the trough. The stomach will take no more.");
      }
      if (sense.food && sense.food.ref) {
        if (!World.takeUse(sense.food.ref)) World.removeId(sim.world, sense.food.id);
      }
      dragon.flags.bloated = false;
      return pack("eat", "bite", name + " takes a mouthful. The stomach takes it in.");
    }

    if (choice.verb === "play") {
      body.emit(Chem.NOVELTY, Knobs.play.novelty, "play");
      body.accrue(Chem.HUNGER, Knobs.play.hunger, "play");
      body.drain(Chem.ENERGY, Knobs.play.energy);
      if (sense.toy && sense.toy.ref) {
        if (!World.takeUse(sense.toy.ref)) World.removeId(sim.world, sense.toy.id);
      }
      return pack("play", "bout", name + " bats the toy about.");
    }

    if (choice.verb === "nuzzle") {
      body.emit(Chem.COMPANY, Knobs.nuzzle.company, "nuzzle");
      if (sense.hand && sense.hand.ref) {
        if (!World.takeUse(sense.hand.ref)) World.removeId(sim.world, sense.hand.id);
      }
      return pack("nuzzle", "accept", name + " leans into the hand.");
    }

    if (choice.verb === "bask") {
      body.emit(Chem.WARMTH, Knobs.bask.warmth, "bask");
      if (sense.warmth && sense.warmth.ref) {
        if (!World.takeUse(sense.warmth.ref)) World.removeId(sim.world, sense.warmth.id);
      }
      return pack("bask", "soak", name + " settles on the warm stone.");
    }

    if (choice.verb === "sleep") {
      body.asleep = Knobs.sleep.bout;
      return pack("sleep", "asleep", name + " curls into the nest.");
    }

    return pack("idle", "content", name + " potters, content.");
  }

  function pushLog(sim, msg) {
    if (!msg) return;
    sim.dragon.line = msg;
    sim.log.push(msg);
    if (sim.log.length > Knobs.logMax) sim.log.shift();
  }

  function notice(sim, sense, events) {
    var name = sim.dragon.name;
    var seen = sim.dragon.noticed;
    function once(key, obj, msg) {
      if (obj && obj.visible) {
        if (seen[key] !== obj.id) {
          seen[key] = obj.id;
          events.push({ msg: msg });
          pushLog(sim, msg);
        }
      } else {
        seen[key] = "";
      }
    }
    once("food", sense.food, name + " notices the trough.");
    once("toy", sense.toy, name + " notices the toy.");
    once("nest", sense.nest, name + " notices the nest.");
    once("warmth", sense.warmth, name + " notices the warm stone.");
    once("hand", sense.hand, name + " notices the hand.");
  }

  // Room heat flows into the heat sensor by emit-and-decay, never by assignment.
  function coupleHeat(dragon, ambient) {
    var target = Math.round(ambient * 255 / 100);
    var m = Chem.MULTIPLIERS[4];
    if (m <= 0 || m >= 1) return;
    dragon.heatAcc += target * (1 - m) / m;
    var whole = Math.floor(dragon.heatAcc);
    if (whole > 0) {
      dragon.body.emit(Chem.HEAT, whole, "room");
      dragon.heatAcc -= whole;
    }
    dragon.heatAcc = Math.round(dragon.heatAcc * 10000) / 10000;
  }

  function feltEdges(sim, events) {
    var heat = sim.dragon.body.conc[Chem.HEAT];
    var band = sim.dragon.traits.comfort;
    var flags = sim.dragon.flags;
    var name = sim.dragon.name;
    if (heat > band.high && !flags.hot) {
      flags.hot = true;
      events.push({ msg: name + " pants. The pen is too warm." });
      pushLog(sim, name + " pants. The pen is too warm.");
    }
    if (heat < band.high - 18) flags.hot = false;
    if (heat < band.low && !flags.cold) {
      flags.cold = true;
      events.push({ msg: name + " shivers in the cool air." });
      pushLog(sim, name + " shivers in the cool air.");
    }
    if (heat > band.low + 18) flags.cold = false;
  }

  function remember(sim, outcome, events) {
    if (outcome.sig !== sim.dragon.sig) {
      sim.dragon.sig = outcome.sig;
      if (outcome.msg) {
        pushLog(sim, outcome.msg);
        events.push({ msg: outcome.msg });
      }
    } else if (outcome.msg) {
      sim.dragon.line = outcome.msg;
    }
    sim.dragon.verb = sim.dragon.body.asleep > 0 ? "sleep" : outcome.verb;
    sim.dragon.detail = outcome.detail;
  }

  function step(sim) {
    var events = [];
    if (sim.phase === "dead") return events;
    if (sim.phase === "dormant") {
      if (sim.world.care === sim.careSeen) return events;
      sim.phase = "awake";
      sim.neglect = 0;
      sim.careSeen = sim.world.care;
      sim.dragon.body.shock(4);
      sim.dragon.body.emit(Chem.SLEEPINESS, Knobs.sleep.groggy, "wake");
      sim.dragon.verb = "idle";
      sim.dragon.detail = "groggy";
      sim.dragon.sig = "";
      pushLog(sim, sim.dragon.name + " stirs, groggy.");
      events.push({ msg: sim.dragon.line });
    }

    var dragon = sim.dragon;
    var body = dragon.body;
    var wasAsleep = body.asleep > 0;
    var outcome;

    if (wasAsleep) {
      outcome = pack("sleep", "asleep", "");
    } else {
      var sense = senseWorld(sim);
      notice(sim, sense, events);
      outcome = act(sim, choose(sim, sense), sense);
    }

    coupleHeat(dragon, sim.world.heat);
    body.tick();

    if (wasAsleep && body.asleep === 0) {
      outcome = pack("idle", "woke", dragon.name + " wakes.");
    }

    feltEdges(sim, events);
    remember(sim, outcome, events);

    if (sim.phase === "awake") {
      var expired = World.age(sim.world);
      for (var i = 0; i < expired.length; i++) {
        events.push(expired[i]);
        pushLog(sim, expired[i].msg);
      }
    }

    var report = Life.afterTick(sim);
    var extra = report.events || [];
    for (var e = 0; e < extra.length; e++) {
      events.push(extra[e]);
      pushLog(sim, extra[e].msg);
    }
    if (sim.phase === "dormant" || sim.phase === "dead") {
      dragon.verb = sim.phase === "dead" ? "still" : "wait";
      dragon.detail = sim.phase;
    }
    sim.clock += 1;
    return events;
  }

  return {
    NAMES: NAMES,
    createSim: createSim,
    step: step,
    senseWorld: senseWorld,
    applyTraits: applyTraits
  };
});
