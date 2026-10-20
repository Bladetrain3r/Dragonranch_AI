/* The pen. Food, toy, nest, warmth, hand, ambient heat, and light.
   This module never sees a body, a drive, or a gene. */
(function (root, factory) {
  var Knobs = root.DragonKnobs || (typeof require === "function" ? require("./knobs.js") : null);
  var api = factory(Knobs);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DragonWorld = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Knobs) {
  "use strict";

  var KINDS = {
    food: { life: Knobs.objects.food.life, bites: Knobs.objects.food.bites },
    toy: { life: Knobs.objects.toy.life, charges: Knobs.objects.toy.charges },
    nest: { life: Knobs.objects.nest.life },
    warmth: { life: Knobs.objects.warmth.life, charges: Knobs.objects.warmth.charges },
    hand: { life: Knobs.objects.hand.life, charges: Knobs.objects.hand.charges }
  };

  var NOTES = {
    food: "A trough of feed sits in the pen.",
    toy: "A toy waits on the ground.",
    nest: "A nest is fluffed in the pen.",
    warmth: "A warm stone sits in the pen.",
    hand: "A hand rests in the pen."
  };

  var STALE = {
    food: "The trough goes stale, untouched.",
    toy: "The toy is forgotten at the fence.",
    nest: "The nest cools, unused.",
    warmth: "The warm stone goes cold.",
    hand: "The hand withdraws."
  };

  function createWorld() {
    return {
      place: "pen",
      heat: Knobs.birth.ambient,
      light: Knobs.birth.light,
      objects: [],
      seq: 1,
      care: 0,
      lastIntent: ""
    };
  }

  function clampUnit(n) {
    n = Math.round(Number(n));
    if (n !== n) return null;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  function findKind(world, kind) {
    for (var i = 0; i < world.objects.length; i++) {
      if (world.objects[i].kind === kind) return world.objects[i];
    }
    return null;
  }

  function publicObject(obj) {
    var view = {
      id: obj.id,
      kind: obj.kind,
      x: obj.x,
      y: obj.y,
      age: obj.age
    };
    if (obj.bites != null) view.portions = obj.bites;
    if (obj.charges != null) view.portions = obj.charges;
    return view;
  }

  function view(world) {
    var objects = [];
    for (var i = 0; i < world.objects.length; i++) objects.push(publicObject(world.objects[i]));
    return { place: world.place, heat: world.heat, light: world.light, objects: objects };
  }

  function place(world, kind, x, y) {
    if (!KINDS[kind]) return { ok: false, error: "unknown kind", world: view(world) };
    var px = clampUnit(x);
    var py = clampUnit(y);
    if (px == null || py == null) return { ok: false, error: "place needs x and y", world: view(world) };
    if (findKind(world, kind)) {
      return { ok: false, error: "a " + kind + " is already in the pen", world: view(world) };
    }
    if (world.objects.length >= Knobs.objects.cap) {
      return { ok: false, error: "the pen is full", world: view(world) };
    }
    var spec = KINDS[kind];
    var obj = { id: "o" + world.seq, kind: kind, x: px, y: py, age: 0, life: spec.life };
    world.seq += 1;
    if (spec.bites != null) obj.bites = spec.bites;
    if (spec.charges != null) obj.charges = spec.charges;
    world.objects.push(obj);
    world.care += 1;
    return { ok: true, note: NOTES[kind], world: view(world), object: publicObject(obj) };
  }

  function setHeat(world, heat) {
    var next = clampUnit(heat);
    if (next == null) return { ok: false, error: "ambient needs a heat", world: view(world) };
    world.heat = next;
    world.care += 1;
    return { ok: true, note: "The air in the pen shifts.", world: view(world) };
  }

  function setLight(world, level) {
    var next = clampUnit(level);
    if (next == null) return { ok: false, error: "light needs a level", world: view(world) };
    world.light = next;
    world.care += 1;
    return { ok: true, note: "The barn light changes.", world: view(world) };
  }

  function takeUse(obj) {
    if (obj.bites != null) {
      obj.bites -= 1;
      return obj.bites > 0;
    }
    if (obj.charges != null) {
      obj.charges -= 1;
      return obj.charges > 0;
    }
    return true;
  }

  function removeId(world, id) {
    var next = [];
    for (var i = 0; i < world.objects.length; i++) {
      if (world.objects[i].id !== id) next.push(world.objects[i]);
    }
    world.objects = next;
  }

  function age(world) {
    var events = [];
    var keep = [];
    for (var i = 0; i < world.objects.length; i++) {
      var obj = world.objects[i];
      obj.age += 1;
      if (obj.age >= obj.life) {
        events.push({ msg: STALE[obj.kind] || "Something in the pen is gone." });
      } else {
        keep.push(obj);
      }
    }
    world.objects = keep;
    return events;
  }

  return {
    KINDS: KINDS,
    createWorld: createWorld,
    place: place,
    setHeat: setHeat,
    setLight: setLight,
    takeUse: takeUse,
    removeId: removeId,
    age: age,
    view: view,
    findKind: findKind
  };
});
