"use client";

import { useMemo, useRef, useState } from "react";
import {
  ACTIONS,
  ENSEMBLE_SIZE,
  GOAL,
  GRID_HEIGHT,
  GRID_WIDTH,
  PARAMETERS_PER_MODEL,
  Plan,
  Position,
  SHIFT_ACTION,
  SHIFT_SOURCE,
  START,
  TinyWorldModel,
  actualTransition,
  adaptOnSurprise,
  cell,
  createCampusGrid,
  createEnsemble,
  planWithModel,
  predictTransition,
  samePosition,
  trainEnsemble,
} from "./world-model";

type Phase = "ready" | "training" | "trained" | "planned" | "executing" | "door" | "surprise" | "adapting" | "adapted" | "complete";
type Mismatch = { predicted: Position; observed: Position; collision: number; uncertainty: number } | null;

const projectQuestions = [
  { code: "REP-01", title: "From grids to pixels", text: "Which latent representation preserves the geometry needed for planning without reconstructing every pixel?" },
  { code: "CAL-02", title: "Confidently wrong", text: "How should ensemble uncertainty respond to a dynamics shift that every member missed in the same way?" },
  { code: "ADAPT-03", title: "One-shot dynamics updates", text: "Can a fast adapter absorb a new transition without corrupting the general model?" },
  { code: "PLAN-04", title: "Search under model error", text: "How should MPC trade goal progress against uncertainty, collision risk, and rollout depth?" },
  { code: "MEM-05", title: "Partial observability", text: "What belongs in persistent world state when the agent can only see a local observation?" },
  { code: "SCALE-06", title: "Video world models", text: "Which findings survive when the compact predictor is replaced by an action-conditioned video model?" },
];

const siteLinks = [
  { href: "https://www.utmist.ca/#about-us", label: "About Us" },
  { href: "https://www.utmist.ca/projects", label: "Projects" },
  { href: "https://www.utmist.ca/sponsors", label: "Sponsors" },
  { href: "https://www.utmist.ca/events", label: "Events" },
  { href: "https://www.utmist.ca/careers", label: "Careers" },
];

