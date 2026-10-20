import test from "node:test";
import assert from "node:assert/strict";
import {
  registerRenderer,
  createRenderer,
  renderers,
} from "../src/renderers/index.js";

test("graphics modes can be registered independently of flight simulation", () => {
  class TestRenderer {
    static id = "test";
    static label = "Test mode";
    constructor(canvas) {
      this.canvas = canvas;
    }
  }
  registerRenderer(TestRenderer);
  const canvas = {};
  assert.equal(createRenderer("test", canvas).canvas, canvas);
  assert.equal(renderers.get("test"), TestRenderer);
  assert.throws(
    () => createRenderer("missing", canvas),
    /Unknown graphics mode/,
  );
  assert.throws(() => registerRenderer(class {}), /id and label/);
});
