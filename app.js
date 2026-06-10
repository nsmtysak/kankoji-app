/* ═══════════════════════════════════════════
   １級管工事施工管理技士 試験対策アプリ
   ═══════════════════════════════════════════ */

const STORAGE_KEY          = "kankoji_review";
const STORAGE_PROGRESS_KEY = "kankoji_progress";
const STORAGE_LAST_KEY     = "kankoji_last";

// ─── 復習リスト localStorage ──────────────
function loadReview() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveReview(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function addToReview(question) {
  const data = loadReview();
  data[question.id] = question;
  saveReview(data);
}
function removeFromReview(id) {
  const data = loadReview();
  delete data[id];
  saveReview(data);
}
function resetReview() {
  localStorage.removeItem(STORAGE_KEY);
}
function reviewCount() {
  return Object.keys(loadReview()).length;
}

// ─── 進捗 localStorage ────────────────────
function loadAllProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PROGRESS_KEY)) || {}; }
  catch { return {}; }
}
function loadProgress(key) {
  return loadAllProgress()[key] ?? 0;
}
function saveProgress(key, index) {
  const all = loadAllProgress();
  all[key] = index;
  localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(all));
}
function clearProgress(key) {
  const all = loadAllProgress();
  delete all[key];
  localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(all));
}

// ─── 最後に開いたクイズキー ────────────────────
function saveLastKey(key) {
  localStorage.setItem(STORAGE_LAST_KEY, key);
}
function loadLastKey() {
  return localStorage.getItem(STORAGE_LAST_KEY) || null;
}

// キー（例: "r5-b"）→ 表示ラベル（例: "令和5年度 B問題"）
function keyToLabel(key) {
  const parts = key.split("-");
  const prefix = parts[0];
  const section = (parts[1] || "").toUpperCase();
  const year = YEAR_DEFS.find(d => d.prefix === prefix)?.label || prefix;
  return `${year}  ${section}問題`;
}

// ─── 利用可能データセットを走査 ──────────────
function getAvailableKeys() {
  if (!window.QUESTIONS) return [];
  return Object.keys(window.QUESTIONS);
}

// 年度ラベル → キー群
const YEAR_DEFS = [
  { label: "令和7年度", prefix: "r7" },
  { label: "令和6年度", prefix: "r6" },
  { label: "令和5年度", prefix: "r5" },
  { label: "令和4年度", prefix: "r4" },
  { label: "令和3年度", prefix: "r3" },
];

// ─── アプリ状態 ───────────────────────────────
let state = {
  screen: "top",
  currentYear: null,
  currentSection: null,
  currentKey: null,
  questions: [],
  index: 0,
  sessionRight: 0,
  sessionWrong: 0,
  answered: false,
  isReviewMode: false,
};

// ─── DOM ─────────────────────────────────────
const $ = id => document.getElementById(id);

function render() {
  ["screen-top", "screen-section", "screen-quiz", "screen-summary"]
    .forEach(id => $(id).classList.add("hidden"));

  document.body.classList.toggle("quiz-active", state.screen === "quiz");

  switch (state.screen) {
    case "top":      renderTop();     break;
    case "section":  renderSection(); break;
    case "quiz":     renderQuiz();    break;
    case "summary":  renderSummary(); break;
  }
}

// ─── トップ画面 ───────────────────────────────
function renderTop() {
  const el = $("screen-top");
  el.classList.remove("hidden");

  const available = getAvailableKeys();
  const rc = reviewCount();

  const reviewBtn = $("btn-review-mode");
  if (rc > 0) {
    reviewBtn.textContent = `復習問題を解く（${rc}問）`;
    reviewBtn.disabled = false;
  } else {
    reviewBtn.textContent = "復習問題（なし）";
    reviewBtn.disabled = true;
  }

  // 「前回の続き」カード
  const lastKey = loadLastKey();
  const lastProgress = lastKey ? loadProgress(lastKey) : 0;
  const cardLast = $("card-last");
  if (lastKey && lastProgress > 0) {
    $("last-label").textContent = keyToLabel(lastKey) + `  ${lastProgress + 1}問目から`;
    cardLast.classList.remove("hidden");
  } else {
    cardLast.classList.add("hidden");
  }

  const grid = $("year-grid");
  grid.innerHTML = "";
  YEAR_DEFS.forEach(({ label, prefix }) => {
    const hasA = available.includes(prefix + "-a");
    const hasB = available.includes(prefix + "-b");
    const exists = hasA || hasB;

    const btn = document.createElement("button");
    btn.className = "btn-year";
    btn.textContent = label;

    if (!exists) {
      btn.disabled = true;
      btn.title = "データ未収録";
    }

    btn.addEventListener("click", () => {
      state.currentYear = prefix;
      state.screen = "section";
      render();
    });
    grid.appendChild(btn);
  });
  // ※ サンプルボタンは表示しない
}

