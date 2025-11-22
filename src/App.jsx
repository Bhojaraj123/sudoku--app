import React, { useEffect, useState, useCallback, useRef } from "react";
import Board from "./components/Board";
import ScoreModal from "./components/ScoreModal";
import { copyBoard, maybeSaveGameKey } from "./utils/sudoku";
import { motion } from "framer-motion";

/* CLUES same as before */
const CLUES = {
  Beginner: [48, 46, 44, 42, 40, 38, 36, 34, 32, 30],
  Intermediate: [36, 34, 32, 30, 28, 26, 24, 22, 20, 18],
  Advanced: [30, 28, 26, 24, 22, 20, 18, 16, 14, 12]
};

export default function App() {
  const [difficulty, setDifficulty] = useState("Beginner");
  const [stage, setStage] = useState(1);
  const [solution, setSolution] = useState(null);
  const [puzzle, setPuzzle] = useState(null);
  const [message, setMessage] = useState("");
  const [hintsLeft, setHintsLeft] = useState(3);
  const [timerKey, setTimerKey] = useState(0);
  const [score, setScore] = useState(0);
  const [completedStages, setCompletedStages] = useState({
    Beginner: 0,
    Intermediate: 0,
    Advanced: 0
  });

  // progress UI state
  const [generatingProgress, setGeneratingProgress] = useState({ active: false, pct: 0, text: "" });
  const [verifyingProgress, setVerifyingProgress] = useState({ active: false, pct: 0, text: "" });

  // score breakdown modal
  const [breakdownModal, setBreakdownModal] = useState({ open: false, breakdown: [], total: 0 });

  const workerRef = useRef(null);
  const verifyRef = useRef(null);

  // create workers
  useEffect(() => {
    // generation worker (existing)
    try {
      workerRef.current = new Worker(new URL("./workers/sudokuWorker.js", import.meta.url), { type: "module" });
      workerRef.current.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === "status") {
          setGeneratingProgress((p) => ({ ...p, text: `Worker: ${msg.status}` }));
        } else if (msg.type === "done") {
          setGeneratingProgress({ active: false, pct: 100, text: "Done" });
          setSolution(msg.solution);
          setPuzzle(msg.puzzle);
          setTimerKey((k) => k + 1);
          setHintsLeft(3);
          setMessage("Puzzle generated (worker). Verifying uniqueness...");
          // now request thorough uniqueness verification
          runVerification(msg.puzzle);
        } else if (msg.type === "error") {
          setGeneratingProgress({ active: false, pct: 0, text: "Error" });
          setMessage("Generation worker error: " + msg.error);
        } else if (msg.type === "status") {
          // handled earlier
        }
      };
      workerRef.current.onerror = (err) => {
        console.error("Worker error", err);
        setGeneratingProgress({ active: false, pct: 0, text: "Worker error" });
        workerRef.current && workerRef.current.terminate();
        workerRef.current = null;
      };
    } catch (e) {
      workerRef.current = null;
    }

    // uniqueness verification worker
    try {
      verifyRef.current = new Worker(new URL("./workers/uniquenessWorker.js", import.meta.url), { type: "module" });
      verifyRef.current.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === "progress") {
          // convert attempts -> pct (heuristic)
          const pct = Math.min(95, Math.floor((msg.attempts % 10000) / 100)); // rough
          setVerifyingProgress({ active: true, pct, text: `Verifying... attempts:${msg.attempts} solutions:${msg.count}` });
        } else if (msg.type === "done") {
          const pct = msg.unique ? 100 : 0;
          setVerifyingProgress({ active: false, pct, text: msg.unique ? "Unique" : "Not unique" });
          setMessage(msg.unique ? "Puzzle verified unique" : "Puzzle may have multiple solutions");
          // if not unique, optionally trigger regeneration. We'll show message and let user regen or allow auto-regenerate:
          if (!msg.unique) {
            // small delay then regenerate automatically with new puzzle
            setTimeout(() => {
              setMessage("Puzzle failed uniqueness check — regenerating...");
              newGame(difficulty, stage, { loadSaved: false });
            }, 900);
          }
        } else if (msg.type === "error") {
          setVerifyingProgress({ active: false, pct: 0, text: "Verification error" });
          console.error("verify worker error:", msg.error);
        }
      };
    } catch (e) {
      verifyRef.current = null;
    }

    return () => {
      if (workerRef.current) try { workerRef.current.terminate(); } catch {}
      if (verifyRef.current) try { verifyRef.current.terminate(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load persisted meta and saved board if exists
  useEffect(() => {
    const meta = localStorage.getItem("sudoku_meta");
    if (meta) {
      try {
        const parsed = JSON.parse(meta);
        if (parsed.difficulty) setDifficulty(parsed.difficulty);
        if (parsed.stage) setStage(parsed.stage);
        if (parsed.score) setScore(parsed.score);
        if (parsed.completedStages) setCompletedStages(parsed.completedStages);
      } catch {}
    }
    newGame(difficulty, stage, { loadSaved: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("sudoku_meta", JSON.stringify({ difficulty, stage, score, completedStages }));
  }, [difficulty, stage, score, completedStages]);

  // request generation (worker first)
  const newGame = useCallback(async (diff = difficulty, st = stage, opts = {}) => {
    setMessage("Starting generation...");
    setGeneratingProgress({ active: true, pct: 4, text: "Starting worker..." });
    // try resume saved
    if (opts.loadSaved) {
      const saved = localStorage.getItem(maybeSaveGameKey(diff, st));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSolution(parsed.solution);
          setPuzzle(parsed.puzzle);
          setHintsLeft(parsed.hintsLeft ?? 3);
          setTimerKey((k) => k + 1);
          setGeneratingProgress({ active: false, pct: 100, text: "Resumed saved" });
          setMessage(`Resumed ${diff} Stage ${st}`);
          // still run verification to reassure uniqueness
          runVerification(parsed.puzzle);
          return;
        } catch {}
      }
    }

    const cluesCount = (CLUES[diff] && CLUES[diff][st - 1]) || 30;

    try {
      if (workerRef.current) {
        // listen for interim statuses: the worker posts status messages we set earlier
        setGeneratingProgress({ active: true, pct: 7, text: "Worker generating..." });
        workerRef.current.postMessage({ type: "generate", clues: cluesCount });
        // worker.onmessage handles result
        return;
      } else {
        throw new Error("Worker unavailable");
      }
    } catch (err) {
      // fallback to synchronous generation (simple)
      setGeneratingProgress({ active: true, pct: 10, text: "Fallback generation on main thread" });
      try {
        const mod = await import("./utils/sudoku.js");
        const solved = mod.generateSudokuUnique();
        const puzzleBoard = mod.puzzleFromSolutionWithUnique(solved, cluesCount);
        setGeneratingProgress({ active: false, pct: 100, text: "Done (fallback)" });
        setSolution(solved);
        setPuzzle(puzzleBoard);
        setHintsLeft(3);
        setMessage("Puzzle generated on main thread — verifying...");
        // verify
        runVerification(puzzleBoard);
      } catch (err2) {
        setGeneratingProgress({ active: false, pct: 0, text: "Failed" });
        setMessage("Generation failed: " + (err2.message || err.message));
        console.error(err2 || err);
      }
    }
  }, [difficulty, stage]);

  // run uniqueness verification using verifyRef worker
  function runVerification(puzzleBoard) {
    setVerifyingProgress({ active: true, pct: 2, text: "Starting verification..." });
    if (!verifyRef.current) {
      setVerifyingProgress({ active: false, pct: 0, text: "No verify worker" });
      setMessage("No verify worker available — skipping deep check");
      return;
    }
    try {
      verifyRef.current.postMessage({ type: "verify", board: puzzleBoard, progressIntervalMs: 300 });
    } catch (e) {
      setVerifyingProgress({ active: false, pct: 0, text: "Verify post failed" });
    }
  }

  // app-level handlers
  function handleRegenerateSameStage(reason = "Regenerating") {
    setMessage(reason);
    setScore(0);
    setTimeout(() => newGame(difficulty, stage, { loadSaved: false }), 500);
  }

  function handleWin(breakdown) {
    // breakdown: array of {r,c,value,base,bonus,points}
    const total = breakdown.reduce((s, x) => s + (x.points || 0), 0);
    setScore((s) => s + total + 100); // also stage bonus
    setBreakdownModal({ open: true, breakdown, total });
    // mark completed stage
    setCompletedStages((prev) => {
      const cur = prev[difficulty] || 0;
      const updated = { ...prev };
      if (stage > cur) updated[difficulty] = stage;
      return updated;
    });
    // auto-advance only if the stage completed is exactly the next in sequence
    const next = stage === 10 ? 1 : stage + 1;
    setStage(next);
    setTimeout(() => newGame(difficulty, next), 1200);
  }

  function changeDifficulty(d) {
    setDifficulty(d);
    const completed = completedStages[d] || 0;
    const allowed = Math.min(10, Math.max(1, completed + 1));
    setStage(allowed);
    setScore(0);
    newGame(d, allowed);
  }

  function stageOptionsForDifficulty(d) {
    const completed = completedStages[d] || 0;
    const maxAvailable = Math.min(10, Math.max(1, completed + 1));
    return Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return { n, locked: n > maxAvailable };
    });
  }

  return (
    <div className="app-shell">
      <motion.header className="header" initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div>
          <h1>Sudoku — Progress & Verification</h1>
          <div className="meta">Difficulty: {difficulty} • Stage: {stage} • Score: {score}</div>
          <div className="meta small">Completed: B {completedStages.Beginner}, I {completedStages.Intermediate}, A {completedStages.Advanced}</div>
          {/* progress bars */}
          {generatingProgress.active && (
            <div className="progress-row">
              <div className="progress-label">Generating: {generatingProgress.text}</div>
              <div className="progress"><div className="progress-fill" style={{ width: `${generatingProgress.pct}%` }} /></div>
            </div>
          )}
          {verifyingProgress.active && (
            <div className="progress-row">
              <div className="progress-label">Verifying uniqueness: {verifyingProgress.text}</div>
              <div className="progress"><div className="progress-fill verify" style={{ width: `${verifyingProgress.pct}%` }} /></div>
            </div>
          )}
        </div>

        <div className="controls">
          <label>Difficulty:
            <select value={difficulty} onChange={(e) => changeDifficulty(e.target.value)}>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
          </label>

          <label>Stage:
            <select value={stage} onChange={(e) => { const s = Number(e.target.value); setStage(s); newGame(difficulty, s); }}>
              {stageOptionsForDifficulty(difficulty).map(({ n, locked }) => (
                <option key={n} value={n} disabled={locked} title={locked ? "Locked — complete previous stage to unlock" : ""}>
                  {locked ? `🔒 ${n}` : n}
                </option>
              ))}
            </select>
          </label>

          <button onClick={() => newGame(difficulty, stage)}>New Game</button>
          <button onClick={() => { if (solution) setPuzzle(copyBoard(solution)); setMessage("Solution shown"); }}>Show Solution</button>
          <button onClick={() => newGame(difficulty, stage, { loadSaved: true })}>Resume</button>
        </div>
      </motion.header>

      <main>
        <motion.div className="board-area" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {puzzle && solution ? (
            <Board
              puzzle={puzzle}
              solution={solution}
              onWin={(breakdown) => handleWin(breakdown)}
              onRegenerateSameStage={(reason) => handleRegenerateSameStage(reason)}
              difficulty={difficulty}
              stage={stage}
              hintsLeft={hintsLeft}
              setHintsLeft={setHintsLeft}
              timerKey={timerKey}
              addScore={(pts) => setScore((s) => s + pts)}
            />
          ) : (
            <div className="loading">Loading...</div>
          )}
          <div className="status">{message}</div>
        </motion.div>

        <aside className="aside-anim">
          <div className="anim-card" aria-hidden>
            <svg viewBox="0 0 100 100" className="spin-svg">
              <defs>
                <linearGradient id="g2" x1="0" x2="1">
                  <stop offset="0" stopColor="#ff5acd" />
                  <stop offset="1" stopColor="#00d4ff" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="28" stroke="url(#g2)" strokeWidth="6" fill="none" />
              <g className="orbit">
                <circle cx="80" cy="50" r="3" fill="#fff" />
              </g>
            </svg>
            <div className="anim-text">Worker generation + deep verification (may take longer)</div>
          </div>
        </aside>
      </main>

      <ScoreModal
        open={breakdownModal.open}
        breakdown={breakdownModal.breakdown}
        total={breakdownModal.total}
        onClose={() => setBreakdownModal({ open: false, breakdown: [], total: 0 })}
      />
    </div>
  );
}
