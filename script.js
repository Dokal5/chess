const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const historyEl = document.getElementById('history');
const restartBtn = document.getElementById('restartBtn');
const promotionModal = document.getElementById('promotionModal');
const promotionChoices = document.getElementById('promotionChoices');

const FILES = 'abcdefgh';
const PIECE_SYMBOLS = {
  wp: '♙',
  wr: '♖',
  wn: '♘',
  wb: '♗',
  wq: '♕',
  wk: '♔',
  bp: '♟',
  br: '♜',
  bn: '♞',
  bb: '♝',
  bq: '♛',
  bk: '♚',
};

const state = {
  board: [],
  currentPlayer: 'w',
  selected: null,
  legalMoves: [],
  history: [],
  castling: { w: { king: true, queen: true }, b: { king: true, queen: true } },
  enPassant: null,
  halfmoveClock: 0,
  fullmoveNumber: 1,
  gameOver: false,
  result: '',
  pendingPromotion: null,
};

function createInitialBoard() {
  return [
    ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
    ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
    ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr'],
  ];
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function squareToAlgebraic(row, col) {
  return `${FILES[col]}${8 - row}`;
}

function algebraicToSquare(square) {
  const col = FILES.indexOf(square[0]);
  const row = 8 - Number(square[1]);
  return { row, col };
}

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

function isSquareAttacked(board, row, col, byColor) {
  const pawnDir = byColor === 'w' ? -1 : 1;
  for (const dc of [-1, 1]) {
    const pr = row - pawnDir;
    const pc = col + dc;
    if (inBounds(pr, pc) && board[pr][pc] === `${byColor}p`) return true;
  }

  const knightOffsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const r = row + dr;
    const c = col + dc;
    if (inBounds(r, c) && board[r][c] === `${byColor}n`) return true;
  }

  const lines = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of lines) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p[0] === byColor && (p[1] === 'r' || p[1] === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  const diagonals = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of diagonals) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p[0] === byColor && (p[1] === 'b' || p[1] === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (inBounds(r, c) && board[r][c] === `${byColor}k`) return true;
    }
  }

  return false;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === `${color}k`) return { row: r, col: c };
    }
  }
  return null;
}

function isInCheck(board, color) {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  return isSquareAttacked(board, kingPos.row, kingPos.col, opposite(color));
}