// ─── 区分選択 ─────────────────────────────────
function renderSection() {
  const el = $("screen-section");
  el.classList.remove("hidden");

  const available = getAvailableKeys();
  const yearLabel = YEAR_DEFS.find(d => d.prefix === state.currentYear)?.label
    || state.currentYear;

  $("section-year-label").textContent = yearLabel;

  const btnA = $("btn-section-a");
  const btnB = $("btn-section-b");
  btnA.disabled = !available.includes(state.currentYear + "-a");
  btnB.disabled = !available.includes(state.currentYear + "-b");
}

// ─── クイズ開始 ───────────────────────────────
function startQuiz(key) {
  let questions;
  if (key === "__review__") {
    questions = Object.values(loadReview());
    state.isReviewMode = true;
  } else {
    questions = (window.QUESTIONS || {})[key] || [];
    state.isReviewMode = false;
  }

  if (questions.length === 0) {
    alert("問題データが見つかりません。");
    return;
  }

  // 復習モード以外は「最後に開いたキー」として保存
  if (key !== "__review__") saveLastKey(key);

  // ─── 中断・再開チェック ───
  const savedIndex = loadProgress(key);
  let startIndex = 0;

  if (savedIndex > 0 && savedIndex < questions.length) {
    const resume = confirm(
      `前回は ${savedIndex + 1} 問目まで進んでいます。\n` +
      `続きから再開しますか？\n\n` +
      `OK → ${savedIndex + 1} 問目から再開\n` +
      `キャンセル → 最初から始める`
    );
    if (resume) {
      startIndex = savedIndex;
    } else {
      clearProgress(key);
    }
  } else if (savedIndex >= questions.length) {
    // 前回完了済み → 進捗をクリアして最初から
    clearProgress(key);
  }

  state.questions  = questions;
  state.index      = startIndex;
  state.currentKey = key;
  state.sessionRight = 0;
  state.sessionWrong = 0;
  state.answered   = false;
  state.screen     = "quiz";
  render();
}

// ─── クイズ画面 ───────────────────────────────
function renderQuiz() {
  const el = $("screen-quiz");
  el.classList.remove("hidden");

  const q     = state.questions[state.index];
  const total = state.questions.length;
  const current = state.index + 1;

  $("quiz-progress-text").textContent = `${current} / ${total}`;
  $("quiz-progress-bar").style.width  = `${(current / total) * 100}%`;

  const modeLabel = state.isReviewMode ? "復習モード" : `${q.year} ${q.section}問題`;
  $("quiz-meta-label").textContent = modeLabel;

  $("quiz-question").textContent = q.question;

  // IDから問番号・枝番号を抽出して表示（例: "r5-a-14-3" → "No.14 (3)"）
  const idParts = (q.id || "").split("-");
  const qNum  = idParts[2];
  const qSub  = idParts[3];
  const qLabel = qNum
    ? (qSub ? `No.${qNum}（${qSub}）` : `No.${qNum}`)
    : "";
  $("quiz-qnum").textContent = qLabel;

  const oxArea     = $("quiz-ox");
  const choiceArea = $("quiz-choice");
  const resultArea = $("quiz-result");

  resultArea.classList.add("hidden");

  const skipChoice = $("btn-skip-choice");
  if (q.type === "ox") {
    oxArea.classList.remove("hidden");
    choiceArea.classList.add("hidden");
    skipChoice.classList.add("hidden");
    resetOxButtons();
  } else {
    oxArea.classList.add("hidden");
    choiceArea.classList.remove("hidden");
    skipChoice.classList.remove("hidden");
    skipChoice.disabled = false;
    skipChoice.className = "btn-skip-choice";
    renderChoices(q);
  }

  state.answered = false;

  // 前後ナビボタンの状態更新
  $("btn-prev").disabled = (state.index === 0);
  $("btn-next").disabled = false;
}

