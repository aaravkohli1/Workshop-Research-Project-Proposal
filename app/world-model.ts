export type Position = { x: number; y: number };
export type Action = 0 | 1 | 2 | 3;

export const GRID_WIDTH = 12;
export const GRID_HEIGHT = 8;
export const START: Position = { x: 2, y: 6 };
export const GOAL: Position = { x: 9, y: 2 };
export const SHIFT_SOURCE: Position = { x: 5, y: 4 };
export const SHIFT_ACTION: Action = 1;
export const ACTIONS = [
  { label: "north", short: "N", dx: 0, dy: -1 },
  { label: "east", short: "E", dx: 1, dy: 0 },
  { label: "south", short: "S", dx: 0, dy: 1 },
  { label: "west", short: "W", dx: -1, dy: 0 },
] as const;

export type Grid = number[];
export type Sample = { input: number[]; target: [number, number, number] };
export type Prediction = {
  next: Position;
  dx: number;
  dy: number;
  collision: number;
  uncertainty: number;
};
export type Candidate = {
  actions: Action[];
  path: Position[];
  score: number;
  uncertainty: number;
  collisionRisk: number;
};
export type Plan = { best: Candidate; candidates: Candidate[]; rollouts: number };

export function createCampusGrid(): Grid {
  const grid = new Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
  for (let x = 0; x < GRID_WIDTH; x += 1) {
    setCell(grid, x, 0, 1);
    setCell(grid, x, GRID_HEIGHT - 1, 1);
  }
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    setCell(grid, 0, y, 1);
    setCell(grid, GRID_WIDTH - 1, y, 1);
  }
  for (let y = 2; y <= 6; y += 1) {
    if (y !== 4) setCell(grid, 6, y, 1);
  }
  setCell(grid, 3, 2, 1);
  setCell(grid, 3, 3, 1);
  setCell(grid, 8, 5, 1);
  return grid;
}

export function cell(grid: Grid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) return 1;
  return grid[y * GRID_WIDTH + x] ?? 1;
}

function setCell(grid: Grid, x: number, y: number, value: number): void {
  grid[y * GRID_WIDTH + x] = value;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function actualTransition(grid: Grid, position: Position, action: Action, shifted = false) {
  const move = ACTIONS[action];
  const lockedDoor = shifted && samePosition(position, SHIFT_SOURCE) && action === SHIFT_ACTION;
  const proposed = { x: position.x + move.dx, y: position.y + move.dy };
  const collision = lockedDoor || cell(grid, proposed.x, proposed.y) === 1;
  return { next: collision ? { ...position } : proposed, collision, lockedDoor };
}

function makeInput(grid: Grid, position: Position, action: Action): number[] {
  const input = [
    (position.x / (GRID_WIDTH - 1)) * 2 - 1,
    (position.y / (GRID_HEIGHT - 1)) * 2 - 1,
  ];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) input.push(cell(grid, position.x + dx, position.y + dy));
  }
  for (let index = 0; index < ACTIONS.length; index += 1) input.push(index === action ? 1 : 0);
  return input;
}

function targetFor(grid: Grid, position: Position, action: Action): [number, number, number] {
  const result = actualTransition(grid, position, action);
  return [result.next.x - position.x, result.next.y - position.y, result.collision ? 1 : 0];
}

export class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  integer(max: number): number { return Math.floor(this.next() * max); }
}

export class TinyWorldModel {
  readonly inputSize = 15;
  readonly hiddenSize = 32;
  readonly parameterCount: number;
  private w1: Float64Array;
  private b1: Float64Array;
  private w2: Float64Array;
  private b2: Float64Array;
  private fastAdapter = new Map<string, { value: [number, number, number]; strength: number }>();

  constructor(seed: number) {
    const random = new SeededRandom(seed);
    this.w1 = new Float64Array(this.inputSize * this.hiddenSize);
    this.b1 = new Float64Array(this.hiddenSize);
    this.w2 = new Float64Array(this.hiddenSize * 3);
    this.b2 = new Float64Array(3);
    const scale1 = Math.sqrt(2 / (this.inputSize + this.hiddenSize));
    const scale2 = Math.sqrt(2 / (this.hiddenSize + 3));
    for (let index = 0; index < this.w1.length; index += 1) this.w1[index] = (random.next() * 2 - 1) * scale1;
    for (let index = 0; index < this.w2.length; index += 1) this.w2[index] = (random.next() * 2 - 1) * scale2;
    this.parameterCount = this.w1.length + this.b1.length + this.w2.length + this.b2.length;
  }

  predict(input: number[]): [number, number, number] {
    const { output } = this.forward(input);
    const adapted = this.fastAdapter.get(this.adapterKey(input));
    if (adapted) {
      const blend = Math.min(0.96, adapted.strength);
      return output.map((value, index) => value * (1 - blend) + adapted.value[index] * blend) as [number, number, number];
    }
    return output;
  }