function getPseudoMoves(board, row, col, options = {}) {
  const { includeCastling = true, enPassant = state.enPassant, castling = state.castling } = options;
  const piece = board[row][col];
  if (!piece) return [];

  const color = piece[0];
  const type = piece[1];
  const enemy = opposite(color);
  const moves = [];

  if (type === 'p') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const promotionRow = color === 'w' ? 0 : 7;
    const oneForward = row + dir;

    if (inBounds(oneForward, col) && !board[oneForward][col]) {
      moves.push({ from: { row, col }, to: { row: oneForward, col }, promotion: oneForward === promotionRow });
      const twoForward = row + dir * 2;
      if (row === startRow && !board[twoForward][col]) {
        moves.push({ from: { row, col }, to: { row: twoForward, col }, doubleStep: true });
      }
    }

    for (const dc of [-1, 1]) {
      const r = row + dir;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = board[r][c];
      if (target && target[0] === enemy) {
        moves.push({ from: { row, col }, to: { row: r, col: c }, capture: true, promotion: r === promotionRow });
      }
    }

    if (enPassant) {
      const { row: epRow, col: epCol } = algebraicToSquare(enPassant);
      if (Math.abs(epCol - col) === 1 && epRow === row + dir) {
        moves.push({
          from: { row, col },
          to: { row: epRow, col: epCol },
          capture: true,
          enPassant: true,
        });
      }
    }
  }

  if (type === 'n') {
    const deltas = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dr, dc] of deltas) {
      const r = row + dr;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = board[r][c];
      if (!target || target[0] === enemy) {
        moves.push({ from: { row, col }, to: { row: r, col: c }, capture: !!target });
      }
    }
  }

  if (type === 'b' || type === 'r' || type === 'q') {
    const dirs = [];
    if (type === 'b' || type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (type === 'r' || type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const target = board[r][c];
        if (!target) {
          moves.push({ from: { row, col }, to: { row: r, col: c } });
        } else {
          if (target[0] === enemy) moves.push({ from: { row, col }, to: { row: r, col: c }, capture: true });
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  if (type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const target = board[r][c];
        if (!target || target[0] === enemy) moves.push({ from: { row, col }, to: { row: r, col: c }, capture: !!target });
      }
    }

    if (includeCastling && !isInCheck(board, color)) {
      const homeRow = color === 'w' ? 7 : 0;
      if (row === homeRow && col === 4) {
        if (
          castling[color].king &&
          !board[homeRow][5] &&
          !board[homeRow][6] &&
          board[homeRow][7] === `${color}r` &&
          !isSquareAttacked(board, homeRow, 5, enemy) &&
          !isSquareAttacked(board, homeRow, 6, enemy)
        ) {
          moves.push({ from: { row, col }, to: { row: homeRow, col: 6 }, castle: 'king' });
        }

        if (
          castling[color].queen &&
          !board[homeRow][3] &&
          !board[homeRow][2] &&
          !board[homeRow][1] &&
          board[homeRow][0] === `${color}r` &&
          !isSquareAttacked(board, homeRow, 3, enemy) &&
          !isSquareAttacked(board, homeRow, 2, enemy)
        ) {
          moves.push({ from: { row, col }, to: { row: homeRow, col: 2 }, castle: 'queen' });
        }
      }
    }
  }

  return moves;
}

function simulateMove(board, move) {
  const nextBoard = cloneBoard(board);
  const piece = nextBoard[move.from.row][move.from.col];
  nextBoard[move.from.row][move.from.col] = null;

  if (move.enPassant) {
    const pawnRow = piece[0] === 'w' ? move.to.row + 1 : move.to.row - 1;
    nextBoard[pawnRow][move.to.col] = null;
  }

  if (move.castle) {
    if (move.castle === 'king') {
      nextBoard[move.to.row][5] = nextBoard[move.to.row][7];
      nextBoard[move.to.row][7] = null;
    } else {
      nextBoard[move.to.row][3] = nextBoard[move.to.row][0];
      nextBoard[move.to.row][0] = null;
    }
  }

  if (move.promotion && move.promoteTo) {
    nextBoard[move.to.row][move.to.col] = `${piece[0]}${move.promoteTo}`;
  } else {
    nextBoard[move.to.row][move.to.col] = piece;
  }

  return nextBoard;
}

function getLegalMovesForSquare(board, row, col, color, context = {}) {
  const piece = board[row][col];
  if (!piece || piece[0] !== color) return [];

  const pseudo = getPseudoMoves(board, row, col, context);
  const legal = [];

  for (const move of pseudo) {
    if (move.promotion) {
      const promotionPieces = ['q', 'r', 'b', 'n'];
      for (const promoteTo of promotionPieces) {
        const promotedMove = { ...move, promoteTo };
        const nextBoard = simulateMove(board, promotedMove);
        if (!isInCheck(nextBoard, color)) legal.push(promotedMove);
      }
    } else {
      const nextBoard = simulateMove(board, move);
      if (!isInCheck(nextBoard, color)) legal.push(move);
    }
  }

  return legal;
}

function getAllLegalMoves(board, color, context = {}) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.[0] === color) {
        moves.push(...getLegalMovesForSquare(board, r, c, color, context));
      }
    }
  }
  return moves;
}

function updateCastlingRights(piece, from, to, capturedPiece) {
  if (piece[1] === 'k') {
    state.castling[piece[0]].king = false;
    state.castling[piece[0]].queen = false;
  }
  if (piece[1] === 'r') {
    if (from.row === 7 && from.col === 0) state.castling.w.queen = false;
    if (from.row === 7 && from.col === 7) state.castling.w.king = false;
    if (from.row === 0 && from.col === 0) state.castling.b.queen = false;
    if (from.row === 0 && from.col === 7) state.castling.b.king = false;
  }
  if (capturedPiece === 'wr') {
    if (to.row === 7 && to.col === 0) state.castling.w.queen = false;
    if (to.row === 7 && to.col === 7) state.castling.w.king = false;
  }
  if (capturedPiece === 'br') {
    if (to.row === 0 && to.col === 0) state.castling.b.queen = false;
    if (to.row === 0 && to.col === 7) state.castling.b.king = false;
  }
}

