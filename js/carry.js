/* Portable dragon. A packet is the creature, not the pen.
   The seal rejects a casual edit. It is not a secret signature. */
(function (root, factory) {
  var Chem = root.DragonChem || (typeof require === "function" ? require("./chem.js") : null);
  var Genome = root.DragonGenome || (typeof require === "function" ? require("./genome.js") : null);
  var Dragon = root.DragonSim || (typeof require === "function" ? require("./dragon.js") : null);
  var Knobs = root.DragonKnobs || (typeof require === "function" ? require("./knobs.js") : null);
  var api = factory(Chem, Genome, Dragon, Knobs);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DragonCarry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chem, Genome, Dragon, Knobs) {
  "use strict";

  var PREFIX = "dr1.";
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function round4(n) {
    return Math.round(n * 10000) / 10000;
  }

  function fnv1a(text) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash = hash >>> 0;
    var hex = hash.toString(16);
    while (hex.length < 8) hex = "0" + hex;
    return hex;
  }

  function canonicalize(value) {
    if (value === null || typeof value !== "object") return value;
    if (Object.prototype.toString.call(value) !== "[object Object]" && !Array.isArray(value)) return value;
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) arr.push(canonicalize(value[i]));
      return arr;
    }
    var out = {};
    var keys = Object.keys(value).sort();
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] === "seal") continue;
      out[keys[k]] = canonicalize(value[keys[k]]);
    }
    return out;
  }

  function sealOf(packet) {
    return fnv1a(JSON.stringify(canonicalize(packet)));
  }

  function utf8Bytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return bytes;
  }

  function bytesToString(bytes) {
    var out = "";
    var i = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        i += 1;
      } else if ((b & 0xe0) === 0xc0 && i + 1 < bytes.length) {
        out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
        i += 2;
      } else if ((b & 0xf0) === 0xe0 && i + 2 < bytes.length) {
        out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
        i += 3;
      } else {
        throw new Error("unreadable seed");
      }
    }
    return out;
  }

  function toBase64Url(str) {
    var bytes = utf8Bytes(str);
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += B64[b0 >> 2];
      out += B64[((b0 & 3) << 4) | (b1 >> 4)];
      out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
      out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
    }
    return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function fromBase64Url(text) {
    var clean = String(text).replace(/-/g, "+").replace(/_/g, "/");
    while (clean.length % 4) clean += "=";
    var bytes = [];
    for (var i = 0; i < clean.length; i += 4) {
      var c0 = B64.indexOf(clean.charAt(i));
      var c1 = B64.indexOf(clean.charAt(i + 1));
      var c2 = B64.indexOf(clean.charAt(i + 2));
      var c3 = B64.indexOf(clean.charAt(i + 3));
      if (c0 < 0 || c1 < 0) throw new Error("unreadable seed");
      bytes.push((c0 << 2) | (c1 >> 4));
      if (clean.charAt(i + 2) !== "=" && c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
      if (clean.charAt(i + 3) !== "=" && c3 >= 0) bytes.push(((c2 & 3) << 6) | c3);
    }
    return bytesToString(bytes);
  }

  function sparseChem(conc) {
    var chem = {};
    for (var i = 1; i < conc.length; i++) {
      if (conc[i]) chem[String(i)] = conc[i];
    }
    return chem;
  }

  function sparseAcc(acc) {
    var out = {};
    var key;
    for (key in acc) {
      if (!Object.prototype.hasOwnProperty.call(acc, key)) continue;
      if (!acc[key]) continue;
      out[key] = round4(acc[key]);
    }
    return out;
  }

  function safeName(name, fallback) {
    if (typeof name === "string" && /^[A-Za-z]{3,12}$/.test(name)) return name;
    return fallback;
  }

  function safeColor(color, fallback) {
    if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
    return fallback;
  }

  function exportState(sim) {
    var dragon = sim.dragon;
    var body = dragon.body;
    var packet = {
      v: 1,
      kind: "dragonranch",
      name: dragon.name,
      color: dragon.color,
      g: Genome.normalize(dragon.genome),
      x: round4(dragon.x),
      y: round4(dragon.y),
      age: body.biotick,
      phase: sim.phase,
      mortal: sim.mortality === true,
      asleep: body.asleep,
      neglect: sim.neglect || 0,
      weather: round4(body.weather),
      climate: round4(body.climate),
      heatAcc: round4(dragon.heatAcc || 0),
      chem: sparseChem(body.conc),
      acc: sparseAcc(body.acc)
    };
    packet.seal = sealOf(packet);
    return packet;
  }

  function assertRange(n, lo, hi, label) {
    if (typeof n !== "number" || n !== n || n < lo || n > hi) throw new Error("packet " + label + " is out of range");
  }

  function validate(packet, sim) {
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) throw new Error("unreadable packet");
    if (packet.v !== 1 || packet.kind !== "dragonranch") throw new Error("unknown creature packet");
    if (packet.seal !== sealOf(packet)) throw new Error("packet seal does not match");
    if (packet.mortal === true && !sim.mortality) {
      throw new Error("packet asks for mortality, and this pen did not opt in");
    }
    var phase = packet.phase;
    if (phase !== "awake" && phase !== "dormant" && phase !== "dead") throw new Error("packet phase is unknown");
    assertRange(packet.age, 0, 10000000, "age");
    if (packet.age !== Math.floor(packet.age)) throw new Error("packet age is out of range");
    assertRange(packet.asleep, 0, Knobs.sleep.bout, "asleep");
    if (packet.asleep !== Math.floor(packet.asleep)) throw new Error("packet asleep is out of range");
    assertRange(packet.neglect, 0, 100000, "neglect");
    assertRange(packet.x, 0, 100, "x");
    assertRange(packet.y, 0, 100, "y");
    assertRange(packet.weather, -Knobs.mood.cap, Knobs.mood.cap, "weather");
    assertRange(packet.climate, -Knobs.mood.cap, Knobs.mood.cap, "climate");
    assertRange(packet.heatAcc, 0, 100000, "heat");
    if (!Array.isArray(packet.g) || packet.g.length !== Genome.COUNT) throw new Error("packet genes are missing");
    var gi;
    for (gi = 0; gi < packet.g.length; gi++) {
      if (packet.g[gi] !== Math.floor(packet.g[gi])) throw new Error("packet gene is out of range");
      assertRange(packet.g[gi], 0, 255, "gene");
    }
    if (sim.dragon.body.biotick > packet.age) throw new Error("packet is younger than the dragon already here");
    var genes = Genome.normalize(packet.g);
    if (packet.chem != null && (typeof packet.chem !== "object" || Array.isArray(packet.chem))) {
      throw new Error("packet chemistry is unknown");
    }
    var chem = packet.chem || {};
    var id;
    for (id in chem) {
      if (!Object.prototype.hasOwnProperty.call(chem, id)) continue;
      var at = Number(id);
      if (String(at) !== id || at < 1 || at >= Chem.SLOTS) throw new Error("packet chemistry is unknown");
      var reading = chem[id];
      if (reading !== Math.floor(reading)) throw new Error("packet chemistry is unknown");
      assertRange(reading, 0, 255, "chemistry");
      if (at === Chem.STOMACH && reading > Knobs.stomach.cap) throw new Error("packet stomach is over the cap");
    }
    if (packet.acc != null && (typeof packet.acc !== "object" || Array.isArray(packet.acc))) {
      throw new Error("packet accumulator is unknown");
    }
    var acc = packet.acc || {};
    var key;
    for (key in acc) {
      if (!Object.prototype.hasOwnProperty.call(acc, key)) continue;
      if (!/^d?[0-9]+$/.test(key)) throw new Error("packet accumulator is unknown");
      assertRange(acc[key], 0, 1000, "accumulator");
    }
    return genes;
  }

  function importState(sim, packet) {
    var genes = validate(packet, sim);
    var dragon = sim.dragon;
    var body = dragon.body;
    var traits = Genome.express(genes);
    dragon.name = safeName(packet.name, dragon.name);
    dragon.color = safeColor(packet.color, dragon.color);
    dragon.genome = genes;
    dragon.traits = traits;
    Dragon.applyTraits(body, traits);
    dragon.x = packet.x;
    dragon.y = packet.y;
    dragon.heatAcc = round4(packet.heatAcc || 0);
    dragon.verb = "idle";
    dragon.detail = "arrive";
    dragon.sig = "";
    dragon.line = dragon.name + " is here.";
    dragon.noticed = {};
    dragon.flags = { hot: false, cold: false, bloated: false };

    body.conc = new Uint8Array(Chem.SLOTS);
    body.acc = {};
    body.lastSource = {};
    body.pendingShock = 0;
    body.biotick = packet.age;
    body.asleep = packet.asleep;
    body.weather = round4(packet.weather);
    body.climate = round4(packet.climate);
    var chem = packet.chem || {};
    var id;
    for (id in chem) {
      if (Object.prototype.hasOwnProperty.call(chem, id)) body.conc[Number(id)] = chem[id];
    }
    var acc = packet.acc || {};
    var key;
    for (key in acc) {
      if (Object.prototype.hasOwnProperty.call(acc, key)) body.acc[key] = acc[key];
    }

    sim.phase = packet.phase;
    sim.neglect = packet.neglect || 0;
    sim.mortality = packet.mortal === true && sim.mortality === true;
    if (sim.phase === "dormant" || sim.phase === "dead") sim.careSeen = sim.world.care;
    else sim.careSeen = sim.world.care;
    sim.log = [dragon.line];
    return sim;
  }

  function exportSeed(sim) {
    return PREFIX + toBase64Url(JSON.stringify(exportState(sim)));
  }

  function seedToPacket(seed) {
    var text = String(seed || "");
    if (text.indexOf(PREFIX) !== 0) throw new Error("unknown seed");
    var json;
    try {
      json = fromBase64Url(text.slice(PREFIX.length));
    } catch (err) {
      throw new Error("unreadable seed");
    }
    var packet;
    try {
      packet = JSON.parse(json);
    } catch (err2) {
      throw new Error("unreadable seed");
    }
    return packet;
  }

  return {
    exportState: exportState,
    importState: importState,
    exportSeed: exportSeed,
    seedToPacket: seedToPacket,
    sealOf: sealOf
  };
});