function resetOxButtons() {
  ["btn-maru", "btn-batsu"].forEach(id => {
    const b = $(id);
    b.disabled = false;
    b.className = "btn-ox";
  });
  const skip = $("btn-skip-ox");
  skip.disabled = false;
  skip.className = "btn-ox btn-skip";
}

function renderChoices(q) {
  const area = $("quiz-choice");
  area.innerHTML = "";
  (q.choices || []).forEach((text, i) => {
    const btn = document.createElement("button");
    btn.className = "btn-choice";
    btn.textContent = `${i + 1}. ${text}`;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      state.answered ? goNext() : onChoiceAnswer(i);
    });
    area.appendChild(btn);
  });
}

// ─── 解答処理 ─────────────────────────────────
function onOxAnswer(userAnswer) {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.index];
  const correct = (q.answer === userAnswer);
  handleResult(correct, q, userAnswer);

  $("btn-skip-ox").disabled = true;
  if (userAnswer === true) {
    $("btn-maru").classList.add(correct ? "btn-correct" : "btn-wrong");
    if (!correct) $("btn-batsu").classList.add("btn-correct");
  } else {
    $("btn-batsu").classList.add(correct ? "btn-correct" : "btn-wrong");
    if (!correct) $("btn-maru").classList.add("btn-correct");
  }
}

function onSkipAnswer() {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.index];
  handleResult(false, q, null);

  if (q.type === "ox") {
    // 正解ボタンを緑で示す
    if (q.answer === true) $("btn-maru").classList.add("btn-correct");
    else $("btn-batsu").classList.add("btn-correct");
  } else {
    const btns = $("quiz-choice").querySelectorAll("button");
    btns.forEach((btn, i) => {
      if (i === q.answer) btn.classList.add("btn-correct");
    });
  }
}

function onChoiceAnswer(userIndex) {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.index];
  const correct = (q.answer === userIndex);
  handleResult(correct, q, userIndex);

  $("btn-skip-choice").disabled = true;
  const btns = $("quiz-choice").querySelectorAll("button");
  btns.forEach((btn, i) => {
    if (i === q.answer) btn.classList.add("btn-correct");
    else if (i === userIndex && !correct) btn.classList.add("btn-wrong");
  });
}

function handleResult(correct, q, _userAnswer) {
  if (correct) {
    state.sessionRight++;
    removeFromReview(q.id);
  } else {
    state.sessionWrong++;
    addToReview(q);
  }

  const resultArea = $("quiz-result");
  resultArea.classList.remove("hidden");

  const label = $("result-label");
  label.className = "result-label " + (correct ? "result-correct" : "result-wrong");
  label.textContent = correct ? "正解！" : "不正解";

  $("explanation-text").textContent = q.explanation || "解説はありません。";
}

// ─── 次の問題 / 終了 ──────────────────────────
function goNext() {
  state.index++;
  if (state.index >= state.questions.length) {
    clearProgress(state.currentKey);
    state.screen = "summary";
  } else {
    saveProgress(state.currentKey, state.index);
    state.answered = false;
  }
  render();
}

// ─── ナビボタン「次へ」（未解答でも記録せず進む）──
function goNextNav() {
  state.index++;
  if (state.index >= state.questions.length) {
    clearProgress(state.currentKey);
    state.screen = "summary";
  } else {
    saveProgress(state.currentKey, state.index);
    state.answered = false;
  }
  render();
}

// ─── ナビボタン「前へ」（解答状態をリセットして戻る）──
function goPrev() {
  if (state.index <= 0) return;
  state.index--;
  saveProgress(state.currentKey, state.index);
  state.answered = false;
  render();
}

// ─── サマリー ─────────────────────────────────
function renderSummary() {
  const el = $("screen-summary");
  el.classList.remove("hidden");

  const total = state.questions.length;
  const right = state.sessionRight;
  const wrong = state.sessionWrong;
  const pct   = total > 0 ? Math.round((right / total) * 100) : 0;

  $("sum-total").textContent = total;
  $("sum-right").textContent = right;
  $("sum-wrong").textContent = wrong;
  $("sum-pct").textContent   = pct + "%";
  $("sum-review-count").textContent = reviewCount();
}

