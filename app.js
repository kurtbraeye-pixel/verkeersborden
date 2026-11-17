(() => {
  'use strict';

  const DATA = window.BORDEN;
  const SIGNS = DATA.signs;
  const BY_ID = new Map(SIGNS.map(s => [s.id, s]));
  const THEMES = DATA.themes;
  const THEME_NAME = Object.fromEntries(THEMES.map(t => [t.id, t.name]));
  const THEME_ICON = { A: 'A1a', B: 'B1', C: 'C3', D: 'D1a', E: 'E1', F: 'F19', G: 'GXa', M: 'M1', T: 'Type_Ic', Z: 'ZC43' };
  const PER_THEME = 20;
  const ALL_MIX = 30;
  const PASS = 0.82; // examennorm theorie-examen (41/50)
  const KEYS = ['A', 'B', 'C', 'D'];

  const app = document.getElementById('app');
  let session = null;
  let keyHandler = null;

  // ---------- voorlezen ----------
  // 1) Vooraf gemaakte MP3's (audio/manifest.js, via tools/maak-audio.py) als die er zijn,
  // 2) anders de ingebouwde stem van de browser (Web Speech API), als die bestaat.
  const PHRASES = {
    vraag_bord: 'Wat betekent dit verkeersbord?',
    vraag_betekenis: 'Welk verkeersbord hoort bij deze betekenis?',
    letter_A: 'Antwoord A.', letter_B: 'Antwoord B.', letter_C: 'Antwoord C.', letter_D: 'Antwoord D.',
    fout: 'Niet juist.',
    juist_antwoord: 'Het juiste antwoord is:',
  };
  const P = (name, pause) => ({ key: 'p:' + name, text: PHRASES[name], pause });
  const T = (title, pause) => ({ key: 't:' + title, text: cap(title), pause });

  const Speech = (() => {
    const synth = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;
    const files = (window.AUDIO && window.AUDIO.files) || {};
    const hasFiles = Object.keys(files).length > 0;
    const player = hasFiles ? new Audio() : null;
    let voice = null;
    let enabled = true;
    try { enabled = localStorage.getItem('voorlezen') !== 'uit'; } catch (e) { /* geen opslag */ }

    const RATE = 0.8;               // spreeksnelheid browserstem (1 = normaal)
    const PAUSE_AFTER_FIRST = 1000; // pauze na de vraag (ms)
    const PAUSE_BETWEEN = 600;      // pauze tussen de antwoorden (ms)

    function pickVoice() {
      if (!synth) return;
      const voices = synth.getVoices();
      const by = pref => voices.find(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(pref));
      voice = by('nl-be') || by('nl-nl') || by('nl') || null;
    }
    if (synth) {
      pickVoice();
      if ('onvoiceschanged' in synth) synth.addEventListener('voiceschanged', pickVoice);
    }
    const supported = !!synth || hasFiles;

    const btn = document.getElementById('speakToggle');
    function drawBtn() {
      btn.setAttribute('aria-pressed', String(enabled));
      btn.querySelector('.speak-icon').textContent = enabled ? '🔊' : '🔇';
      btn.querySelector('.speak-label').textContent = enabled ? 'Voorlezen aan' : 'Voorlezen uit';
      btn.title = enabled ? 'Voorlezen uitzetten' : 'Voorlezen aanzetten';
    }
    if (supported) {
      btn.hidden = false;
      drawBtn();
      btn.addEventListener('click', () => {
        enabled = !enabled;
        try { localStorage.setItem('voorlezen', enabled ? 'aan' : 'uit'); } catch (e) { /* geen opslag */ }
        drawBtn();
        if (!enabled) stop(); else if (lastItems) say(lastItems);
      });
    }

    let lastItems = null;
    let runId = 0;
    let timer = null;
    function stop() {
      runId++;
      clearTimeout(timer);
      if (synth) synth.cancel();
      if (player) { player.onended = player.onerror = null; player.pause(); }
    }

    function speakTTS(item, done) {
      if (!synth) return done();
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = voice ? voice.lang : 'nl-BE';
      if (voice) u.voice = voice;
      u.rate = RATE;
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    }
    function playFile(item, done, fallback) {
      player.onended = done;
      player.onerror = fallback;
      player.src = files[item.key];
      const p = player.play();
      if (p && p.catch) p.catch(fallback);
    }

    // Items één voor één uitspreken, met een pauze ertussen.
    function say(items) {
      lastItems = items;
      if (!supported || !enabled) return;
      stop();
      const id = runId;
      const list = items.filter(it => it && it.text);
      let i = 0;
      const next = () => {
        if (id !== runId || i >= list.length) return;
        const item = list[i++];
        let finished = false;
        const done = () => {
          if (finished || id !== runId) return;
          finished = true;
          const pause = item.pause != null ? item.pause : (i === 1 ? PAUSE_AFTER_FIRST : PAUSE_BETWEEN);
          timer = setTimeout(next, pause);
        };
        if (player && files[item.key]) {
          playFile(item, done, () => { if (!finished && id === runId) speakTTS(item, done); });
        } else {
          speakTTS(item, done);
        }
      };
      // kleine vertraging zodat cancel() in elke browser eerst afgerond is
      timer = setTimeout(next, 150);
    }
    return { say, stop, supported, repeat: () => lastItems && say(lastItems), clear: () => { lastItems = null; stop(); } };
  })();

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => s.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const img = (s, alt = '') => `<img src="${esc(s.img)}" alt="${esc(alt)}" loading="lazy">`;

  function setKeys(fn) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = fn;
    if (fn) document.addEventListener('keydown', fn);
  }

  function render(html) {
    Speech.clear();
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  // ---------- home ----------
  function showHome() {
    session = null;
    setKeys(null);
    render(`
      <h1>Wat wil je oefenen?</h1>
      <p class="lead">Kies alle borden door elkaar, of oefen één thema. Een fout beantwoord bord komt later in de reeks terug, tot je het juist hebt.</p>

      <section class="panel mix">
        <div>
          <h2>Alle borden door elkaar</h2>
          <p>${ALL_MIX} willekeurige borden uit alle thema's.</p>
        </div>
        <button class="btn" type="button" data-start="ALL">Start</button>
      </section>

      <h2>Per thema · ${PER_THEME} borden</h2>
      <div class="themes">
        ${THEMES.map(t => `
          <button class="theme" type="button" data-start="${t.id}">
            ${img(BY_ID.get(THEME_ICON[t.id]))}
            <div><strong>${esc(t.name)}</strong><span>${t.count < PER_THEME ? `alle ${t.count} borden` : `${PER_THEME} van ${t.count} borden`}</span></div>
          </button>`).join('')}
      </div>

      <div class="home-foot">
        <button class="btn secondary" type="button" id="browseBtn">Alle borden bekijken</button>
      </div>`);
    app.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => startQuiz(b.dataset.start)));
    document.getElementById('browseBtn').addEventListener('click', () => showBrowse('A'));
  }

  // ---------- quiz ----------
  function startQuiz(themeId) {
    const pool = themeId === 'ALL' ? SIGNS : SIGNS.filter(s => s.theme === themeId);
    const n = themeId === 'ALL' ? ALL_MIX : PER_THEME;
    const ids = shuffle(pool).slice(0, Math.min(n, pool.length)).map(s => s.id);
    session = {
      themeId,
      label: themeId === 'ALL' ? 'Alle borden door elkaar' : THEME_NAME[themeId],
      ids,
      queue: ids.slice(),
      mastered: 0,
      wrong: new Map(), // id -> aantal keer fout
      asked: 0,
      current: null,
    };
    nextQuestion();
  }

  function pickDistractors(sign) {
    const title = norm(sign.title);
    const used = new Set([title]);
    const out = [];
    const tryFrom = list => {
      for (const s of shuffle(list)) {
        if (out.length === 3) return;
        const t = norm(s.title);
        if (s.id === sign.id || used.has(t)) continue;
        used.add(t);
        out.push(s);
      }
    };
    tryFrom(SIGNS.filter(s => s.theme === sign.theme));
    if (out.length < 3) tryFrom(SIGNS);
    return out;
  }

  function nextQuestion() {
    if (!session.queue.length) return showResults();
    const sign = BY_ID.get(session.queue[0]);
    const mode = Math.random() < 0.5 ? 'img2text' : 'text2img';
    const options = shuffle([sign, ...pickDistractors(sign)]);
    session.current = { sign, mode, options, answered: false };
    session.asked++;
    renderQuestion();
  }

  function renderQuestion() {
    const { sign, mode, options } = session.current;
    const total = session.ids.length;
    const errors = session.wrong.size;
    const pct = Math.round((session.mastered / total) * 100);
    const remaining = session.queue.length;

    const prompt = mode === 'img2text'
      ? `<p class="q-label">Wat betekent dit verkeersbord?</p>
         <div class="q-sign">${img(sign, 'Verkeersbord')}</div>`
      : `<p class="q-label">Welk verkeersbord hoort bij deze betekenis?</p>
         <p class="q-text">${esc(cap(sign.title))}</p>`;

    const choices = options.map((o, i) => mode === 'img2text'
      ? `<button class="choice" type="button" data-i="${i}"><span class="key">${KEYS[i]}</span><span>${esc(cap(o.title))}</span></button>`
      : `<button class="choice" type="button" data-i="${i}" aria-label="Antwoord ${KEYS[i]}"><span class="key">${KEYS[i]}</span>${img(o, 'Antwoord ' + KEYS[i])}</button>`
    ).join('');

    render(`
      <div class="quizbar">
        <span><strong>${esc(session.label)}</strong> · nog ${remaining} te gaan</span>
        <span class="stats"><span class="ok">✓ ${session.mastered}</span><span class="bad">✗ ${errors}</span><span>${session.mastered}/${total}</span></span>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${session.mastered}"><div style="width:${pct}%"></div></div>
      <section class="panel question">
        ${prompt}
        <div class="choices ${mode === 'text2img' ? 'images' : ''}">${choices}</div>
        <div id="feedback"></div>
      </section>
      <div class="quiz-foot">
        <button class="btn link" type="button" id="stopBtn">Stoppen</button>
        <span class="quiz-tools">
          ${Speech.supported ? '<button class="btn link" type="button" id="repeatBtn" title="Opnieuw voorlezen (R)">🔊 Herhaal</button>' : ''}
          <span class="hint">Toetsen: A–D of 1–4${Speech.supported ? ', R = herhaal' : ''}</span>
        </span>
      </div>`);

    const repeatBtn = document.getElementById('repeatBtn');
    if (repeatBtn) repeatBtn.addEventListener('click', () => Speech.repeat());
    Speech.say(mode === 'img2text'
      ? [P('vraag_bord'), ...options.flatMap((o, i) => [P('letter_' + KEYS[i], 300), T(o.title)])]
      : [P('vraag_betekenis'), T(sign.title)]);

    app.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => answer(+b.dataset.i)));
    document.getElementById('stopBtn').addEventListener('click', () => {
      if (confirm('Wil je stoppen? Je voortgang in deze reeks gaat verloren.')) showHome();
    });
    setKeys(e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (k === 'R') { e.preventDefault(); Speech.repeat(); return; }
      let i = KEYS.indexOf(k);
      if (i < 0 && /^[1-4]$/.test(k)) i = +k - 1;
      if (i >= 0 && i < options.length && !session.current.answered) { e.preventDefault(); answer(i); }
    });
  }

  function answer(i) {
    const cur = session.current;
    if (cur.answered) return;
    cur.answered = true;
    const chosen = cur.options[i];
    const correct = chosen.id === cur.sign.id;
    const buttons = [...app.querySelectorAll('.choice')];
    buttons.forEach((b, j) => {
      b.disabled = true;
      if (cur.options[j].id === cur.sign.id) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
      else b.classList.add('dim');
    });

    if (correct) {
      Speech.stop();
      session.queue.shift();
      session.mastered++;
      setKeys(null);
      setTimeout(nextQuestion, 650);
      return;
    }

    // fout: bord komt later in deze sessie terug
    session.wrong.set(cur.sign.id, (session.wrong.get(cur.sign.id) || 0) + 1);
    const id = session.queue.shift();
    const pos = Math.min(session.queue.length, 3 + Math.floor(Math.random() * 3));
    session.queue.splice(pos, 0, id);
    const bad = app.querySelector('.stats .bad');
    if (bad) bad.textContent = '✗ ' + session.wrong.size;
    showFeedback(chosen);
  }

  function showFeedback(chosen) {
    const { sign, mode } = session.current;
    const info = sign.info.length ? `<p class="fb-info">${sign.info.map(esc).join('<br>')}</p>` : '';
    const yours = mode === 'img2text'
      ? `<div class="fb-row">${img(chosen, 'Bord ' + chosen.code)}
           <div><p class="fb-tag bad">Jouw antwoord</p>
           <p>“${esc(cap(chosen.title))}”</p>
           <p class="fb-info">Die betekenis hoort bij bord ${esc(chosen.code)} (links). Merk het verschil op met het bord in de vraag.</p></div></div>`
      : `<div class="fb-row">${img(chosen, 'Bord ' + chosen.code)}
           <div><p class="fb-tag bad">Het bord dat je koos (${esc(chosen.code)})</p>
           <p>betekent: “${esc(cap(chosen.title))}”</p></div></div>`;
    const right = `<div class="fb-row">${img(sign, 'Bord ' + sign.code)}
           <div><p class="fb-tag ok">Juist antwoord · ${esc(sign.code)}</p>
           <p><strong>${esc(cap(sign.title))}</strong></p>${info}</div></div>`;

    document.getElementById('feedback').innerHTML = `
      <div class="feedback" role="alert">
        <h3>Niet juist</h3>
        ${yours}
        ${right}
        <div class="fb-actions">
          <span class="hint">Dit bord komt straks nog eens terug.</span>
          <button class="btn" type="button" id="nextBtn">Verder</button>
        </div>
      </div>`;
    const next = document.getElementById('nextBtn');
    next.addEventListener('click', nextQuestion);
    next.focus({ preventScroll: true });
    document.getElementById('feedback').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    Speech.say([P('fout', 400), P('juist_antwoord', 200), T(sign.title)]);
    setKeys(e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextQuestion(); }
      else if (e.key.toUpperCase() === 'R' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); Speech.repeat(); }
    });
  }

  // ---------- results ----------
  function showResults() {
    setKeys(null);
    const total = session.ids.length;
    const firstTry = total - session.wrong.size;
    const ratio = firstTry / total;
    const passed = ratio >= PASS;
    const mistakes = session.ids.filter(id => session.wrong.has(id)).map(id => BY_ID.get(id))
      .sort((a, b) => session.wrong.get(b.id) - session.wrong.get(a.id));
    const themeId = session.themeId;
    const wrongIds = mistakes.map(s => s.id);

    render(`
      <section class="panel result-head">
        <h1>Reeks afgerond</h1>
        <p class="lead" style="margin:0">${esc(session.label)}</p>
        <div class="score">${firstTry} / ${total}</div>
        <p>in één keer juist (${Math.round(ratio * 100)}%)</p>
        <p class="verdict ${passed ? 'ok' : 'bad'}">${passed ? 'Boven de examennorm van 82%' : 'Onder de examennorm van 82%'}</p>
        <div class="result-actions">
          <button class="btn" type="button" id="againBtn">Nieuwe reeks</button>
          ${wrongIds.length ? `<button class="btn secondary" type="button" id="retryBtn">Enkel mijn fouten (${wrongIds.length})</button>` : ''}
          <button class="btn secondary" type="button" id="homeBtn2">Startscherm</button>
        </div>
      </section>
      ${mistakes.length ? `
        <section class="panel mistakes">
          <h2>Fout beantwoord</h2>
          ${mistakes.map(s => `
            <div class="mistake">${img(s, 'Bord ' + s.code)}
              <div><p class="code">${esc(s.code)}<span class="badge">${session.wrong.get(s.id)}× fout</span></p>
              <p>${esc(cap(s.title))}</p></div>
            </div>`).join('')}
        </section>` : `<section class="panel result-head"><p style="margin:0">Geen enkele fout. Knap!</p></section>`}`);

    document.getElementById('againBtn').addEventListener('click', () => startQuiz(themeId));
    document.getElementById('homeBtn2').addEventListener('click', showHome);
    const retry = document.getElementById('retryBtn');
    if (retry) retry.addEventListener('click', () => {
      const label = session.label;
      session = { themeId, label: label + ' · fouten', ids: shuffle(wrongIds), queue: [], mastered: 0, wrong: new Map(), asked: 0, current: null };
      session.queue = session.ids.slice();
      nextQuestion();
    });
  }

  // ---------- browse ----------
  function showBrowse(themeId, query = '') {
    setKeys(null);
    render(`
      <h1>Alle borden</h1>
      <p class="lead">Bekijk per thema alle borden met hun betekenis.</p>
      <div class="browse-tools">
        <div class="tabs" role="group" aria-label="Thema">
          ${THEMES.map(t => `<button class="tab" type="button" data-theme="${t.id}" aria-pressed="${t.id === themeId}">${esc(t.name)}</button>`).join('')}
        </div>
      </div>
      <div class="browse-tools">
        <input class="search" type="search" id="search" placeholder="Zoek op code of betekenis, bv. C43 of fiets" value="${esc(query)}" aria-label="Zoeken">
        <button class="btn secondary" type="button" id="practiceBtn">Dit thema oefenen</button>
      </div>
      <div class="grid" id="grid"></div>`);

    const grid = document.getElementById('grid');
    const search = document.getElementById('search');
    const draw = () => {
      const q = norm(search.value);
      const list = q
        ? SIGNS.filter(s => norm(s.code + ' ' + s.title + ' ' + s.info.join(' ')).includes(q))
        : SIGNS.filter(s => s.theme === themeId);
      grid.innerHTML = list.length ? list.map(s => `
        <article class="card">
          <div class="img">${img(s, 'Bord ' + s.code)}</div>
          <span class="code">${esc(s.code)}${q ? ' · ' + esc(THEME_NAME[s.theme]) : ''}</span>
          <p>${esc(cap(s.title))}</p>
          ${s.info.length ? `<details><summary>Meer uitleg</summary>${s.info.map(esc).join('<br>')}</details>` : ''}
        </article>`).join('') : '<p class="empty">Geen borden gevonden.</p>';
    };
    draw();
    search.addEventListener('input', draw);
    app.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => showBrowse(b.dataset.theme)));
    document.getElementById('practiceBtn').addEventListener('click', () => startQuiz(themeId));
  }

  document.getElementById('homeBtn').addEventListener('click', () => {
    if (session && session.queue.length && !confirm('Wil je stoppen? Je voortgang in deze reeks gaat verloren.')) return;
    showHome();
  });

  showHome();
})();
