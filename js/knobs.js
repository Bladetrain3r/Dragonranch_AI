/* Tunable numbers for the ranch. Caretaker code never writes a drive;
   these knobs only shape the creature's own chemistry and the pen. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DragonKnobs = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return {
    pen: { size: 100 },
    move: { reach: 10, sight: 90, speed: 8 },
    time: { maxTicksPerCall: 240, maxTicksPerSession: 5000 },
    birth: {
      hunger: 64,
      energy: 180,
      sleepiness: 36,
      boredom: 48,
      loneliness: 42,
      chill: 8,
      ambient: 55,
      light: 70,
      x: 28,
      y: 42
    },
    stomach: { cap: 140, bite: 50, digest: 4 },
    sleep: { bout: 18, restEmit: 70, energy: 8, inhibit: 0.9, groggy: 14 },
    pressure: {
      hunger: 0.85,
      sleepiness: 0.55,
      boredom: 0.4,
      loneliness: 0.35,
      chill: 1.15,
      energyDrain: 0.45,
      hungerWhileAsleep: 0.35,
      heatSleep: 0.45
    },
    play: { novelty: 56, hunger: 2, energy: 3 },
    nuzzle: { company: 48 },
    bask: { warmth: 44 },
    mood: {
      flash: 0.22,
      weatherDecay: 0.72,
      climateRate: 0.01,
      cap: 80
    },
    life: { stasisHunger: 210, stasisEnergy: 36, stasisSpan: 40 },
    objects: {
      cap: 5,
      food: { life: 110, bites: 3 },
      toy: { life: 80, charges: 5 },
      nest: { life: 130 },
      warmth: { life: 90, charges: 6 },
      hand: { life: 40, charges: 3 }
    },
    choose: {
      idleBelow: 28,
      starve: 200,
      arbitration: 0.25,
      tiredIgnorePlay: 175,
      hungryIgnorePlay: 190,
      dimLight: 35,
      dimSleepBias: 1.2
    },
    intentMax: 80,
    logMax: 12
  };
});