function moveToNotation(piece, move, wasCheck, wasMate) {
  if (move.castle === 'king') return `O-O${wasMate ? '#' : wasCheck ? '+' : ''}`;
  if (move.castle === 'queen') return `O-O-O${wasMate ? '#' : wasCheck ? '+' : ''}`;

  const type = piece[1] === 'p' ? '' : piece[1].toUpperCase();
  const target = squareToAlgebraic(move.to.row, move.to.col);
  const fromFile = FILES[move.from.col];

  let note = '';
  if (piece[1] === 'p' && (move.capture || move.enPassant)) {
    note = `${fromFile}x${target}`;
  } else {
    note = `${type}${move.capture ? 'x' : ''}${target}`;
  }

  if (move.promotion) note += `=${move.promoteTo.toUpperCase()}`;
  if (move.enPassant) note += ' e.p.';
  if (wasMate) note += '#';
  else if (wasCheck) note += '+';

  return note;
}

function makeMove(move) {
  if (state.gameOver) return;

  const piece = state.board[move.from.row][move.from.col];
  const targetPiece = state.board[move.to.row][move.to.col];
  state.board[move.from.row][move.from.col] = null;

  if (move.enPassant) {
    const capturedRow = piece[0] === 'w' ? move.to.row + 1 : move.to.row - 1;
    state.board[capturedRow][move.to.col] = null;
  }

  if (move.castle) {
    if (move.castle === 'king') {
      state.board[move.to.row][5] = state.board[move.to.row][7];
      state.board[move.to.row][7] = null;
    } else {
      state.board[move.to.row][3] = state.board[move.to.row][0];
      state.board[move.to.row][0] = null;
    }
  }

  const placedPiece = move.promotion ? `${piece[0]}${move.promoteTo}` : piece;
  state.board[move.to.row][move.to.col] = placedPiece;

  updateCastlingRights(piece, move.from, move.to, targetPiece);

  state.enPassant = null;
  if (piece[1] === 'p' && Math.abs(move.to.row - move.from.row) === 2) {
    const epSquare = squareToAlgebraic((move.to.row + move.from.row) / 2, move.from.col);
    state.enPassant = epSquare;
  }

  const wasPawnMove = piece[1] === 'p';
  const wasCapture = !!targetPiece || move.enPassant;
  state.halfmoveClock = wasPawnMove || wasCapture ? 0 : state.halfmoveClock + 1;

  const nextPlayer = opposite(state.currentPlayer);
  const check = isInCheck(state.board, nextPlayer);
  const nextMoves = getAllLegalMoves(state.board, nextPlayer, { castling: state.castling, enPassant: state.enPassant });
  const mate = check && nextMoves.length === 0;
  const stalemate = !check && nextMoves.length === 0;

  const notation = moveToNotation(piece, move, check, mate);
  state.history.push({ player: state.currentPlayer, notation, fullmove: state.fullmoveNumber });

  if (state.currentPlayer === 'b') state.fullmoveNumber += 1;
  state.currentPlayer = nextPlayer;

  if (mate) {
    state.gameOver = true;
    state.result = `Checkmate! ${piece[0] === 'w' ? 'White' : 'Black'} wins.`;
  } else if (stalemate) {
    state.gameOver = true;
    state.result = 'Stalemate! Draw.';
  } else {
    state.result = '';
  }

  state.selected = null;
  state.legalMoves = [];
  render();
}

