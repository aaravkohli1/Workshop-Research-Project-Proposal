"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = 0 | 1 | 2 | 3 | 4;
type Probe = "corridor" | "sign" | "memory" | null;

const stages = [
  { short: "Brief", title: "Establish the mission" },
  { short: "Observe", title: "Build a world model" },
  { short: "Recall", title: "Reason over memory" },
  { short: "Shift", title: "Detect a changed world" },
  { short: "Adapt", title: "Choose what to observe next" },
];

const traceByStage = [
  { frame: "READY", time: "—", text: "The agent has no prior map. Its first task is to turn a continuous walk into structured memory.", confidence: 0, tone: "quiet" },
  { frame: "FRAME 042", time: "00:14", text: "Elevator observed to the right of Room 1045.", confidence: 92, tone: "good" },
  { frame: "FRAMES 031 · 042", time: "00:31", text: "The Vision Lab is two corridor segments west of the elevator.", confidence: 87, tone: "good" },
  { frame: "FRAME 118", time: "04:06", text: "New obstacle conflicts with the stored route to the Vision Lab.", confidence: 41, tone: "warn" },
  { frame: "FRAMES 118 · 126", time: "04:22", text: "The east corridor is blocked. A route through the Student Lounge remains open.", confidence: 84, tone: "good" },
];

const projects = [
  { code: "CV-01", division: "Computer Vision", title: "Open-world spatial grounding", question: "Can geometry-aware MLLMs build metrically consistent maps from ordinary phone video?", tags: ["3D vision", "VLMs"] },
  { code: "CV-02", division: "Computer Vision", title: "Active visual sensing", question: "Can an agent learn which camera movement will resolve its uncertainty fastest?", tags: ["Embodied AI", "RL"] },
  { code: "NLP-01", division: "Natural Language", title: "Contradiction-aware memory", question: "What should an agent update, preserve, or forget when observations disagree over time?", tags: ["Agent memory", "Reasoning"] },
  { code: "NLP-02", division: "Natural Language", title: "Evidence-bound answers", question: "Can every spatial claim be traced to the minimum sufficient set of frames?", tags: ["Grounding", "Verification"] },
  { code: "AML-01", division: "Applied ML", title: "Calibrated active perception", question: "When should a model answer, abstain, retrieve memory, or gather new evidence?", tags: ["Uncertainty", "Decision theory"] },
  { code: "AML-02", division: "Applied ML", title: "Continual adaptation", question: "Can the agent absorb environmental change without catastrophically rewriting valid memory?", tags: ["Continual learning", "Shift"] },
];

