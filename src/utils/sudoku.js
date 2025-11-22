export function copyBoard(b) {
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

// quick count of solutions with early exit if more than 1
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

export function generateSudokuUnique() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let k = 0; k < 3; k++) {
    const nums = shuffleArray([1,2,3,4,5,6,7,8,9]);
    for (let i=0;i<3;i++) for (let j=0;j<3;j++) board[k*3+i][k*3+j] = nums[i*3+j];
  }
  solveBacktrack(board);
  return board;
}

export function puzzleFromSolutionWithUnique(solution, clues = 30) {
  const board = copyBoard(solution);
  const cells = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([r, c]);
  shuffleArray(cells);
  let removed = 0;
  const toRemove = 81 - clues;
  for (let i = 0; i < cells.length && removed < toRemove; i++) {
    const [r,c] = cells[i];
    const saved = board[r][c];
    board[r][c] = 0;
    const sols = countSolutions(board, 2);
    if (sols !== 1) {
      board[r][c] = saved;
    } else {
      removed++;
    }
  }
  return board;
}

export function isValidMove(board, r, c, n) {
  if (n < 1 || n > 9) return false;
  for (let i = 0; i < 9; i++) if (board[r][i] === n && i !== c) return false;
  for (let i = 0; i < 9; i++) if (board[i][c] === n && i !== r) return false;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const rr = br + i, cc = bc + j;
    if ((rr !== r || cc !== c) && board[rr][cc] === n) return false;
  }
  return true;
}

export function isSolved(board) {
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (board[r][c] === 0) return false;
  for (let r=0;r<9;r++){ const seen = new Set(); for (let c=0;c<9;c++){ if (seen.has(board[r][c])) return false; seen.add(board[r][c]) } }
  for (let c=0;c<9;c++){ const seen = new Set(); for (let r=0;r<9;r++){ if (seen.has(board[r][c])) return false; seen.add(board[r][c]) } }
  for (let br=0;br<9;br+=3) for (let bc=0;bc<9;bc+=3){ const seen = new Set(); for (let i=0;i<3;i++) for (let j=0;j<3;j++){ const v=board[br+i][bc+j]; if (seen.has(v)) return false; seen.add(v);} }
  return true;
}

export function maybeSaveGameKey(difficulty, stage) { return `sudoku_saved_${difficulty}_${stage}`; }

// scoring helper: base points per difficulty
export function basePointsForDifficulty(difficulty) {
  switch (difficulty) {
    case "Beginner": return 10;
    case "Intermediate": return 20;
    case "Advanced": return 30;
    default: return 10;
  }
}
