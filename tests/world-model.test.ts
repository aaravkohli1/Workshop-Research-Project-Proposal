import assert from "node:assert/strict";
import test from "node:test";
import {
  GOAL,
  SHIFT_ACTION,
  SHIFT_SOURCE,
  START,
  adaptOnSurprise,
  createCampusGrid,
  createEnsemble,
  planWithModel,
  predictTransition,
  samePosition,
  trainEnsemble,
} from "../app/world-model.ts";

test("the neural ensemble learns nominal transition dynamics", async () => {
  const models = createEnsemble();
  const history = await trainEnsemble(models);
  const prediction = predictTransition(models, createCampusGrid(), SHIFT_SOURCE, SHIFT_ACTION);
  assert.ok((history.at(-1) ?? 1) < 0.04);
  assert.deepEqual(prediction.next, { x: 6, y: 4 });
  assert.ok(prediction.collision < 0.25);
});

test("MPC replans around a dynamics shift after one-shot adaptation", async () => {
  const models = createEnsemble();
  await trainEnsemble(models);
  const grid = createCampusGrid();
  const nominal = planWithModel(models, grid, START, GOAL);
  assert.ok(samePosition(nominal.best.path.at(-1)!, GOAL));
  assert.ok(nominal.best.path.some((position) => samePosition(position, SHIFT_SOURCE)));

  await adaptOnSurprise(models, grid);
  const changedPrediction = predictTransition(models, grid, SHIFT_SOURCE, SHIFT_ACTION);
  const adapted = planWithModel(models, grid, SHIFT_SOURCE, GOAL, 24);
  assert.ok(changedPrediction.collision > 0.85);
  assert.notEqual(adapted.best.actions[0], SHIFT_ACTION);
  assert.ok(samePosition(adapted.best.path.at(-1)!, GOAL));
});