function onSquareClick(row, col) {
  if (state.gameOver || state.pendingPromotion) return;

  const clickedPiece = state.board[row][col];

  if (state.selected) {
    const chosenMove = state.legalMoves.find((m) => m.to.row === row && m.to.col === col);
    if (chosenMove) {
      if (chosenMove.promotion) {
        state.pendingPromotion = chosenMove;
        openPromotionModal(state.currentPlayer, (promotionPiece) => {
          const finalMove = { ...chosenMove, promoteTo: promotionPiece };
          state.pendingPromotion = null;
          closePromotionModal();
          makeMove(finalMove);
        });
      } else {
        makeMove(chosenMove);
      }
      return;
    }
  }

  if (clickedPiece && clickedPiece[0] === state.currentPlayer) {
    state.selected = { row, col };
    state.legalMoves = getLegalMovesForSquare(state.board, row, col, state.currentPlayer, {
      castling: state.castling,
      enPassant: state.enPassant,
    });
  } else {
    state.selected = null;
    state.legalMoves = [];
  }

  render();
}

function openPromotionModal(color, onSelect) {
  promotionChoices.innerHTML = '';
  const options = ['q', 'r', 'b', 'n'];
  for (const p of options) {
    const button = document.createElement('button');
    button.className = 'promotion-btn';
    button.type = 'button';
    button.textContent = PIECE_SYMBOLS[`${color}${p}`];
    button.addEventListener('click', () => onSelect(p));
    promotionChoices.appendChild(button);
  }
  promotionModal.classList.remove('hidden');
}

function closePromotionModal() {
  promotionModal.classList.add('hidden');
}

function renderBoard() {
  boardEl.innerHTML = '';

  const checkKing = isInCheck(state.board, state.currentPlayer) ? findKing(state.board, state.currentPlayer) : null;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      square.setAttribute('role', 'gridcell');
      square.setAttribute('aria-label', squareToAlgebraic(r, c));

      const piece = state.board[r][c];
      if (piece) {
        square.textContent = PIECE_SYMBOLS[piece];
      }

      if (state.selected && state.selected.row === r && state.selected.col === c) {
        square.classList.add('selected');
      }

      const matchingMove = state.legalMoves.find((m) => m.to.row === r && m.to.col === c);
      if (matchingMove) {
        square.classList.add(matchingMove.capture ? 'capture' : 'legal');
      }

      if (checkKing && checkKing.row === r && checkKing.col === c) {
        square.classList.add('in-check');
      }

      square.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(square);
    }
  }
}

function renderHistory() {
  historyEl.innerHTML = '';
  for (let i = 0; i < state.history.length; i += 2) {
    const turn = document.createElement('li');
    turn.className = 'history-item';

    const turnNum = document.createElement('span');
    turnNum.textContent = `${Math.floor(i / 2) + 1}.`;

    const moves = document.createElement('span');
    moves.className = 'move-pair';
    const white = state.history[i]?.notation || '';
    const black = state.history[i + 1]?.notation || '';
    moves.textContent = `${white} ${black}`.trim();

    turn.append(turnNum, moves);
    historyEl.appendChild(turn);
  }
}

function renderStatus() {
  const inCheck = isInCheck(state.board, state.currentPlayer);
  const turnText = state.currentPlayer === 'w' ? 'White' : 'Black';

  if (state.gameOver) {
    statusEl.textContent = state.result;
    return;
  }

  if (inCheck) {
    statusEl.textContent = `${turnText} to move — Check!`;
  } else {
    statusEl.textContent = `${turnText} to move`;
  }
}

function render() {
  renderBoard();
  renderHistory();
  renderStatus();
}

function resetGame() {
  state.board = createInitialBoard();
  state.currentPlayer = 'w';
  state.selected = null;
  state.legalMoves = [];
  state.history = [];
  state.castling = { w: { king: true, queen: true }, b: { king: true, queen: true } };
  state.enPassant = null;
  state.halfmoveClock = 0;
  state.fullmoveNumber = 1;
  state.gameOver = false;
  state.result = '';
  state.pendingPromotion = null;
  closePromotionModal();
  render();
}

restartBtn.addEventListener('click', resetGame);

resetGame();