export default function Home() {
  const [stage, setStage] = useState<Stage>(0);
  const [probe, setProbe] = useState<Probe>(null);
  const [showProjects, setShowProjects] = useState(false);
  const trace = traceByStage[stage];
  const resolved = stage === 4 && probe === "corridor";
  const displayTrace = stage === 4 && !resolved
    ? { frame: "DECISION POINT", time: "04:12", text: "Stored evidence cannot determine whether an alternate route is open.", confidence: 0, tone: "quiet" }
    : trace;

  const memoryCount = useMemo(() => {
    if (stage === 0) return 0;
    if (stage < 3) return stage + 3;
    if (stage === 3) return 6;
    return resolved ? 7 : 6;
  }, [stage, resolved]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && stage < 4) setStage((stage + 1) as Stage);
      if (event.key.toLowerCase() === "r") {
        setStage(0); setProbe(null); setShowProjects(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  const advance = () => {
    if (stage < 4) {
      setStage((stage + 1) as Stage);
      setProbe(null);
    } else if (resolved) {
      setShowProjects(true);
      window.setTimeout(() => document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" }), 30);
    }
  };

  const reset = () => { setStage(0); setProbe(null); setShowProjects(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <main className="demo-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">UT</span>
          <div><strong>UTMIST Research</strong><span>Frontier systems lab</span></div>
        </div>
        <div className="top-actions">
          <span className="keyboard-tip">→ advance&nbsp;&nbsp; R reset</span>
          <div className="live-chip"><span /> Workshop simulation</div>
        </div>
      </header>

      <section className="hero-row">
        <div>
          <p className="eyebrow">Changing-world campus agent</p>
          <h1>Can an AI remember a world<br />that won&rsquo;t stay still?</h1>
          <p className="lede">A live test of spatial intelligence, multimodal memory, and calibrated action.</p>
        </div>
        <button className="primary-action" type="button" onClick={advance} disabled={stage === 4 && !resolved}>
          {stage === 0 ? "Begin traversal" : stage < 4 ? "Next experiment" : "Reveal project ideas"}<span aria-hidden="true">→</span>
        </button>
      </section>

      <nav className="experiment-nav" aria-label="Experiment stages">
        {stages.map((item, index) => (
          <button key={item.short} type="button" onClick={() => { setStage(index as Stage); setProbe(null); }} className={index === stage ? "active" : index < stage ? "complete" : ""}>
            <i>{index < stage ? "✓" : `0${index + 1}`}</i>
            <span><small>{item.short}</small>{item.title}</span>
          </button>
        ))}
      </nav>

      <section className={`workspace stage-${stage} ${resolved ? "resolved" : ""}`} aria-label="Campus agent simulation">
        <article className="map-card">
          <div className="panel-heading">
            <div><span className="panel-kicker">WORLD MODEL</span><h2>Deerfield Hall · Level 1</h2></div>
            <span className={`status-pill ${stage >= 3 ? "alert" : ""}`}>{stage === 0 ? "Awaiting observations" : stage >= 3 && !resolved ? "Conflict detected" : `${memoryCount} memories indexed`}</span>
          </div>
          <div className="map-stage">
            <div className="room room-a"><span>Lecture 1030</span></div>
            <div className="room room-b"><span>Room 1045</span></div>
            <div className="room room-c"><span>Studio 1060</span></div>
            <div className="corridor corridor-a" />
            <div className="corridor corridor-b" />
            {stage > 0 && <div className={`route-line ${stage >= 3 ? "invalid" : ""}`} />}
            {resolved && <div className="alternate-route"><b /><i /></div>}
            <div className={`map-node entrance ${stage > 0 ? "seen" : ""}`}><i>01</i><span>Entrance</span></div>
            <div className={`map-node lab ${stage > 1 ? "seen" : ""}`}><i>02</i><span>Vision Lab</span></div>
            <div className={`map-node lounge ${stage > 0 ? "seen" : ""}`}><i>03</i><span>Student Lounge</span></div>
            <div className={`map-node elevator ${stage > 0 ? "active" : ""}`}><i>04</i><span>Elevator</span></div>
            {stage >= 3 && <div className="blocked"><i>!</i><span>Unexpected barrier</span></div>}
            {stage > 0 && <div className={`agent-dot position-${stage}`} aria-label="Agent position"><span /></div>}
            {stage > 0 && <div className={`map-label label-${stage}`}>{stage === 3 ? "CONFLICT LOCATION" : resolved ? "NEW ROUTE VERIFIED" : "CURRENT OBSERVATION"}</div>}
            {stage === 0 && <div className="map-empty"><span>NO WORLD MODEL</span><p>Begin the traversal to stream observations.</p></div>}
            <div className="map-legend"><span><i className="known" /> observed</span><span><i className="route" /> planned path</span>{stage >= 3 && <span><i className="conflict" /> contradiction</span>}</div>
          </div>
        </article>

        <aside className="evidence-card">
          <div className="panel-heading compact">
            <div><span className="panel-kicker">AGENT TRACE</span><h2>{stage === 0 ? "Evidence, not guesses" : stage === 3 ? "A belief breaks" : resolved ? "Memory revised" : "Grounded inference"}</h2></div>
          </div>
          <div className={`observation-preview view-${stage}`}>
            <span className="frame-tag">{displayTrace.frame}</span>
            {stage === 0 ? <div className="camera-ready"><i /><span>CAMERA READY</span></div> : <Scene stage={stage} />}
            {stage >= 3 && <div className="barrier"><span>ACCESS CLOSED</span></div>}
            {resolved && <div className="verified-stamp">VERIFIED · 04:22</div>}
          </div>
          <div className="trace-copy">
            <span className="trace-time">{displayTrace.time}</span>
            <p>{displayTrace.text}</p>
            <div className={`confidence ${displayTrace.tone}`}>
              <span><i /> Confidence</span><strong>{displayTrace.confidence ? `${displayTrace.confidence}%` : "—"}</strong>
            </div>
            {stage >= 3 && <div className="memory-diff"><span>Memory operation</span><code>{resolved ? "UPDATE route_vision_lab" : "HOLD + SEEK_EVIDENCE"}</code></div>}
          </div>
        </aside>
      </section>

      <section className="control-deck">
        <article className="mission-card">
          <span className="panel-kicker">LIVE PROMPT</span>
          <h2>{stage === 0 ? "Reach the Vision Lab and remember the route." : stage === 1 ? "What did you observe near Room 1045?" : stage === 2 ? "Plan a route from the elevator to the Vision Lab." : stage === 3 ? "Your remembered route is blocked. What changed?" : resolved ? "Route repaired. What did the agent learn?" : "What should the agent observe next?"}</h2>
          <p>{stage === 0 ? "The model receives only an egocentric video stream—no floor plan and no privileged coordinates." : stage === 1 ? "The answer must be grounded in a retained visual observation." : stage === 2 ? "The model must compose multiple episodic memories into a spatial answer." : stage === 3 ? "The new frame contradicts a high-confidence memory. Updating too aggressively could erase valid knowledge." : resolved ? "A targeted observation changed one relationship while preserving the rest of the map." : "Choose an information-gathering action. The highest-confidence action is not necessarily the most useful one."}</p>
        </article>

        <article className="memory-card">
          <div className="memory-heading"><span className="panel-kicker">MEMORY STREAM</span><span>{memoryCount} active</span></div>
          <div className="memory-list" aria-live="polite">
            {stage === 0 && <p className="empty-memory">No memories written yet.</p>}
            {stage > 0 && <Memory op="ADD" id="m_042" text="Elevator ↔ Room 1045" />}
            {stage > 1 && <Memory op="ADD" id="m_077" text="Vision Lab west of elevator" />}
            {stage >= 3 && <Memory op={resolved ? "UPDATE" : "CONFLICT"} id="m_118" text={resolved ? "East corridor blocked" : "Barrier contradicts route"} />}
          </div>
        </article>

        <article className="decision-card">
          <span className="panel-kicker">AGENT POLICY</span>
          {stage < 4 ? (
            <div className="policy-state"><span>{`0${stage + 1}`}</span><p>{stage === 0 ? "Observe before acting" : stage === 1 ? "Write structured memory" : stage === 2 ? "Retrieve and compose evidence" : "Abstain under contradiction"}</p></div>
          ) : resolved ? (
            <div className="policy-result"><strong>Good decision</strong><p>Looking down the corridor maximized expected information gain.</p></div>
          ) : (
            <div className="probe-options">
              <button className={probe === "corridor" ? "selected correct" : ""} onClick={() => setProbe("corridor")}><span>Look down corridor</span><small>High information gain</small></button>
              <button className={probe === "sign" ? "selected wrong" : ""} onClick={() => setProbe("sign")}><span>Re-read room sign</span><small>Low relevance</small></button>
              <button className={probe === "memory" ? "selected wrong" : ""} onClick={() => setProbe("memory")}><span>Trust old memory</span><small>No new evidence</small></button>
              {probe && probe !== "corridor" && <p className="probe-warning">That action leaves the route conflict unresolved. Try gathering evidence about the corridor.</p>}
            </div>
          )}
        </article>
      </section>

      {showProjects && (
        <section className="projects-section" id="projects">
          <div className="projects-intro">
            <div><p className="eyebrow">The failure is the invitation</p><h2>Six projects hiding inside one demo.</h2></div>
            <p>A finished application would conceal these gaps. This experiment makes them visible—and turns each one into a tractable investigator question.</p>
          </div>
          <div className="project-grid">
            {projects.map((project, index) => (
              <article className="project-card" key={project.code} style={{ "--delay": `${index * 70}ms` } as React.CSSProperties}>
                <div><span>{project.code}</span><small>{project.division}</small></div>
                <h3>{project.title}</h3><p>{project.question}</p>
                <footer>{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</footer>
              </article>
            ))}
          </div>
          <div className="closing-banner"><div><span>YOUR MOVE</span><h3>Which uncertainty would you investigate?</h3></div><button type="button" onClick={reset}>Run the demo again ↻</button></div>
        </section>
      )}
    </main>
  );
}

function Scene({ stage }: { stage: Stage }) {
  return <><div className="ceiling-line" /><div className="door-shape"><span>1045</span></div><div className="hall-opening" /><div className="floor-line" />{stage === 2 && <div className="evidence-ray"><i /><span>retrieved evidence</span></div>}</>;
}

function Memory({ op, id, text }: { op: string; id: string; text: string }) {
  return <div className={`memory-row op-${op.toLowerCase()}`}><span>{op}</span><code>{id}</code><p>{text}</p></div>;
}
