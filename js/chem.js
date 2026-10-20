/* Dragon chemistry. Drives are chemicals. emit() is the inlet, and only the
   creature's own step may call it. Adding a drive later is a row in DRIVES
   plus a PRESSURE or COUPLINGS row, not a new pathway.

   Decay tables follow the Creatures-style reference (the same arithmetic
   WebNorns borrows). Reactions cancel a molecule against a need. They do
   not award anything. */
(function (root, factory) {
  var Knobs = root.DragonKnobs || (typeof require === "function" ? require("./knobs.js") : null);
  var api = factory(Knobs);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DragonChem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Knobs) {
  "use strict";

  var SLOTS = 32;

  var EVERY = [
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 3, 7, 15, 31, 63, 127, 255,
    511, 1023, 2047, 4095, 8191, 16383, 32767, 65535,
    131071, 262143, 524287, 1048575, 2097151, 4194303, 8388607, 16777215
  ];

  var MULTIPLIERS = [
    0.0,
    0.1978302001953125,
    0.4447784423828125,
    0.6669158935546875,
    0.816650390625,
    0.9036865234375,
    0.95062255859375,
    0.9749908447265625
  ];
  while (MULTIPLIERS.length < 31) MULTIPLIERS.push(0.9749908447265625);
  MULTIPLIERS.push(0.9999847412109375);

  // Stable ids. 15–31 are free so a later drive can take a slot without
  // renumbering a packet. Candidates when the ranch earns them: thirst,
  // fear, itch, curiosity, bond, ache.
  var STOMACH = 1;
  var HUNGER = 2;
  var ENERGY = 3;
  var SLEEPINESS = 4;
  var BOREDOM = 5;
  var LONELINESS = 6;
  var CHILL = 7;
  var HEAT = 8;
  var REST = 9;
  var NOVELTY = 10;
  var COMPANY = 11;
  var WARMTH = 12;
  var COMFORT = 13;
  var DISTRESS = 14;

  var DRIVES = [
    { name: "hunger", chem: HUNGER, kind: "need" },
    { name: "energy", chem: ENERGY, kind: "store" },
    { name: "sleepiness", chem: SLEEPINESS, kind: "need" },
    { name: "boredom", chem: BOREDOM, kind: "need" },
    { name: "loneliness", chem: LONELINESS, kind: "need" },
    { name: "chill", chem: CHILL, kind: "need" }
  ];

  var NEED_NAMES = ["hunger", "sleepiness", "boredom", "loneliness", "chill"];

  // Slow decay on drives (verbs and reactions move them). Molecules fade
  // quicker. Stomach and energy are not decayed: digestion and the drain
  // row are the only ways they move.
  var SLOW = 13 << 3;
  var MOLECULE = 6 << 3;
  var FAST = 2 << 3;
  var SENSOR = 4 << 3;

  var RATE = {};
  RATE[HUNGER] = SLOW;
  RATE[SLEEPINESS] = SLOW;
  RATE[BOREDOM] = SLOW;
  RATE[LONELINESS] = SLOW;
  RATE[CHILL] = 12 << 3;
  RATE[HEAT] = SENSOR;
  RATE[REST] = MOLECULE;
  RATE[NOVELTY] = MOLECULE;
  RATE[COMPANY] = MOLECULE;
  RATE[WARMTH] = MOLECULE;
  RATE[COMFORT] = FAST;
  RATE[DISTRESS] = FAST;

  // Molecule × need, both consumed, no product. Relief is the drop itself.
  var REACTIONS = [
    [1, REST, 1, SLEEPINESS, FAST, 0, 0, 0, 0],
    [1, NOVELTY, 1, BOREDOM, FAST, 0, 0, 0, 0],
    [1, COMPANY, 1, LONELINESS, FAST, 0, 0, 0, 0],
    [1, WARMTH, 1, CHILL, FAST, 0, 0, 0, 0]
  ];

  // Base weather of each drive. Couplings below scale some of these.
  var PRESSURE = [
    { name: "hunger-awake", when: "awake", chem: HUNGER, amount: Knobs.pressure.hunger, scale: "hunger", source: "time" },
    { name: "sleepiness-awake", when: "awake", chem: SLEEPINESS, amount: Knobs.pressure.sleepiness, scale: "sleepiness", source: "time" },
    { name: "boredom-awake", when: "awake", chem: BOREDOM, amount: Knobs.pressure.boredom, scale: "boredom", source: "time" },
    { name: "loneliness-awake", when: "awake", chem: LONELINESS, amount: Knobs.pressure.loneliness, scale: "loneliness", source: "time" },
    { name: "chill-when-cold", when: "awake", chem: CHILL, amount: Knobs.pressure.chill, scale: "chill", source: "cold", belowComfort: true },
    { name: "too-hot-to-settle", when: "awake", chem: SLEEPINESS, amount: Knobs.pressure.heatSleep, scale: "sleepiness", source: "heat", aboveComfort: true },
    { name: "energy-drain", when: "awake", chem: ENERGY, amount: Knobs.pressure.energyDrain, scale: "energyDrain", drain: true },
    { name: "hunger-while-asleep", when: "asleep", chem: HUNGER, amount: Knobs.pressure.hungerWhileAsleep, scale: "hunger", source: "time" },
    { name: "rest-while-asleep", when: "asleep", chem: REST, amount: Knobs.sleep.restEmit, source: "sleep" }
  ];

  // Each coupling is one row: a rate scaled by a concentration, or a
  // produce amount while asleep. Strong rows can spiral, so these stay mild.
  var COUPLINGS = [
    {
      name: "sleep-restores-less-energy-when-hungry",
      when: "asleep",
      chem: ENERGY,
      produce: Knobs.sleep.energy,
      inhibitBy: HUNGER,
      strength: Knobs.sleep.inhibit,
      source: "sleep"
    },
    {
      name: "boredom-accelerates-when-fed-and-rested",
      when: "awake",
      chem: BOREDOM,
      boostWhenLow: [HUNGER, SLEEPINESS],
      strength: 2
    },
    {
      name: "loneliness-slows-when-starving",
      when: "awake",
      chem: LONELINESS,
      inhibitBy: HUNGER,
      strength: 0.8
    }
  ];

  function decayChemical(concentration, rate, biotick) {
    var r = rate >> 3;
    if (r < 0) r = 0;
    if (r > 31) r = 31;
    var every = EVERY[r];
    if ((biotick & every) === every) {
      var c = Math.trunc(concentration * MULTIPLIERS[r]);
      return c > 255 ? 255 : (c < 0 ? 0 : c);
    }
    return concentration;
  }

  function addSat(a, b) {
    var v = a + b;
    return v > 255 ? 255 : v;
  }

  function subSat(a, b) {
    var v = a - b;
    return v < 0 ? 0 : v;
  }

  function mulSat(a, b) {
    var v = a * b;
    return v > 255 ? 255 : v;
  }

  function round4(n) {
    return Math.round(n * 10000) / 10000;
  }

  function runReaction(conc, rxn, biotick) {
    var r1Prop = rxn[0], r1Chem = rxn[1], r2Prop = rxn[2], r2Chem = rxn[3];
    var rate = rxn[4], p1Prop = rxn[5], p1Chem = rxn[6], p2Prop = rxn[7], p2Chem = rxn[8];
    var availability = 255;
    if (r1Chem !== 0 && r1Prop !== 0) availability = Math.floor(conc[r1Chem] / r1Prop);
    if (r2Chem !== 0 && r2Prop !== 0) {
      var availability2 = Math.floor(conc[r2Chem] / r2Prop);
      if (availability2 < availability) availability = availability2;
    }
    if (availability === 0) return;
    var diff = availability - decayChemical(availability, rate, biotick);
    if (diff === 0) return;
    if (r1Chem !== 0) conc[r1Chem] = subSat(conc[r1Chem], mulSat(diff, r1Prop));
    if (r2Chem !== 0) conc[r2Chem] = subSat(conc[r2Chem], mulSat(diff, r2Prop));
    if (p1Chem !== 0 && p1Prop !== 0) conc[p1Chem] = addSat(conc[p1Chem], mulSat(diff, p1Prop));
    if (p2Chem !== 0 && p2Prop !== 0) conc[p2Chem] = addSat(conc[p2Chem], mulSat(diff, p2Prop));
  }

  function defaultScales() {
    return {
      hunger: 1,
      sleepiness: 1,
      boredom: 1,
      loneliness: 1,
      chill: 1,
      energyDrain: 1,
      digest: 1,
      mood: 1
    };
  }

  function Body() {
    this.conc = new Uint8Array(SLOTS);
    this.biotick = 0;
    this.asleep = 0;
    this.acc = {};
    this.lastSource = {};
    this.pendingShock = 0;
    this.weather = 0;
    this.climate = 0;
    this.scales = defaultScales();
    this.comfort = { low: 90, high: 180 };
  }

  Body.prototype.emit = function (chem, amount, source) {
    var n = Math.floor(amount);
    if (!(n > 0) || !(chem > 0) || chem >= SLOTS) return 0;
    if (chem === STOMACH) {
      var room = Knobs.stomach.cap - this.conc[STOMACH];
      if (room <= 0) return 0;
      if (n > room) n = room;
    }
    this.conc[chem] = addSat(this.conc[chem], n);
    this.lastSource[chem] = source || "";
    return n;
  };

  Body.prototype.shock = function (amount) {
    if (amount > 0) this.pendingShock += amount;
  };

  Body.prototype.accrue = function (chem, amount, source) {
    if (!(amount > 0) || !(chem > 0)) return;
    var key = String(chem);
    this.acc[key] = round4((this.acc[key] || 0) + amount);
    var whole = Math.floor(this.acc[key]);
    if (whole > 0) {
      this.acc[key] = round4(this.acc[key] - whole);
      this.emit(chem, whole, source || "time");
    }
  };

  Body.prototype.drain = function (chem, amount) {
    if (!(amount > 0) || !(chem > 0)) return;
    var key = "d" + chem;
    this.acc[key] = round4((this.acc[key] || 0) + amount);
    var whole = Math.floor(this.acc[key]);
    if (whole > 0) {
      this.acc[key] = round4(this.acc[key] - whole);
      this.conc[chem] = subSat(this.conc[chem], whole);
    }
  };

  function couplingScale(body, chem, when) {
    var scale = 1;
    for (var i = 0; i < COUPLINGS.length; i++) {
      var row = COUPLINGS[i];
      if (row.when !== when || row.chem !== chem || row.produce != null) continue;
      if (row.inhibitBy != null) {
        var inhibited = 1 - row.strength * (body.conc[row.inhibitBy] / 255);
        if (inhibited < 0) inhibited = 0;
        scale *= inhibited;
      } else if (row.boostWhenLow) {
        var prod = 1;
        for (var j = 0; j < row.boostWhenLow.length; j++) {
          prod *= 1 - body.conc[row.boostWhenLow[j]] / 255;
        }
        scale *= 1 + row.strength * prod;
      }
    }
    return scale;
  }

  function applyPressure(body, when) {
    for (var i = 0; i < PRESSURE.length; i++) {
      var row = PRESSURE[i];
      if (row.when !== when) continue;
      var scale = row.scale ? (body.scales[row.scale] || 1) : 1;
      var amount = row.amount * scale * couplingScale(body, row.chem, when);
      if (row.belowComfort) {
        var gap = body.comfort.low - body.conc[HEAT];
        if (gap <= 0) continue;
        amount *= gap / 255;
      }
      if (row.aboveComfort && body.conc[HEAT] <= body.comfort.high) continue;
      if (row.drain) body.drain(row.chem, amount);
      else body.accrue(row.chem, amount, row.source);
    }
  }

  function applyProduceCouplings(body, when) {
    for (var i = 0; i < COUPLINGS.length; i++) {
      var row = COUPLINGS[i];
      if (row.when !== when || row.produce == null) continue;
      var amount = row.produce;
      if (row.inhibitBy != null) {
        var inhibited = 1 - row.strength * (body.conc[row.inhibitBy] / 255);
        if (inhibited < 0) inhibited = 0;
        amount *= inhibited;
      }
      body.accrue(row.chem, amount, row.source || "couple");
    }
  }

  function digest(body) {
    var rate = Math.round(Knobs.stomach.digest * (body.scales.digest || 1));
    if (rate < 1) rate = 1;
    var have = body.conc[STOMACH];
    if (have <= 0) return 0;
    if (rate > have) rate = have;
    body.conc[STOMACH] = have - rate;
    var ease = rate;
    if (ease > body.conc[HUNGER]) ease = body.conc[HUNGER];
    body.conc[HUNGER] = subSat(body.conc[HUNGER], ease);
    body.emit(ENERGY, rate, "digest");
    return ease;
  }

  function needSnapshot(body) {
    return {
      hunger: body.conc[HUNGER],
      sleepiness: body.conc[SLEEPINESS],
      boredom: body.conc[BOREDOM],
      loneliness: body.conc[LONELINESS],
      chill: body.conc[CHILL]
    };
  }

  function reliefOf(before, after) {
    var total = 0;
    for (var i = 0; i < NEED_NAMES.length; i++) {
      var name = NEED_NAMES[i];
      var drop = before[name] - after[name];
      if (drop > 0) total += drop;
    }
    return total;
  }

  function decayAll(body) {
    for (var chem = 1; chem < SLOTS; chem++) {
      if (!body.conc[chem] || !RATE[chem]) continue;
      body.conc[chem] = decayChemical(body.conc[chem], RATE[chem], body.biotick);
    }
  }

  function updateMood(body, relief) {
    if (relief > 0) body.emit(COMFORT, relief > 255 ? 255 : relief, "relief");
    if (body.pendingShock > 0) {
      var shock = Math.round(body.pendingShock);
      if (shock > 255) shock = 255;
      if (shock > 0) body.emit(DISTRESS, shock, "shock");
      body.pendingShock = 0;
    }
    decayAll(body);
    var flash = (body.conc[COMFORT] - body.conc[DISTRESS]) * Knobs.mood.flash * (body.scales.mood || 1);
    var weather = body.weather * Knobs.mood.weatherDecay + flash;
    var cap = Knobs.mood.cap;
    if (weather > cap) weather = cap;
    if (weather < -cap) weather = -cap;
    body.weather = round4(weather);
    var climate = body.climate + (body.weather - body.climate) * Knobs.mood.climateRate;
    if (climate > cap) climate = cap;
    if (climate < -cap) climate = -cap;
    body.climate = round4(climate);
  }

  Body.prototype.tick = function () {
    this.biotick += 1;
    if (this.asleep > 0) {
      this.asleep -= 1;
      applyPressure(this, "asleep");
      applyProduceCouplings(this, "asleep");
    } else {
      applyPressure(this, "awake");
    }
    var before = needSnapshot(this);
    digest(this);
    for (var i = 0; i < REACTIONS.length; i++) runReaction(this.conc, REACTIONS[i], this.biotick);
    var relief = reliefOf(before, needSnapshot(this));
    updateMood(this, relief);
  };

  Body.prototype.drives = function () {
    return {
      hunger: this.conc[HUNGER],
      energy: this.conc[ENERGY],
      sleepiness: this.conc[SLEEPINESS],
      boredom: this.conc[BOREDOM],
      loneliness: this.conc[LONELINESS],
      chill: this.conc[CHILL]
    };
  };

  return {
    SLOTS: SLOTS,
    EVERY: EVERY,
    MULTIPLIERS: MULTIPLIERS,
    STOMACH: STOMACH,
    HUNGER: HUNGER,
    ENERGY: ENERGY,
    SLEEPINESS: SLEEPINESS,
    BOREDOM: BOREDOM,
    LONELINESS: LONELINESS,
    CHILL: CHILL,
    HEAT: HEAT,
    REST: REST,
    NOVELTY: NOVELTY,
    COMPANY: COMPANY,
    WARMTH: WARMTH,
    COMFORT: COMFORT,
    DISTRESS: DISTRESS,
    DRIVES: DRIVES,
    PRESSURE: PRESSURE,
    COUPLINGS: COUPLINGS,
    REACTIONS: REACTIONS,
    RATE: RATE,
    decayChemical: decayChemical,
    addSat: addSat,
    subSat: subSat,
    mulSat: mulSat,
    runReaction: runReaction,
    Body: Body
  };
});
