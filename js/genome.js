/* Genes scale how a dragon answers the pen. They are not drives.
   128 is the even dragon. Inheritance waits for a later tier. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DragonGenome = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var COUNT = 7;
  var NEUTRAL = 128;
  var BAND = 28;
  var POLES = [
    ["dainty", "greedy"],
    ["solemn", "playful"],
    ["independent", "clingy"],
    ["shade-loving", "sun-loving"],
    ["slow-gut", "quick-gut"],
    ["alert", "drowsy"],
    ["even", "stormy"]
  ];

  function clamp(n) {
    n = Math.round(Number(n));
    if (n !== n) return NEUTRAL;
    if (n < 0) return 0;
    if (n > 255) return 255;
    return n;
  }

  function neutral() {
    var genes = [];
    for (var i = 0; i < COUNT; i++) genes.push(NEUTRAL);
    return genes;
  }

  function normalize(genes) {
    var out = neutral();
    if (!genes) return out;
    for (var i = 0; i < COUNT; i++) {
      if (genes[i] == null) continue;
      out[i] = clamp(genes[i]);
    }
    return out;
  }

  function unit(gene) {
    return gene / 255;
  }

  function scale(gene) {
    return 0.7 + unit(gene) * 0.6;
  }

  function span(gene) {
    return 0.55 + unit(gene) * 0.9;
  }

  function lerp(gene, lo, hi) {
    return Math.round(lo + unit(gene) * (hi - lo));
  }

  function express(genes) {
    var g = normalize(genes);
    var appetite = g[0];
    var play = g[1];
    var social = g[2];
    var warmth = g[3];
    var metabolism = g[4];
    var sleep = g[5];
    var mood = g[6];
    var meta = scale(metabolism);
    return {
      genes: g,
      salience: {
        food: span(appetite),
        toy: span(play),
        nest: span(sleep),
        hand: span(social),
        warmth: span(warmth)
      },
      scales: {
        hunger: meta * scale(appetite),
        boredom: meta * scale(play),
        loneliness: meta * scale(social),
        sleepiness: meta * scale(sleep),
        chill: scale(warmth),
        energyDrain: meta,
        digest: meta,
        mood: 0.65 + unit(mood) * 0.7
      },
      refuseEatBelow: lerp(appetite, 100, 28),
      playMin: lerp(play, 110, 24),
      sleepMin: lerp(sleep, 130, 36),
      companyMin: lerp(social, 120, 24),
      baskMin: lerp(warmth, 80, 28),
      comfort: {
        low: lerp(warmth, 60, 120),
        high: lerp(warmth, 150, 210)
      }
    };
  }

  function roll(rng) {
    var genes = [];
    for (var i = 0; i < COUNT; i++) genes.push(Math.floor(rng() * 256));
    return genes;
  }

  function words(genes) {
    var g = normalize(genes);
    var bits = [];
    for (var i = 0; i < COUNT; i++) {
      if (g[i] < NEUTRAL - BAND) bits.push(POLES[i][0]);
      else if (g[i] > NEUTRAL + BAND) bits.push(POLES[i][1]);
    }
    if (!bits.length) return "even-tempered";
    return bits.join(" · ");
  }

  return {
    COUNT: COUNT,
    NEUTRAL: NEUTRAL,
    neutral: neutral,
    normalize: normalize,
    express: express,
    roll: roll,
    words: words
  };
});
