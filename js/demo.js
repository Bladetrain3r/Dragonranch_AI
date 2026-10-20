/* One hatch, one look, one knob. node js/demo.js */
(function () {
  "use strict";

  var Ranch = require("./ranch.js");
  var pen = Ranch.hatch({ seed: 3 });
  var first = pen.observe();
  console.log(JSON.stringify({
    name: first.dragon.name,
    phase: first.phase,
    line: first.dragon.line,
    face: first.dragon.face,
    posture: first.dragon.posture,
    drives: first.drives,
    stomach: first.stomach,
    weather: first.dragon.weather,
    climate: first.dragon.climate,
    traits: first.traits.words
  }, null, 2));
  var placed = pen.act({
    action: "place",
    kind: "food",
    x: 54,
    y: 42,
    intent: "a trough, where she can find it"
  });
  console.log(JSON.stringify({ act: placed.note, world: placed.world.objects }, null, 2));
  var ran = pen.advance(12);
  var later = pen.observe();
  console.log(JSON.stringify({
    advanced: ran.advanced,
    phase: later.phase,
    verb: later.dragon.verb,
    line: later.dragon.line,
    hunger: later.drives.hunger,
    stomach: later.stomach
  }, null, 2));
})();
