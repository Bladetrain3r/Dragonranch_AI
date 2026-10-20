/* Caretaker handle. observe reads. act changes the pen only.
   advance runs the dragon. Nothing here writes a drive, a need, a
   chemical, or a gene. There is no score. */
(function (root, factory) {
  var Chem = root.DragonChem || (typeof require === "function" ? require("./chem.js") : null);
  var Genome = root.DragonGenome || (typeof require === "function" ? require("./genome.js") : null);
  var World = root.DragonWorld || (typeof require === "function" ? require("./world.js") : null);
  var Dragon = root.DragonBody || (typeof require === "function" ? require("./dragon.js") : null);
  var Carry = root.DragonCarry || (typeof require === "function" ? require("./carry.js") : null);
  var Knobs = root.DragonKnobs || (typeof require === "function" ? require("./knobs.js") : null);
  var api = factory(Chem, Genome, World, Dragon, Carry, Knobs);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Dragonranch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chem, Genome, World, Dragon, Carry, Knobs) {
  "use strict";

  var CATALOG = [
    { action: "place", kinds: ["food", "toy", "nest", "warmth", "hand"], fields: ["x", "y", "intent"] },
    { action: "ambient", fields: ["heat", "intent"] },
    { action: "light", fields: ["level", "intent"] }
  ];

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function wordNeed(reading) {
    if (reading >= 210) return "critical";
    if (reading >= 150) return "loud";
    if (reading >= 90) return "pressing";
    if (reading >= 40) return "stirring";
    return "eased";
  }

  function wordStore(reading) {
    if (reading <= 36) return "spent";
    if (reading <= 90) return "low";
    if (reading <= 170) return "steady";
    return "bright";
  }

  function wordStomach(fill) {
    if (fill <= 0) return "empty";
    if (fill >= Knobs.stomach.cap - 8) return "full";
    if (fill >= Knobs.stomach.cap * 0.45) return "working";
    return "a mouthful";
  }

  function wordWeather(reading) {
    if (reading >= 24) return "bright";
    if (reading >= 8) return "lifted";
    if (reading <= -24) return "stormy";
    if (reading <= -8) return "grey";
    return "calm";
  }

  function wordClimate(reading) {
    if (reading >= 16) return "sunny";
    if (reading >= 6) return "mild";
    if (reading <= -16) return "bleak";
    if (reading <= -6) return "cool";
    return "steady";
  }

  function postureOf(sim) {
    if (sim.phase === "dormant") return "still";
    if (sim.phase === "dead") return "still";
    var verb = sim.dragon.verb;
    if (verb === "sleep" || sim.dragon.body.asleep > 0) return "curled";
    if (verb === "eat") return "feeding";
    if (verb === "play") return "playing";
    if (verb === "move") return "seeking";
    if (verb === "bask") return "basking";
    if (verb === "nuzzle") return "leaning";
    if (sim.dragon.body.weather <= -8) return "tight";
    if (sim.dragon.body.weather >= 8) return "loose";
    return "settled";
  }

  function faceOf(sim) {
    if (sim.phase === "dormant") return "quiet";
    if (sim.phase === "dead") return "still";
    if (sim.dragon.body.asleep > 0 || sim.dragon.verb === "sleep") return "sleeping";
    var weather = sim.dragon.body.weather;
    if (weather >= 24) return "bright";
    if (weather <= -24) return "stormy";
    if (weather <= -8) return "grey";
    if (sim.dragon.verb === "eat" || sim.dragon.verb === "play") return "intent";
    return "calm";
  }

  function driveView(body) {
    var drives = {};
    for (var i = 0; i < Chem.DRIVES.length; i++) {
      var row = Chem.DRIVES[i];
      var reading = body.conc[row.chem];
      drives[row.name] = {
        kind: row.kind,
        reading: reading,
        word: row.kind === "store" ? wordStore(reading) : wordNeed(reading)
      };
    }
    return drives;
  }

  function observe(sim) {
    var dragon = sim.dragon;
    var body = dragon.body;
    var log = sim.log.slice();
    return {
      v: 1,
      place: sim.world.place,
      phase: sim.phase,
      room: World.view(sim.world),
      dragon: {
        name: dragon.name,
        color: dragon.color,
        x: round2(dragon.x),
        y: round2(dragon.y),
        age: body.biotick,
        verb: dragon.verb,
        detail: dragon.detail,
        line: dragon.line,
        asleep: body.asleep > 0,
        posture: postureOf(sim),
        face: faceOf(sim),
        weather: { word: wordWeather(body.weather), reading: round2(body.weather) },
        climate: { word: wordClimate(body.climate), reading: round2(body.climate) }
      },
      drives: driveView(body),
      stomach: {
        reading: body.conc[Chem.STOMACH],
        cap: Knobs.stomach.cap,
        word: wordStomach(body.conc[Chem.STOMACH])
      },
      traits: {
        words: Genome.words(dragon.genome),
        genes: dragon.genome.slice()
      },
      log: log,
      caretaker: { said: sim.world.lastIntent || "" },
      time: {
        perCall: Knobs.time.maxTicksPerCall,
        perSession: Knobs.time.maxTicksPerSession,
        used: sim.sessionTicks
      },
      actions: CATALOG
    };
  }

  function cleanIntent(text) {
    if (typeof text !== "string" || !text) return "";
    var out = "";
    for (var i = 0; i < text.length && out.length < Knobs.intentMax; i++) {
      var code = text.charCodeAt(i);
      if (code >= 32 && code !== 127) out += text.charAt(i);
      else if (code === 10 || code === 9) out += " ";
    }
    return out;
  }

  function bodySnap(sim) {
    var body = sim.dragon.body;
    return {
      conc: Array.prototype.slice.call(body.conc),
      asleep: body.asleep,
      age: body.biotick,
      weather: body.weather,
      climate: body.climate,
      shock: body.pendingShock,
      acc: JSON.stringify(body.acc),
      scales: JSON.stringify(body.scales),
      comfort: JSON.stringify(body.comfort),
      genes: sim.dragon.genome.slice(),
      mortality: sim.mortality === true,
      phase: sim.phase,
      neglect: sim.neglect
    };
  }

  function restoreBody(sim, snap) {
    var body = sim.dragon.body;
    body.conc = new Uint8Array(Chem.SLOTS);
    for (var i = 0; i < snap.conc.length && i < Chem.SLOTS; i++) body.conc[i] = snap.conc[i];
    body.asleep = snap.asleep;
    body.biotick = snap.age;
    body.weather = snap.weather;
    body.climate = snap.climate;
    body.pendingShock = snap.shock;
    body.acc = JSON.parse(snap.acc);
    body.scales = JSON.parse(snap.scales);
    body.comfort = JSON.parse(snap.comfort);
    sim.dragon.genome = snap.genes.slice();
    sim.dragon.traits = Genome.express(sim.dragon.genome);
    sim.mortality = snap.mortality;
    sim.phase = snap.phase;
    sim.neglect = snap.neglect;
  }

  function act(sim, input) {
    input = input || {};
    var name = input.action;
    var before = bodySnap(sim);
    var result;
    if (name === "place") result = World.place(sim.world, input.kind, input.x, input.y);
    else if (name === "ambient") result = World.setHeat(sim.world, input.heat);
    else if (name === "light") result = World.setLight(sim.world, input.level);
    else result = { ok: false, error: "unknown action", world: World.view(sim.world) };

    var after = bodySnap(sim);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      restoreBody(sim, before);
      return { ok: false, error: "refused: an action may not write the body" };
    }
    if (!result.ok) {
      return { ok: false, error: result.error, world: result.world };
    }
    var said = cleanIntent(input.intent);
    if (said) sim.world.lastIntent = said;
    return {
      ok: true,
      action: name,
      note: result.note,
      intent: sim.world.lastIntent || "",
      world: result.world
    };
  }

  function advance(sim, ticks) {
    var requested = Math.floor(Number(ticks));
    if (!(requested > 0)) return { ok: false, error: "ticks must be a positive number", advanced: 0 };
    var room = Knobs.time.maxTicksPerSession - sim.sessionTicks;
    if (room <= 0) {
      return {
        ok: false,
        error: "session bound",
        advanced: 0,
        requested: requested,
        capped: true,
        phase: sim.phase
      };
    }
    var budget = requested;
    if (budget > Knobs.time.maxTicksPerCall) budget = Knobs.time.maxTicksPerCall;
    if (budget > room) budget = room;
    var events = [];
    for (var i = 0; i < budget; i++) {
      var stepEvents = Dragon.step(sim);
      sim.sessionTicks += 1;
      for (var e = 0; e < stepEvents.length; e++) {
        if (stepEvents[e].msg) events.push(stepEvents[e].msg);
      }
    }
    if (events.length > 24) events = events.slice(events.length - 24);
    return {
      ok: true,
      advanced: budget,
      requested: requested,
      capped: budget < requested,
      phase: sim.phase,
      events: events
    };
  }

  function fail(err) {
    return { ok: false, error: err && err.message ? err.message : "unreadable packet" };
  }

  function hatch(opts) {
    var sim = Dragon.createSim(opts || {});
    return {
      observe: function () { return observe(sim); },
      act: function (input) { return act(sim, input); },
      advance: function (ticks) { return advance(sim, ticks); },
      exportPacket: function () { return Carry.exportState(sim); },
      importPacket: function (packet) {
        try {
          Carry.importState(sim, packet);
          return { ok: true };
        } catch (err) {
          return fail(err);
        }
      },
      exportSeed: function () { return Carry.exportSeed(sim); },
      importSeed: function (seed) {
        try {
          Carry.importState(sim, Carry.seedToPacket(seed));
          return { ok: true };
        } catch (err) {
          return fail(err);
        }
      }
    };
  }

  return {
    hatch: hatch,
    catalog: function () { return CATALOG.slice(); },
    knobs: Knobs
  };
});
