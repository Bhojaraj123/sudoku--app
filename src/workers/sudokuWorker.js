// src/workers/sudokuWorker.js
// Web Worker (module) that generates a solved sudoku and removes cells,
// attempting uniqueness. Runs off the main thread to keep UI snappy.

/* eslint-disable no-restricted-globals */
function copyBoard(b) {
  return b.map((r) => r.slice());
}

function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function canPlace(board, r, c, n) {
  for (let i = 0; i < 9; i++) {
    if (board[r][i] === n) return false;
    if (board[i][c] === n) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (board[br + i][bc + j] === n) return false;
  return true;
}

function solveBacktrack(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        for (let n = 1; n <= 9; n++) {
          if (canPlace(board, r, c, n)) {
            board[r][c] = n;
            if (solveBacktrack(board)) return true;
            board[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

// count solutions with early exit (limit)
function countSolutions(board, limit = 2) {
  let count = 0;
  function helper(b) {
    if (count >= limit) return;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] === 0) {
          for (let n = 1; n <= 9; n++) {
            if (canPlace(b, r, c, n)) {
              b[r][c] = n;
              helper(b);
              b[r][c] = 0;
            }
          }
          return;
        }
      }
    }
    count++;
  }
  helper(copyBoard(board));
  return count;
}

function generateSolvedBoard() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let k = 0; k < 3; k++) {
    const nums = shuffleArray([1,2,3,4,5,6,7,8,9]);
    for (let i=0;i<3;i++) for (let j=0;j<3;j++) board[k*3+i][k*3+j] = nums[i*3+j];
  }
  solveBacktrack(board);
  return board;
}

function puzzleFromSolutionWithUnique(solution, clues = 30, timeLimitMs = 1200) {
  // Remove cells, attempting to keep uniqueness. We respect a timeLimitMs
  // to avoid excessive work inside the worker.
  const start = Date.now();
  const board = copyBoard(solution);
  const cells = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([r,c]);
  shuffleArray(cells);

  let removed = 0;
  const toRemove = Math.max(0, 81 - (clues || 30));
  // iterate cells and try to remove while checking unique solution
  for (let i = 0; i < cells.length && removed < toRemove; i++) {
    if (Date.now() - start > timeLimitMs) {
      // stop uniqueness checking if we're over time limit; fall back to blind removal
      break;
    }
    const [r,c] = cells[i];
    const saved = board[r][c];
    board[r][c] = 0;
    const sols = countSolutions(board, 2);
    if (sols !== 1) {
      board[r][c] = saved; // restore
    } else {
      removed++;
    }
  }

  // if we still need to remove more (due to timeLimit stopping uniqueness checks),
  // perform blind removals among remaining cells (faster).
  if (removed < toRemove) {
    for (let i = 0; i < cells.length && removed < toRemove; i++) {
      const [r,c] = cells[i];
      if (board[r][c] !== 0) {
        board[r][c] = 0;
        removed++;
      }
    }
  }

  return board;
}

// Worker message handling
self.addEventListener('message', async (ev) => {
  const msg = ev.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'generate') {
    const clues = typeof msg.clues === 'number' ? msg.clues : 30;
    // Optionally inform main thread about progress
    self.postMessage({ type: 'status', status: 'started' });

    // generate solved board then puzzle
    try {
      const solution = generateSolvedBoard();
      // after generating solution, attempt to remove to reach requested clues
      const puzzle = puzzleFromSolutionWithUnique(solution, clues, 1200); // 1.2s uniqueness budget
      // send result back
      self.postMessage({ type: 'done', solution, puzzle });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  }
});
