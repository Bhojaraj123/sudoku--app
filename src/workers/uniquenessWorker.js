// src/workers/uniquenessWorker.js
/* eslint-disable no-restricted-globals */
// This worker takes a partially filled board and verifies whether the
// puzzle has a unique solution. It runs a DFS/backtracking search and posts
// progress updates periodically.

function copyBoard(b) {
  return b.map((r) => r.slice());
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

self.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (!msg || !msg.type) return;

  if (msg.type === "verify") {
    const board = copyBoard(msg.board);
    const limit = msg.limit || 2;
    let count = 0;
    const start = Date.now();
    // We'll do a controlled backtrack that periodically posts progress.
    const cells = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board[r][c] === 0) cells.push([r, c]);

    // We'll search using recursive helper, but post progress after each N attempts.
    let attempts = 0;
    const progressInterval = msg.progressIntervalMs || 300; // ms
    let lastProgressTs = Date.now();

    function helper(b) {
      if (count >= limit) return;
      // find first empty
      let found = false;
      let r0 = -1, c0 = -1;
      for (let r = 0; r < 9 && !found; r++) {
        for (let c = 0; c < 9; c++) {
          if (b[r][c] === 0) {
            found = true;
            r0 = r; c0 = c;
            break;
          }
        }
      }
      if (!found) {
        count++;
        // post small progress update
        const now = Date.now();
        if (now - lastProgressTs > progressInterval) {
          self.postMessage({ type: "progress", attempts, count, elapsedMs: now - start });
          lastProgressTs = now;
        }
        return;
      }
      for (let n = 1; n <= 9; n++) {
        if (canPlace(b, r0, c0, n)) {
          b[r0][c0] = n;
          attempts++;
          // periodically post progress
          const now = Date.now();
          if (now - lastProgressTs > progressInterval) {
            self.postMessage({ type: "progress", attempts, count, elapsedMs: now - start });
            lastProgressTs = now;
          }
          helper(b);
          b[r0][c0] = 0;
          if (count >= limit) return;
        }
      }
    }

    try {
      helper(board);
      self.postMessage({ type: "done", unique: count === 1, count, attempts, elapsedMs: Date.now() - start });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
  }
});