  adapt(input: number[], target: [number, number, number], rate = 0.38): void {
    const key = this.adapterKey(input);
    const previous = this.fastAdapter.get(key);
    if (!previous) {
      this.fastAdapter.set(key, { value: [...target] as [number, number, number], strength: rate });
      return;
    }
    previous.value = previous.value.map((value, index) => value * (1 - rate) + target[index] * rate) as [number, number, number];
    previous.strength = previous.strength + (1 - previous.strength) * rate;
  }

  train(input: number[], target: [number, number, number], learningRate: number): number {
    const { hidden, output } = this.forward(input);
    const outputGradient = new Float64Array(3);
    let loss = 0;
    for (let out = 0; out < 3; out += 1) {
      const error = output[out] - target[out];
      loss += error * error;
      const activationDerivative = out < 2 ? 1 - output[out] * output[out] : output[out] * (1 - output[out]);
      outputGradient[out] = (2 / 3) * error * activationDerivative;
    }
    const hiddenGradient = new Float64Array(this.hiddenSize);
    for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
      let gradient = 0;
      for (let out = 0; out < 3; out += 1) gradient += this.w2[out * this.hiddenSize + hiddenIndex] * outputGradient[out];
      hiddenGradient[hiddenIndex] = gradient * (1 - hidden[hiddenIndex] * hidden[hiddenIndex]);
    }
    for (let out = 0; out < 3; out += 1) {
      for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
        const index = out * this.hiddenSize + hiddenIndex;
        this.w2[index] -= learningRate * outputGradient[out] * hidden[hiddenIndex];
      }
      this.b2[out] -= learningRate * outputGradient[out];
    }
    for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
      for (let inputIndex = 0; inputIndex < this.inputSize; inputIndex += 1) {
        const index = hiddenIndex * this.inputSize + inputIndex;
        this.w1[index] -= learningRate * hiddenGradient[hiddenIndex] * input[inputIndex];
      }
      this.b1[hiddenIndex] -= learningRate * hiddenGradient[hiddenIndex];
    }
    return loss / 3;
  }

  private forward(input: number[]) {
    const hidden = new Float64Array(this.hiddenSize);
    for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
      let value = this.b1[hiddenIndex];
      for (let inputIndex = 0; inputIndex < this.inputSize; inputIndex += 1) value += this.w1[hiddenIndex * this.inputSize + inputIndex] * input[inputIndex];
      hidden[hiddenIndex] = Math.tanh(value);
    }
    const output = [0, 0, 0] as [number, number, number];
    for (let out = 0; out < 3; out += 1) {
      let value = this.b2[out];
      for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) value += this.w2[out * this.hiddenSize + hiddenIndex] * hidden[hiddenIndex];
      output[out] = out < 2 ? Math.tanh(value) : 1 / (1 + Math.exp(-value));
    }
    return { hidden, output };
  }

  private adapterKey(input: number[]): string {
    const action = input.slice(-4).indexOf(1);
    return `${input[0].toFixed(3)}:${input[1].toFixed(3)}:${action}`;
  }
}

function randomGrid(random: SeededRandom): Grid {
  const grid = createCampusGrid().map(() => 0);
  for (let x = 0; x < GRID_WIDTH; x += 1) { setCell(grid, x, 0, 1); setCell(grid, x, GRID_HEIGHT - 1, 1); }
  for (let y = 0; y < GRID_HEIGHT; y += 1) { setCell(grid, 0, y, 1); setCell(grid, GRID_WIDTH - 1, y, 1); }
  for (let y = 1; y < GRID_HEIGHT - 1; y += 1) {
    for (let x = 1; x < GRID_WIDTH - 1; x += 1) if (random.next() < 0.14) setCell(grid, x, y, 1);
  }
  return grid;
}

export function generateDataset(count: number, seed: number): Sample[] {
  const random = new SeededRandom(seed);
  const samples: Sample[] = [];
  while (samples.length < count) {
    const grid = randomGrid(random);
    const position = { x: 1 + random.integer(GRID_WIDTH - 2), y: 1 + random.integer(GRID_HEIGHT - 2) };
    if (cell(grid, position.x, position.y)) continue;
    const action = random.integer(4) as Action;
    samples.push({ input: makeInput(grid, position, action), target: targetFor(grid, position, action) });
  }
  return samples;
}

export function createEnsemble(size = 5): TinyWorldModel[] {
  return Array.from({ length: size }, (_, index) => new TinyWorldModel(701 + index * 997));
}

export function validationLoss(models: TinyWorldModel[], samples: Sample[]): number {
  let total = 0;
  for (const sample of samples) {
    const predictions = models.map((model) => model.predict(sample.input));
    for (let out = 0; out < 3; out += 1) {
      const mean = predictions.reduce((sum, prediction) => sum + prediction[out], 0) / models.length;
      total += (mean - sample.target[out]) ** 2;
    }
  }
  return total / (samples.length * 3);
}

