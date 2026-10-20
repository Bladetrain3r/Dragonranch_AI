/* Lifecycle. The tick asks a policy. The default policy is stasis.
   Mortality exists only after an explicit opt-in on the sim, which the
   caretaker act path never calls. Neither policy writes a drive. */
(function (root, factory) {
  var Chem = root.DragonChem || (typeof require === "function" ? require("./chem.js") : null);
  var Knobs = root.DragonKnobs || (typeof require === "function" ? require("./knobs.js") : null);
  var api = factory(Chem, Knobs);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DragonLife = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chem, Knobs) {
  "use strict";

  function afterTick(sim) {
    if (sim.phase === "dead" || sim.phase === "dormant") {
      return { phase: sim.phase, events: [] };
    }
    var body = sim.dragon.body;
    var hunger = body.conc[Chem.HUNGER];
    var energy = body.conc[Chem.ENERGY];
    if (hunger >= Knobs.life.stasisHunger && energy <= Knobs.life.stasisEnergy) sim.neglect += 1;
    else sim.neglect = 0;
    if (sim.neglect < Knobs.life.stasisSpan) return { phase: "awake", events: [] };
    sim.phase = sim.mortality ? "dead" : "dormant";
    sim.careSeen = sim.world.care;
    var name = sim.dragon.name;
    var msg = sim.mortality
      ? name + " goes still. Mortality was chosen, and this life ends."
      : name + " curls into a still glow and waits.";
    return { phase: sim.phase, events: [{ msg: msg }] };
  }

  function optIn(sim) {
    sim.mortality = true;
    return sim;
  }

  return { afterTick: afterTick, optIn: optIn };
});