// ─── イベント設定 ─────────────────────────────
function setupEvents() {
  // 前回の続き
  $("btn-last-resume").addEventListener("click", () => {
    const key = loadLastKey();
    if (key) startQuiz(key);
  });

  // 復習モードへ
  $("btn-review-mode").addEventListener("click", () => {
    startQuiz("__review__");
  });

  // 復習リストリセット
  $("btn-reset-review").addEventListener("click", () => {
    if (confirm("復習リストをリセットしますか？この操作は元に戻せません。")) {
      resetReview();
      render();
    }
  });

  // 区分選択 → 戻る
  $("btn-back-to-top").addEventListener("click", () => {
    state.screen = "top";
    render();
  });

  // A問題
  $("btn-section-a").addEventListener("click", () => {
    startQuiz(state.currentYear + "-a");
  });

  // B問題
  $("btn-section-b").addEventListener("click", () => {
    startQuiz(state.currentYear + "-b");
  });

  // クイズ → 中断ボタン（伝播を止めてカード全体タップを誤発動させない）
  $("btn-quiz-back").addEventListener("click", e => {
    e.stopPropagation();
    if (confirm("問題を中断してトップに戻りますか？")) {
      // 中断時は現在の index を進捗として保存
      if (state.currentKey) saveProgress(state.currentKey, state.index);
      state.screen = "top";
      render();
    }
  });

  // 〇/× ボタン（解答後は次の問題へ進む）
  $("btn-maru").addEventListener("click",  e => { e.stopPropagation(); state.answered ? goNext() : onOxAnswer(true);  });
  $("btn-batsu").addEventListener("click", e => { e.stopPropagation(); state.answered ? goNext() : onOxAnswer(false); });
  $("btn-skip-ox").addEventListener("click",     e => { e.stopPropagation(); state.answered ? goNext() : onSkipAnswer(); });
  $("btn-skip-choice").addEventListener("click", e => { e.stopPropagation(); state.answered ? goNext() : onSkipAnswer(); });

  // ── カード全体タップで次へ（解答後のみ有効）──
  $("screen-quiz").addEventListener("click", () => {
    if (state.answered && state.screen === "quiz") {
      goNext();
    }
  });

  // 問題番号タップで指定問題へジャンプ（プルダウン選択）
  $("quiz-progress-text").addEventListener("click", e => {
    e.stopPropagation();
    const total = state.questions.length;
    const sel = $("jump-select");
    sel.innerHTML = "";
    for (let i = 1; i <= total; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${i} 問目`;
      if (i === state.index + 1) opt.selected = true;
      sel.appendChild(opt);
    }
    $("jump-modal").classList.remove("hidden");
  });

  $("btn-jump-ok").addEventListener("click", () => {
    const num = parseInt($("jump-select").value, 10);
    $("jump-modal").classList.add("hidden");
    state.index = num - 1;
    state.answered = false;
    saveProgress(state.currentKey, state.index);
    render();
  });

  $("btn-jump-cancel").addEventListener("click", () => {
    $("jump-modal").classList.add("hidden");
  });

  $("jump-overlay").addEventListener("click", () => {
    $("jump-modal").classList.add("hidden");
  });

  // 前後ナビボタン（伝播を止めてカード全体タップの二重発動を防ぐ）
  $("btn-prev").addEventListener("click", e => {
    e.stopPropagation();
    goPrev();
  });
  $("btn-next").addEventListener("click", e => {
    e.stopPropagation();
    goNextNav();
  });

  // サマリー → トップ
  $("btn-sum-top").addEventListener("click", () => {
    state.screen = "top";
    render();
  });

  // サマリー → 復習
  $("btn-sum-review").addEventListener("click", () => {
    startQuiz("__review__");
  });
}

// ─── タブ/ウィンドウを閉じる際の自動保存 ────────
function autoSaveProgress() {
  if (state.screen === "quiz" && state.currentKey) {
    saveProgress(state.currentKey, state.index);
  }
}
window.addEventListener("beforeunload", autoSaveProgress);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") autoSaveProgress();
});

// ─── 起動 ────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  render();
});
