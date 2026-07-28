const board = document.getElementById('board');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const movesDisplay = document.getElementById('moves');
const timerDisplay = document.getElementById('timer');
const themeSelect = document.getElementById('themeSelect');
const playerNameInput = document.getElementById('playerNameInput');
const nameHint = document.getElementById('nameHint');
const rankingList = document.getElementById('rankingList');
const rankingEmpty = document.getElementById('rankingEmpty');
const rankingSubtitle = document.querySelector('.ranking-subtitle');

const SAVED_NAME_KEY = 'memoryPlayerName';

const themes = {
  classic: [
    { type: 'emoji', value: '🍎' },
    { type: 'emoji', value: '🚀' },
    { type: 'emoji', value: '🎧' },
    { type: 'emoji', value: '🌙' },
    { type: 'emoji', value: '🔥' },
    { type: 'emoji', value: '🎲' },
    { type: 'emoji', value: '🐼' },
    { type: 'emoji', value: '⚽' },
  ],
  jesus: Array.from({ length: 18 }, (_, index) => ({ type: 'image', value: `images/jesus/jesus${String(index + 1).padStart(2, '0')}.jpg` })),
  pokemon: Array.from({ length: 18 }, (_, index) => ({ type: 'image', value: `images/pokemon/pokemon${String(index + 1).padStart(2, '0')}.jpg` })),
  flo: Array.from({ length: 18 }, (_, index) => ({ type: 'image', value: `images/flo/flo${String(index + 1).padStart(2, '0')}.jpg` })),
  geschaeft: Array.from({ length: 18 }, (_, index) => ({ type: 'image', value: `images/geschaeft/geschaeft${String(index + 1).padStart(2, '0')}.jpg` })),
  band: Array.from({ length: 18 }, (_, index) => ({ type: 'image', value: `images/band/band${String(index + 1).padStart(2, '0')}.jpg` })),
};

let cards = [];
let flippedCards = [];
let lockBoard = false;
let started = false;
let moves = 0;
let secondsElapsed = 0;
let timerId = null;
let currentPlayerName = '';
let currentRankings = {};
let rankingSavedThisRound = false;

const formatTime = (totalSeconds) => {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const getThemeLabel = (themeKey) => {
  const option = themeSelect.querySelector(`option[value="${themeKey}"]`);
  return option ? option.textContent : themeKey;
};

const sortRanking = (entries) => [...entries].sort((a, b) => {
  if (a.moves !== b.moves) return a.moves - b.moves;
  if (a.seconds !== b.seconds) return a.seconds - b.seconds;
  return (a.createdAt || 0) - (b.createdAt || 0);
});

async function fetchRankings() {
  try {
    const response = await fetch('/api/rankings', { cache: 'no-store' });
    if (!response.ok) throw new Error('ranking fetch failed');
    currentRankings = await response.json();
  } catch {
    currentRankings = {};
  }
  renderRanking();
}

function renderRanking() {
  const selectedTheme = themeSelect.value;
  const selectedThemeLabel = getThemeLabel(selectedTheme);
  const entries = sortRanking(currentRankings[selectedTheme] || []).slice(0, 20);

  rankingSubtitle.textContent = `${selectedThemeLabel} – sortiert nach Zügen, dann Zeit`;
  rankingList.innerHTML = '';

  if (!entries.length) {
    rankingEmpty.hidden = false;
    rankingEmpty.textContent = `Noch keine Einträge für ${selectedThemeLabel}.`;
    rankingList.hidden = true;
    return;
  }

  rankingEmpty.hidden = true;
  rankingList.hidden = false;

  entries.forEach((entry, index) => {
    const item = document.createElement('li');
    const isTop = index === 0;
    const isLast = index === entries.length - 1 && entries.length > 1;
    item.className = `ranking-item ${isTop ? 'ranking-item--top' : ''} ${isLast ? 'ranking-item--last' : ''}`.trim();

    const badgeImage = isTop
      ? '<img class="ranking-badge-image" src="images/ranking/top-hat.jpg" alt="Hut für Platz 1" />'
      : (isLast ? '<img class="ranking-badge-image" src="images/ranking/last-feet.jpg" alt="Füße für letzten Platz" />' : '');

    const badgeLabel = isTop
      ? '<span class="ranking-badge-text">Krone des Grauens 👑</span>'
      : (isLast ? '<span class="ranking-badge-text">Letzter Platz 😅</span>' : '');

    item.innerHTML = `
      <div class="ranking-place">#${index + 1}</div>
      <div class="ranking-main">
        <strong>${entry.name}</strong>
        <span>${entry.themeLabel}</span>
      </div>
      <div class="ranking-stats">
        <span>${entry.moves} Züge</span>
        <span>${formatTime(entry.seconds)}</span>
      </div>
      ${(isTop || isLast) ? `<div class="ranking-badge">${badgeImage}${badgeLabel}</div>` : ''}
    `;
    rankingList.appendChild(item);
  });
}

async function addRankingEntry() {
  if (rankingSavedThisRound) return;
  rankingSavedThisRound = true;

  const payload = {
    name: currentPlayerName || playerNameInput.value.trim().slice(0, 24) || 'Gast',
    theme: themeSelect.value,
    themeLabel: getThemeLabel(themeSelect.value),
    moves,
    seconds: secondsElapsed,
  };

  try {
    const response = await fetch('/api/rankings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'save failed');
    currentRankings = data.rankings || {};
    renderRanking();
  } catch {
    rankingSavedThisRound = false;
    rankingEmpty.hidden = false;
    rankingEmpty.textContent = 'Sieg erkannt, aber Ranking konnte gerade nicht gespeichert werden.';
    rankingList.hidden = true;
  }
}

const updateStatus = () => {
  movesDisplay.textContent = String(moves);
  timerDisplay.textContent = formatTime(secondsElapsed);
};

const updateNameState = () => {
  const cleanName = playerNameInput.value.trim().slice(0, 24);
  const hasName = cleanName.length > 0;
  startButton.disabled = !hasName;
  nameHint.hidden = hasName;
  if (hasName) localStorage.setItem(SAVED_NAME_KEY, cleanName);
};

const startTimer = () => {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    secondsElapsed += 1;
    updateStatus();
  }, 1000);
};

