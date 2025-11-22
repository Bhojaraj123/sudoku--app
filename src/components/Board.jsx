import React, { useEffect, useState, useCallback, useRef } from "react";
import Cell from "./Cell";
import confetti from "canvas-confetti";
import {
  isSolved,
  copyBoard,
  isValidMove,
  maybeSaveGameKey,
  basePointsForDifficulty
} from "../utils/sudoku";
import { motion } from "framer-motion";

/*
 Board now:
 - collects scoring breakdown entries (for completed stage)
 - enforces mistakes limit (>3 triggers onRegenerateSameStage)
 - countdown timer
 - on complete calls onWin with breakdown array
*/

export default function Board({
  puzzle: initialPuzzle,
  solution,
  onWin,
  onRegenerateSameStage,
  difficulty,
  stage,
  hintsLeft,
  setHintsLeft,
  timerKey,
  addScore
}) {
  const [board, setBoard] = useState(copyBoard(initialPuzzle));
  const [selected, setSelected] = useState([0, 0]);
  const [errorCells, setErrorCells] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [breakdown, setBreakdown] = useState([]); // collects placements: {r,c,val,base,bonus,points}

  // countdown
  const timeLimits = { Beginner: 10 * 60, Intermediate: 7 * 60, Advanced: 5 * 60 };
  const [timeLeft, setTimeLeft] = useState(timeLimits[difficulty] || 600);
  const timerRef = useRef(null);

  // clue frequency for rarity calculation
  function computeClueFrequency(puzzleBoard) {
    const freq = Array(10).fill(0);
    for (let r=0;r<9;r++) for (let c=0;c<9;c++){
      const v = puzzleBoard[r][c];
      if (v >= 1 && v <= 9) freq[v]++;
    }
    return freq;
  }
  const clueFreqRef = useRef(computeClueFrequency(initialPuzzle));

  useEffect(() => {
    setBoard(copyBoard(initialPuzzle));
    setSelected([0, 0]);
    setErrorCells([]);
    setMistakes(0);
    setBreakdown([]);
    setTimeLeft(timeLimits[difficulty] || 600);
    clueFreqRef.current = computeClueFrequency(initialPuzzle);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [initialPuzzle, timerKey, difficulty, stage]);

  useEffect(() => {
    if (timeLeft <= 0) {
      clearInterval(timerRef.current);
      onRegenerateSameStage && onRegenerateSameStage("Time out");
    }
  }, [timeLeft, onRegenerateSameStage]);

  useEffect(() => {
    // persist
    const payload = { puzzle: board, solution, hintsLeft };
    localStorage.setItem(maybeSaveGameKey(difficulty, stage), JSON.stringify(payload));
  }, [board, solution, hintsLeft, difficulty, stage]);

  useEffect(() => {
    function handleKey(e) {
      if (!document.activeElement || document.activeElement.tagName === "BODY") {
        const key = e.key;
        if (/^[1-9]$/.test(key)) handleMove(parseInt(key, 10));
        if (key === "Backspace" || key === "Delete" || key === "0") handleMove(0);
        if (key === "ArrowUp") setSelected((s) => [Math.max(0, s[0] - 1), s[1]]);
        if (key === "ArrowDown") setSelected((s) => [Math.min(8, s[0] + 1), s[1]]);
        if (key === "ArrowLeft") setSelected((s) => [s[0], Math.max(0, s[1] - 1)]);
        if (key === "ArrowRight") setSelected((s) => [s[0], Math.min(8, s[1] + 1)]);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, board]);

  const handleMove = useCallback((value) => {
    setBoard((prev) => {
      const b = copyBoard(prev);
      const [r, c] = selected;
      if (initialPuzzle[r][c] !== 0) return b;
      if (value === 0) {
        b[r][c] = 0;
        return b;
      }
      // wrong entry -> increment mistakes & possibly regenerate
      if (value !== solution[r][c]) {
        setErrorCells([[r, c]]);
        setTimeout(() => setErrorCells([]), 450);
        setMistakes((m) => {
          const next = m + 1;
          if (next > 3) {
            onRegenerateSameStage && onRegenerateSameStage("Too many mistakes");
          }
          return next;
        });
        return b;
      }

      // correct placement
      b[r][c] = value;
      // scoring: base + rarity bonus
      const base = basePointsForDifficulty(difficulty);
      const freq = clueFreqRef.current[value] || 0;
      const rarityBonus = Math.max(0, 4 - freq) * 2;
      const points = base + rarityBonus;
      addScore && addScore(points);

      // record breakdown entry
      setBreakdown((d) => [...d, { r, c, value, base, bonus: rarityBonus, points }]);

      // small pop
      confetti({ particleCount: 12, spread: 30, scalar: 0.5 });
      if (isSolved(b)) {
        clearInterval(timerRef.current);
        setTimeout(() => {
          confetti({ particleCount: 200, spread: 90 });
          // send breakdown up (App will open modal and handle stage progression)
          onWin && onWin(breakdown.concat([{ r, c, value, base, bonus: rarityBonus, points }]));
        }, 400);
      }
      return b;
    });
  }, [selected, initialPuzzle, solution, onWin, onRegenerateSameStage, difficulty, addScore, breakdown]);

  function setCell(r, c) {
    setSelected([r, c]);
  }

  function useHint() {
    if (hintsLeft <= 0) return;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          setBoard((prev) => {
            const b = copyBoard(prev);
            b[r][c] = solution[r][c];
            return b;
          });
          setHintsLeft((h) => h - 1);
          addScore && addScore(5);
          confetti({ particleCount: 30, spread: 50, scalar: 0.6 });
          return;
        }
      }
    }
  }

  function formatTime(s) {
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  return (
    <div className="board-wrap">
      <div className="top-row">
        <div className="info">
          <div>Difficulty: {difficulty}</div>
          <div>Stage: {stage}</div>
          <div>Hints: {hintsLeft}</div>
          <div>Time left: {formatTime(timeLeft)}</div>
          <div>Mistakes: {mistakes} / 3</div>
        </div>
        <div className="actions">
          <button onClick={useHint} disabled={hintsLeft <= 0}>Use Hint</button>
        </div>
      </div>

      <div className="board">
        {board.map((row, r) => (
          <div className="row" key={r}>
            {row.map((val, c) => (
              <Cell
                key={`${r}-${c}`}
                r={r}
                c={c}
                value={val}
                initial={initialPuzzle[r][c]}
                solvedValue={solution[r][c]}
                selected={selected[0] === r && selected[1] === c}
                onSelect={() => setCell(r, c)}
                onSet={(v) => handleMove(v)}
                shake={errorCells.some(([er,ec]) => er===r && ec===c)}
              />
            ))}
          </div>
        ))}
      </div>

      <motion.div className="numpad" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => handleMove(n)}>{n}</button>
        ))}
        <button onClick={() => handleMove(0)}>Clear</button>
      </motion.div>
    </div>
  );
}