export async function trainEnsemble(models: TinyWorldModel[], onProgress?: (epoch: number, loss: number) => void): Promise<number[]> {
  const training = generateDataset(900, 1234);
  const validation = generateDataset(220, 5678);
  const history: number[] = [];
  const random = new SeededRandom(90125);
  const epochs = 48;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const learningRate = 0.035 * Math.pow(0.965, epoch);
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      for (let step = 0; step < training.length; step += 1) {
        const sample = training[(random.integer(training.length) + modelIndex * 17) % training.length];
        model.train(sample.input, sample.target, learningRate);
      }
    }
    if (epoch % 4 === 3 || epoch === 0) {
      const loss = validationLoss(models, validation);
      history.push(loss);
      onProgress?.(epoch + 1, loss);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return history;
}

export function predictTransition(models: TinyWorldModel[], grid: Grid, position: Position, action: Action): Prediction {
  const input = makeInput(grid, position, action);
  const outputs = models.map((model) => model.predict(input));
  const means = [0, 1, 2].map((out) => outputs.reduce((sum, prediction) => sum + prediction[out], 0) / outputs.length);
  const variance = [0, 1, 2].reduce((sum, out) => sum + outputs.reduce((inner, prediction) => inner + (prediction[out] - means[out]) ** 2, 0) / outputs.length, 0) / 3;
  const collision = means[2];
  const dx = collision > 0.52 ? 0 : Math.round(means[0]);
  const dy = collision > 0.52 ? 0 : Math.round(means[1]);
  return {
    next: { x: Math.max(0, Math.min(GRID_WIDTH - 1, position.x + dx)), y: Math.max(0, Math.min(GRID_HEIGHT - 1, position.y + dy)) },
    dx: means[0], dy: means[1], collision, uncertainty: Math.sqrt(variance),
  };
}

function manhattan(a: Position, b: Position): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function pathKey(path: Position[]): string { return path.map((position) => `${position.x}:${position.y}`).join("|"); }

export function planWithModel(models: TinyWorldModel[], grid: Grid, start: Position, goal: Position, horizon = 18): Plan {
  type Beam = Candidate & { position: Position };
  let beam: Beam[] = [{ actions: [], path: [{ ...start }], score: manhattan(start, goal), uncertainty: 0, collisionRisk: 0, position: { ...start } }];
  let rollouts = 0;
  for (let depth = 0; depth < horizon; depth += 1) {
    const expanded: Beam[] = [];
    for (const candidate of beam) {
      if (samePosition(candidate.position, goal)) { expanded.push(candidate); continue; }
      for (let action = 0; action < 4; action += 1) {
        const prediction = predictTransition(models, grid, candidate.position, action as Action);
        const revisits = candidate.path.filter((position) => samePosition(position, prediction.next)).length;
        const uncertainty = candidate.uncertainty + prediction.uncertainty;
        const collisionRisk = candidate.collisionRisk + prediction.collision;
        const actions = [...candidate.actions, action as Action];
        const path = [...candidate.path, prediction.next];
        const score = manhattan(prediction.next, goal) * 1.35 + collisionRisk * 2.8 + uncertainty * 3.5 + revisits * 0.65 + actions.length * 0.025;
        expanded.push({ actions, path, score, uncertainty, collisionRisk, position: prediction.next });
        rollouts += 1;
      }
    }
    expanded.sort((a, b) => a.score - b.score);
    const unique = new Map<string, Beam>();
    for (const candidate of expanded) {
      const key = `${candidate.position.x}:${candidate.position.y}:${candidate.actions.slice(-3).join("")}`;
      if (!unique.has(key)) unique.set(key, candidate);
      if (unique.size >= 140) break;
    }
    beam = [...unique.values()];
    if (beam[0] && samePosition(beam[0].position, goal) && depth >= manhattan(start, goal)) break;
  }
  beam.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const item of beam) {
    const key = pathKey(item.path);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ actions: item.actions, path: item.path, score: item.score, uncertainty: item.uncertainty, collisionRisk: item.collisionRisk });
    }
    if (candidates.length === 6) break;
  }
  return { best: candidates[0], candidates, rollouts };
}

export async function adaptOnSurprise(
  models: TinyWorldModel[],
  grid: Grid,
  onProgress?: (step: number, predictedCollision: number) => void,
): Promise<number[]> {
  const surprise: Sample = { input: makeInput(grid, SHIFT_SOURCE, SHIFT_ACTION), target: [0, 0, 1] };
  const history: number[] = [];
  for (let block = 0; block < 8; block += 1) {
    for (const model of models) model.adapt(surprise.input, surprise.target, 0.34);
    const collision = models.reduce((sum, model) => sum + model.predict(surprise.input)[2], 0) / models.length;
    history.push(collision);
    onProgress?.(block + 1, collision);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return history;
}