const stopTimer = () => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
};

const shuffle = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const getBoardColumns = () => {
  const selectedTheme = themes[themeSelect.value] || themes.classic;
  return selectedTheme.length >= 10 ? 6 : 4;
};

const createCards = () => {
  const selectedTheme = themes[themeSelect.value] || themes.classic;
  const motifs = [...selectedTheme, ...selectedTheme];
  return shuffle(motifs).map((motif, index) => ({ id: index, motif, flipped: false, matched: false }));
};

const checkWin = () => {
  const allMatched = cards.every((card) => card.matched);
  if (allMatched) {
    stopTimer();
    startButton.textContent = 'Gewonnen 🎉';
    lockBoard = true;
    addRankingEntry();
  }
};

const renderBackFace = (motif) => {
  if (motif.type === 'image') return `<img class="card__image" src="${motif.value}" alt="Memory Motiv" />`;
  return `<span class="card__label">${motif.value}</span>`;
};

const updateCardElement = (button, card) => {
  button.disabled = card.matched;
  button.classList.toggle('card--flipped', card.flipped || card.matched);
  button.classList.toggle('card--matched', card.matched);
  const backFace = button.querySelector('.card__face--back');
  if (backFace) backFace.innerHTML = renderBackFace(card.motif);
};

const sameMotif = (first, second) => first.motif.type === second.motif.type && first.motif.value === second.motif.value;

const handleCardClick = (cardId) => {
  if (lockBoard || !started) return;
  const card = cards.find((entry) => entry.id === cardId);
  if (!card || card.flipped || card.matched) return;

  card.flipped = true;
  const button = board.querySelector(`[data-id="${card.id}"]`);
  updateCardElement(button, card);
  flippedCards.push(card);
  if (flippedCards.length < 2) return;

  moves += 1;
  updateStatus();
  lockBoard = true;
  const [first, second] = flippedCards;

  if (sameMotif(first, second)) {
    first.matched = true;
    second.matched = true;
    first.flipped = false;
    second.flipped = false;
    updateCardElement(board.querySelector(`[data-id="${first.id}"]`), first);
    updateCardElement(board.querySelector(`[data-id="${second.id}"]`), second);
    flippedCards = [];
    lockBoard = false;
    checkWin();
    return;
  }

  setTimeout(() => {
    first.flipped = false;
    second.flipped = false;
    updateCardElement(board.querySelector(`[data-id="${first.id}"]`), first);
    updateCardElement(board.querySelector(`[data-id="${second.id}"]`), second);
    flippedCards = [];
    lockBoard = false;
  }, 900);
};

const renderBoard = () => {
  board.innerHTML = '';
  const columns = getBoardColumns();
  const rows = Math.ceil(cards.length / columns) || 1;
  board.style.setProperty('--cols', String(columns));
  board.style.setProperty('--rows', String(rows));
  board.dataset.cols = String(columns);

  cards.forEach((card) => {
    const button = document.createElement('button');
    button.className = 'card';
    button.type = 'button';
    button.dataset.id = String(card.id);
    button.setAttribute('aria-label', `Karte ${card.id + 1}`);
    button.innerHTML = `
      <div class="card__inner">
        <div class="card__face card__face--front">?</div>
        <div class="card__face card__face--back">${renderBackFace(card.motif)}</div>
      </div>
    `;
    updateCardElement(button, card);
    button.addEventListener('click', () => handleCardClick(card.id));
    board.appendChild(button);
  });
};

const startGame = () => {
  currentPlayerName = playerNameInput.value.trim().slice(0, 24);
  if (!currentPlayerName) {
    updateNameState();
    playerNameInput.focus();
    return;
  }

  rankingSavedThisRound = false;
  cards = createCards();
  flippedCards = [];
  lockBoard = false;
  started = true;
  moves = 0;
  secondsElapsed = 0;
  updateStatus();
  renderBoard();
  board.classList.remove('board--hidden');
  restartButton.disabled = false;
  startButton.textContent = 'Spiel läuft';
  startTimer();
};

const savedName = localStorage.getItem(SAVED_NAME_KEY);
if (savedName) playerNameInput.value = savedName;

updateStatus();
updateNameState();
fetchRankings();
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
themeSelect.addEventListener('change', () => {
  renderRanking();
  if (started) startGame();
});
playerNameInput.addEventListener('input', updateNameState);