const sleep = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export default function Home() {
  const grid = useMemo(() => createCampusGrid(), []);
  const models = useRef<TinyWorldModel[]>([]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [epoch, setEpoch] = useState(0);
  const [lossHistory, setLossHistory] = useState<number[]>([]);
  const [adaptHistory, setAdaptHistory] = useState<number[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [position, setPosition] = useState<Position>({ ...START });
  const [actualPath, setActualPath] = useState<Position[]>([{ ...START }]);
  const [mismatch, setMismatch] = useState<Mismatch>(null);
  const [planningMs, setPlanningMs] = useState<number | null>(null);
  const [worldShifted, setWorldShifted] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>(["Engine initialized. Parameters are random."]);

  const isBusy = phase === "training" || phase === "executing" || phase === "adapting";
  const finalLoss = lossHistory.at(-1) ?? null;
  const parameters = ENSEMBLE_SIZE * PARAMETERS_PER_MODEL;
  const shifted = worldShifted;
  const activePlan = plan?.best.path ?? [];

  const addLog = (message: string) => setEventLog((current) => [message, ...current].slice(0, 5));

  async function trainModel() {
    setPhase("training");
    setEpoch(0);
    setLossHistory([]);
    setPlan(null);
    setMismatch(null);
    models.current = createEnsemble(ENSEMBLE_SIZE);
    addLog("Generated 900 randomized transition samples.");
    const history = await trainEnsemble(models.current, (nextEpoch, loss) => {
      setEpoch(nextEpoch);
      setLossHistory((current) => [...current, loss]);
    });
    setLossHistory(history);
    setPhase("trained");
    addLog(`Training converged at loss ${history.at(-1)?.toFixed(4)}.`);
  }

  function createPlan(start = position, horizon = 18) {
    const began = performance.now();
    const nextPlan = planWithModel(models.current, grid, start, GOAL, horizon);
    setPlanningMs(performance.now() - began);
    setPlan(nextPlan);
    return nextPlan;
  }

  function planFutures() {
    const nextPlan = createPlan(START);
    setPhase("planned");
    addLog(`MPC evaluated ${nextPlan.rollouts.toLocaleString()} learned futures.`);
  }

  async function executeToDoor() {
    if (!plan) return;
    setPhase("executing");
    let current = { ...START };
    const traversed = [{ ...START }];
    const doorIndex = plan.best.path.findIndex((item, index) => samePosition(item, SHIFT_SOURCE) && plan.best.actions[index] === SHIFT_ACTION);
    const stopIndex = doorIndex >= 0 ? doorIndex : Math.min(5, plan.best.actions.length);
    for (let index = 0; index < stopIndex; index += 1) {
      const result = actualTransition(grid, current, plan.best.actions[index], false);
      current = result.next;
      traversed.push({ ...current });
      setPosition({ ...current });
      setActualPath([...traversed]);
      await sleep(120);
    }
    setPhase("door");
    addLog("Agent reached the model’s preferred decision boundary.");
  }

  function introduceShift() {
    setWorldShifted(true);
    const prediction = predictTransition(models.current, grid, position, SHIFT_ACTION);
    const reality = actualTransition(grid, position, SHIFT_ACTION, true);
    setMismatch({ predicted: prediction.next, observed: reality.next, collision: prediction.collision, uncertainty: prediction.uncertainty });
    setActualPath((current) => [...current, { ...reality.next }]);
    setPhase("surprise");
    addLog("Prediction error: the newly activated door rejected EAST.");
  }

  async function adaptAndReplan() {
    setPhase("adapting");
    setAdaptHistory([]);
    await adaptOnSurprise(models.current, grid, (_step, collision) => setAdaptHistory((current) => [...current, collision]));
    const nextPlan = createPlan(position, 24);
    setPhase("adapted");
    addLog(`Fast adapter updated; MPC found an ${nextPlan.best.actions.length}-step alternate route.`);
  }

  async function executeAdaptedPlan() {
    if (!plan) return;
    setPhase("executing");
    let current = { ...position };
    const traversed = [...actualPath];
    for (const action of plan.best.actions) {
      const result = actualTransition(grid, current, action, true);
      current = result.next;
      traversed.push({ ...current });
      setPosition({ ...current });
      setActualPath([...traversed]);
      await sleep(105);
      if (samePosition(current, GOAL)) break;
    }
    setPhase("complete");
    addLog("Goal reached using only model rollouts after the update.");
    window.setTimeout(() => document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" }), 350);
  }

  function primaryAction() {
    if (phase === "ready") void trainModel();
    else if (phase === "trained") planFutures();
    else if (phase === "planned") void executeToDoor();
    else if (phase === "door") introduceShift();
    else if (phase === "surprise") void adaptAndReplan();
    else if (phase === "adapted") void executeAdaptedPlan();
  }

  const primaryLabel: Record<Phase, string> = {
    ready: "Train world model",
    training: `Training ensemble · ${epoch}/48`,
    trained: "Plan with learned dynamics",
    planned: "Execute predicted route",
    executing: "Executing model policy…",
    door: "Change world + test prediction",
    surprise: "Adapt on the surprise",
    adapting: "Updating fast adapter…",
    adapted: "Execute adapted plan",
    complete: "Experiment complete",
  };

  return (
    <main className="lab-shell">
      <header className="lab-topbar">
        <a className="lab-brand" href="https://www.utmist.ca">
          <span className="brand-mark" aria-hidden="true" />
          <div><strong>UTMIST Research</strong><small>World Model Laboratory</small></div>
        </a>
        <nav className="site-nav">
          {siteLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="runtime-badge"><i /> LIVE INFERENCE · THIS TAB</div>
      </header>

      <section className="lab-hero">
        <div><p className="eyebrow">Action-conditioned neural world model</p><h1>Learn the dynamics.<br /><em>Imagine the future.</em> Act.</h1><p>Train five independent predictors, search thousands of imagined trajectories, then break their shared assumptions with a changed world.</p></div>
        <button className="run-button" type="button" onClick={primaryAction} disabled={isBusy || phase === "complete"}>{primaryLabel[phase]}<span>→</span></button>
      </section>

      <aside className="honesty-strip">
        <strong>What is real</strong><span>Weights train from random initialization. Every transition prediction, uncertainty estimate, rollout score, and plan is computed live.</span>
        <strong>What is simplified</strong><span>The observation is a compact occupancy grid—not raw video—so the full experiment runs reliably without a GPU.</span>
      </aside>

      <section className="lab-grid">
        <article className="world-panel panel">
          <PanelHeader kicker="ACTUAL ENVIRONMENT" title="Two-corridor navigation task" meta={shifted ? "Dynamics shifted" : "Nominal dynamics"} alert={shifted} />
          <div className="world-stage" role="img" aria-label="Grid world with agent, goal, walls, predicted path, and a changing one-way door">
            <div className="world-grid" style={{ gridTemplateColumns: `repeat(${GRID_WIDTH}, 1fr)` }}>
              {Array.from({ length: GRID_WIDTH * GRID_HEIGHT }, (_, index) => {
                const x = index % GRID_WIDTH;
                const y = Math.floor(index / GRID_WIDTH);
                const point = { x, y };
                const predictedStep = activePlan.findIndex((item) => samePosition(item, point));
                const actualStep = actualPath.findIndex((item) => samePosition(item, point));
                const classes = ["world-cell", cell(grid, x, y) ? "wall" : "floor"];
                if (predictedStep >= 0) classes.push("predicted");
                if (actualStep >= 0) classes.push("actual");
                if (samePosition(point, START)) classes.push("start");
                if (samePosition(point, GOAL)) classes.push("goal");
                if (samePosition(point, SHIFT_SOURCE)) classes.push("door-cell");
                if (samePosition(point, position)) classes.push("agent-cell");
                return <div className={classes.join(" ")} key={`${x}-${y}`} data-step={predictedStep >= 0 ? predictedStep : undefined}>
                  {samePosition(point, START) && <small>START</small>}
                  {samePosition(point, GOAL) && <small>GOAL</small>}
                  {samePosition(point, SHIFT_SOURCE) && <span className={`door-edge ${shifted ? "closed" : ""}`} />}
                  {samePosition(point, position) && <b className="agent-token"><i /></b>}
                </div>;
              })}
            </div>
            <div className="world-legend"><span><i className="legend-agent" /> observed state</span><span><i className="legend-plan" /> model rollout</span><span><i className="legend-real" /> executed path</span></div>
          </div>
        </article>

        <aside className="model-panel panel">
          <PanelHeader kicker="LEARNED DYNAMICS" title="Neural ensemble inspector" meta={phase === "ready" ? "Untrained" : phase === "training" ? "Optimizing" : "Weights active"} />
          <div className="architecture">
            <div><span>OBS</span><b>15</b><small>state + local map + action</small></div><i>→</i><div><span>LATENT</span><b>32 × 5</b><small>independent MLP ensemble</small></div><i>→</i><div><span>PRED</span><b>3</b><small>Δx · Δy · collision</small></div>
          </div>
          <div className="metric-grid">
            <Metric label="Parameters" value={parameters.toLocaleString()} detail="learned, not scripted" />
            <Metric label="Training data" value="900" detail="random transitions" />
            <Metric label="Validation MSE" value={finalLoss ? finalLoss.toFixed(4) : "—"} detail={phase === "training" ? `epoch ${epoch}` : "held-out dynamics"} accent={Boolean(finalLoss)} />
            <Metric label="MPC latency" value={planningMs ? `${planningMs.toFixed(0)} ms` : "—"} detail="on this device" />
          </div>
          <LossChart values={lossHistory} label="HELD-OUT LOSS" />
        </aside>
      </section>

      <section className="analysis-grid">
        <article className="rollout-panel panel">
          <PanelHeader kicker="MODEL-PREDICTIVE CONTROL" title="Counterfactual rollout search" meta={plan ? `${plan.rollouts.toLocaleString()} transitions` : "Waiting for trained model"} />
          <div className="candidate-list">
            {!plan && <div className="empty-state"><span>∿</span><p>Train the model, then let MPC search futures predicted by its learned weights.</p></div>}
            {plan?.candidates.slice(0, 5).map((candidate, index) => <div className={`candidate ${index === 0 ? "best" : ""}`} key={`${candidate.actions.join("")}-${index}`}>
              <b>#{index + 1}</b><code>{candidate.actions.slice(0, 12).map((action) => ACTIONS[action].short).join(" ")}{candidate.actions.length > 12 ? " …" : ""}</code>
              <span>score {candidate.score.toFixed(2)}</span><span>risk {candidate.collisionRisk.toFixed(2)}</span>{index === 0 && <em>SELECTED</em>}
            </div>)}
          </div>
        </article>

        <article className={`prediction-panel panel ${phase === "surprise" ? "error" : ""}`}>
          <PanelHeader kicker="PREDICTION VS. REALITY" title={mismatch ? "A confident model meets a changed world" : "Transition error monitor"} meta={mismatch ? "Out-of-distribution event" : "No mismatch yet"} alert={Boolean(mismatch)} />
          {mismatch ? <div className="mismatch-grid">
            <div><span>MODEL PREDICTED</span><strong>({mismatch.predicted.x}, {mismatch.predicted.y})</strong><small>{(100 * (1 - mismatch.collision)).toFixed(1)}% move probability</small></div>
            <div className="not-equal">≠</div>
            <div><span>WORLD RETURNED</span><strong>({mismatch.observed.x}, {mismatch.observed.y})</strong><small>door rejected action EAST</small></div>
            <p>The ensemble agreed with itself—uncertainty {mismatch.uncertainty.toFixed(3)}—and was still wrong. Agreement is not calibration under distribution shift.</p>
          </div> : <div className="empty-state compact"><span>Δ</span><p>The monitor compares each learned next-state prediction with the environment transition actually observed.</p></div>}
          {adaptHistory.length > 0 && <div className="adapter-progress"><span>FAST ADAPTER · P(collision)</span><div>{adaptHistory.map((value, index) => <i key={index} style={{ height: `${Math.max(8, value * 100)}%` }} />)}</div><strong>{((adaptHistory.at(-1) ?? 0) * 100).toFixed(1)}%</strong></div>}
        </article>

        <article className="event-panel panel">
          <PanelHeader kicker="LIVE EVENT STREAM" title="Nothing up our sleeve" meta="Computed locally" />
          <ol>{eventLog.map((event, index) => <li key={`${event}-${index}`}><span>{String(eventLog.length - index).padStart(2, "0")}</span><p>{event}</p></li>)}</ol>
        </article>
      </section>

      <section className="method-strip">
        <div><span>01</span><strong>Fit dynamics</strong><small>s<sub>t</sub>, a<sub>t</sub> → s<sub>t+1</sub></small></div><i>→</i><div><span>02</span><strong>Imagine futures</strong><small>5-model ensemble rollouts</small></div><i>→</i><div><span>03</span><strong>Search actions</strong><small>uncertainty-aware MPC</small></div><i>→</i><div><span>04</span><strong>Compare reality</strong><small>prediction error signal</small></div><i>→</i><div><span>05</span><strong>Adapt + replan</strong><small>fast residual dynamics update</small></div>
      </section>

      {phase === "complete" && <section className="research-section" id="projects">
        <div className="research-heading"><div><p className="eyebrow">The demo works. The science is unfinished.</p><h2>Six research projects exposed by the run.</h2></div><p>The small model makes every assumption inspectable. Each limitation scales directly into a frontier problem for visual, language, and applied machine learning.</p></div>
        <div className="question-grid">{projectQuestions.map((project) => <article key={project.code}><span>{project.code}</span><h3>{project.title}</h3><p>{project.text}</p></article>)}</div>
        <footer className="research-footer"><div><strong>Scale-up path</strong><span>Replace the 3,055-parameter predictor with JEPA-WM, DINO-WM, or an action-conditioned video diffusion model—the experiment protocol stays the same.</span></div><button onClick={() => window.location.reload()}>Reset all learned state ↻</button></footer>
      </section>}
    </main>
  );
}

function PanelHeader({ kicker, title, meta, alert = false }: { kicker: string; title: string; meta: string; alert?: boolean }) {
  return <header className="panel-header"><div><span>{kicker}</span><h2>{title}</h2></div><small className={alert ? "alert" : ""}>{meta}</small></header>;
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function LossChart({ values, label }: { values: number[]; label: string }) {
  const maximum = Math.max(...values, 0.18);
  return <div className="loss-chart"><div><span>{label}</span><small>{values.length ? `${values[0].toFixed(3)} → ${values.at(-1)?.toFixed(3)}` : "awaiting training"}</small></div><figure>{values.length ? values.map((value, index) => <i key={index} style={{ height: `${Math.max(5, (value / maximum) * 100)}%` }} />) : Array.from({ length: 13 }, (_, index) => <i className="placeholder" key={index} style={{ height: `${20 + ((index * 17) % 65)}%` }} />)}</figure></div>;
}
