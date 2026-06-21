/* Firebase config is initialized by config.js. Firebase Auth and Firestore
 * are exposed through the small sb adapter for the game code.
 */
const MQ_CONFIG         = window.MATHQUEST_CONFIG || {};
const BACKEND_CONFIGURED = window.MQ_BACKEND_CONFIGURED === true;
const sb = window.sb;
/** @constant {Object} ROLES - Role name constants */
const ROLES = { TEACHER: 'teacher', STUDENT: 'student' };
const TOTAL_PHASES = 201;
const TOTAL_STARS = TOTAL_PHASES * 3;


/* â”€â”€â”€ Estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const state = {
    userId:        null,
    nickname:      '',
    xp:            0,
    stars:         {},          // { '1': 3, '2': 2, ... }
    achievements:  [],
    currentPhase:  null,
    questions:     [],
    qIndex:        0,
    hearts:        3,
    correct:       0,
    answered:      false,
    earnedXp:      0,
    muted:         localStorage.getItem('mq_muted') === '1',
    classCode:     localStorage.getItem('mq_class_code') || '',
    streak:        0,
    lastPlayDate:  '',
    trainingMode:  false,
    wrongCount:    0,
    failStreak:    {},
    teacherUnlocks: [],
    avatar:        'ðŸŽ“',
};

/* â”€â”€â”€ UtilitÃ¡rios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rand    = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick    = arr   => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr   => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep   = ms    => new Promise(r => setTimeout(r, ms));

/* â”€â”€â”€ Toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let toastTimer;

/**
 * Centralizes error handling across the app.
 * @param {Error|Object} err - Error from Firebase adapter or JS.
 * @param {string} [context=''] - Context label.
 */
function handleError(err, context = '') {
  const msg = err?.message || String(err) || 'Erro inesperado';
  console.error('[handleError]', context, err);
  toast(msg, 'error');
}

/**
 * Returns true if every value is a non-empty string after trimming.
 * @param {...string} values
 * @returns {boolean}
 */
function validateRequired(...values) {
  return values.every(v => typeof v === 'string' && v.trim().length > 0);
}

function toast(msg, type = 'info') {
    const el = $('toast');
    el.textContent = msg;
    el.className   = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* â”€â”€â”€ Som (Web Audio simples â€” sem assets) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const audioCtx = (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } })();
function beep(freq = 440, duration = 0.15, type = 'sine', vol = 0.12) {
    if (state.muted || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    o.stop(audioCtx.currentTime + duration + 0.02);
}
const sndCorrect = () => {
    beep(523, 0.06, 'sine', .1);
    setTimeout(() => beep(659, 0.06, 'sine', .1), 60);
    setTimeout(() => beep(784, 0.12, 'sine', .12), 120);
};
const sndWrong = () => {
    beep(220, 0.1, 'square', .08);
    setTimeout(() => beep(180, 0.18, 'square', .06), 90);
};
const sndStar = () => {
    [523,659,784,1046,1318].forEach((f,i) => setTimeout(() => beep(f, 0.15, 'triangle', .1), i*80));
};
const sndUnlock = () => {
    [392,494,587,659,784].forEach((f,i) => setTimeout(() => beep(f, 0.12, 'sine', .09), i*90));
};
const sndStreak = () => {
    [659,784,1046,784,1046,1318].forEach((f,i) => setTimeout(() => beep(f, 0.1, 'triangle', .08), i*70));
};

/* â”€â”€â”€ RegiÃµes (mapa) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const REGIONS = [
    { id: 1, range: [1, 20], name: 'Vila dos NÃºmeros',      year: '1Âº ano', color: '#7dd3a8', icon: 'ðŸ˜ï¸',  desc: 'Primeiros passos: contar, reconhecer e comparar.' },
    { id: 2, range: [21, 40], name: 'Bosque das OperaÃ§Ãµes',  year: '2Âº ano', color: '#69b8e5', icon: 'ðŸŒ³',  desc: 'Somas, subtraÃ§Ãµes e famÃ­lia dos nÃºmeros.' },
    { id: 3, range: [41, 60], name: 'Vale das Tabuadas',     year: '3Âº ano', color: '#f0c75e', icon: 'ðŸŒ¾',  desc: 'MultiplicaÃ§Ã£o, divisÃ£o e dinheiro.' },
    { id: 4, range: [61, 80], name: 'Caverna das FraÃ§Ãµes',   year: '4Âº ano', color: '#e88c4a', icon: 'ðŸ•³ï¸',  desc: 'PedaÃ§os do todo e medidas.' },
    { id: 5, range: [81, 100], name: 'Lago dos Decimais',     year: '5Âº ano', color: '#5fc8c8', icon: 'ðŸžï¸',  desc: 'VÃ­rgulas, porcentagens e Ã¡reas.' },
    { id: 6, range: [101, 120], name: 'Montanha dos Inteiros', year: '6Âº ano', color: '#a78bdc', icon: 'â›°ï¸',  desc: 'Negativos, MMC e primeiras equaÃ§Ãµes.' },
    { id: 7, range: [121, 140], name: 'Deserto das EquaÃ§Ãµes',  year: '7Âº ano', color: '#c89669', icon: 'ðŸœï¸',  desc: 'X dos dois lados, razÃ£o e proporÃ§Ã£o.' },
    { id: 8, range: [141, 160], name: 'Templo das PotÃªncias',  year: '8Âº ano', color: '#e26d6d', icon: 'ðŸ›ï¸',  desc: 'PotÃªncias, raÃ­zes e Ã¡lgebra.' },
    { id: 9, range: [161, 181], name: 'Cidadela do Mestre',    year: '9Âº ano', color: '#f0c419', icon: 'ðŸ°',  desc: 'FunÃ§Ãµes, Bhaskara e PitÃ¡goras.' },
    { id: 10, range: [182, 201], name: 'Arena do Vestibular',  year: 'ENEM/Vestibular', color: '#ff6b9d', icon: 'ðŸŸï¸',  desc: 'ENEM, FUVEST, UNICAMP: matemÃ¡tica de alto nÃ­vel.' },
];

/* â”€â”€â”€ Geradores de questÃµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Toda fase declara um gerador. O gerador retorna 5 questÃµes.
 * Question = { stem, options[4], correctIndex, explain? }
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function makeChoice(correct, distractors) {
    const correctStr = String(correct);
    const opts = shuffle([correctStr, ...distractors.map(String)]);
    return { options: opts, correctIndex: opts.indexOf(correctStr) };
}

function nearDistr(correct, spread = 5, n = 3, allowNeg = false) {
    const set = new Set();
    let guard = 0;
    while (set.size < n && guard++ < 50) {
        const v = correct + (rand(-spread, spread) || spread);
        if (v !== correct && (allowNeg || v >= 0)) set.add(v);
    }
    while (set.size < n) set.add(correct + set.size + 1);
    return [...set];
}

const Q = (count, fn) => () => Array.from({ length: count }, fn);

/* â”€â”€ 1Âº ano â€” Vila dos NÃºmeros â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_count = (min, max) => Q(5, () => {
    const n = rand(min, max);
    return { stem: `Quantas bolinhas vocÃª vÃª?<div class="dots">${'<span>â—</span>'.repeat(n)}</div>`,
             ...makeChoice(n, nearDistr(n, 3)),
             explain: `Para contar: conte um a um. O Ãºltimo nÃºmero que vocÃª falar Ã© a resposta!` };
});

const g_zero = () => Q(5, () => {
    const items = [
        { stem: 'Quantos elefantes verdes existem nesta sala?<div class="dots"></div>', ans: 0 },
        { stem: 'Se eu tenho 2 maÃ§Ã£s e como as 2, quantas sobram?', ans: 0 },
        { stem: 'Quantos nÃºmeros vÃªm antes do 1?', ans: 0 },
        { stem: 'Um saco vazio tem quantas bolas?', ans: 0 },
        { stem: 'Quantos meses do ano tÃªm 32 dias?', ans: 0 },
        { stem: 'Quanto Ã© 7 âˆ’ 7?', ans: 0 },
        { stem: 'Quanto Ã© 4 + 0?', ans: 4, d: [0, 1, 5] },
        { stem: 'Quantas patas tem um peixe?', ans: 0 },
        { stem: 'Quanto vale qualquer nÃºmero multiplicado por 0?', ans: 0 },
        { stem: 'Quantos dias da semana comeÃ§am com a letra K?', ans: 0 },
        { stem: 'Quantos cachorros voam pela janela?', ans: 0 },
        { stem: 'Quanto Ã© 10 âˆ’ 10?', ans: 0 },
        { stem: 'Uma caixa fechada e vazia tem quantos brinquedos?', ans: 0 },
        { stem: 'Quanto Ã© 5 Ã— 0?', ans: 0 },
        { stem: 'Quantas bocas tem um sapato?', ans: 0 },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d || [1, 2, 3]),
             explain: 'Zero (0) significa <b>nenhum</b>! Ã‰ o nÃºmero que representa ausÃªncia de quantidade.' };
});

const g_compare = (min, max) => Q(5, () => {
    const a = rand(min, max), b = rand(min, max);
    const sym = a > b ? '>' : a < b ? '<' : '=';
    const opts = ['>', '<', '='];
    return { stem: `Qual sinal completa? &nbsp; <b>${a} â˜ ${b}</b>`,
             options: opts, correctIndex: opts.indexOf(sym),
             explain: 'Dica: o bico do sinal aponta para o <b>menor</b> nÃºmero. <b>></b> maior que, <b>&lt;</b> menor que, <b>=</b> igual.' };
});

const g_pattern = (low, step) => Q(5, () => {
    const s0 = rand(low, low + 10);
    const seq = [s0, s0 + step, s0 + 2 * step, s0 + 3 * step];
    const next = s0 + 4 * step;
    return { stem: `Qual nÃºmero vem a seguir? <b>${seq.join(', ')}, ?</b>`,
             ...makeChoice(next, nearDistr(next, step + 2)),
             explain: `SequÃªncia: descubra quanto soma de um nÃºmero ao prÃ³ximo e aplique para achar o seguinte!` };
});

const g_orderAsc = (min, max) => Q(5, () => {
    const nums = shuffle([rand(min, max), rand(min, max), rand(min, max), rand(min, max)]);
    while (new Set(nums).size < 4) nums[rand(0, 3)] = rand(min, max);
    const sorted = [...nums].sort((a, b) => a - b).join(', ');
    const sortedArr = [...nums].sort((a, b) => a - b);
    const descSorted = [...sortedArr].reverse().join(', ');
    const asIs = nums.join(', ');
    const distrSet = new Set([descSorted, asIs, [...nums].reverse().join(', ')].filter(x => x !== sorted));
    if (distrSet.size < 3) distrSet.add([sortedArr[1], sortedArr[0], sortedArr[2], sortedArr[3]].join(', '));
    if (distrSet.size < 3) distrSet.add([sortedArr[0], sortedArr[2], sortedArr[1], sortedArr[3]].join(', '));
    const opts = shuffle([sorted, ...[...distrSet].slice(0, 3)]);
    return { stem: `Coloque em ordem <b>crescente</b>: ${nums.join(', ')}`,
             options: opts, correctIndex: opts.indexOf(sorted),
             explain: '<b>Crescente</b>: do menor para o maior (como ir crescendo!). Coloque os nÃºmeros em fila do menor para o maior.' };
});

const g_orderDesc = (min, max) => Q(5, () => {
    const nums = shuffle([rand(min, max), rand(min, max), rand(min, max), rand(min, max)]);
    while (new Set(nums).size < 4) nums[rand(0, 3)] = rand(min, max);
    const sorted = [...nums].sort((a, b) => b - a).join(', ');
    const sortedArr2 = [...nums].sort((a, b) => b - a);
    const ascSorted = [...sortedArr2].reverse().join(', ');
    const asIs2 = nums.join(', ');
    const distrSet2 = new Set([ascSorted, asIs2, [...nums].reverse().join(', ')].filter(x => x !== sorted));
    if (distrSet2.size < 3) distrSet2.add([sortedArr2[1], sortedArr2[0], sortedArr2[2], sortedArr2[3]].join(', '));
    if (distrSet2.size < 3) distrSet2.add([sortedArr2[0], sortedArr2[2], sortedArr2[1], sortedArr2[3]].join(', '));
    const opts = shuffle([sorted, ...[...distrSet2].slice(0, 3)]);
    return { stem: `Coloque em ordem <b>decrescente</b>: ${nums.join(', ')}`,
             options: opts, correctIndex: opts.indexOf(sorted),
             explain: '<b>Decrescente</b>: do maior para o menor. Ã‰ o contrÃ¡rio da ordem crescente!' };
});

const g_before = (min, max) => Q(5, () => {
    const n = rand(min + 1, max);
    return { stem: `Qual nÃºmero vem <b>antes</b> de ${n}?`, ...makeChoice(n - 1, nearDistr(n - 1, 3)),
             explain: `O nÃºmero <b>anterior</b> Ã© um a menos. Antes de ${n} vem ${n - 1}.` };
});

const g_after = (min, max) => Q(5, () => {
    const n = rand(min, max - 1);
    return { stem: `Qual nÃºmero vem <b>depois</b> de ${n}?`, ...makeChoice(n + 1, nearDistr(n + 1, 3)),
             explain: `O nÃºmero <b>posterior</b> Ã© um a mais. Depois de ${n} vem ${n + 1}.` };
});

const g_shapes = () => Q(5, () => {
    const items = [
        { stem: 'Qual forma tem 3 lados?', ans: 'TriÃ¢ngulo', d: ['Quadrado', 'CÃ­rculo', 'PentÃ¡gono'] },
        { stem: 'Qual forma tem 4 lados iguais?', ans: 'Quadrado', d: ['TriÃ¢ngulo', 'RetÃ¢ngulo', 'CÃ­rculo'] },
        { stem: 'Qual forma nÃ£o tem lados retos?', ans: 'CÃ­rculo', d: ['TriÃ¢ngulo', 'Quadrado', 'HexÃ¡gono'] },
        { stem: 'Quantos lados tem um pentÃ¡gono?', ans: 5, d: [3, 4, 6] },
        { stem: 'Quantos lados tem um hexÃ¡gono?', ans: 6, d: [4, 5, 7] },
        { stem: 'Quantos lados tem um quadrado?', ans: 4, d: [3, 5, 6] },
        { stem: 'Quantos lados tem um triÃ¢ngulo?', ans: 3, d: [4, 2, 5] },
        { stem: 'Quantos lados tem um retÃ¢ngulo?', ans: 4, d: [3, 5, 6] },
        { stem: 'Quantos lados tem um octÃ³gono?', ans: 8, d: [6, 7, 9] },
        { stem: 'Quantos lados tem um decÃ¡gono?', ans: 10, d: [8, 9, 12] },
        { stem: 'Quantos vÃ©rtices (cantos) tem um triÃ¢ngulo?', ans: 3, d: [4, 2, 5] },
        { stem: 'Quantos vÃ©rtices tem um quadrado?', ans: 4, d: [3, 5, 6] },
        { stem: 'Quantos vÃ©rtices tem um pentÃ¡gono?', ans: 5, d: [3, 4, 6] },
        { stem: 'Qual forma tem 4 lados, mas sÃ³ 2 pares iguais?', ans: 'RetÃ¢ngulo', d: ['Quadrado', 'TriÃ¢ngulo', 'PentÃ¡gono'] },
        { stem: 'Qual forma Ã© redonda como uma roda?', ans: 'CÃ­rculo', d: ['Quadrado', 'TriÃ¢ngulo', 'Estrela'] },
        { stem: 'Quantos lados tem um triÃ¢ngulo equilÃ¡tero?', ans: 3, d: [4, 5, 6] },
        { stem: 'Forma de 6 lados parecida com favo de mel?', ans: 'HexÃ¡gono', d: ['PentÃ¡gono', 'OctÃ³gono', 'Quadrado'] },
        { stem: 'Forma de 5 lados?', ans: 'PentÃ¡gono', d: ['HexÃ¡gono', 'QuadrilÃ¡tero', 'TriÃ¢ngulo'] },
        { stem: 'PolÃ­gono que NÃƒO existe (todo lado curvo):', ans: 'CÃ­rculo', d: ['TriÃ¢ngulo', 'OctÃ³gono', 'HexÃ¡gono'] },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d),
             explain: 'Dica: <b>triÃ¢ngulo</b>=3 lados, <b>quadrado</b>=4 lados iguais, <b>retÃ¢ngulo</b>=4 lados (2 pares), <b>pentÃ¡gono</b>=5, <b>hexÃ¡gono</b>=6, <b>cÃ­rculo</b>=sem lados.' };
});

const g_dezena = () => Q(5, () => {
    const items = [
        { stem: 'Quantas unidades formam 1 dezena?', ans: 10, d: [5, 8, 100] },
        { stem: 'Em 23, quantas dezenas hÃ¡?', ans: 2, d: [3, 20, 23] },
        { stem: 'Em 47, quantas unidades hÃ¡ (algarismo das unidades)?', ans: 7, d: [4, 40, 47] },
        { stem: 'Quanto Ã© 3 dezenas + 5 unidades?', ans: 35, d: [8, 53, 30] },
        { stem: 'Quanto Ã© 7 dezenas?', ans: 70, d: [7, 17, 77] },
        { stem: 'Em 56, quantas dezenas hÃ¡?', ans: 5, d: [6, 50, 60] },
        { stem: 'Em 89, qual o algarismo das unidades?', ans: 9, d: [8, 80, 89] },
        { stem: 'Quanto Ã© 4 dezenas + 2 unidades?', ans: 42, d: [6, 24, 40] },
        { stem: 'Quanto Ã© 6 dezenas + 0 unidades?', ans: 60, d: [6, 16, 66] },
        { stem: 'Quantas dezenas hÃ¡ em 100?', ans: 10, d: [1, 100, 11] },
        { stem: 'Em 30, quantas unidades soltas (algarismo)?', ans: 0, d: [3, 30, 13] },
        { stem: 'Quanto vale 9 dezenas?', ans: 90, d: [9, 19, 99] },
        { stem: 'Quanto Ã© 2 dezenas + 8 unidades?', ans: 28, d: [10, 82, 26] },
        { stem: 'Em 75, quantas dezenas?', ans: 7, d: [5, 50, 75] },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d),
             explain: 'Uma <b>dezena</b> = 10 unidades. No nÃºmero 35: 3 dezenas e 5 unidades. O algarismo da esquerda Ã© o das dezenas!' };
});

/* â”€â”€ 2Âº ano â€” Bosque das OperaÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_add = (maxA, maxB, minA = 1, minB = 1) => Q(5, () => {
    const a = rand(minA, maxA), b = rand(minB, maxB);
    const c = a + b;
    return { stem: `<b>${a} + ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, Math.ceil(c / 4)))),
             explain: `AdiÃ§Ã£o: <b>${a} + ${b} = ${c}</b>. Junte as quantidades. Pode contar nos dedos ou na reta numÃ©rica!` };
});

const g_sub = (maxA, maxB, minA = 2) => Q(5, () => {
    let a = rand(minA, maxA), b = rand(1, Math.min(a - 1, maxB));
    const c = a - b;
    return { stem: `<b>${a} âˆ’ ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 3)),
             explain: `SubtraÃ§Ã£o: <b>${a} âˆ’ ${b} = ${c}</b>. Tire do maior. Quantas sobram?` };
});

const g_parity = () => Q(5, () => {
    const n = rand(1, 99);
    const opts = ['Par', 'Ãmpar'];
    return { stem: `O nÃºmero <b>${n}</b> Ã© par ou Ã­mpar?`, options: opts, correctIndex: n % 2 ? 1 : 0,
             explain: `<b>${n % 2 === 0 ? 'Par' : 'Ãmpar'}</b>: olhe o Ãºltimo algarismo. Termina em 0,2,4,6,8 â†’ par. Termina em 1,3,5,7,9 â†’ Ã­mpar.` };
});

const g_double = (max = 50) => Q(5, () => {
    const n = rand(1, max);
    return { stem: `Qual Ã© o <b>dobro</b> de ${n}?`, ...makeChoice(n * 2, nearDistr(n * 2, 4)),
             explain: `Dobro = vezes 2 = somar o nÃºmero com ele mesmo. Dobro de ${n} = ${n} + ${n} = <b>${n * 2}</b>.` };
});

const g_half = (max = 50) => Q(5, () => {
    const n = rand(1, max) * 2;
    return { stem: `Qual Ã© a <b>metade</b> de ${n}?`, ...makeChoice(n / 2, nearDistr(n / 2, 4)),
             explain: `Metade = dividir por 2. Metade de ${n} = ${n} Ã· 2 = <b>${n / 2}</b>.` };
});

const g_add3 = (max) => Q(5, () => {
    const a = rand(1, max), b = rand(1, max), c = rand(1, max);
    const r = a + b + c;
    return { stem: `<b>${a} + ${b} + ${c}</b> = ?`, ...makeChoice(r, nearDistr(r, 4)),
             explain: `Some em etapas: primeiro ${a}+${b}=${a+b}, depois ${a+b}+${c}=<b>${r}</b>.` };
});

const g_seqStep = (step) => Q(5, () => {
    const s0 = rand(step, step * 10);
    const seq = [s0, s0 + step, s0 + 2 * step, s0 + 3 * step];
    const next = s0 + 4 * step;
    return { stem: `SequÃªncia de ${step} em ${step}: ${seq.join(', ')}, ?`, ...makeChoice(next, nearDistr(next, step + 2)),
             explain: `O padrÃ£o Ã© somar <b>${step}</b> a cada vez. O prÃ³ximo Ã© ${seq[3]} + ${step} = <b>${next}</b>.` };
});

const g_decomp = () => Q(5, () => {
    const n = rand(11, 99);
    const d = Math.floor(n / 10), u = n % 10;
    const ans = `${d} dezenas e ${u} unidades`;
    const d1 = d !== u ? `${u} dezenas e ${d} unidades` : `${d + 2} dezenas e ${u} unidades`;
    const d2 = `${d + 1} dezenas e ${u} unidades`;
    const d3 = `${d} dezenas e ${(u + 1) % 10} unidades`;
    const optsSet3 = new Set([ans, d1, d2, d3]);
    let ex3 = d + 3; while (optsSet3.size < 4) { optsSet3.add(`${ex3++} dezenas e ${u} unidades`); }
    const opts = shuffle([...optsSet3]);
    return { stem: `Decomponha o nÃºmero <b>${n}</b>:`, options: opts, correctIndex: opts.indexOf(ans),
             explain: `<b>${n}</b> = ${d} dezenas + ${u} unidades. Lembre: 1 dezena = 10 unidades.` };
});

const g_wordSimple = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 9), b = rand(2, 9); return { s: `Ana tem ${a} balas e ganhou ${b}. Quantas balas ela tem agora?`, r: a + b }; },
        () => { const a = rand(5, 20), b = rand(1, 4); return { s: `Tinha ${a} pÃ¡ssaros, ${b} voaram. Quantos restaram?`, r: a - b }; },
        () => { const a = rand(2, 9), b = rand(2, 5); return { s: `${b} caixas com ${a} maÃ§Ã£s cada. Total de maÃ§Ã£s?`, r: a * b }; },
        () => { const b = rand(2, 5), q = rand(2, 6); const a = b * q; return { s: `${a} doces divididos igualmente entre ${b} amigos. Quantos cada um recebe?`, r: q }; },
        () => { const a = rand(3, 12), b = rand(2, 8); return { s: `JoÃ£o tem ${a} figurinhas. Comprou mais ${b}. Quantas tem agora?`, r: a + b }; },
        () => { const a = rand(8, 25), b = rand(2, 6); return { s: `Uma cesta tem ${a} laranjas. ${b} foram tiradas. Quantas restaram?`, r: a - b }; },
        () => { const a = rand(2, 7), b = rand(3, 6); return { s: `${a} pacotes de figurinhas. Cada um tem ${b} figurinhas. Total?`, r: a * b }; },
        () => { const k = rand(2, 6), q = rand(3, 8); const a = k * q; return { s: `${a} bolinhas em ${k} potes iguais. Quantas em cada pote?`, r: q }; },
        () => { const a = rand(5, 15), b = rand(2, 5); return { s: `Maria tinha ${a} reais. Gastou ${b}. Quanto sobrou?`, r: a - b }; },
        () => { const a = rand(4, 9); return { s: `Cada aluno recebe ${a} lÃ¡pis. Em 3 alunos, quantos lÃ¡pis no total?`, r: a * 3 }; },
        () => { const a = rand(2, 6); return { s: `Uma caixa traz ${a} pares de meias. Quantas meias soltas?`, r: a * 2 }; },
        () => { const a = rand(20, 50); return { s: `Sou ${a} anos mais velho que meu irmÃ£o de 2 anos. Quantos anos tenho?`, r: a + 2 }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, nearDistr(it.r, 4)),
             explain: 'Leia com atenÃ§Ã£o: o que vocÃª tem, o que acontece. Junte (+) ou tire (âˆ’)?' };
});

/* â”€â”€ 3Âº ano â€” Vale das Tabuadas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_addCarry = () => Q(5, () => {
    let a, b;
    do { a = rand(10, 99); b = rand(10, 99); } while ((a % 10) + (b % 10) < 10);
    const c = a + b;
    return { stem: `<b>${a} + ${b}</b> = ?  <small>(com reserva)</small>`, ...makeChoice(c, nearDistr(c, 5)),
             explain: `<b>Reserva (vai um):</b> quando a soma das unidades passa de 9, leve 1 para as dezenas. Verifique: ${a}+${b}=${c}.` };
});

const g_subBorrow = () => Q(5, () => {
    let a, b;
    do { a = rand(30, 99); b = rand(10, a - 1); } while ((a % 10) >= (b % 10));
    const c = a - b;
    return { stem: `<b>${a} âˆ’ ${b}</b> = ?  <small>(com emprÃ©stimo)</small>`, ...makeChoice(c, nearDistr(c, 5)),
             explain: `<b>EmprÃ©stimo:</b> quando o dÃ­gito de baixo Ã© maior, peÃ§a 1 dezena (=10) emprestada da coluna da esquerda. ${a}âˆ’${b}=${c}.` };
});

const g_table = (n) => Q(5, () => {
    const k = rand(1, 10);
    const c = n * k;
    return { stem: `<b>${n} Ã— ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, n + 2))),
             explain: `Tabuada: <b>${n} Ã— ${k} = ${c}</b>. VocÃª pode calcular somando ${n} exatamente ${k} vezes!` };
});

const g_tableMix = (low, high) => Q(5, () => {
    const a = rand(low, high), b = rand(1, 10);
    const c = a * b;
    return { stem: `<b>${a} Ã— ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, a + 2))),
             explain: `MultiplicaÃ§Ã£o: <b>${a} Ã— ${b} = ${c}</b>. Lembre: Ã© como somar ${a} exatamente ${b} vezes.` };
});

const g_divExact = (divisorMax) => Q(5, () => {
    const b = rand(2, divisorMax);
    const q = rand(2, 10);
    const a = b * q;
    return { stem: `<b>${a} Ã· ${b}</b> = ?`, ...makeChoice(q, nearDistr(q, 3)),
             explain: `DivisÃ£o: <b>${a} Ã· ${b} = ${q}</b>. Use a tabuada do ${b}: ${b}Ã—${q}=${a}. âœ“` };
});

const g_money = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 9), b = rand(1, 9); return { s: `R$ ${a},00 + R$ ${b},00 = ?`, r: `R$ ${a + b},00`, d: [`R$ ${a + b + 1},00`, `R$ ${a + b - 1},00`, `R$ ${a * b},00`] }; },
        () => { const a = rand(5, 20), b = rand(1, a - 1); return { s: `Paguei R$ ${a},00 num produto de R$ ${b},00. Troco?`, r: `R$ ${a - b},00`, d: [`R$ ${a + b},00`, `R$ ${b - 1},00`, `R$ ${a - b + 1},00`] }; },
        () => { const c = rand(2, 9), v = rand(2, 5); return { s: `${c} pacotes de R$ ${v},00. Quanto pagar?`, r: `R$ ${c * v},00`, d: [`R$ ${c + v},00`, `R$ ${c * v + 1},00`, `R$ ${c * v - 2},00`] }; },
        () => { const a = rand(10, 50), b = rand(5, 9); return { s: `Uma bola custa R$ ${a},00 e uma raquete R$ ${b},00. Total?`, r: `R$ ${a + b},00`, d: [`R$ ${a - b},00`, `R$ ${a + b + 2},00`, `R$ ${a * b},00`] }; },
        () => { const a = rand(3, 9); return { s: `${a} chocolates de R$ 2,00 cada. Total?`, r: `R$ ${a * 2},00`, d: [`R$ ${a + 2},00`, `R$ ${a * 2 + 1},00`, `R$ ${a},00`] }; },
        () => { const t = rand(15, 40), p = rand(5, 12); return { s: `Tinha R$ ${t},00, comprei algo por R$ ${p},00. Sobrou:`, r: `R$ ${t - p},00`, d: [`R$ ${t + p},00`, `R$ ${t - p + 1},00`, `R$ ${p},00`] }; },
        () => { const a = rand(2, 6), v = pick([5, 10, 20]); return { s: `${a} notas de R$ ${v},00. Quanto tenho?`, r: `R$ ${a * v},00`, d: [`R$ ${a + v},00`, `R$ ${a * v - v},00`, `R$ ${v},00`] }; },
        () => { const a = rand(20, 50); return { s: `R$ ${a},00 dividido entre 2 pessoas. Cada uma recebe:`, r: `R$ ${a / 2},00`, d: [`R$ ${a},00`, `R$ ${a / 2 + 1},00`, `R$ ${a - 2},00`] }; },
        () => { const c = rand(2, 5), p = rand(3, 9); return { s: `${c} camisetas a R$ ${p},00 cada. Total da compra?`, r: `R$ ${c * p},00`, d: [`R$ ${c + p},00`, `R$ ${c * p + 1},00`, `R$ ${p},00`] }; },
        () => { const total = rand(30, 80); return { s: `Uma compra de R$ ${total},00 paga com nota de R$ 100,00. Troco?`, r: `R$ ${100 - total},00`, d: [`R$ ${total},00`, `R$ ${100 + total},00`, `R$ ${100 - total + 1},00`] }; },
    ];
    const it = pick(items)();
    const seen4 = new Set([String(it.r)]);
    const uniqueD = [];
    for (const x of it.d) { if (!seen4.has(String(x))) { seen4.add(String(x)); uniqueD.push(x); } }
    let fill4 = 1; while (uniqueD.length < 3) { const v = `R$ ${fill4++},00`; if (!seen4.has(v)) { seen4.add(v); uniqueD.push(v); } }
    return { stem: it.s, ...makeChoice(it.r, uniqueD.slice(0, 3)),
             explain: 'Com dinheiro: <b>+</b> para ganhar/comprar juntos, <b>âˆ’</b> para gastar/troco. Troco = pago âˆ’ preÃ§o.' };
});

/* â”€â”€ 4Âº ano â€” Caverna das FraÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_mult10 = () => Q(5, () => {
    const n = rand(2, 999);
    const k = pick([10, 100, 1000]);
    const c = n * k;
    return { stem: `<b>${n} Ã— ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, k * 2)),
             explain: `Multiplicar por <b>${k}</b>: acrescente ${String(k).length-1} zero(s) ao nÃºmero. ${n}Ã—${k}=<b>${c}</b>.` };
});

const g_mult2x1 = () => Q(5, () => {
    const a = rand(11, 99), b = rand(2, 9);
    const c = a * b;
    return { stem: `<b>${a} Ã— ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 8)),
             explain: `Multiplique em partes: ${a}Ã—${b} = (${Math.floor(a/10)*10}Ã—${b}) + (${a%10}Ã—${b}) = ${Math.floor(a/10)*10*b} + ${(a%10)*b} = <b>${c}</b>.` };
});

const g_mult2x2 = () => Q(5, () => {
    const a = rand(11, 30), b = rand(11, 30);
    const c = a * b;
    return { stem: `<b>${a} Ã— ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 20)),
             explain: `Para multiplicar ${a}Ã—${b}, decomponha: ${a}Ã—${Math.floor(b/10)*10} + ${a}Ã—${b%10} = ${a*Math.floor(b/10)*10} + ${a*(b%10)} = <b>${c}</b>.` };
});

const g_divRest = () => Q(5, () => {
    const b = rand(3, 9), q = rand(3, 12), r = rand(1, b - 1);
    const a = b * q + r;
    const ans = `${q} resto ${r}`;
    const d = [`${q + 1} resto ${r}`, `${q} resto ${r + 1}`, `${q - 1} resto ${b - r}`];
    const opts = shuffle([ans, ...d]);
    return { stem: `<b>${a} Ã· ${b}</b> = ? (com resto)`, options: opts, correctIndex: opts.indexOf(ans),
             explain: `DivisÃ£o com resto: <b>${a} Ã· ${b} = ${q} resto ${r}</b>. Verifique: ${b}Ã—${q}+${r}=${b*q+r}=<b>${a}</b>. âœ“ O resto Ã© sempre menor que o divisor.` };
});

const g_div2dig = () => Q(5, () => {
    const b = rand(2, 9);
    const q = rand(11, 50);
    const a = b * q;
    return { stem: `<b>${a} Ã· ${b}</b> = ?`, ...makeChoice(q, nearDistr(q, 5)),
             explain: `DivisÃ£o: <b>${a} Ã· ${b} = ${q}</b>. Verifique pela tabuada: ${b}Ã—${q}=${a}. âœ“` };
});

const g_fracVisual = () => Q(5, () => {
    const den = pick([2, 3, 4, 5, 6, 8]);
    const num = rand(1, den - 1);
    const blocks = '<span class="frac-on">â–ˆ</span>'.repeat(num) + '<span class="frac-off">â–ˆ</span>'.repeat(den - num);
    const correct = `${num}/${den}`;
    const candidates5 = [`${den - num}/${den}`, `${num}/${den + 1}`, `${num + 1}/${den}`];
    const distrSet5 = new Set(candidates5.filter(x => x !== correct));
    let ex5 = 2; while (distrSet5.size < 3) { const v = `${num + ex5}/${den + ex5}`; if (v !== correct) distrSet5.add(v); ex5++; }
    return { stem: `Qual fraÃ§Ã£o representa a parte preenchida?<div class="frac-bar">${blocks}</div>`,
             ...makeChoice(correct, [...distrSet5].slice(0, 3)),
             explain: `FraÃ§Ã£o: partes coloridas / total de partes. Aqui: <b>${num}/${den}</b> â€” ${num} partes preenchidas de ${den} totais.` };
});

const g_fracTerm = () => Q(5, () => {
    const items = [
        { s: 'Em 3/7, qual Ã© o <b>numerador</b>?', r: 3, d: [7, 4, 10] },
        { s: 'Em 3/7, qual Ã© o <b>denominador</b>?', r: 7, d: [3, 10, 4] },
        { s: 'O denominador indica:', r: 'em quantas partes o todo foi dividido', d: ['as partes pintadas', 'a parte total', 'os nÃºmeros primos'] },
        { s: 'O numerador indica:', r: 'as partes consideradas', d: ['o todo dividido', 'a parte vazia', 'sempre 1'] },
        { s: 'Que fraÃ§Ã£o Ã© "meio"?', r: '1/2', d: ['2/1', '1/4', '2/2'] },
        { s: 'Que fraÃ§Ã£o Ã© "um terÃ§o"?', r: '1/3', d: ['3/1', '1/2', '2/3'] },
        { s: 'Que fraÃ§Ã£o Ã© "trÃªs quartos"?', r: '3/4', d: ['4/3', '1/4', '2/4'] },
        { s: 'Que fraÃ§Ã£o Ã© "um quinto"?', r: '1/5', d: ['5/1', '1/4', '2/5'] },
        { s: 'Que fraÃ§Ã£o Ã© "dois terÃ§os"?', r: '2/3', d: ['3/2', '1/3', '2/6'] },
        { s: 'Em 5/8, qual o numerador?', r: 5, d: [8, 3, 13] },
        { s: 'Em 5/8, qual o denominador?', r: 8, d: [5, 3, 13] },
        { s: 'Que fraÃ§Ã£o Ã© "um quarto"?', r: '1/4', d: ['4/1', '1/2', '2/4'] },
        { s: 'Que fraÃ§Ã£o Ã© "metade"?', r: '1/2', d: ['1/3', '2/2', '1/4'] },
        { s: 'Em 7/10, qual nÃºmero estÃ¡ embaixo?', r: 10, d: [7, 3, 17] },
        { s: 'Quando o numerador Ã© 0, a fraÃ§Ã£o vale:', r: '0', d: ['1', 'o denominador', 'indefinido'] },
        { s: 'FraÃ§Ã£o "cinco oitavos" escreve-se:', r: '5/8', d: ['8/5', '5,8', '5x8'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>Numerador</b> (em cima): quantas partes vocÃª tem. <b>Denominador</b> (embaixo): em quantas partes o todo foi dividido.' };
});

const g_fracEquiv = () => Q(5, () => {
    const den = pick([2, 3, 4, 5]);
    const num = rand(1, den - 1);
    const k = rand(2, 4);
    const correct6 = `${num * k}/${den * k}`;
    const cands6 = [`${num + 1}/${den + 1}`, `${num * k}/${den * k + 1}`, `${num + k}/${den * k}`];
    const distrSet6 = new Set(cands6.filter(x => x !== correct6));
    let ex6 = 1; while (distrSet6.size < 3) { const v = `${num * k + ex6}/${den * k}`; if (v !== correct6) distrSet6.add(v); ex6++; }
    return { stem: `Qual fraÃ§Ã£o Ã© <b>equivalente</b> a ${num}/${den}?`,
             ...makeChoice(correct6, [...distrSet6].slice(0, 3)),
             explain: 'FraÃ§Ãµes equivalentes: multiplique (ou divida) numerador <b>e</b> denominador pelo mesmo nÃºmero. O valor nÃ£o muda!' };
});

const g_fracCompareSameDen = () => Q(5, () => {
    const den = pick([4, 5, 6, 8]);
    const a = rand(3, den - 1);       // greaterNum always >= 3
    const b = rand(1, a - 1);         // lesserNum always < a
    const greater = `${a}/${den}`;
    const lesser  = `${b}/${den}`;
    // d3: pick from nums 1..a-1 excluding b (all < greaterNum, guaranteed unique)
    const d3candidates = [];
    for (let n = 1; n < a; n++) if (n !== b) d3candidates.push(n);
    const d3num = pick(d3candidates);
    return { stem: `Qual Ã© <b>maior</b>? ${a}/${den} ou ${b}/${den}?`,
             ...makeChoice(greater, [lesser, 'SÃ£o iguais', `${d3num}/${den}`]),
             explain: 'Mesmo denominador: compare os numeradores. Maior numerador = <b>maior fraÃ§Ã£o</b>.' };
});

const g_fracAddSame = () => Q(5, () => {
    const den = pick([4, 5, 6, 7, 8]);
    const a = rand(1, Math.floor(den / 2)), b = rand(1, den - a - 1);
    return { stem: `<b>${a}/${den} + ${b}/${den}</b> = ?`,
             ...makeChoice(`${a + b}/${den}`, [`${a + b}/${den * 2}`, `${a + b - 1}/${den}`, `${a + b + 1}/${den}`]),
             explain: 'Mesmo denominador: some os numeradores e mantenha o denominador. <b>a/n + b/n = (a+b)/n</b>.' };
});

const g_units = () => Q(5, () => {
    const items = [
        { s: 'Quantos centÃ­metros em 1 metro?', r: 100, d: [10, 1000, 50] },
        { s: 'Quantos metros em 1 quilÃ´metro?', r: 1000, d: [100, 10, 10000] },
        { s: 'Quantos milÃ­metros em 1 centÃ­metro?', r: 10, d: [100, 1, 1000] },
        { s: 'Quantos gramas em 1 quilograma?', r: 1000, d: [100, 10, 10000] },
        { s: '2,5 metros em centÃ­metros:', r: 250, d: [25, 2500, 2050] },
        { s: '3 km em metros:', r: 3000, d: [300, 30, 30000] },
        { s: 'Quantos miligramas em 1 grama?', r: 1000, d: [100, 10, 10000] },
        { s: 'Quantos mililitros em 1 litro?', r: 1000, d: [100, 10, 10000] },
        { s: '1,5 km em metros:', r: 1500, d: [150, 15000, 105] },
        { s: '500 g em quilogramas:', r: '0,5 kg', d: ['5 kg', '0,05 kg', '50 kg'] },
        { s: '250 cm em metros:', r: '2,5 m', d: ['25 m', '0,25 m', '2,05 m'] },
        { s: '0,5 L em mililitros:', r: 500, d: [50, 5000, 5] },
        { s: '2 toneladas em quilogramas:', r: 2000, d: [200, 20000, 20] },
        { s: 'Qual unidade mede massa?', r: 'grama', d: ['metro', 'litro', 'segundo'] },
        { s: 'Qual unidade mede volume?', r: 'litro', d: ['metro', 'grama', 'segundo'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'ConversÃµes: 1 m = 100 cm, 1 km = 1000 m, 1 kg = 1000 g, 1 L = 1000 mL. Para converter, multiplique ou divida pela relaÃ§Ã£o.' };
});

const g_perimeter = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 20), b = rand(2, 20); return { s: `PerÃ­metro de retÃ¢ngulo ${a} Ã— ${b} cm:`, r: 2 * (a + b), d: nearDistr(2 * (a + b), 6) }; },
        () => { const l = rand(2, 30); return { s: `PerÃ­metro de quadrado de lado ${l} cm:`, r: 4 * l, d: nearDistr(4 * l, 5) }; },
        () => { const a = rand(3, 9), b = rand(3, 9), c = rand(3, 9); return { s: `PerÃ­metro de triÃ¢ngulo de lados ${a}, ${b} e ${c} cm:`, r: a + b + c, d: nearDistr(a + b + c, 4) }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'PerÃ­metro = soma de todos os lados. <b>RetÃ¢ngulo:</b> P = 2Ã—(b+h). <b>Quadrado:</b> P = 4Ã—l. <b>TriÃ¢ngulo:</b> some os trÃªs lados.' };
});

const g_time = () => Q(5, () => {
    const items = [
        { s: 'Quantos minutos em 1 hora?', r: 60, d: [30, 100, 24] },
        { s: 'Quantos segundos em 1 minuto?', r: 60, d: [30, 100, 24] },
        { s: 'Quantas horas em 1 dia?', r: 24, d: [12, 60, 48] },
        { s: 'Quantos dias em uma semana?', r: 7, d: [5, 10, 30] },
        { s: 'Quantos meses em 1 ano?', r: 12, d: [10, 30, 365] },
        { s: '90 minutos = quantas horas?', r: '1h30', d: ['1h09', '9h', '90h'] },
        { s: '2 horas = quantos minutos?', r: 120, d: [60, 200, 180] },
        { s: 'Quantos dias em 1 ano (nÃ£o bissexto)?', r: 365, d: [360, 366, 30] },
        { s: 'Quantos dias em fevereiro (ano normal)?', r: 28, d: [30, 29, 31] },
        { s: '3 horas = quantos minutos?', r: 180, d: [60, 90, 300] },
        { s: '120 segundos = quantos minutos?', r: 2, d: [1, 60, 120] },
        { s: '1 semana = quantas horas?', r: 168, d: [24, 60, 70] },
        { s: 'Quantos trimestres tem 1 ano?', r: 4, d: [3, 6, 12] },
        { s: '1 hora e meia em minutos:', r: 90, d: [60, 130, 150] },
        { s: 'Quantas estaÃ§Ãµes tem 1 ano?', r: 4, d: [2, 12, 7] },
        { s: '4 dÃ©cadas = quantos anos?', r: 40, d: [4, 14, 400] },
        { s: '1 sÃ©culo = quantos anos?', r: 100, d: [10, 1000, 50] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '1 hora = 60 min, 1 min = 60 s, 1 dia = 24 h, 1 semana = 7 dias, 1 ano = 12 meses = 365 dias.' };
});

/* â”€â”€ 5Âº ano â€” Lago dos Decimais â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_fracProperImproper = () => Q(5, () => {
    const items = [
        { s: 'A fraÃ§Ã£o 5/3 Ã©:', r: 'imprÃ³pria', d: ['prÃ³pria', 'aparente', 'mista'] },
        { s: 'A fraÃ§Ã£o 2/5 Ã©:', r: 'prÃ³pria', d: ['imprÃ³pria', 'aparente', 'mista'] },
        { s: 'A fraÃ§Ã£o 4/4 Ã©:', r: 'aparente', d: ['prÃ³pria', 'imprÃ³pria', 'mista'] },
        { s: 'A fraÃ§Ã£o 7/2 Ã©:', r: 'imprÃ³pria', d: ['prÃ³pria', 'aparente', 'mista'] },
        { s: 'FraÃ§Ã£o prÃ³pria significa:', r: 'numerador menor que denominador', d: ['numerador maior', 'iguais', 'sempre 1'] },
        { s: 'A fraÃ§Ã£o 3/8 Ã©:', r: 'prÃ³pria', d: ['imprÃ³pria', 'aparente', 'mista'] },
        { s: 'A fraÃ§Ã£o 9/4 Ã©:', r: 'imprÃ³pria', d: ['prÃ³pria', 'aparente', 'mista'] },
        { s: 'A fraÃ§Ã£o 6/6 Ã©:', r: 'aparente', d: ['prÃ³pria', 'imprÃ³pria', 'mista'] },
        { s: 'FraÃ§Ã£o aparente equivale a:', r: 'um nÃºmero inteiro', d: ['zero', 'uma metade', 'um dÃ©cimo'] },
        { s: 'A fraÃ§Ã£o 11/3 Ã©:', r: 'imprÃ³pria', d: ['prÃ³pria', 'aparente', 'mista'] },
        { s: 'A fraÃ§Ã£o 7/7 vale:', r: '1', d: ['0', '7', '1/7'] },
        { s: 'FraÃ§Ã£o imprÃ³pria significa:', r: 'numerador maior ou igual ao denominador', d: ['numerador menor', 'denominador zero', 'sempre 1'] },
        { s: '4/4 vale:', r: '1', d: ['4', '0', '1/4'] },
        { s: '1 + 1/2 (forma mista) equivale a fraÃ§Ã£o:', r: '3/2', d: ['2/3', '1/2', '11/2'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>PrÃ³pria:</b> numerador < denominador (valor < 1). <b>ImprÃ³pria:</b> numerador â‰¥ denominador (valor â‰¥ 1). <b>Aparente:</b> representa inteiro.' };
});

const g_decRead = () => Q(5, () => {
    const items = [
        { s: 'Como se lÃª <b>0,5</b>?', r: 'cinco dÃ©cimos', d: ['cinco centÃ©simos', 'cinco', 'meio centavo'] },
        { s: 'Como se lÃª <b>0,25</b>?', r: 'vinte e cinco centÃ©simos', d: ['vinte e cinco dÃ©cimos', 'dois e cinco', '25 milÃ©simos'] },
        { s: 'O nÃºmero 1,5 estÃ¡ entre:', r: '1 e 2', d: ['0 e 1', '5 e 6', '10 e 15'] },
        { s: 'Qual Ã© maior: 0,7 ou 0,69?', r: '0,7', d: ['0,69', 'iguais', 'depende'] },
        { s: 'Qual Ã© maior: 0,3 ou 0,30?', r: 'iguais', d: ['0,3', '0,30', 'nenhum'] },
        { s: 'Como se lÃª <b>0,1</b>?', r: 'um dÃ©cimo', d: ['um centÃ©simo', 'uma unidade', 'dez'] },
        { s: 'Como se lÃª <b>0,01</b>?', r: 'um centÃ©simo', d: ['um dÃ©cimo', 'um milÃ©simo', 'zero e um'] },
        { s: 'O nÃºmero 2,5 Ã© igual a:', r: '2 + 0,5', d: ['25', '2,05', '0,25'] },
        { s: 'Quanto Ã© "trÃªs dÃ©cimos" em decimal?', r: '0,3', d: ['0,03', '3,0', '3'] },
        { s: 'Quanto Ã© "quinze centÃ©simos" em decimal?', r: '0,15', d: ['1,5', '0,015', '15'] },
        { s: 'Qual Ã© maior: 1,2 ou 1,19?', r: '1,2', d: ['1,19', 'iguais', '0,2'] },
        { s: 'O nÃºmero 0,8 estÃ¡ mais perto de:', r: '1', d: ['0', '8', '0,5'] },
        { s: 'Quantas casas decimais tem 3,14?', r: '2', d: ['3', '1', '4'] },
        { s: 'Qual Ã© menor: 0,4 ou 0,40?', r: 'iguais', d: ['0,4', '0,40', 'nenhum'] },
        { s: '4,9 estÃ¡ entre quais inteiros?', r: '4 e 5', d: ['3 e 4', '5 e 6', '9 e 10'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>0,1</b> = 1 dÃ©cimo. <b>0,01</b> = 1 centÃ©simo. <b>0,001</b> = 1 milÃ©simo. Compare decimais casa por casa, da esquerda para a direita.' };
});

const g_decCompare = () => Q(5, () => {
    const a = (rand(1, 99) / 10).toFixed(1);
    let b = (rand(1, 99) / 10).toFixed(1);
    while (b === a) b = (rand(1, 99) / 10).toFixed(1);
    const big = parseFloat(a) > parseFloat(b) ? a : b;
    return { stem: `Qual Ã© <b>maior</b>: ${a} ou ${b}?`, ...makeChoice(big, [a === big ? b : a, 'SÃ£o iguais', '0']),
             explain: `Compare casa por casa (esquerdaâ†’direita): parte inteira, dÃ©cimos, centÃ©simos... O primeiro dÃ­gito diferente decide quem Ã© maior!` };
});

const g_decAdd = () => Q(5, () => {
    const a = rand(10, 99) / 10, b = rand(10, 99) / 10;
    const c = +(a + b).toFixed(1);
    return { stem: `<b>${a.toFixed(1)} + ${b.toFixed(1)}</b> = ?`,
             ...makeChoice(c.toFixed(1), nearDistr(Math.round(c * 10), 8).map(x => (x / 10).toFixed(1))),
             explain: 'Some decimais <b>alinhando as vÃ­rgulas</b> e calcule normalmente, coluna por coluna.' };
});

const g_decSub = () => Q(5, () => {
    let a = rand(50, 99) / 10, b = rand(10, 49) / 10;
    if (b > a) [a, b] = [b, a];
    const c = +(a - b).toFixed(1);
    return { stem: `<b>${a.toFixed(1)} âˆ’ ${b.toFixed(1)}</b> = ?`,
             ...makeChoice(c.toFixed(1), nearDistr(Math.round(c * 10), 8).map(x => (x / 10).toFixed(1))),
             explain: 'Subtraia decimais <b>alinhando as vÃ­rgulas</b>. Use zeros Ã  direita se precisar. Calcule coluna por coluna.' };
});

const g_decMult10 = () => Q(5, () => {
    const n = (rand(15, 99) / 10).toFixed(1);
    const k = pick([10, 100, 1000]);
    const c = parseFloat(n) * k;
    return { stem: `<b>${n} Ã— ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, k)),
             explain: `Multiplicar por ${k}: mova a vÃ­rgula ${String(k).length-1} casa(s) para a <b>direita</b>. ${n}Ã—${k}=<b>${c}</b>.` };
});

const g_percentEasy = () => Q(5, () => {
    const p = pick([10, 25, 50, 75, 100]);
    const n = pick([20, 40, 80, 100, 200, 400]);
    const c = (n * p) / 100;
    return { stem: `Quanto Ã© <b>${p}% de ${n}</b>?`, ...makeChoice(c, nearDistr(c, n / 10)),
             explain: `<b>${p}%</b> de ${n}: calcule ${n}Ã—${p}/100 = <b>${c}</b>. Dica: 10% â†’ divida por 10. 50% â†’ metade. 25% â†’ quarto.` };
});

const g_percentApply = () => Q(5, () => {
    const p = pick([10, 15, 20, 25, 30, 50]);
    const n = pick([50, 80, 100, 150, 200, 250, 300]);
    const c = Math.round((n * p) / 100 * 100) / 100;
    return { stem: `${p}% de R$ ${n},00 vale quanto?`, ...makeChoice(`R$ ${c.toFixed(2)}`, nearDistr(c, n / 10).map(x => `R$ ${x.toFixed(2)}`)),
             explain: `Porcentagem: <b>${p}%</b> de R$ ${n} = ${n} Ã— ${p}/100 = <b>R$ ${c.toFixed(2)}</b>. Muito comum em problemas do cotidiano!` };
});

const g_areaSquare = () => Q(5, () => {
    const l = rand(2, 20);
    const c = l * l;
    return { stem: `Ãrea de quadrado de lado <b>${l} cm</b>:`, ...makeChoice(`${c} cmÂ²`, nearDistr(c, 8).map(x => `${x} cmÂ²`)),
             explain: `Ãrea do quadrado = lado Ã— lado = ladoÂ². <b>${l}Â² = ${c} cmÂ²</b>. Ãrea mede o espaÃ§o da superfÃ­cie!` };
});

const g_areaRect = () => Q(5, () => {
    const a = rand(3, 20), b = rand(3, 20);
    const c = a * b;
    return { stem: `Ãrea de retÃ¢ngulo <b>${a} Ã— ${b} cm</b>:`, ...makeChoice(`${c} cmÂ²`, nearDistr(c, 10).map(x => `${x} cmÂ²`)),
             explain: `Ãrea do retÃ¢ngulo = base Ã— altura. <b>${a} Ã— ${b} = ${c} cmÂ²</b>. Ã‰ como contar quantos quadradinhos de 1 cm cabem dentro.` };
});

const g_volumeCube = () => Q(5, () => {
    const l = rand(2, 10);
    const c = l * l * l;
    return { stem: `Volume de cubo de aresta <b>${l} cm</b>:`, ...makeChoice(`${c} cmÂ³`, nearDistr(c, 12).map(x => `${x} cmÂ³`)),
             explain: `Volume do cubo = arestaÂ³ = aresta Ã— aresta Ã— aresta. <b>${l}Â³ = ${c} cmÂ³</b>. Mede o espaÃ§o 3D que o objeto ocupa.` };
});

const g_volumePar = () => Q(5, () => {
    const a = rand(2, 8), b = rand(2, 8), c = rand(2, 8);
    const v = a * b * c;
    return { stem: `Volume do paralelepÃ­pedo <b>${a} Ã— ${b} Ã— ${c} cm</b>:`, ...makeChoice(`${v} cmÂ³`, nearDistr(v, 20).map(x => `${x} cmÂ³`)),
             explain: `Volume do paralelepÃ­pedo = comprimento Ã— largura Ã— altura. <b>${a}Ã—${b}Ã—${c} = ${v} cmÂ³</b>.` };
});

const g_mean = () => Q(5, () => {
    const n = pick([2, 3, 4]);
    const nums = Array.from({ length: n }, () => rand(2, 20));
    let sum = nums.reduce((a, b) => a + b, 0);
    let guard = 0;
    while (sum % n !== 0 && guard++ < 30) {
        nums[0] = rand(2, 20);
        sum = nums.reduce((a, b) => a + b, 0);
    }
    const ans = sum / n;
    const intAns = Math.round(ans * 10) / 10;
    return { stem: `MÃ©dia de ${nums.join(', ')} =?`, ...makeChoice(intAns, nearDistr(intAns, 4)),
             explain: `MÃ©dia = soma Ã· quantidade. <b>(${nums.join('+')})/  ${n} = ${sum}/${n} = ${intAns}</b>. Ã‰ o valor que representaria todos igualmente.` };
});

const g_probSimple = () => Q(5, () => {
    const items = [
        { s: 'Numa moeda, qual a chance de cair cara?', r: '1/2', d: ['1/4', '1/3', '1'] },
        { s: 'Num dado, qual a chance de sair 3?', r: '1/6', d: ['1/3', '1/2', '3/6'] },
        { s: 'Num dado, chance de sair nÃºmero par?', r: '1/2', d: ['1/3', '1/6', '2/3'] },
        { s: '20 bolas, 5 vermelhas. Chance de tirar vermelha?', r: '1/4', d: ['1/5', '5/15', '1/20'] },
        { s: 'Probabilidade do evento certo:', r: '1', d: ['0', '1/2', 'depende'] },
        { s: 'Probabilidade do evento impossÃ­vel:', r: '0', d: ['1', '1/2', 'depende'] },
        { s: 'Num dado, chance de sair nÃºmero maior que 4?', r: '1/3', d: ['1/2', '2/3', '1/6'] },
        { s: 'Numa moeda, chance de cair coroa?', r: '1/2', d: ['1/4', '1/3', '0'] },
        { s: '10 bolas, 2 azuis. Chance de azul?', r: '1/5', d: ['2/10', '1/2', '1/10'] },
        { s: 'Num dado, chance de sair 7?', r: '0', d: ['1/6', '1/7', '1'] },
        { s: 'Num dado, chance de sair 1, 2 ou 3?', r: '1/2', d: ['1/3', '3/6', '1/6'] },
        { s: '52 cartas, 4 ases. Chance de tirar Ã¡s?', r: '1/13', d: ['4/52', '1/52', '1/4'] },
        { s: 'Numa urna com 3 bolas brancas e 1 preta, chance de preta?', r: '1/4', d: ['3/4', '1/3', '1/2'] },
        { s: 'Num dado, chance de NÃƒO sair 6?', r: '5/6', d: ['1/6', '6/6', '1/2'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>Probabilidade</b> = casos favorÃ¡veis Ã· casos totais. Varia entre 0 (impossÃ­vel) e 1 (certeza).' };
});

/* â”€â”€ 6Âº ano â€” Montanha dos Inteiros â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_negLine = () => Q(5, () => {
    const items = [
        { s: 'Qual Ã© maior: -3 ou -5?', r: '-3', d: ['-5', 'iguais', '0'] },
        { s: 'Qual Ã© maior: -1 ou 1?', r: '1', d: ['-1', 'iguais', 'depende'] },
        { s: 'Na reta, qual fica mais Ã  esquerda: -7 ou -2?', r: '-7', d: ['-2', 'iguais', 'nenhum'] },
        { s: 'O oposto de 4 Ã©:', r: -4, d: [4, 0, 14] },
        { s: 'MÃ³dulo de -8 Ã©:', r: 8, d: [-8, 0, 18] },
        { s: 'Qual Ã© o menor: -10, -3, 0, 5?', r: -10, d: [-3, 0, 5] },
        { s: 'O oposto de -7 Ã©:', r: 7, d: [-7, 0, 14] },
        { s: 'MÃ³dulo de 12 Ã©:', r: 12, d: [-12, 0, 24] },
        { s: 'Qual fica mais Ã  direita na reta: -2 ou -8?', r: '-2', d: ['-8', 'iguais', '0'] },
        { s: 'Qual Ã© maior: 0 ou -3?', r: '0', d: ['-3', 'iguais', 'depende'] },
        { s: 'O oposto de 0 Ã©:', r: 0, d: [1, -1, 10] },
        { s: 'Qual Ã© o maior: -10, -3, 0, 5?', r: 5, d: [-10, 0, -3] },
        { s: 'MÃ³dulo de -100 Ã©:', r: 100, d: [-100, 0, 200] },
        { s: 'Entre -4 e -1, qual Ã© maior?', r: '-1', d: ['-4', 'iguais', '0'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Na <b>reta numÃ©rica</b>: negativos ficam Ã  esquerda do zero. Quanto mais Ã  esquerda, <b>menor</b> o nÃºmero. Ex: âˆ’10 < âˆ’3 < 0 < 5.' };
});

const g_negAdd = () => Q(5, () => {
    const a = rand(-20, 20), b = rand(-20, 20);
    const c = a + b;
    const str = `(${a}) + (${b})`.replace(/\+ \(-/g, 'âˆ’ (').replace(/\(-/g, '(âˆ’');
    return { stem: `<b>${a} + (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 6, 3, true)),
             explain: `Soma com negativos: sinais <b>iguais</b> â†’ some os mÃ³dulos e mantenha o sinal. Sinais <b>diferentes</b> â†’ subtraia os mÃ³dulos e use o sinal do maior.` };
});

const g_negSub = () => Q(5, () => {
    const a = rand(-20, 20), b = rand(-20, 20);
    const c = a - b;
    return { stem: `<b>${a} âˆ’ (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 6, 3, true)),
             explain: `SubtraÃ§Ã£o de negativo: <b>a âˆ’ (âˆ’b) = a + b</b>. Dois negativos seguidos viram positivo! Ex: 5âˆ’(âˆ’3) = 5+3 = 8.` };
});

const g_negMult = () => Q(5, () => {
    const a = rand(-12, 12) || 1, b = rand(-12, 12) || 1;
    const c = a * b;
    return { stem: `<b>(${a}) Ã— (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 10, 3, true)),
             explain: 'MultiplicaÃ§Ã£o: <b>sinais iguais â†’ positivo</b> (+ Ã— + ou âˆ’ Ã— âˆ’). <b>Sinais diferentes â†’ negativo</b> (+ Ã— âˆ’ ou âˆ’ Ã— +).' };
});

const g_negDiv = () => Q(5, () => {
    const b = rand(2, 9) * pick([-1, 1]);
    const q = rand(2, 9) * pick([-1, 1]);
    const a = b * q;
    return { stem: `<b>(${a}) Ã· (${b})</b> = ?`, ...makeChoice(q, nearDistr(q, 4, 3, true)),
             explain: 'DivisÃ£o: <b>sinais iguais â†’ resultado positivo</b>. <b>Sinais diferentes â†’ resultado negativo</b>. Mesma regra da multiplicaÃ§Ã£o!' };
});

const g_mmc = () => Q(5, () => {
    const pairs = [[4, 6, 12], [3, 5, 15], [6, 8, 24], [4, 10, 20], [9, 12, 36], [5, 7, 35], [8, 12, 24], [2, 3, 6], [6, 9, 18], [4, 5, 20]];
    const [a, b, m] = pick(pairs);
    return { stem: `<b>MMC(${a}, ${b})</b> = ?`, ...makeChoice(m, nearDistr(m, 6)),
             explain: `<b>MMC</b> (MÃ­nimo MÃºltiplo Comum): o menor nÃºmero divisÃ­vel pelos dois. MMC(${a},${b}) = <b>${m}</b>. Usado para somar fraÃ§Ãµes com denominadores diferentes!` };
});

const g_mdc = () => Q(5, () => {
    const pairs = [[12, 18, 6], [20, 30, 10], [24, 36, 12], [15, 25, 5], [14, 21, 7], [8, 12, 4], [9, 27, 9], [16, 24, 8], [10, 15, 5], [18, 24, 6]];
    const [a, b, m] = pick(pairs);
    return { stem: `<b>MDC(${a}, ${b})</b> = ?`, ...makeChoice(m, nearDistr(m, 4)),
             explain: `<b>MDC</b> (MÃ¡ximo Divisor Comum): o maior nÃºmero que divide os dois exatamente. MDC(${a},${b}) = <b>${m}</b>. Usado para simplificar fraÃ§Ãµes!` };
});

const g_fracAddDiff = () => Q(5, () => {
    const pairs = [['1/2', '1/3', '5/6'], ['1/4', '1/2', '3/4'], ['2/3', '1/6', '5/6'], ['1/3', '1/4', '7/12'], ['3/4', '1/8', '7/8'], ['1/5', '1/2', '7/10']];
    const [a, b, r] = pick(pairs);
    return { stem: `<b>${a} + ${b}</b> = ?`, ...makeChoice(r, ['1/5', '2/12', '3/7', '4/9'].filter(x => x !== r).slice(0, 3)),
             explain: `FraÃ§Ãµes com denominadores diferentes: ache o <b>MMC</b> dos denominadores, converta e some os numeradores. Ex: ${a}+${b} = <b>${r}</b>.` };
});

const g_fracMult = () => Q(5, () => {
    const items = [['1/2', '1/3', '1/6'], ['2/3', '3/4', '1/2'], ['1/2', '1/4', '1/8'], ['3/5', '1/2', '3/10'], ['2/5', '5/6', '1/3']];
    const [a, b, r] = pick(items);
    return { stem: `<b>${a} Ã— ${b}</b> = ?`, ...makeChoice(r, ['2/12', '5/9', '3/8', '7/15'].filter(x => x !== r).slice(0, 3)),
             explain: `MultiplicaÃ§Ã£o de fraÃ§Ãµes: multiplique numerador Ã— numerador e denominador Ã— denominador. Ex: ${a}Ã—${b} = <b>${r}</b>. Simplifique no final!` };
});

const g_fracDiv = () => Q(5, () => {
    const items = [['1/2', '1/4', '2'], ['3/4', '1/2', '3/2'], ['2/3', '1/3', '2'], ['1/2', '1/2', '1']];
    const [a, b, r] = pick(items);
    return { stem: `<b>${a} Ã· ${b}</b> = ?`, ...makeChoice(r, ['1/4', '1/8', '3/4', '4'].filter(x => x !== r).slice(0, 3)),
             explain: `DivisÃ£o de fraÃ§Ãµes: <b>inverta a segunda e multiplique</b>. Ex: ${a}Ã·${b} = ${a}Ã—(inverso de ${b}) = <b>${r}</b>.` };
});

const g_eq1 = () => Q(5, () => {
    const x = rand(1, 20), a = rand(1, 20);
    const types = [
        { s: `x + ${a} = ${x + a}`, r: x },
        { s: `x âˆ’ ${a} = ${x - a}`, r: x },
        { s: `${a + x} = x + ${a}`, r: x },
    ];
    const t = pick(types);
    return { stem: `Resolva: <b>${t.s}</b>. x = ?`, ...makeChoice(t.r, nearDistr(t.r, 4)),
             explain: `Isole o x: passe o nÃºmero para o outro lado <b>com o sinal trocado</b>. Ex: x+${a}=${x + a} â†’ x = ${x + a}âˆ’${a} = <b>${x}</b>.` };
});

const g_eqMult = () => Q(5, () => {
    const x = rand(2, 10), a = rand(2, 9);
    const types = [
        { s: `${a}x = ${a * x}`, r: x },
        { s: `x/${a} = ${Math.floor(x)}`, r: a * Math.floor(x) },
        { s: `${a}x âˆ’ ${a} = ${a * x - a}`, r: x },
    ];
    const t = pick(types);
    return { stem: `Resolva: <b>${t.s}</b>. x = ?`, ...makeChoice(t.r, nearDistr(t.r, 4)),
             explain: `Para isolar x: realize a <b>operaÃ§Ã£o inversa</b> dos dois lados. Se ${a}x=${a*x}, divida por ${a}: x = <b>${x}</b>.` };
});

const g_ratioBasic = () => Q(5, () => {
    const items = [
        { s: 'Numa sala hÃ¡ 12 meninas e 8 meninos. RazÃ£o meninas:meninos?', r: '3:2', d: ['2:3', '12:8', '8:12'] },
        { s: 'RazÃ£o de 6 para 9 (simplificada):', r: '2:3', d: ['3:2', '6:9', '1:1'] },
        { s: 'RazÃ£o de 10 para 5:', r: '2:1', d: ['1:2', '5:10', '10:5'] },
        { s: 'RazÃ£o de 4 para 16 (simplificada):', r: '1:4', d: ['4:1', '4:16', '2:8'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'RazÃ£o = comparaÃ§Ã£o pela divisÃ£o. Simplifique dividindo pelo MDC. RazÃ£o 12:8 = 3:2 (dividido por 4).' };
});

/* â”€â”€ 7Âº ano â€” Deserto das EquaÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_eq2sides = () => Q(5, () => {
    const x = rand(1, 10), a = rand(2, 6), b = rand(2, 6), c = rand(1, 10);
    if (a === b) return { stem: 'Resolva: 2x + 3 = x + 7. x = ?', ...makeChoice(4, [3, 5, 6]),
        explain: 'Isole o x: passe os termos com x para um lado e os nÃºmeros para o outro. <b>2x âˆ’ x = 7 âˆ’ 3 â†’ x = 4.</b> Regra: ao mudar de lado, inverta o sinal.' };
    const left = a * x + c;
    const rightConst = left - b * x;
    const diff = a - b;
    return { stem: `Resolva: <b>${a}x + ${c} = ${b}x + ${rightConst}</b>. x = ?`, ...makeChoice(x, nearDistr(x, 4)),
        explain: `Agrupe os x: <b>${a}x âˆ’ ${b}x = ${rightConst} âˆ’ ${c} â†’ ${diff}x = ${diff * x} â†’ x = ${x}.</b> Ao passar um termo para o outro lado, o sinal sempre troca.` };
});

const g_eqParen = () => Q(5, () => {
    const items = [
        { s: '2(x + 3) = 14', r: 4, e: '<b>Distributiva:</b> 2x + 6 = 14 â†’ 2x = 8 â†’ x = 4.' },
        { s: '3(x âˆ’ 1) = 12', r: 5, e: '<b>Distributiva:</b> 3x âˆ’ 3 = 12 â†’ 3x = 15 â†’ x = 5.' },
        { s: '2(x âˆ’ 4) = 6', r: 7, e: '<b>Distributiva:</b> 2x âˆ’ 8 = 6 â†’ 2x = 14 â†’ x = 7.' },
        { s: '5(x + 2) = 35', r: 5, e: '<b>Distributiva:</b> 5x + 10 = 35 â†’ 5x = 25 â†’ x = 5.' },
        { s: '4(x + 1) = 20', r: 4, e: '<b>Distributiva:</b> 4x + 4 = 20 â†’ 4x = 16 â†’ x = 4.' },
        { s: '3(2x + 1) = 21', r: 3, e: '<b>Distributiva:</b> 6x + 3 = 21 â†’ 6x = 18 â†’ x = 3.' },
    ];
    const it = pick(items);
    return { stem: `Resolva: <b>${it.s}</b>. x = ?`, ...makeChoice(it.r, nearDistr(it.r, 4)), explain: it.e };
});

const g_eqFrac = () => Q(5, () => {
    const items = [
        { s: 'x/2 + 1 = 4', r: 6,  e: 'Multiplique tudo por 2 (MMC): x + 2 = 8 â†’ x = 6.' },
        { s: 'x/3 âˆ’ 2 = 1', r: 9,  e: 'Multiplique tudo por 3: x âˆ’ 6 = 3 â†’ x = 9.' },
        { s: '2x/3 = 6',    r: 9,  e: 'Multiplique por 3: 2x = 18 â†’ x = 9. Ou: x = 6 Ã— 3/2 = 9.' },
        { s: 'x/4 = 3',     r: 12, e: 'Multiplique por 4: x = 12. Direto: x = 3 Ã— 4.' },
        { s: 'x/5 + 1 = 3', r: 10, e: 'Multiplique por 5: x + 5 = 15 â†’ x = 10.' },
    ];
    const it = pick(items);
    return { stem: `Resolva: <b>${it.s}</b>. x = ?`, ...makeChoice(it.r, nearDistr(it.r, 4)), explain: it.e };
});

const g_proportion = () => Q(5, () => {
    const a = rand(2, 9), b = rand(2, 9), k = rand(2, 6);
    const c = a * k, d = b * k;
    const items = [
        { s: `${a}/${b} = x/${d}. x = ?`, r: c },
        { s: `${a}/${b} = ${c}/x. x = ?`, r: d },
        { s: `x/${b} = ${c}/${d}. x = ?`, r: a },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, nearDistr(it.r, 5)),
             explain: `<b>Produto cruzado</b> (regra da cruz): a/b = c/d â†’ aÃ—d = bÃ—c. Isole o x!` };
});

const g_rule3 = () => Q(5, () => {
    const items = [
        () => { const u = rand(2, 9), v = rand(2, 9), k = rand(2, 6); return { s: `Se ${u} caixas custam R$ ${u * v},00, quanto custam ${u * k} caixas?`, r: u * v * k }; },
        () => { const km = rand(50, 200), h = rand(2, 5); return { s: `Carro a ${km} km/h percorre quantos km em ${h} h?`, r: km * h }; },
        () => { const a = rand(2, 6), b = rand(2, 9); return { s: `${a} laranjas custam R$ ${a * b},00. Quanto custam ${a + 3} laranjas?`, r: (a + 3) * b }; },
    ];
    const it = pick(items)();
    return { stem: `<b>Regra de 3:</b> ${it.s}`, ...makeChoice(it.r, nearDistr(it.r, 8)),
             explain: '<b>Regra de 3 direta</b>: grandezas proporcionais. Monte a tabela e calcule pela proporÃ§Ã£o. Se dobra um, dobra o outro!' };
});

const g_rule3Inv = () => Q(5, () => {
    const items = [
        { s: '6 operÃ¡rios fazem obra em 10 dias. Quantos dias para 12 operÃ¡rios?', r: 5,  e: 'Inversa: mais operÃ¡rios â†’ menos dias. Produto constante: 6Ã—10 = 12Ã—x â†’ x = 60/12 = <b>5 dias</b>.' },
        { s: '4 torneiras enchem tanque em 6h. Tempo com 8 torneiras?', r: 3,             e: 'Inversa: mais torneiras â†’ menos tempo. 4Ã—6 = 8Ã—x â†’ x = 24/8 = <b>3 horas</b>.' },
        { s: '3 mÃ¡quinas em 8h. Tempo com 6 mÃ¡quinas?', r: 4,                            e: 'Inversa: mais mÃ¡quinas â†’ menos tempo. 3Ã—8 = 6Ã—x â†’ x = 24/6 = <b>4 horas</b>.' },
        { s: '5 pintores em 12 dias. Tempo com 10 pintores?', r: 6,                       e: 'Inversa: mais pintores â†’ menos dias. 5Ã—12 = 10Ã—x â†’ x = 60/10 = <b>6 dias</b>.' },
    ];
    const it = pick(items);
    return { stem: `<b>Inversa:</b> ${it.s}`, ...makeChoice(it.r, nearDistr(it.r, 4)), explain: it.e };
});

const g_discount = () => Q(5, () => {
    const v = pick([100, 150, 200, 250, 300, 500]);
    const p = pick([10, 15, 20, 25, 30]);
    const c = v - (v * p) / 100;
    const fator = (1 - p / 100);
    return { stem: `Produto de R$ ${v} com desconto de ${p}%. Valor final?`, ...makeChoice(`R$ ${c}`, nearDistr(c, 30).map(x => `R$ ${x}`)),
        explain: `Desconto de ${p}%: multiplique pelo fator <b>(1 âˆ’ ${p}/100) = ${fator}</b>. CÃ¡lculo: ${v} Ã— ${fator} = <b>R$ ${c}</b>. Muito cobrado no ENEM em problemas de consumo!` };
});

const g_increase = () => Q(5, () => {
    const v = pick([100, 200, 300, 400, 500]);
    const p = pick([10, 15, 20, 25, 30, 50]);
    const c = v + (v * p) / 100;
    const fator = (1 + p / 100);
    return { stem: `R$ ${v} com aumento de ${p}%. Valor final?`, ...makeChoice(`R$ ${c}`, nearDistr(c, 40).map(x => `R$ ${x}`)),
        explain: `Aumento de ${p}%: multiplique pelo fator <b>(1 + ${p}/100) = ${fator}</b>. CÃ¡lculo: ${v} Ã— ${fator} = <b>R$ ${c}</b>. Encadeando aumentos/descontos: multiplique os fatores em sequÃªncia.` };
});

const g_interestSimple = () => Q(5, () => {
    const c = pick([1000, 2000, 5000]);
    const i = pick([1, 2, 5, 10]);
    const t = pick([3, 6, 12]);
    const j = (c * i * t) / 100;
    return { stem: `Capital R$ ${c}, taxa ${i}% ao mÃªs, ${t} meses. Juros simples = ?`, ...makeChoice(`R$ ${j}`, nearDistr(j, 100).map(x => `R$ ${x}`)),
        explain: `Juros Simples: <b>J = C Ã— i Ã— t</b> = ${c} Ã— ${i}/100 Ã— ${t} = <b>R$ ${j}</b>. O montante total seria M = C + J = R$ ${c + j}. Diferente dos juros compostos (capitalizaÃ§Ã£o), aqui os juros nÃ£o se acumulam sobre si mesmos.` };
});

const g_angles = () => Q(5, () => {
    const items = [
        { s: 'Ã‚ngulo de 90Â° Ã©:', r: 'reto', d: ['agudo', 'obtuso', 'raso'] },
        { s: 'Ã‚ngulo menor que 90Â°:', r: 'agudo', d: ['reto', 'obtuso', 'raso'] },
        { s: 'Ã‚ngulo entre 90Â° e 180Â°:', r: 'obtuso', d: ['agudo', 'reto', 'raso'] },
        { s: 'Ã‚ngulo de 180Â°:', r: 'raso', d: ['reto', 'obtuso', 'agudo'] },
        { s: 'Soma dos Ã¢ngulos internos de um triÃ¢ngulo:', r: '180Â°', d: ['90Â°', '360Â°', '270Â°'] },
        { s: 'Soma dos Ã¢ngulos de um quadrilÃ¡tero:', r: '360Â°', d: ['180Â°', '270Â°', '90Â°'] },
        { s: 'Dois Ã¢ngulos somando 90Â° sÃ£o:', r: 'complementares', d: ['suplementares', 'opostos', 'iguais'] },
        { s: 'Dois Ã¢ngulos somando 180Â° sÃ£o:', r: 'suplementares', d: ['complementares', 'opostos', 'paralelos'] },
        { s: 'Complemento de 30Â°:', r: '60Â°', d: ['150Â°', '90Â°', '30Â°'] },
        { s: 'Suplemento de 120Â°:', r: '60Â°', d: ['90Â°', '180Â°', '240Â°'] },
        { s: 'Ã‚ngulo de 45Â° Ã©:', r: 'agudo', d: ['reto', 'obtuso', 'raso'] },
        { s: 'Ã‚ngulo de 135Â° Ã©:', r: 'obtuso', d: ['agudo', 'reto', 'raso'] },
        { s: 'Em um triÃ¢ngulo retÃ¢ngulo, um Ã¢ngulo Ã©:', r: '90Â°', d: ['180Â°', '60Â°', '45Â°'] },
        { s: 'Soma dos Ã¢ngulos internos do pentÃ¡gono:', r: '540Â°', d: ['360Â°', '720Â°', '180Â°'] },
        { s: 'Complemento de 45Â°:', r: '45Â°', d: ['90Â°', '135Â°', '0Â°'] },
        { s: 'Suplemento de 90Â°:', r: '90Â°', d: ['180Â°', '45Â°', '270Â°'] },
        { s: 'Ã‚ngulo de 360Â° Ã©:', r: 'volta completa', d: ['raso', 'reto', 'agudo'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>Agudo</b> < 90Â° | <b>Reto</b> = 90Â° | <b>Obtuso</b> 90Â°-180Â° | <b>Raso</b> = 180Â°. TriÃ¢ngulo: soma interna = 180Â°. QuadrilÃ¡tero: 360Â°.' };
});

const g_areaTri = () => Q(5, () => {
    const b = rand(2, 20), h = rand(2, 20);
    const c = (b * h) / 2;
    return { stem: `Ãrea de triÃ¢ngulo base <b>${b}</b> cm e altura <b>${h}</b> cm:`, ...makeChoice(`${c} cmÂ²`, nearDistr(c, 8).map(x => `${x} cmÂ²`)),
             explain: `Ãrea do triÃ¢ngulo = (base Ã— altura) Ã· 2. <b>(${b}Ã—${h})/2 = ${c} cmÂ²</b>. A altura Ã© sempre perpendicular Ã  base.` };
});

const g_areaPar = () => Q(5, () => {
    const b = rand(3, 20), h = rand(2, 15);
    const c = b * h;
    return { stem: `Ãrea de paralelogramo base ${b} altura ${h}:`, ...makeChoice(`${c} cmÂ²`, nearDistr(c, 10).map(x => `${x} cmÂ²`)),
             explain: `Ãrea do paralelogramo = base Ã— altura. <b>${b}Ã—${h} = ${c} cmÂ²</b>. AtenÃ§Ã£o: use a altura perpendicular, nÃ£o o lado inclinado!` };
});

const g_areaTrap = () => Q(5, () => {
    const B = rand(6, 15), b = rand(2, 5), h = rand(2, 10);
    const c = ((B + b) * h) / 2;
    return { stem: `Ãrea de trapÃ©zio (B=${B}, b=${b}, h=${h}):`, ...makeChoice(`${c} cmÂ²`, nearDistr(c, 8).map(x => `${x} cmÂ²`)),
             explain: `Ãrea do trapÃ©zio = (Base + base) Ã— altura Ã· 2. <b>(${B}+${b})Ã—${h}/2 = ${c} cmÂ²</b>.` };
});

const g_circle = () => Q(5, () => {
    const r = rand(2, 10);
    const items = [
        { s: `Comprimento do cÃ­rculo de raio ${r} cm (use Ï€=3,14):`, r: +(2 * 3.14 * r).toFixed(2) },
        { s: `Ãrea do cÃ­rculo de raio ${r} cm (use Ï€=3,14):`, r: +(3.14 * r * r).toFixed(2) },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, nearDistr(Math.round(it.r), 10).map(x => x.toString())),
             explain: 'CÃ­rculo: <b>CircunferÃªncia = 2Ï€r</b>. <b>Ãrea = Ï€rÂ²</b>. Use Ï€ â‰ˆ 3,14 nas contas.' };
});

/* â”€â”€ 8Âº ano â€” Templo das PotÃªncias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_power = () => Q(5, () => {
    const b = rand(2, 9), e = rand(2, 4);
    const c = Math.pow(b, e);
    const steps = Array.from({ length: e }, () => b).join(' Ã— ');
    return { stem: `<b>${b}<sup>${e}</sup></b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(5, c / 4))),
        explain: `PotenciaÃ§Ã£o: <b>${b}${e > 1 ? `<sup>${e}</sup>` : ''}</b> = ${steps} = <b>${c}</b>. O expoente indica quantas vezes a base Ã© multiplicada por ela mesma.` };
});

const g_powerProp = () => Q(5, () => {
    const items = [
        { s: 'aÂ³ Ã— aâµ = ?', r: 'aâ¸',   d: ['aÂ²', 'aÂ¹âµ', '2aâ¸'],   e: '<b>MultiplicaÃ§Ã£o de mesma base:</b> soma os expoentes. aÂ³ Ã— aâµ = a^(3+5) = <b>aâ¸</b>.' },
        { s: 'xâ· Ã· xÂ³ = ?', r: 'xâ´',   d: ['xÂ¹â°', 'xÂ²Â¹', 'x'],    e: '<b>DivisÃ£o de mesma base:</b> subtrai os expoentes. xâ· Ã· xÂ³ = x^(7âˆ’3) = <b>xâ´</b>.' },
        { s: '(aÂ²)Â³ = ?',   r: 'aâ¶',   d: ['aâµ', 'aÂ²Â³', 'a'],      e: '<b>PotÃªncia de potÃªncia:</b> multiplica os expoentes. (aÂ²)Â³ = a^(2Ã—3) = <b>aâ¶</b>.' },
        { s: 'xâ° = ?',      r: '1',     d: ['0', 'x', 'indefinido'], e: 'Qualquer base (exceto 0) elevada a <b>zero Ã© igual a 1</b>. xâ° = 1. Decorre da divisÃ£o: xâ¿ Ã· xâ¿ = xâ° = 1.' },
        { s: '2Â³ Ã— 2â´ = ?', r: '2â·',   d: ['2Â¹Â²', '4â·', '2Â¹'],    e: '<b>Mesma base:</b> soma os expoentes. 2Â³ Ã— 2â´ = 2^(3+4) = <b>2â·</b> = 128.' },
        { s: '(2Â³)Â² = ?',   r: '2â¶',   d: ['2âµ', '4Â³', '6'],       e: '<b>PotÃªncia de potÃªncia:</b> (2Â³)Â² = 2^(3Ã—2) = <b>2â¶</b> = 64. Nunca some os expoentes aqui!' },
        { s: 'aâ´ Ã— aÂ² = ?', r: 'aâ¶',   d: ['aâ¸', 'aÂ²', '2aâ¶'],    e: '<b>MultiplicaÃ§Ã£o de mesma base:</b> aâ´ Ã— aÂ² = a^(4+2) = <b>aâ¶</b>.' },
        { s: 'bâµ Ã· bÂ² = ?', r: 'bÂ³',   d: ['bâ·', 'bÂ¹â°', 'bÂ²Â·âµ'],  e: '<b>DivisÃ£o de mesma base:</b> bâµ Ã· bÂ² = b^(5âˆ’2) = <b>bÂ³</b>.' },
        { s: '(xÂ³)Â² = ?',   r: 'xâ¶',   d: ['xâµ', 'xâ¹', 'x'],      e: '<b>PotÃªncia de potÃªncia:</b> (xÂ³)Â² = x^(3Ã—2) = <b>xâ¶</b>.' },
        { s: '5â° = ?',      r: '1',     d: ['0', '5', '50'],         e: '<b>Expoente zero:</b> 5â° = 1. Regra geral: aâ° = 1 para qualquer a â‰  0.' },
        { s: '3Â² Ã— 3Â³ = ?', r: '3âµ',   d: ['3â¶', '9âµ', '3Â¹'],     e: '<b>Mesma base:</b> 3Â² Ã— 3Â³ = 3^(2+3) = <b>3âµ</b> = 243.' },
        { s: 'aâ»Â¹ = ?',     r: '1/a',  d: ['-a', '0', 'a'],         e: '<b>Expoente negativo:</b> aâ»Â¹ = 1/a. Generalizando: aâ»â¿ = 1/aâ¿. Ex: 2â»Â³ = 1/8.' },
        { s: '(ab)Â² = ?',   r: 'aÂ²bÂ²', d: ['abÂ²', 'aÂ²b', '2ab'],    e: '<b>PotÃªncia de produto:</b> (ab)Â² = aÂ²bÂ². Cada fator recebe o expoente individualmente.' },
        { s: '10â»Â² = ?',    r: '0,01', d: ['-100', '100', '-0,01'],  e: '10â»Â² = 1/10Â² = 1/100 = <b>0,01</b>. Expoente negativo na base 10 gera decimais.' },
        { s: 'aâµ Ã· aâµ = ?', r: '1',    d: ['0', 'a', 'aÂ¹â°'],        e: 'aâµ Ã· aâµ = a^(5âˆ’5) = aâ° = <b>1</b>. Qualquer nÃºmero dividido por si mesmo Ã© 1.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sciNotation = () => Q(5, () => {
    const items = [
        { s: '500 em notaÃ§Ã£o cientÃ­fica:', r: '5 Ã— 10Â²', d: ['5 Ã— 10Â³', '50 Ã— 10', '5,0 Ã— 10â»Â²'],
          e: 'NotaÃ§Ã£o cientÃ­fica: <b>a Ã— 10â¿</b> onde 1 â‰¤ a < 10. 500 = 5,00 Ã— 10Â² (vÃ­rgula andou 2 casas para a esquerda).' },
        { s: '3.000.000 em notaÃ§Ã£o cientÃ­fica:', r: '3 Ã— 10â¶', d: ['3 Ã— 10âµ', '30 Ã— 10âµ', '3 Ã— 10â·'],
          e: '3.000.000 = 3 Ã— 10â¶ (6 zeros = expoente 6). Muito usada em FÃ­sica (distÃ¢ncias astronÃ´micas, tamanho de Ã¡tomos).' },
        { s: '0,005 em notaÃ§Ã£o cientÃ­fica:', r: '5 Ã— 10â»Â³', d: ['5 Ã— 10Â³', '0,5 Ã— 10â»Â²', '5 Ã— 10â»Â²'],
          e: '0,005 = 5 Ã— 10â»Â³ (vÃ­rgula andou 3 casas para a direita â†’ expoente negativo).' },
        { s: '7,2 Ã— 10Â² = ?', r: '720', d: ['72', '7200', '0,72'],
          e: '7,2 Ã— 10Â² = 7,2 Ã— 100 = <b>720</b>. Expoente positivo â†’ desloque a vÃ­rgula para a direita.' },
        { s: '4,5 Ã— 10â»Â¹ = ?', r: '0,45', d: ['45', '4,5', '0,045'],
          e: '4,5 Ã— 10â»Â¹ = 4,5 Ã· 10 = <b>0,45</b>. Expoente negativo â†’ desloque a vÃ­rgula para a esquerda.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sqrt = () => Q(5, () => {
    const r = rand(2, 15);
    const n = r * r;
    return { stem: `<b>âˆš${n}</b> = ?`, ...makeChoice(r, nearDistr(r, 4)),
        explain: `Raiz quadrada: âˆš${n} = <b>${r}</b> porque ${r}Â² = ${n}. Para conferir: ${r} Ã— ${r} = ${n}. âœ“` };
});

const g_cubeRoot = () => Q(5, () => {
    const r = rand(2, 9);
    const n = r * r * r;
    return { stem: `<b>âˆ›${n}</b> = ?`, ...makeChoice(r, nearDistr(r, 3)),
             explain: `Raiz cÃºbica: <b>âˆ›${n} = ${r}</b> porque ${r}Â³ = ${r}Ã—${r}Ã—${r} = ${n}. Verifique sempre elevando ao cubo!` };
});

const g_sqrtAprox = () => Q(5, () => {
    const items = [
        { s: 'âˆš50 estÃ¡ entre:', r: '7 e 8', d: ['6 e 7', '8 e 9', '4 e 5'] },
        { s: 'âˆš30 estÃ¡ entre:', r: '5 e 6', d: ['4 e 5', '6 e 7', '3 e 4'] },
        { s: 'âˆš90 estÃ¡ entre:', r: '9 e 10', d: ['8 e 9', '10 e 11', '7 e 8'] },
        { s: 'âˆš20 estÃ¡ entre:', r: '4 e 5', d: ['3 e 4', '5 e 6', '6 e 7'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Para aproximar âˆšn: encontre os quadrados perfeitos vizinhos. Ex: âˆš50: como 7Â²=49 e 8Â²=64, âˆš50 estÃ¡ entre <b>7 e 8</b>.' };
});

const g_algebraVal = () => Q(5, () => {
    const x = rand(2, 6);
    const items = [
        { s: `2x + 3 (com x=${x})`, r: 2 * x + 3 },
        { s: `xÂ² âˆ’ 1 (com x=${x})`, r: x * x - 1 },
        { s: `3x âˆ’ 2 (com x=${x})`, r: 3 * x - 2 },
        { s: `xÂ² + x (com x=${x})`, r: x * x + x },
    ];
    const it = pick(items);
    return { stem: `Valor numÃ©rico de ${it.s}:`, ...makeChoice(it.r, nearDistr(it.r, 5)),
             explain: `Valor numÃ©rico: <b>substitua</b> x pelo valor dado e calcule. Siga a ordem das operaÃ§Ãµes (parÃªnteses, potÃªncias, Ã—Ã·, +âˆ’).` };
});

const g_monoSum = () => Q(5, () => {
    const items = [
        { s: '3x + 5x', r: '8x', d: ['15x', '8', '8xÂ²'] },
        { s: '7a âˆ’ 2a', r: '5a', d: ['9a', '5', '14a'] },
        { s: '2xÂ² + 5xÂ²', r: '7xÂ²', d: ['10xâ´', '7x', '7xâ´'] },
        { s: '4y + y', r: '5y', d: ['4yÂ²', '5', '4y + 1'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Some monÃ´mios <b>semelhantes</b> (mesma parte literal): some sÃ³ os coeficientes. Ex: 3x+5x=8x. NÃ£o some 3x+5xÂ² (letras diferentes)!' };
});

const g_monoMult = () => Q(5, () => {
    const items = [
        { s: '3x Â· 2x', r: '6xÂ²', d: ['5xÂ²', '6x', '5x'] },
        { s: '4a Â· 3b', r: '12ab', d: ['7ab', '12a', '12b'] },
        { s: '2xÂ² Â· 5x', r: '10xÂ³', d: ['7xÂ³', '10xÂ²', '10x'] },
        { s: '6y Â· yÂ²', r: '6yÂ³', d: ['6yÂ²', '7yÂ³', 'yâ¶'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'MultiplicaÃ§Ã£o de monÃ´mios: multiplique os coeficientes e <b>some os expoentes</b> das mesmas letras. Ex: 3xÂ·2x=6xÂ².' };
});

const EXPLAIN_SQ_PLUS  = 'Quadrado da soma: <b>(a+b)Â² = aÂ² + 2ab + bÂ²</b>. O erro mais comum Ã© esquecer o termo do meio <b>2ab</b>. Nunca escreva (a+b)Â² = aÂ²+bÂ²!';
const EXPLAIN_SQ_MINUS = 'Quadrado da diferenÃ§a: <b>(aâˆ’b)Â² = aÂ² âˆ’ 2ab + bÂ²</b>. AtenÃ§Ã£o: o Ãºltimo termo <b>+bÂ²</b> Ã© positivo! SÃ³ o termo do meio muda de sinal.';
const EXPLAIN_DIFF_SQ  = 'DiferenÃ§a de quadrados: <b>(a+b)(aâˆ’b) = aÂ² âˆ’ bÂ²</b>. ReconheÃ§a o padrÃ£o para fatorar rapidamente. Muito cobrado em vestibulares!';

const g_squarePlus = () => Q(5, () => {
    const items = [
        { s: '(a + b)Â² = ?', r: 'aÂ² + 2ab + bÂ²', d: ['aÂ² + bÂ²', 'aÂ² âˆ’ bÂ²', 'aÂ² + ab + bÂ²'] },
        { s: '(x + 3)Â² = ?', r: 'xÂ² + 6x + 9',   d: ['xÂ² + 9', 'xÂ² âˆ’ 6x + 9', 'xÂ² + 3x + 9'] },
        { s: '(2 + y)Â² = ?', r: 'yÂ² + 4y + 4',   d: ['yÂ² + 4', '2yÂ² + 4', '4 + yÂ²'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_SQ_PLUS };
});

const g_squareMinus = () => Q(5, () => {
    const items = [
        { s: '(a âˆ’ b)Â² = ?', r: 'aÂ² âˆ’ 2ab + bÂ²', d: ['aÂ² + bÂ²', 'aÂ² âˆ’ bÂ²', 'aÂ² + 2ab âˆ’ bÂ²'] },
        { s: '(x âˆ’ 2)Â² = ?', r: 'xÂ² âˆ’ 4x + 4',   d: ['xÂ² âˆ’ 4', 'xÂ² + 4x + 4', 'xÂ² âˆ’ 2x + 4'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_SQ_MINUS };
});

const g_diffSquares = () => Q(5, () => {
    const items = [
        { s: '(a + b)(a âˆ’ b) = ?', r: 'aÂ² âˆ’ bÂ²',  d: ['aÂ² + bÂ²', 'aÂ² + 2ab + bÂ²', '(a âˆ’ b)Â²'] },
        { s: '(x + 3)(x âˆ’ 3) = ?', r: 'xÂ² âˆ’ 9',   d: ['xÂ² + 9', 'xÂ² âˆ’ 6x + 9', 'xÂ² âˆ’ 6'] },
        { s: '(y + 5)(y âˆ’ 5) = ?', r: 'yÂ² âˆ’ 25',  d: ['yÂ² + 25', '(y âˆ’ 5)Â²', 'yÂ² âˆ’ 10'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_DIFF_SQ };
});

const g_factor = () => Q(5, () => {
    const items = [
        { s: 'Fatore: 2x + 4', r: '2(x + 2)', d: ['x(2 + 4)', '2x Â· 4', '(x + 2)(x + 2)'],
          e: '<b>EvidenciaÃ§Ã£o:</b> MDC(2x, 4) = 2. Coloque 2 em evidÃªncia: 2x+4 = <b>2(x+2)</b>. Confira expandindo: 2Â·x + 2Â·2 = 2x+4. âœ“' },
        { s: 'Fatore: 3xÂ² âˆ’ 6x', r: '3x(x âˆ’ 2)', d: ['3xÂ² âˆ’ 6x', 'x(3x âˆ’ 6)', '3(xÂ² âˆ’ 2)'],
          e: '<b>EvidenciaÃ§Ã£o:</b> MDC(3xÂ², 6x) = 3x. EntÃ£o 3xÂ²âˆ’6x = <b>3x(xâˆ’2)</b>. Sempre coloque o maior fator comum em evidÃªncia.' },
        { s: 'Fatore: 5a + 10', r: '5(a + 2)', d: ['(a + 2)(a + 5)', '5a Â· 2', 'a(5 + 10)'],
          e: '<b>EvidenciaÃ§Ã£o:</b> MDC(5a, 10) = 5. EntÃ£o 5a+10 = <b>5(a+2)</b>.' },
        { s: 'Fatore: xÂ² âˆ’ 9', r: '(x + 3)(x âˆ’ 3)', d: ['(x âˆ’ 3)Â²', '(x + 3)Â²', 'x(x âˆ’ 9)'],
          e: '<b>DiferenÃ§a de quadrados:</b> xÂ²âˆ’9 = xÂ²âˆ’3Â² = <b>(x+3)(xâˆ’3)</b>. ReconheÃ§a o padrÃ£o aÂ²âˆ’bÂ² = (a+b)(aâˆ’b).' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sysSubst = () => Q(5, () => {
    const items = [
        { s: '{ x + y = 7 ;  x âˆ’ y = 1 }', r: 'x=4, y=3', d: ['x=3, y=4', 'x=5, y=2', 'x=6, y=1'],
          e: '<b>MÃ©todo da adiÃ§Ã£o:</b> some as equaÃ§Ãµes: 2x = 8 â†’ x = 4. Substitua: 4+y=7 â†’ y=3.' },
        { s: '{ x + y = 10 ; x âˆ’ y = 4 }', r: 'x=7, y=3', d: ['x=3, y=7', 'x=6, y=4', 'x=5, y=5'],
          e: '<b>MÃ©todo da adiÃ§Ã£o:</b> some: 2x = 14 â†’ x = 7. Substitua: 7+y=10 â†’ y=3.' },
        { s: '{ 2x + y = 9 ; x + y = 5 }', r: 'x=4, y=1', d: ['x=1, y=4', 'x=3, y=2', 'x=2, y=3'],
          e: '<b>SubtraÃ§Ã£o:</b> subtraia a 2Âª da 1Âª: (2x+y)âˆ’(x+y) = 9âˆ’5 â†’ x=4. Substitua: 4+y=5 â†’ y=1.' },
    ];
    const it = pick(items);
    return { stem: `Sistema: ${it.s}`, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_thales = () => Q(5, () => {
    const items = [
        { s: '3/x = 6/8. x = ?', r: 4 }, { s: '5/10 = x/12. x = ?', r: 6 },
        { s: '4/x = 8/14. x = ?', r: 7 }, { s: '2/3 = x/9. x = ?', r: 6 },
    ];
    const it = pick(items);
    return { stem: `<b>Tales:</b> ${it.s}`, ...makeChoice(it.r, nearDistr(it.r, 4)),
             explain: '<b>Produto cruzado:</b> se a/b = c/x, entÃ£o aÂ·x = bÂ·c. Isole x dividindo. Muito usado em semelhanÃ§a de triÃ¢ngulos!' };
});

/* â”€â”€ 9Âº ano â€” Cidadela do Mestre â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_funcAfim = () => Q(5, () => {
    const items = [
        { s: 'Em f(x) = 2x + 3, qual o coeficiente angular?', r: 2, d: [3, 5, -2],
          e: 'Em <b>f(x) = ax + b</b>: <b>a</b> Ã© o coeficiente angular (taxa de variaÃ§Ã£o, inclinaÃ§Ã£o da reta). Aqui a=<b>2</b>, b=3.' },
        { s: 'Em f(x) = 2x + 3, qual o coeficiente linear?', r: 3, d: [2, -3, 0],
          e: 'Em <b>f(x) = ax + b</b>: <b>b</b> Ã© o coeficiente linear (valor de f quando x=0, onde a reta cruza o eixo y). Aqui b=<b>3</b>.' },
        { s: 'f(x) = 3x âˆ’ 6. f(0) = ?', r: -6, d: [0, 3, 6],
          e: 'Substitua x=0: f(0) = 3(0)âˆ’6 = <b>âˆ’6</b>. Este Ã© o coeficiente linear â€” o ponto onde a reta toca o eixo y.' },
        { s: 'f(x) = 3x âˆ’ 6. f(2) = ?', r: 0, d: [6, -6, 12],
          e: 'Substitua x=2: f(2) = 3(2)âˆ’6 = 6âˆ’6 = <b>0</b>. Quando f(x)=0, x=2 Ã© a raiz (zero) da funÃ§Ã£o afim.' },
        { s: 'A funÃ§Ã£o afim tem a forma:', r: 'f(x) = ax + b', d: ['f(x) = axÂ²', 'f(x) = a/x', 'f(x) = aË£'],
          e: 'FunÃ§Ã£o afim: <b>f(x) = ax + b</b> (grau 1, grÃ¡fico Ã© reta). NÃ£o confunda com quadrÃ¡tica (axÂ²), inversa (a/x) ou exponencial (aË£).' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_funcRoot = () => Q(5, () => {
    const a = rand(1, 6), b = rand(2, 20);
    const r = b / a;
    if (b % a !== 0) return { stem: `Raiz de f(x) = ${a}x âˆ’ ${a * 3}`, ...makeChoice(3, [0, a === 3 ? 6 : a, a === -3 ? -6 : -3]) };
    return { stem: `Raiz de f(x) = ${a}x âˆ’ ${b}`, ...makeChoice(r, nearDistr(r, 4)) };
});

const EXPLAIN_FUNC_GRAPH = 'GrÃ¡fico de <b>f(x) = ax + b</b> Ã© sempre uma <b>reta</b>. Se a>0 â†’ crescente (sobe da esquerda para direita). Se a<0 â†’ decrescente. Se a=0 â†’ reta horizontal. O grÃ¡fico corta o eixo y no ponto (0, b).';
const g_funcGraph = () => Q(5, () => {
    const items = [
        { s: 'GrÃ¡fico de funÃ§Ã£o afim Ã©:',          r: 'uma reta',   d: ['parÃ¡bola', 'hipÃ©rbole', 'circunferÃªncia'] },
        { s: 'Quando a > 0, f(x) = ax + b Ã©:',     r: 'crescente',  d: ['decrescente', 'constante', 'oscilante'] },
        { s: 'Quando a < 0, f(x) = ax + b Ã©:',     r: 'decrescente', d: ['crescente', 'constante', 'paralela ao eixo x'] },
        { s: 'A reta passa pelo eixo y no ponto:',  r: '(0, b)',     d: ['(b, 0)', '(0, 0)', '(a, b)'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_FUNC_GRAPH };
});

const g_bhaskaraDelta = () => Q(5, () => {
    const items = [
        { s: 'xÂ² âˆ’ 5x + 6 = 0. Î” = ?', r: 1, d: [25, -1, 11],
          e: '<b>Î” = bÂ²âˆ’4ac</b> com a=1, b=âˆ’5, c=6: Î” = 25âˆ’24 = <b>1</b>. Como Î”>0, hÃ¡ duas raÃ­zes reais distintas.' },
        { s: 'xÂ² + 2x âˆ’ 3 = 0. Î” = ?', r: 16, d: [4, -8, 12],
          e: 'a=1, b=2, c=âˆ’3: <b>Î” = 4âˆ’4(1)(âˆ’3) = 4+12 = 16</b>. âˆš16=4, logo as raÃ­zes sÃ£o racionais.' },
        { s: '2xÂ² + 3x âˆ’ 2 = 0. Î” = ?', r: 25, d: [9, -7, 17],
          e: 'a=2, b=3, c=âˆ’2: <b>Î” = 9âˆ’4(2)(âˆ’2) = 9+16 = 25</b>. âˆš25=5, raÃ­zes racionais.' },
        { s: 'xÂ² âˆ’ 4x + 4 = 0. Î” = ?', r: 0, d: [16, -16, 8],
          e: 'a=1, b=âˆ’4, c=4: <b>Î” = 16âˆ’16 = 0</b>. Quando Î”=0, hÃ¡ exatamente <b>uma raiz real</b> (raiz dupla): x = âˆ’b/2a = 2.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_bhaskaraRoots = () => Q(5, () => {
    const items = [
        { s: 'xÂ² âˆ’ 5x + 6 = 0. RaÃ­zes?', r: '2 e 3', d: ['1 e 6', 'âˆ’2 e âˆ’3', '5 e 6'],
          e: 'Î” = 25âˆ’24 = 1. <b>x = (5Â±1)/2</b> â†’ xâ‚=3, xâ‚‚=2. VerificaÃ§Ã£o: soma = 5 = âˆ’b/a âœ“  produto = 6 = c/a âœ“' },
        { s: 'xÂ² âˆ’ 7x + 12 = 0. RaÃ­zes?', r: '3 e 4', d: ['2 e 6', '1 e 12', 'âˆ’3 e âˆ’4'],
          e: 'Î” = 49âˆ’48 = 1. <b>x = (7Â±1)/2</b> â†’ xâ‚=4, xâ‚‚=3. Soma=7=âˆ’(âˆ’7), produto=12. RelaÃ§Ãµes de Girard!' },
        { s: 'xÂ² + x âˆ’ 6 = 0. RaÃ­zes?', r: '2 e âˆ’3', d: ['âˆ’2 e 3', '1 e âˆ’6', '6 e âˆ’1'],
          e: 'a=1, b=1, c=âˆ’6. Î” = 1+24 = 25. <b>x = (âˆ’1Â±5)/2</b> â†’ xâ‚=2, xâ‚‚=âˆ’3. Note: b=+1, entÃ£o âˆ’b=âˆ’1!' },
        { s: 'xÂ² âˆ’ 9 = 0. RaÃ­zes?', r: '3 e âˆ’3', d: ['9 e âˆ’9', '3 e 9', '0 e 9'],
          e: 'ReconheÃ§a: <b>diferenÃ§a de quadrados!</b> xÂ²âˆ’9 = (x+3)(xâˆ’3)=0. Logo x=3 ou x=âˆ’3. Mais rÃ¡pido que Bhaskara!' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sumProd = () => Q(5, () => {
    const items = [
        { s: 'xÂ² âˆ’ 5x + 6 = 0. Soma das raÃ­zes?', r: 5, d: [-5, 6, 1],
          e: '<b>Soma = âˆ’b/a</b> = âˆ’(âˆ’5)/1 = <b>5</b>. Confirme: raÃ­zes sÃ£o 2 e 3, soma = 5. âœ“' },
        { s: 'xÂ² âˆ’ 5x + 6 = 0. Produto das raÃ­zes?', r: 6, d: [5, -6, 1],
          e: '<b>Produto = c/a</b> = 6/1 = <b>6</b>. Confirme: raÃ­zes 2 e 3, produto = 6. âœ“ RelaÃ§Ãµes de Girard!' },
        { s: 'xÂ² + 3x âˆ’ 10 = 0. Soma?', r: -3, d: [3, -10, 10],
          e: 'a=1, b=3, c=âˆ’10. <b>Soma = âˆ’b/a = âˆ’3/1 = âˆ’3</b>. RaÃ­zes: x=2 e x=âˆ’5, soma=âˆ’3. âœ“' },
        { s: 'Soma = âˆ’b/a, produto = c/a. Em xÂ²+2xâˆ’8: soma?', r: -2, d: [2, -8, 8],
          e: 'a=1, b=2, c=âˆ’8. <b>Soma = âˆ’2/1 = âˆ’2</b>. Produto = âˆ’8. RaÃ­zes: x=2 e x=âˆ’4, soma=âˆ’2. âœ“' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_vertex = () => Q(5, () => {
    const items = [
        { s: 'f(x) = xÂ² âˆ’ 4x + 3. xáµ¥ = ?', r: 2, d: [-2, 4, 3],
          e: 'VÃ©rtice: <b>xáµ¥ = âˆ’b/(2a)</b> = âˆ’(âˆ’4)/(2Â·1) = 4/2 = <b>2</b>. Com a>0, Ã© o ponto de mÃ­nimo da parÃ¡bola.' },
        { s: 'f(x) = xÂ² âˆ’ 6x + 5. xáµ¥ = ?', r: 3, d: [-3, 6, 5],
          e: '<b>xáµ¥ = âˆ’b/(2a)</b> = âˆ’(âˆ’6)/(2Â·1) = <b>3</b>. A parÃ¡bola tem mÃ­nimo em x=3, pois a=1>0.' },
        { s: 'f(x) = 2xÂ² âˆ’ 4x. xáµ¥ = ?', r: 1, d: [-1, 2, 0],
          e: 'a=2, b=âˆ’4, c=0. <b>xáµ¥ = âˆ’(âˆ’4)/(2Â·2) = 4/4 = 1</b>. A parÃ¡bola abre para cima (a>0) com mÃ­nimo em x=1.' },
        { s: 'VÃ©rtice da parÃ¡bola: xáµ¥ = ?', r: 'âˆ’b/(2a)', d: ['âˆ’b/a', 'b/(2a)', 'âˆ’c/a'],
          e: 'FÃ³rmula do vÃ©rtice: <b>xáµ¥ = âˆ’b/(2a)</b>. O yáµ¥ = f(xáµ¥) = âˆ’Î”/(4a). O vÃ©rtice Ã© mÃ¡ximo se a<0 e mÃ­nimo se a>0.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_pythCat = () => Q(5, () => {
    const items = [
        [3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25],
    ];
    const [a, b, c] = pick(items);
    const role = pick(['hip', 'catA', 'catB']);
    if (role === 'hip') return { stem: `Catetos ${a} e ${b}. Hipotenusa?`, ...makeChoice(c, nearDistr(c, 5)),
        explain: `<b>PitÃ¡goras: cÂ² = aÂ² + bÂ²</b> = ${a}Â² + ${b}Â² = ${a*a} + ${b*b} = ${c*c}. EntÃ£o c = âˆš${c*c} = <b>${c}</b>. Terna pitagÃ³rica: (${a}, ${b}, ${c}).` };
    if (role === 'catA') return { stem: `Hipotenusa ${c}, um cateto ${b}. Outro cateto?`, ...makeChoice(a, nearDistr(a, 4)),
        explain: `<b>PitÃ¡goras: aÂ² = cÂ² âˆ’ bÂ²</b> = ${c}Â² âˆ’ ${b}Â² = ${c*c} âˆ’ ${b*b} = ${a*a}. EntÃ£o a = âˆš${a*a} = <b>${a}</b>.` };
    return { stem: `Hipotenusa ${c}, um cateto ${a}. Outro cateto?`, ...makeChoice(b, nearDistr(b, 5)),
        explain: `<b>PitÃ¡goras: bÂ² = cÂ² âˆ’ aÂ²</b> = ${c}Â² âˆ’ ${a}Â² = ${c*c} âˆ’ ${a*a} = ${b*b}. EntÃ£o b = âˆš${b*b} = <b>${b}</b>.` };
});

const EXPLAIN_TRIG_TABLE = 'Tabela notÃ¡vel: <b>30Â°â†’1/2 | 45Â°â†’âˆš2/2 | 60Â°â†’âˆš3/2</b> (para seno). Coseno usa a mesma tabela mas invertida (cos30Â°=sen60Â°=âˆš3/2). MnemÃ´nico: <b>1, âˆš2, âˆš3</b> divididos por 2.';
const EXPLAIN_TRIG_ID = '<b>Identidade fundamental:</b> senÂ²x + cosÂ²x = 1 (para qualquer x). Decorre do Teorema de PitÃ¡goras no cÃ­rculo trigonomÃ©trico de raio 1.';
const g_trigSpecial = () => Q(5, () => {
    const items = [
        { s: 'sen 30Â° = ?', r: '1/2',   d: ['âˆš3/2', 'âˆš2/2', '1'],    e: EXPLAIN_TRIG_TABLE },
        { s: 'cos 60Â° = ?', r: '1/2',   d: ['âˆš3/2', 'âˆš2/2', '1'],    e: EXPLAIN_TRIG_TABLE },
        { s: 'sen 45Â° = ?', r: 'âˆš2/2',  d: ['1/2', 'âˆš3/2', '1'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'cos 30Â° = ?', r: 'âˆš3/2',  d: ['1/2', 'âˆš2/2', '0'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'tg 45Â° = ?',  r: '1',     d: ['0', 'âˆš2', 'âˆš3'],         e: 'tg 45Â° = sen45Â°/cos45Â° = (âˆš2/2)/(âˆš2/2) = <b>1</b>. A tangente de 45Â° Ã© 1 porque os catetos sÃ£o iguais.' },
        { s: 'sen 90Â° = ?', r: '1',     d: ['0', '1/2', 'âˆš3/2'],      e: 'sen 90Â° = <b>1</b> (mÃ¡ximo). cos 90Â° = 0. No cÃ­rculo trig, o ponto Ã© (0, 1).' },
        { s: 'cos 0Â° = ?',  r: '1',     d: ['0', '1/2', 'âˆš2/2'],      e: 'cos 0Â° = <b>1</b>. No cÃ­rculo trigonomÃ©trico, o Ã¢ngulo 0Â° corresponde ao ponto (1, 0).' },
        { s: 'sen 0Â° = ?',  r: '0',     d: ['1', '1/2', 'âˆš2/2'],      e: 'sen 0Â° = <b>0</b>. O seno de 0Â° Ã© zero porque a altura no cÃ­rculo trigonomÃ©trico Ã© nula.' },
        { s: 'cos 90Â° = ?', r: '0',     d: ['1', '1/2', 'âˆš3/2'],      e: 'cos 90Â° = <b>0</b>. No cÃ­rculo trig, 90Â° â†’ ponto (0, 1), entÃ£o a projeÃ§Ã£o horizontal Ã© zero.' },
        { s: 'cos 45Â° = ?', r: 'âˆš2/2',  d: ['1/2', 'âˆš3/2', '1'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'sen 60Â° = ?', r: 'âˆš3/2',  d: ['1/2', 'âˆš2/2', '1'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'tg 30Â° = ?',  r: 'âˆš3/3',  d: ['1/2', 'âˆš3', 'âˆš3/2'],    e: 'tg 30Â° = sen30Â°/cos30Â° = (1/2)/(âˆš3/2) = 1/âˆš3 = <b>âˆš3/3</b> (racionalizando o denominador).' },
        { s: 'tg 60Â° = ?',  r: 'âˆš3',    d: ['1/2', 'âˆš3/2', '1'],     e: 'tg 60Â° = sen60Â°/cos60Â° = (âˆš3/2)/(1/2) = <b>âˆš3</b> â‰ˆ 1,73.' },
        { s: 'senÂ²x + cosÂ²x = ?', r: '1', d: ['0', 'x', '2'],        e: EXPLAIN_TRIG_ID },
        { s: 'tg x = sen x / ?', r: 'cos x', d: ['sen x', '1', 'x'], e: 'DefiniÃ§Ã£o: <b>tg x = sen x / cos x</b>. DaÃ­ derivam outras identidades como 1 + tgÂ²x = secÂ²x.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_similar = () => Q(5, () => {
    const items = [
        { s: 'TriÃ¢ngulos semelhantes tÃªm lados ___:', r: 'proporcionais', d: ['iguais', 'perpendiculares', 'paralelos'],
          e: 'SemelhanÃ§a: mesmos Ã¢ngulos e lados <b>proporcionais</b> (nÃ£o iguais). CongruÃªncia exige lados iguais. Semelhante â‰  congruente!' },
        { s: 'RazÃ£o de semelhanÃ§a 1:2. Ãreas?', r: '1:4', d: ['1:2', '2:1', '1:8'],
          e: 'RazÃ£o de semelhanÃ§a k â†’ razÃ£o de Ã¡reas = <b>kÂ²</b>. Se k=1/2, Ã¡rea = (1/2)Â² = <b>1:4</b>. Dobrar o lado quadruplica a Ã¡rea!' },
        { s: 'RazÃ£o de semelhanÃ§a 2:3. Ãreas?', r: '4:9', d: ['2:3', '6:9', '8:27'],
          e: 'k = 2/3 â†’ razÃ£o de Ã¡reas = kÂ² = <b>(2/3)Â² = 4/9</b>. Para volumes, seria kÂ³ = 8/27.' },
        { s: 'TriÃ¢ngulos semelhantes tÃªm Ã¢ngulos ___:', r: 'iguais', d: ['proporcionais', 'opostos', 'retos'],
          e: 'CritÃ©rio AA (Ã¢ngulo-Ã¢ngulo): basta dois Ã¢ngulos iguais para garantir semelhanÃ§a. Os Ã¢ngulos sÃ£o sempre <b>iguais</b>, os lados Ã© que sÃ£o proporcionais.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_polygon = () => Q(5, () => {
    const items = [
        { s: 'Ã‚ngulo interno do triÃ¢ngulo equilÃ¡tero:', r: '60Â°', d: ['90Â°', '120Â°', '180Â°'] },
        { s: 'Ã‚ngulo interno do quadrado:', r: '90Â°', d: ['60Â°', '120Â°', '180Â°'] },
        { s: 'Ã‚ngulo interno do hexÃ¡gono regular:', r: '120Â°', d: ['60Â°', '90Â°', '150Â°'] },
        { s: 'Soma dos Ã¢ngulos internos do pentÃ¡gono:', r: '540Â°', d: ['360Â°', '720Â°', '180Â°'] },
        { s: 'Soma dos internos: (nâˆ’2)Â·180Â°. n=8?', r: '1080Â°', d: ['900Â°', '1260Â°', '720Â°'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_probComp = () => Q(5, () => {
    const items = [
        { s: 'Duas moedas. Probabilidade de duas caras?', r: '1/4', d: ['1/2', '1/3', '2/4'] },
        { s: 'Dois dados. Probabilidade de soma 7?', r: '1/6', d: ['1/7', '2/6', '1/12'] },
        { s: 'Tirar 2 ases num baralho (sem reposiÃ§Ã£o):', r: '1/221', d: ['1/52', '1/13', '1/26'] },
        { s: 'Eventos independentes: P(A e B) =', r: 'P(A) Â· P(B)', d: ['P(A) + P(B)', 'P(A) âˆ’ P(B)', '1'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_stats = () => Q(5, () => {
    const items = [
        { s: 'Dados: 2, 4, 4, 6, 8. MÃ©dia?', r: '4,8', d: ['4', '5', '6'] },
        { s: 'Dados: 2, 4, 4, 6, 8. Mediana?', r: '4', d: ['4,8', '6', '2'] },
        { s: 'Dados: 2, 4, 4, 6, 8. Moda?', r: '4', d: ['4,8', '6', 'nÃ£o hÃ¡'] },
        { s: 'Dados: 1, 3, 5, 7, 9. Mediana?', r: '5', d: ['4', '6', '3'] },
        { s: 'Dados: 10, 20, 30. MÃ©dia?', r: '20', d: ['15', '30', '60'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_irrational = () => Q(5, () => {
    const items = [
        { s: 'âˆšx = 5. x = ?', r: 25, d: [5, 10, 125] },
        { s: 'âˆš(x + 1) = 3. x = ?', r: 8, d: [9, 2, 3] },
        { s: 'âˆš(2x) = 4. x = ?', r: 8, d: [4, 16, 2] },
        { s: 'âˆš(x âˆ’ 5) = 2. x = ?', r: 9, d: [4, 7, 3] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_master = () => () => {
    // mix de tudo
    const pool = [g_pythCat(), g_bhaskaraRoots(), g_funcAfim(), g_trigSpecial(), g_sysSubst(), g_diffSquares(), g_percentApply(), g_areaTri(), g_power(), g_eq2sides()];
    const qs = pool.flatMap(g => g()).sort(() => Math.random() - 0.5).slice(0, 8);
    return qs;
};

/* â”€â”€ 10 â€” Arena do Vestibular â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const g_progressAritm = () => Q(5, () => {
    const a1 = rand(2, 20), r = rand(2, 10);
    const n  = rand(5, 15);
    const an = a1 + (n - 1) * r;
    const sn = n * (a1 + an) / 2;
    const items = [
        { s: `PA: aâ‚=${a1}, r=${r}. Qual Ã© o ${n}Âº termo?`, ans: an, d: nearDistr(an, 8) },
        { s: `PA: aâ‚=${a1}, r=${r}, n=${n}. Qual Ã© a soma Sâ‚™?`, ans: sn, d: nearDistr(sn, 20) },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.ans, it.d),
        explain: `<b>PA (ProgressÃ£o AritmÃ©tica):</b> aâ‚™ = aâ‚ + (nâˆ’1)Â·r. Sâ‚™ = nÂ·(aâ‚+aâ‚™)/2. Aqui: a${n} = ${a1}+(${n}-1)Â·${r} = <b>${an}</b>.` };
});

const g_progressGeom = () => Q(5, () => {
    const a1 = pick([2, 3, 4, 5, 6]);
    const q  = pick([2, 3]);
    const n  = rand(3, 6);
    const an = a1 * Math.pow(q, n - 1);
    return { stem: `PG: aâ‚=${a1}, q=${q}. Qual Ã© o ${n}Âº termo?`,
             ...makeChoice(an, nearDistr(an, Math.max(5, an / 4))),
        explain: `<b>PG (ProgressÃ£o GeomÃ©trica):</b> aâ‚™ = aâ‚Â·qâ¿â»Â¹. Aqui: a${n} = ${a1}Â·${q}^${n-1} = <b>${an}</b>.` };
});

const g_logBasic = () => Q(5, () => {
    const bases = [[2,8,3],[2,16,4],[2,32,5],[3,9,2],[3,27,3],[10,100,2],[10,1000,3],[5,25,2],[5,125,3]];
    const [b, x, r] = pick(bases);
    return { stem: `log<sub>${b}</sub>${x} = ?`,
             ...makeChoice(r, nearDistr(r, 2)),
        explain: `Logaritmo: log<sub>${b}</sub>${x} = <b>${r}</b> porque ${b}<sup>${r}</sup> = ${x}. Logaritmo Ã© o <b>expoente</b> que a base precisa ter para resultar no logaritmando.` };
});

const g_logProp = () => Q(5, () => {
    const items = [
        { s: 'log(aÂ·b) = ?', r: 'log a + log b', d: ['log a âˆ’ log b', 'log a Â· log b', 'log(a+b)'],
          e: '<b>Produto:</b> log(aÂ·b) = log a + log b. Logaritmo transforma multiplicaÃ§Ã£o em soma!' },
        { s: 'log(a/b) = ?', r: 'log a âˆ’ log b', d: ['log a + log b', 'log b âˆ’ log a', 'log a / log b'],
          e: '<b>Quociente:</b> log(a/b) = log a âˆ’ log b.' },
        { s: 'log(aâ¿) = ?', r: 'n Â· log a', d: ['log a + n', 'log(na)', 'log a / n'],
          e: '<b>PotÃªncia:</b> log(aâ¿) = n Â· log a. O expoente vira fator multiplicativo!' },
        { s: 'logâ‚â‚€ 1 = ?', r: '0', d: ['1', '10', '-1'],
          e: 'log de 1 em qualquer base = <b>0</b>, pois aâ° = 1 para qualquer base a.' },
        { s: 'logâ‚‚ 2 = ?', r: '1', d: ['0', '2', '4'],
          e: 'logâ‚ a = <b>1</b> sempre, pois aÂ¹ = a.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_combinatoria = () => Q(5, () => {
    const items = [
        { s: 'C(5,2) = ?', r: 10, d: [20, 6, 15],
          e: 'CombinaÃ§Ã£o: C(n,k) = n!/(k!Â·(n-k)!). C(5,2) = 5!/(2!Â·3!) = 120/12 = <b>10</b>.' },
        { s: 'C(6,3) = ?', r: 20, d: [15, 30, 6],
          e: 'C(6,3) = 6!/(3!Â·3!) = 720/36 = <b>20</b>. NÃºmero de grupos de 3 em 6 elementos.' },
        { s: 'P(4) = 4! = ?', r: 24, d: [12, 16, 20],
          e: 'PermutaÃ§Ã£o simples: P(n) = n! = nÃ—(n-1)Ã—...Ã—1. P(4) = 4Ã—3Ã—2Ã—1 = <b>24</b>.' },
        { s: 'A(5,2) = ?', r: 20, d: [10, 25, 15],
          e: 'Arranjo: A(n,k) = n!/(n-k)!. A(5,2) = 5Ã—4 = <b>20</b>. Ordem importa!' },
        { s: 'C(7,7) = ?', r: 1, d: [7, 0, 49],
          e: 'C(n,n) = 1 sempre â€” sÃ³ existe <b>um jeito</b> de escolher todos.' },
        { s: 'C(10,1) = ?', r: 10, d: [1, 9, 100],
          e: 'C(n,1) = n. HÃ¡ <b>n</b> jeitos de escolher 1 elemento de n.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_probCondicional = () => Q(5, () => {
    const items = [
        { s: 'Uma urna tem 5 bolas (3 vermelhas, 2 azuis). Retira-se 1 vermelha (sem repor). Prob. de sair azul na 2Âª?',
          r: '2/4', d: ['2/5', '1/2', '1/3'],
          e: 'Sem reposiÃ§Ã£o: restam 4 bolas (2V, 2A). P(azul) = 2/4 = <b>1/2</b>. Probabilidade condicional muda o espaÃ§o amostral!' },
        { s: 'Dois dados lanÃ§ados. P(soma = 7) = ?', r: '6/36', d: ['7/36', '1/6', '5/36'],
          e: 'Pares que somam 7: (1,6)(2,5)(3,4)(4,3)(5,2)(6,1) = 6 casos. P = 6/36 = <b>1/6</b>.' },
        { s: 'Baralho 52 cartas. P(Ã¡s ou copas) = ?', r: '16/52', d: ['17/52', '1/4', '4/52'],
          e: 'P(Ã¡s âˆª copas) = P(Ã¡s) + P(copas) âˆ’ P(Ã¡s de copas) = 4/52 + 13/52 âˆ’ 1/52 = <b>16/52</b>.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_geometriaAnalitica = () => Q(5, () => {
    const x1 = rand(-5, 5), y1 = rand(-5, 5), x2 = rand(-5, 5), y2 = rand(-5, 5);
    const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    const distRound = Math.round(dist * 10) / 10;
    const items = [
        { s: `DistÃ¢ncia entre (${x1},${y1}) e (${x2},${y2}):`,
          ans: distRound,
          d: (() => { const raw = nearDistr(Math.round(distRound), 3).map(x => Math.abs(x) || 1); const seen8 = new Set([String(distRound)]); const u8 = []; for (const v of raw) { if (!seen8.has(String(v))) { seen8.add(String(v)); u8.push(v); } } let i8 = 1; while (u8.length < 3) { if (!seen8.has(String(i8))) { seen8.add(String(i8)); u8.push(i8); } i8++; } return u8; })(),
          e: `d = âˆš[(${x2}âˆ’${x1})Â² + (${y2}âˆ’${y1})Â²] = âˆš[${(x2-x1)**2}+${(y2-y1)**2}] â‰ˆ <b>${distRound}</b>. Teorema de PitÃ¡goras no plano!` },
        { s: `Ponto mÃ©dio de (${x1},${y1}) e (${x2},${y2}):`,
          ans: `(${(x1+x2)/2}, ${(y1+y2)/2})`,
          d: (() => { const ans8b = `(${(x1+x2)/2}, ${(y1+y2)/2})`; const c8b = [`(${x1+x2}, ${y1+y2})`, `(${(x1-x2)/2}, ${(y1-y2)/2})`, `(${x1}, ${y2})`]; const s8b = new Set([ans8b]); const u8b = c8b.filter(c => !s8b.has(c) && s8b.add(c)); let i8b = 1; while (u8b.length < 3) { const candidate = `(${x1+i8b}, ${y1-i8b})`; if (!s8b.has(candidate)) { s8b.add(candidate); u8b.push(candidate); } i8b++; } return u8b.slice(0,3); })(),
          e: `Ponto mÃ©dio: M = ((xâ‚+xâ‚‚)/2, (yâ‚+yâ‚‚)/2) = <b>(${(x1+x2)/2}, ${(y1+y2)/2})</b>.` },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.ans, it.d), explain: it.e };
});

const g_trigAvancado = () => Q(5, () => {
    const items = [
        { s: 'senÂ²x + cosÂ²x = ?', r: '1', d: ['0', '2', 'tg x'],
          e: '<b>Identidade fundamental:</b> senÂ²x + cosÂ²x = 1. Decorre do Teorema de PitÃ¡goras no cÃ­rculo trigonomÃ©trico.' },
        { s: 'tg x = ?', r: 'sen x / cos x', d: ['cos x / sen x', 'sen x Â· cos x', '1/cos x'],
          e: 'Tangente: tg x = sen x / cos x. Coeficiente angular da reta tangente ao cÃ­rculo.' },
        { s: 'sen(30Â°) = ?', r: '1/2', d: ['âˆš2/2', 'âˆš3/2', '1'],
          e: 'Valores especiais: sen 30Â° = 1/2, sen 45Â° = âˆš2/2, sen 60Â° = âˆš3/2.' },
        { s: 'cos(60Â°) = ?', r: '1/2', d: ['âˆš3/2', 'âˆš2/2', '0'],
          e: 'cos 60Â° = 1/2. Lembre: cos 30Â° = âˆš3/2, cos 45Â° = âˆš2/2, cos 90Â° = 0.' },
        { s: 'A lei dos senos diz que a/sen A = ?', r: 'b/sen B = c/sen C', d: ['bÂ·sen B', 'c/cos C', 'R'],
          e: '<b>Lei dos senos:</b> a/senA = b/senB = c/senC = 2R (R = raio da circunferÃªncia circunscrita).' },
        { s: 'sen(Ï€/2) = ?', r: '1', d: ['0', 'âˆš2/2', '-1'],
          e: 'sen(Ï€/2) = sen(90Â°) = <b>1</b>. No cÃ­rculo trigonomÃ©trico, 90Â° aponta para cima (y=1).' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_matrizBasica = () => Q(5, () => {
    const items = [
        { s: 'Determinante de [[1,2],[3,4]]:', r: -2, d: [2, 10, 14],
          e: 'det[[a,b],[c,d]] = ad âˆ’ bc = 1Ã—4 âˆ’ 2Ã—3 = 4 âˆ’ 6 = <b>âˆ’2</b>.' },
        { s: 'Determinante de [[2,0],[0,3]]:', r: 6, d: [5, 0, -6],
          e: 'Matriz diagonal: determinante = produto da diagonal. 2Ã—3 = <b>6</b>.' },
        { s: 'Determinante de [[1,0],[0,1]] (identidade):', r: 1, d: [0, 2, -1],
          e: 'Matriz identidade sempre tem det = <b>1</b>.' },
        { s: 'Uma matriz 2Ã—3 tem quantos elementos?', r: 6, d: [5, 8, 2],
          e: 'Elementos = linhas Ã— colunas = 2Ã—3 = <b>6</b>.' },
        { s: 'Matriz transposta de [[1,2],[3,4]] Ã©:', r: '[[1,3],[2,4]]', d: ['[[4,2],[3,1]]', '[[1,2],[3,4]]', '[[3,1],[4,2]]'],
          e: '<b>Transposta:</b> troca linhas por colunas. (Aáµ€)áµ¢â±¼ = Aâ±¼áµ¢.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_funcExponencial = () => Q(5, () => {
    const items = [
        { s: '2Ë£ = 8. x = ?', r: 3, d: [2, 4, 6],
          e: '2Ë£ = 8 = 2Â³ â†’ mesma base, iguale os expoentes: <b>x = 3</b>.' },
        { s: '3Ë£ = 27. x = ?', r: 3, d: [2, 9, 4],
          e: '3Ë£ = 27 = 3Â³ â†’ <b>x = 3</b>.' },
        { s: 'f(x) = 2Ë£. f(0) = ?', r: 1, d: [0, 2, -1],
          e: 'f(0) = 2â° = <b>1</b>. Toda exponencial passa por (0,1).' },
        { s: 'FunÃ§Ã£o exponencial crescente quando base:', r: 'maior que 1', d: ['menor que 1', 'igual a 1', 'negativa'],
          e: 'Base > 1 â†’ crescente. 0 < base < 1 â†’ decrescente. Base = 1 â†’ constante.' },
        { s: '5Ë£ = 1. x = ?', r: 0, d: [1, 5, -1],
          e: '5Ë£ = 1 = 5â° â†’ <b>x = 0</b>. Qualquer base elevada a 0 Ã© 1.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_geometriaEspacial = () => Q(5, () => {
    const items = [
        () => { const l = rand(2,8); const v = l*l*l; return { s: `Volume de cubo de aresta ${l} cm:`, r: `${v} cmÂ³`, d: nearDistr(v,15).map(x=>`${x} cmÂ³`) }; },
        () => { const r2 = rand(2,8), h = rand(3,10); const v = Math.round(3.14*r2*r2*h); return { s: `Volume do cilindro r=${r2}, h=${h} (Ï€â‰ˆ3,14):`, r: `${v} cmÂ³`, d: nearDistr(v,30).map(x=>`${x} cmÂ³`) }; },
        () => { const r2 = rand(2,6); const v = Math.round(4/3*3.14*r2**3); return { s: `Volume da esfera de raio ${r2} (Ï€â‰ˆ3,14):`, r: `${v} cmÂ³`, d: nearDistr(v,40).map(x=>`${x} cmÂ³`) }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, it.d),
        explain: 'SÃ³lidos: Cubo V=aÂ³ Â· Cilindro V=Ï€rÂ²h Â· Esfera V=4Ï€rÂ³/3 Â· Cone V=Ï€rÂ²h/3. ENEM adora esses!' };
});

const g_enunciado = () => Q(5, () => {
    const items = [
        { s: '(ENEM) Uma torneira perde 1 gota a cada 5s. Cada gota = 0,05 mL. Litros desperdiÃ§ados em 1 dia?', r: '0,864', d: ['1,44', '0,432', '0,5'],
          e: 'Gotas/dia = 86400/5 = 17280. Volume = 17280 Ã— 0,05 mL = 864 mL = <b>0,864 L</b>. Regra de 3 direta.' },
        { s: '(FUVEST) Quantos nÃºmeros inteiros x satisfazem |x âˆ’ 3| < 2?', r: '3', d: ['4', '2', '5'],
          e: '|xâˆ’3|<2 â†’ âˆ’2<xâˆ’3<2 â†’ 1<x<5. Inteiros: 2, 3, 4 â†’ <b>3 nÃºmeros</b>.' },
        { s: '(UNICAMP) SequÃªncia: 1, 1, 2, 3, 5, 8... Qual o prÃ³ximo?', r: '13', d: ['11', '12', '16'],
          e: 'SequÃªncia de Fibonacci: cada termo = soma dos dois anteriores. 5+8 = <b>13</b>.' },
        { s: '(ENEM) PoupanÃ§a R$1000, 1% ao mÃªs. Montante apÃ³s 3 meses (juros compostos)?', r: 'R$ 1030,30', d: ['R$ 1030,00', 'R$ 1031,00', 'R$ 1003,00'],
          e: 'M = CÂ·(1+i)â¿ = 1000Â·(1,01)Â³ = 1000Â·1,030301 = <b>R$1030,30</b>. Juros compostos: capitaliza sobre o montante!' },
        { s: '(ENEM) GrÃ¡fico de f(x) = xÂ² passa por qual ponto com certeza?', r: '(0, 0)', d: ['(1, 0)', '(0, 1)', '(-1, 0)'],
          e: 'f(0) = 0Â² = 0 â†’ ponto <b>(0,0)</b>. O vÃ©rtice da parÃ¡bola y=xÂ² Ã© a origem.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

/* â”€â”€â”€ 201 fases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Cada fase: { id, region, name, gen }.
 * region indica a regiÃ£o no mapa (1..10).
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const PHASES = [
    // â”€â”€ 1Âº ano â€” Vila dos NÃºmeros (1-20) â”€â”€
    { id: 1,  region: 1, name: 'Contar atÃ© 5',           gen: g_count(1, 5) },
    { id: 2,  region: 1, name: 'Contar atÃ© 10',          gen: g_count(3, 10) },
    { id: 3,  region: 1, name: 'O nÃºmero zero',          gen: g_zero() },
    { id: 4,  region: 1, name: 'Contar atÃ© 15',          gen: g_count(5, 15) },
    { id: 5,  region: 1, name: 'Contar atÃ© 20',          gen: g_count(10, 20) },
    { id: 6,  region: 1, name: 'Maior e menor (1-10)',   gen: g_compare(0, 10) },
    { id: 7,  region: 1, name: 'Comparar atÃ© 20',        gen: g_compare(0, 20) },
    { id: 8,  region: 1, name: 'SequÃªncia +1',           gen: g_pattern(0, 1) },
    { id: 9,  region: 1, name: 'SequÃªncia +2',           gen: g_pattern(0, 2) },
    { id: 10, region: 1, name: 'Ordem crescente',        gen: g_orderAsc(1, 20) },
    { id: 11, region: 1, name: 'Ordem decrescente',      gen: g_orderDesc(1, 20) },
    { id: 12, region: 1, name: 'NÃºmero antes',           gen: g_before(1, 30) },
    { id: 13, region: 1, name: 'NÃºmero depois',          gen: g_after(0, 29) },
    { id: 14, region: 1, name: 'Formas geomÃ©tricas',     gen: g_shapes() },
    { id: 15, region: 1, name: 'Mais lados, mais formas', gen: g_shapes() },
    { id: 16, region: 1, name: 'SequÃªncia +5',           gen: g_pattern(0, 5) },
    { id: 17, region: 1, name: 'SequÃªncia +10',          gen: g_pattern(0, 10) },
    { id: 18, region: 1, name: 'Dezenas e unidades',     gen: g_dezena() },
    { id: 19, region: 1, name: 'Comparar atÃ© 50',        gen: g_compare(0, 50) },
    { id: 20, region: 1, name: 'â­ Desafio da Vila',     gen: () => shuffle([...g_count(1, 20)(), ...g_compare(0, 30)(), ...g_shapes()()]).slice(0, 6) },

    // â”€â”€ 2Âº ano â€” Bosque das OperaÃ§Ãµes (21-40) â”€â”€
    { id: 21, region: 2, name: 'Soma atÃ© 10',            gen: g_add(5, 5) },
    { id: 22, region: 2, name: 'Soma atÃ© 20',            gen: g_add(10, 10) },
    { id: 23, region: 2, name: 'SubtraÃ§Ã£o atÃ© 10',       gen: g_sub(10, 5) },
    { id: 24, region: 2, name: 'SubtraÃ§Ã£o atÃ© 20',       gen: g_sub(20, 10) },
    { id: 25, region: 2, name: 'Soma atÃ© 50',            gen: g_add(30, 20) },
    { id: 26, region: 2, name: 'SubtraÃ§Ã£o atÃ© 50',       gen: g_sub(50, 30) },
    { id: 27, region: 2, name: 'Par ou Ã­mpar',           gen: g_parity() },
    { id: 28, region: 2, name: 'Dobro',                  gen: g_double(30) },
    { id: 29, region: 2, name: 'Metade',                 gen: g_half(30) },
    { id: 30, region: 2, name: 'Soma de 3 parcelas',     gen: g_add3(10) },
    { id: 31, region: 2, name: 'Soma atÃ© 100',           gen: g_add(50, 50) },
    { id: 32, region: 2, name: 'SubtraÃ§Ã£o atÃ© 100',      gen: g_sub(100, 50) },
    { id: 33, region: 2, name: 'Antecessor/sucessor 100', gen: () => shuffle([...g_before(20, 100)(), ...g_after(20, 99)()]).slice(0, 5) },
    { id: 34, region: 2, name: 'SequÃªncia de 5 em 5',    gen: g_seqStep(5) },
    { id: 35, region: 2, name: 'SequÃªncia de 10 em 10',  gen: g_seqStep(10) },
    { id: 36, region: 2, name: 'DecomposiÃ§Ã£o',           gen: g_decomp() },
    { id: 37, region: 2, name: 'Comparar atÃ© 100',       gen: g_compare(0, 100) },
    { id: 38, region: 2, name: 'Problemas (soma/sub)',   gen: g_wordSimple() },
    { id: 39, region: 2, name: 'Dobro avanÃ§ado',         gen: g_double(50) },
    { id: 40, region: 2, name: 'â­ Desafio do Bosque',    gen: () => shuffle([...g_add(50, 50)(), ...g_sub(100, 50)(), ...g_parity()()]).slice(0, 6) },

    // â”€â”€ 3Âº ano â€” Vale das Tabuadas (41-60) â”€â”€
    { id: 41, region: 3, name: 'Soma com reserva',       gen: g_addCarry() },
    { id: 42, region: 3, name: 'SubtraÃ§Ã£o com emprÃ©stimo', gen: g_subBorrow() },
    { id: 43, region: 3, name: 'Tabuada do 2',           gen: g_table(2) },
    { id: 44, region: 3, name: 'Tabuada do 3',           gen: g_table(3) },
    { id: 45, region: 3, name: 'Tabuada do 4',           gen: g_table(4) },
    { id: 46, region: 3, name: 'Tabuada do 5',           gen: g_table(5) },
    { id: 47, region: 3, name: 'Tabuada do 6',           gen: g_table(6) },
    { id: 48, region: 3, name: 'Tabuada do 7',           gen: g_table(7) },
    { id: 49, region: 3, name: 'Tabuada do 8',           gen: g_table(8) },
    { id: 50, region: 3, name: 'Tabuada do 9',           gen: g_table(9) },
    { id: 51, region: 3, name: 'Tabuada do 10',          gen: g_table(10) },
    { id: 52, region: 3, name: 'MultiplicaÃ§Ã£o mista',    gen: g_tableMix(2, 9) },
    { id: 53, region: 3, name: 'DivisÃ£o por 2',          gen: g_divExact(2) },
    { id: 54, region: 3, name: 'DivisÃ£o por 3, 4, 5',    gen: g_divExact(5) },
    { id: 55, region: 3, name: 'DivisÃ£o por 6 a 9',      gen: g_divExact(9) },
    { id: 56, region: 3, name: 'DivisÃ£o mista',          gen: g_divExact(10) },
    { id: 57, region: 3, name: 'Dinheiro: somar reais',  gen: g_money() },
    { id: 58, region: 3, name: 'Troco',                  gen: g_money() },
    { id: 59, region: 3, name: 'Problemas com mult/div', gen: g_wordSimple() },
    { id: 60, region: 3, name: 'â­ Desafio do Vale',      gen: () => shuffle([...g_tableMix(2, 9)(), ...g_divExact(9)(), ...g_money()()]).slice(0, 6) },

    // â”€â”€ 4Âº ano â€” Caverna das FraÃ§Ãµes (61-80) â”€â”€
    { id: 61, region: 4, name: 'MultiplicaÃ§Ã£o por 10/100', gen: g_mult10() },
    { id: 62, region: 4, name: 'MultiplicaÃ§Ã£o 2 Ã— 1',    gen: g_mult2x1() },
    { id: 63, region: 4, name: 'MultiplicaÃ§Ã£o 2 Ã— 2',    gen: g_mult2x2() },
    { id: 64, region: 4, name: 'DivisÃ£o com resto',      gen: g_divRest() },
    { id: 65, region: 4, name: 'DivisÃ£o de 2 dÃ­gitos',   gen: g_div2dig() },
    { id: 66, region: 4, name: 'O que Ã© uma fraÃ§Ã£o',     gen: g_fracTerm() },
    { id: 67, region: 4, name: 'FraÃ§Ã£o visual',          gen: g_fracVisual() },
    { id: 68, region: 4, name: 'Metade, terÃ§o, quarto',  gen: g_fracTerm() },
    { id: 69, region: 4, name: 'FraÃ§Ãµes equivalentes',   gen: g_fracEquiv() },
    { id: 70, region: 4, name: 'Comparar fraÃ§Ãµes iguais', gen: g_fracCompareSameDen() },
    { id: 71, region: 4, name: 'Soma de fraÃ§Ãµes iguais', gen: g_fracAddSame() },
    { id: 72, region: 4, name: 'Unidades de medida',     gen: g_units() },
    { id: 73, region: 4, name: 'ConversÃ£o de unidades',  gen: g_units() },
    { id: 74, region: 4, name: 'PerÃ­metro',              gen: g_perimeter() },
    { id: 75, region: 4, name: 'Tempo: horas e min',     gen: g_time() },
    { id: 76, region: 4, name: 'Tempo: conversÃµes',      gen: g_time() },
    { id: 77, region: 4, name: 'Problemas com fraÃ§Ãµes',  gen: g_fracVisual() },
    { id: 78, region: 4, name: 'DivisÃ£o 2 dÃ­gitos avanÃ§ada', gen: g_div2dig() },
    { id: 79, region: 4, name: 'Mistura caverna',        gen: () => shuffle([...g_mult2x1()(), ...g_fracVisual()()]).slice(0, 6) },
    { id: 80, region: 4, name: 'â­ Desafio da Caverna',  gen: () => shuffle([...g_fracVisual()(), ...g_perimeter()(), ...g_mult2x2()()]).slice(0, 6) },

    // â”€â”€ 5Âº ano â€” Lago dos Decimais (81-100) â”€â”€
    { id: 81,  region: 5, name: 'FraÃ§Ãµes prÃ³prias/imprÃ³prias', gen: g_fracProperImproper() },
    { id: 82,  region: 5, name: 'Equivalentes avanÃ§adas', gen: g_fracEquiv() },
    { id: 83,  region: 5, name: 'Decimais: leitura',     gen: g_decRead() },
    { id: 84,  region: 5, name: 'Comparar decimais',     gen: g_decCompare() },
    { id: 85,  region: 5, name: 'Soma de decimais',      gen: g_decAdd() },
    { id: 86,  region: 5, name: 'SubtraÃ§Ã£o de decimais', gen: g_decSub() },
    { id: 87,  region: 5, name: 'Decimais Ã— 10, 100',    gen: g_decMult10() },
    { id: 88,  region: 5, name: 'Porcentagem bÃ¡sica',    gen: g_percentEasy() },
    { id: 89,  region: 5, name: '10%, 50%, 100%',        gen: g_percentEasy() },
    { id: 90,  region: 5, name: 'Porcentagem aplicada',  gen: g_percentApply() },
    { id: 91,  region: 5, name: 'Ãrea do quadrado',      gen: g_areaSquare() },
    { id: 92,  region: 5, name: 'Ãrea do retÃ¢ngulo',     gen: g_areaRect() },
    { id: 93,  region: 5, name: 'Volume do cubo',        gen: g_volumeCube() },
    { id: 94,  region: 5, name: 'Volume do paralelepÃ­pedo', gen: g_volumePar() },
    { id: 95,  region: 5, name: 'Probabilidade simples', gen: g_probSimple() },
    { id: 96,  region: 5, name: 'MÃ©dia aritmÃ©tica',      gen: g_mean() },
    { id: 97,  region: 5, name: 'Decimais misturados',   gen: () => shuffle([...g_decAdd()(), ...g_decSub()()]).slice(0, 6) },
    { id: 98,  region: 5, name: 'Porcentagem real',      gen: g_percentApply() },
    { id: 99,  region: 5, name: 'Geometria mista',       gen: () => shuffle([...g_areaRect()(), ...g_volumeCube()()]).slice(0, 6) },
    { id: 100, region: 5, name: 'â­ Desafio do Lago',     gen: () => shuffle([...g_decAdd()(), ...g_percentApply()(), ...g_areaRect()()]).slice(0, 6) },

    // â”€â”€ 6Âº ano â€” Montanha dos Inteiros (101-120) â”€â”€
    { id: 101, region: 6, name: 'Reta dos inteiros',     gen: g_negLine() },
    { id: 102, region: 6, name: 'Soma com negativos',    gen: g_negAdd() },
    { id: 103, region: 6, name: 'SubtraÃ§Ã£o de negativos', gen: g_negSub() },
    { id: 104, region: 6, name: 'Mult. com negativos',   gen: g_negMult() },
    { id: 105, region: 6, name: 'DivisÃ£o com negativos', gen: g_negDiv() },
    { id: 106, region: 6, name: 'Sinais misturados',     gen: () => shuffle([...g_negAdd()(), ...g_negMult()()]).slice(0, 6) },
    { id: 107, region: 6, name: 'MMC',                   gen: g_mmc() },
    { id: 108, region: 6, name: 'MDC',                   gen: g_mdc() },
    { id: 109, region: 6, name: 'Soma de fraÃ§Ãµes â‰ ',     gen: g_fracAddDiff() },
    { id: 110, region: 6, name: 'SubtraÃ§Ã£o de fraÃ§Ãµes',  gen: g_fracAddDiff() },
    { id: 111, region: 6, name: 'MultiplicaÃ§Ã£o fracion.', gen: g_fracMult() },
    { id: 112, region: 6, name: 'DivisÃ£o fracionÃ¡ria',   gen: g_fracDiv() },
    { id: 113, region: 6, name: 'EquaÃ§Ã£o x + a = b',     gen: g_eq1() },
    { id: 114, region: 6, name: 'EquaÃ§Ã£o x âˆ’ a = b',     gen: g_eq1() },
    { id: 115, region: 6, name: 'EquaÃ§Ã£o ax = b',        gen: g_eqMult() },
    { id: 116, region: 6, name: 'EquaÃ§Ã£o x/a = b',       gen: g_eqMult() },
    { id: 117, region: 6, name: 'Porcentagem como fraÃ§Ã£o', gen: g_percentEasy() },
    { id: 118, region: 6, name: 'RazÃ£o simples',         gen: g_ratioBasic() },
    { id: 119, region: 6, name: 'OperaÃ§Ãµes mistas',      gen: () => shuffle([...g_negAdd()(), ...g_fracMult()(), ...g_eq1()()]).slice(0, 6) },
    { id: 120, region: 6, name: 'â­ Desafio da Montanha', gen: () => shuffle([...g_negMult()(), ...g_fracAddDiff()(), ...g_eqMult()()]).slice(0, 6) },

    // â”€â”€ 7Âº ano â€” Deserto das EquaÃ§Ãµes (121-140) â”€â”€
    { id: 121, region: 7, name: 'EquaÃ§Ã£o 2 passos',      gen: g_eqMult() },
    { id: 122, region: 7, name: 'X dos dois lados',      gen: g_eq2sides() },
    { id: 123, region: 7, name: 'EquaÃ§Ã£o com parÃªnteses', gen: g_eqParen() },
    { id: 124, region: 7, name: 'EquaÃ§Ã£o fracionÃ¡ria',   gen: g_eqFrac() },
    { id: 125, region: 7, name: 'RazÃ£o',                 gen: g_ratioBasic() },
    { id: 126, region: 7, name: 'ProporÃ§Ã£o',             gen: g_proportion() },
    { id: 127, region: 7, name: 'Regra de 3 direta',     gen: g_rule3() },
    { id: 128, region: 7, name: 'Regra de 3 inversa',    gen: g_rule3Inv() },
    { id: 129, region: 7, name: 'Desconto percentual',   gen: g_discount() },
    { id: 130, region: 7, name: 'Aumento percentual',    gen: g_increase() },
    { id: 131, region: 7, name: 'Juros simples',         gen: g_interestSimple() },
    { id: 132, region: 7, name: 'Tipos de Ã¢ngulos',      gen: g_angles() },
    { id: 133, region: 7, name: 'Soma de Ã¢ngulos',       gen: g_angles() },
    { id: 134, region: 7, name: 'Ãrea de triÃ¢ngulo',     gen: g_areaTri() },
    { id: 135, region: 7, name: 'Ãrea de paralelogramo', gen: g_areaPar() },
    { id: 136, region: 7, name: 'Ãrea de trapÃ©zio',      gen: g_areaTrap() },
    { id: 137, region: 7, name: 'CÃ­rculo',               gen: g_circle() },
    { id: 138, region: 7, name: 'Problemas geomÃ©tricos', gen: () => shuffle([...g_areaTri()(), ...g_areaPar()()]).slice(0, 6) },
    { id: 139, region: 7, name: 'OperaÃ§Ãµes algÃ©bricas',  gen: () => shuffle([...g_eq2sides()(), ...g_proportion()()]).slice(0, 6) },
    { id: 140, region: 7, name: 'â­ Desafio do Deserto',  gen: () => shuffle([...g_eq2sides()(), ...g_rule3()(), ...g_discount()()]).slice(0, 6) },

    // â”€â”€ 8Âº ano â€” Templo das PotÃªncias (141-160) â”€â”€
    { id: 141, region: 8, name: 'PotÃªncias bÃ¡sicas',     gen: g_power() },
    { id: 142, region: 8, name: 'Base inteira',          gen: g_power() },
    { id: 143, region: 8, name: 'Propriedades I',        gen: g_powerProp() },
    { id: 144, region: 8, name: 'Propriedades II',       gen: g_powerProp() },
    { id: 145, region: 8, name: 'PotÃªncia de potÃªncia',  gen: g_powerProp() },
    { id: 146, region: 8, name: 'NotaÃ§Ã£o cientÃ­fica',    gen: g_sciNotation() },
    { id: 147, region: 8, name: 'Raiz quadrada',         gen: g_sqrt() },
    { id: 148, region: 8, name: 'Raiz aproximada',       gen: g_sqrtAprox() },
    { id: 149, region: 8, name: 'Raiz cÃºbica',           gen: g_cubeRoot() },
    { id: 150, region: 8, name: 'Valor numÃ©rico',        gen: g_algebraVal() },
    { id: 151, region: 8, name: 'Soma de monÃ´mios',      gen: g_monoSum() },
    { id: 152, region: 8, name: 'MultiplicaÃ§Ã£o monÃ´mios', gen: g_monoMult() },
    { id: 153, region: 8, name: '(a + b)Â²',              gen: g_squarePlus() },
    { id: 154, region: 8, name: '(a âˆ’ b)Â²',              gen: g_squareMinus() },
    { id: 155, region: 8, name: '(a + b)(a âˆ’ b)',        gen: g_diffSquares() },
    { id: 156, region: 8, name: 'FatoraÃ§Ã£o',             gen: g_factor() },
    { id: 157, region: 8, name: 'Sistemas substituiÃ§Ã£o', gen: g_sysSubst() },
    { id: 158, region: 8, name: 'Sistemas adiÃ§Ã£o',       gen: g_sysSubst() },
    { id: 159, region: 8, name: 'Teorema de Tales',      gen: g_thales() },
    { id: 160, region: 8, name: 'â­ Desafio do Templo',  gen: () => shuffle([...g_power()(), ...g_diffSquares()(), ...g_sysSubst()()]).slice(0, 6) },

    // â”€â”€ 9Âº ano â€” Cidadela do Mestre (161-181) â”€â”€
    { id: 161, region: 9, name: 'FunÃ§Ã£o afim',           gen: g_funcAfim() },
    { id: 162, region: 9, name: 'Coeficientes da afim',  gen: g_funcAfim() },
    { id: 163, region: 9, name: 'Raiz da funÃ§Ã£o afim',   gen: g_funcRoot() },
    { id: 164, region: 9, name: 'GrÃ¡fico da afim',       gen: g_funcGraph() },
    { id: 165, region: 9, name: 'Eq. 2Âº grau: forma',    gen: g_bhaskaraRoots() },
    { id: 166, region: 9, name: 'Discriminante (Î”)',     gen: g_bhaskaraDelta() },
    { id: 167, region: 9, name: 'Bhaskara: raÃ­zes',      gen: g_bhaskaraRoots() },
    { id: 168, region: 9, name: 'Soma e produto',        gen: g_sumProd() },
    { id: 169, region: 9, name: 'VÃ©rtice da parÃ¡bola',   gen: g_vertex() },
    { id: 170, region: 9, name: 'PitÃ¡goras: hipotenusa', gen: g_pythCat() },
    { id: 171, region: 9, name: 'PitÃ¡goras: cateto',     gen: g_pythCat() },
    { id: 172, region: 9, name: 'SemelhanÃ§a',            gen: g_similar() },
    { id: 173, region: 9, name: 'Trigonometria especial', gen: g_trigSpecial() },
    { id: 174, region: 9, name: 'Seno, cosseno e tg',    gen: g_trigSpecial() },
    { id: 175, region: 9, name: 'PolÃ­gonos regulares',   gen: g_polygon() },
    { id: 176, region: 9, name: 'Probabilidade composta', gen: g_probComp() },
    { id: 177, region: 9, name: 'EstatÃ­stica I',         gen: g_stats() },
    { id: 178, region: 9, name: 'EstatÃ­stica II',        gen: g_stats() },
    { id: 179, region: 9, name: 'EquaÃ§Ãµes irracionais',  gen: g_irrational() },
    { id: 180, region: 9, name: 'Mistura final',         gen: () => shuffle([...g_bhaskaraRoots()(), ...g_pythCat()(), ...g_trigSpecial()()]).slice(0, 6) },
    { id: 181, region: 9, name: 'ðŸ† Desafio Mestre',     gen: g_master() },

    // â”€â”€ 10 â€” Arena do Vestibular (182-201) â”€â”€
    { id: 182, region: 10, name: 'ProgressÃ£o AritmÃ©tica', gen: g_progressAritm() },
    { id: 183, region: 10, name: 'ProgressÃ£o GeomÃ©trica', gen: g_progressGeom() },
    { id: 184, region: 10, name: 'Logaritmo bÃ¡sico',      gen: g_logBasic() },
    { id: 185, region: 10, name: 'Propriedades do log',   gen: g_logProp() },
    { id: 186, region: 10, name: 'CombinatÃ³ria',          gen: g_combinatoria() },
    { id: 187, region: 10, name: 'Probabilidade avanÃ§ada',gen: g_probCondicional() },
    { id: 188, region: 10, name: 'Geometria analÃ­tica',   gen: g_geometriaAnalitica() },
    { id: 189, region: 10, name: 'Trigonometria avanÃ§ada',gen: g_trigAvancado() },
    { id: 190, region: 10, name: 'Matrizes e determinantes', gen: g_matrizBasica() },
    { id: 191, region: 10, name: 'FunÃ§Ã£o exponencial',    gen: g_funcExponencial() },
    { id: 192, region: 10, name: 'Geometria espacial',    gen: g_geometriaEspacial() },
    { id: 193, region: 10, name: 'QuestÃµes ENEM/Vestibular', gen: g_enunciado() },
    { id: 194, region: 10, name: 'PA e PG mistas',        gen: () => shuffle([...g_progressAritm()(), ...g_progressGeom()()]).slice(0,5) },
    { id: 195, region: 10, name: 'Log e exponencial',     gen: () => shuffle([...g_logBasic()(), ...g_funcExponencial()()]).slice(0,5) },
    { id: 196, region: 10, name: 'CombinatÃ³ria aplicada', gen: () => shuffle([...g_combinatoria()(), ...g_probCondicional()()]).slice(0,5) },
    { id: 197, region: 10, name: 'Geometria completa',    gen: () => shuffle([...g_geometriaAnalitica()(), ...g_geometriaEspacial()()]).slice(0,5) },
    { id: 198, region: 10, name: 'Ãlgebra avanÃ§ada',      gen: () => shuffle([...g_matrizBasica()(), ...g_trigAvancado()()]).slice(0,5) },
    { id: 199, region: 10, name: 'Simulado ENEM I',       gen: () => shuffle([...g_enunciado()(), ...g_combinatoria()(), ...g_logBasic()()]).slice(0,5) },
    { id: 200, region: 10, name: 'Simulado ENEM II',      gen: () => shuffle([...g_progressAritm()(), ...g_funcExponencial()(), ...g_trigAvancado()()]).slice(0,5) },
    { id: 201, region: 10, name: 'ðŸ† Desafio Vestibular', gen: () => shuffle([...g_enunciado()(), ...g_probCondicional()(), ...g_matrizBasica()(), ...g_geometriaAnalitica()()]).slice(0,5) },
];

/* â”€â”€â”€ Conquistas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ACHIEVEMENTS = [
    { id: 'first_phase',  name: 'Primeiro passo',         desc: 'Complete sua primeira fase',      check: s => Object.keys(s.stars).length >= 1 },
    { id: 'ten_phases',   name: 'Aquecido',               desc: '10 fases concluÃ­das',             check: s => Object.keys(s.stars).length >= 10 },
    { id: 'thirty_phases', name: 'Em chamas',             desc: '30 fases concluÃ­das',             check: s => Object.keys(s.stars).length >= 30 },
    { id: 'hundred_phases', name: 'Caminho longo',        desc: '100 fases concluÃ­das',            check: s => Object.keys(s.stars).length >= 100 },
    { id: 'all_phases',   name: 'Mestre da matemÃ¡tica',   desc: 'Todas as 201 fases',              check: s => Object.keys(s.stars).length >= 201 },
    { id: 'perfectionist', name: 'Perfeccionista',        desc: '10 fases com 3 estrelas',         check: s => Object.values(s.stars).filter(x => x === 3).length >= 10 },
    { id: 'star_collector', name: 'Coletor de estrelas',  desc: '300 estrelas no total',           check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= 300 },
    { id: 'all_stars',    name: 'BrilhantÃ­ssimo',         desc: `Todas as estrelas (${TOTAL_STARS})`, check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= TOTAL_STARS },
    { id: 'region_1',     name: 'Numerologista',          desc: 'Conclua toda a Vila dos NÃºmeros', check: s => PHASES.filter(p => p.region === 1).every(p => s.stars[p.id]) },
    { id: 'region_9',     name: 'Coroado',                desc: 'Conclua toda a Cidadela',         check: s => PHASES.filter(p => p.region === 9).every(p => s.stars[p.id]) },
    { id: 'xp_1000',      name: 'Mil XP',                 desc: 'Acumule 1000 XP',                 check: s => s.xp >= 1000 },
    { id: 'xp_5000',      name: '5K XP',                  desc: 'Acumule 5000 XP',                 check: s => s.xp >= 5000 },
    // Novas conquistas â€” RegiÃ£o 10 e Especiais
    { id: 'region_10',    name: 'Veterano',              desc: 'Conclua a Arena do Vestibular',     check: s => PHASES.filter(p => p.region === 10).every(p => s.stars[p.id]) },
    { id: 'vestibular',   name: 'PrÃ©-vestibulando',      desc: 'Complete 5 fases da regiÃ£o 10',     check: s => PHASES.filter(p => p.region === 10 && s.stars[p.id]).length >= 5 },
    { id: 'streak_3',     name: 'Em sequÃªncia',          desc: '3 dias seguidos jogando',           check: s => (s.streak || 0) >= 3 },
    { id: 'streak_7',     name: 'Semana dedicada',       desc: '7 dias seguidos jogando',           check: s => (s.streak || 0) >= 7 },
    { id: 'streak_30',    name: 'MÃªs de estudo',         desc: '30 dias seguidos jogando',          check: s => (s.streak || 0) >= 30 },
    { id: 'all_regions',  name: 'Explorador total',      desc: 'Complete pelo menos 1 fase em cada regiÃ£o', check: s => REGIONS.every(r => PHASES.filter(p => p.region === r.id).some(p => s.stars[p.id])) },
    { id: 'speed_demon',  name: 'RelÃ¢mpago',             desc: 'Acerte 5 questÃµes seguidas sem errar', check: s => (s._correctStreak || 0) >= 5 },
    { id: 'centurion',    name: 'CenturiÃ£o',             desc: '100 fases com pelo menos 1 estrela', check: s => Object.keys(s.stars).length >= 100 },
    { id: 'xp_10000',     name: '10K XP',                desc: 'Acumule 10.000 XP',                 check: s => s.xp >= 10000 },
    { id: 'xp_50000',     name: 'XP MÃ¡ster',             desc: 'Acumule 50.000 XP',                 check: s => s.xp >= 50000 },
    { id: 'all_3star_r1', name: 'Perfeito no comeÃ§o',    desc: '3 estrelas em todas as fases do 1Âº ano', check: s => PHASES.filter(p => p.region === 1).every(p => s.stars[p.id] === 3) },
    { id: 'training_10',  name: 'Estudioso',             desc: 'Complete 10 sessÃµes em Modo Treino', check: s => (s._trainingSessions || 0) >= 10 },
    { id: 'missions_7',   name: 'MissÃ£o cumprida',       desc: 'Complete missÃµes por 7 dias diferentes', check: s => (s._missionDays || 0) >= 7 },
    { id: 'secret_zero',  name: '??? Zero',              desc: 'Secreta â€” descubra acertando 0 na questÃ£o do zero', check: s => s.achievements.includes('secret_zero') },
    { id: 'region_2',     name: 'Operador',              desc: 'Conclua o Bosque das OperaÃ§Ãµes',    check: s => PHASES.filter(p => p.region === 2).every(p => s.stars[p.id]) },
    { id: 'region_3',     name: 'Multiplicador',         desc: 'Conclua o Vale das Tabuadas',       check: s => PHASES.filter(p => p.region === 3).every(p => s.stars[p.id]) },
    { id: 'region_4',     name: 'Fracionista',           desc: 'Conclua a Caverna das FraÃ§Ãµes',     check: s => PHASES.filter(p => p.region === 4).every(p => s.stars[p.id]) },
    { id: 'region_5',     name: 'Decimais mestre',       desc: 'Conclua o Lago dos Decimais',       check: s => PHASES.filter(p => p.region === 5).every(p => s.stars[p.id]) },
    { id: 'region_6',     name: 'Alpinista',             desc: 'Conclua a Montanha dos Inteiros',   check: s => PHASES.filter(p => p.region === 6).every(p => s.stars[p.id]) },
    { id: 'region_7',     name: 'Equacionista',          desc: 'Conclua o Deserto das EquaÃ§Ãµes',    check: s => PHASES.filter(p => p.region === 7).every(p => s.stars[p.id]) },
    { id: 'region_8',     name: 'PotÃªncia mÃ¡xima',       desc: 'Conclua o Templo das PotÃªncias',    check: s => PHASES.filter(p => p.region === 8).every(p => s.stars[p.id]) },
];

/* â”€â”€â”€ PersistÃªncia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const localKey = id => `mq_progress_${id || 'anon'}`;

function saveLocal() {
    if (!state.userId) return;
    localStorage.setItem(localKey(state.userId), JSON.stringify({
        nickname: state.nickname, xp: state.xp, stars: state.stars, achievements: state.achievements,
        streak: state.streak, lastPlayDate: state.lastPlayDate, avatar: state.avatar,
        trainingSessions: state._trainingSessions || 0, missionDays: state._missionDays || 0,
        teacherUnlocks: state.teacherUnlocks || [],
    }));
}

function loadLocal() {
    const raw = localStorage.getItem(localKey(state.userId));
    if (!raw) return false;
    try {
        const d = JSON.parse(raw);
        state.nickname     = d.nickname     || state.nickname;
        state.xp           = d.xp           || 0;
        state.stars        = d.stars        || {};
        state.achievements = d.achievements || [];
        state.streak       = d.streak       || 0;
        state.lastPlayDate = d.lastPlayDate || '';
        state.avatar       = d.avatar       || 'ðŸŽ“';
        state._trainingSessions = d.trainingSessions || 0;
        state._missionDays      = d.missionDays || 0;
        state.teacherUnlocks    = d.teacherUnlocks || [];
        return true;
    } catch { return false; }
}

async function saveRemote() {
    if (!state.userId || !BACKEND_CONFIGURED || state.userId.startsWith('local-')) return;
    try {
        const { error } = await sb.from('mathquest_progress').upsert({
            user_id:      state.userId,
            nickname:     state.nickname,
            xp:           state.xp,
            stars:        state.stars,
            achievements: state.achievements,
            updated_at:   new Date().toISOString(),
        });
        if (error) {
            // Falha de regras/schema precisa aparecer no console para diagnostico
            // conseguir diagnosticar; antes era engolida silenciosamente.
            console.warn('[mathquest] saveRemote falhou:', error.message, error);
        }
    } catch (e) {
        // Sem rede: cache local cobre, sincroniza depois.
        console.warn('[mathquest] saveRemote offline:', e?.message || e);
    }
}

async function loadRemote() {
    if (!state.userId || !BACKEND_CONFIGURED || state.userId.startsWith('local-')) return false;
    const { data, error } = await sb.from('mathquest_progress')
        .select('nickname, xp, stars, achievements')
        .eq('user_id', state.userId).maybeSingle();
    if (error || !data) return false;
    state.nickname     = data.nickname     || state.nickname;
    state.xp           = data.xp           || 0;
    state.stars        = data.stars        || {};
    state.achievements = data.achievements || [];
    const { data: unlocks } = await sb.from('teacher_unlocks').select('region').eq('user_id', state.userId);
    state.teacherUnlocks = (unlocks || []).map(({ region }) => region);
    return true;
}

let remoteSaveTimer = null;
let remoteSaveChain = Promise.resolve();

function scheduleRemoteSave() {
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(() => {
        remoteSaveTimer = null;
        remoteSaveChain = remoteSaveChain.then(() => saveRemote());
    }, 750);
}

async function flushRemoteSave() {
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = null;
    remoteSaveChain = remoteSaveChain.then(() => saveRemote());
    await remoteSaveChain;
}

const persist = () => { saveLocal(); scheduleRemoteSave(); };
// Variante que espera o write remoto terminar.  Usada quando precisamos
// garantir que o servidor tem a linha (ex: antes de o aluno entrar numa
// turma, pra que o professor jÃ¡ veja o apelido em vez de "entrou agora").
const persistAwait = async () => { saveLocal(); await flushRemoteSave(); };

/* â”€â”€â”€ Auth anÃ´nima â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function initAuth() {
    try {
        if (!BACKEND_CONFIGURED) throw new Error('Backend Firebase ainda nÃ£o configurado.');
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            state.userId = session.user.id;
        } else {
            const { data, error } = await sb.auth.signInAnonymously();
            if (error) throw error;
            state.userId = data.user?.id;
        }
    } catch (e) {
        // Modo offline: usa um ID local persistente
        let local = localStorage.getItem('mq_localuid');
        if (!local) { local = 'local-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('mq_localuid', local); }
        state.userId = local;
        toast('Jogando offline â€” progresso salvo neste dispositivo.', 'warn');
    }
}

/* â”€â”€â”€ Desbloqueio e estrelas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function isUnlocked(phaseId) {
    if (phaseId === 1) return true;
    if (state.stars[phaseId - 1]) return true;
    // Teste de nivelamento: desbloqueia apenas a 1Âª fase da regiÃ£o
    const phase = PHASES.find(p => p.id === phaseId);
    if (phase) {
        const firstInRegion = PHASES.find(p => p.region === phase.region);
        if (firstInRegion?.id === phaseId && (
            state.achievements.includes(`placement_${phase.region}`)
            || state.teacherUnlocks.includes(phase.region)
        )) return true;
    }
    return false;
}

function starsFor(phaseId) {
    return state.stars[phaseId] || 0;
}

function totalStars() {
    return Object.values(state.stars).reduce((a, b) => a + b, 0);
}

function completedCount() {
    return Object.keys(state.stars).length;
}

/* â”€â”€â”€ Teste de nivelamento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function buildPlacementTest(regionId) {
    const regionPhases = PHASES.filter(p => p.region === regionId);
    const picked = shuffle([...regionPhases]).slice(0, Math.min(5, regionPhases.length));
    const qs = [];
    picked.forEach(p => { const all = p.gen(); qs.push(...all.slice(0, 2)); });
    return shuffle(qs).slice(0, 10);
}

function startPlacementTest(regionId) {
    const reg = REGIONS.find(r => r.id === regionId);
    state.currentPhase = { id: `p_${regionId}`, name: `ðŸ§ª Teste: ${reg.name}`, region: regionId, isPlacement: true };
    state.questions    = buildPlacementTest(regionId);
    state.qIndex       = 0;
    state.correct      = 0;
    state.hearts       = 3;
    state.earnedXp     = 0;
    state.answered     = false;
    $('mapView').style.display = 'none';
    $('phaseView').style.display = '';
    renderQuestion();
}

function endPlacementTest() {
    const regionId = state.currentPhase.region;
    const reg      = REGIONS.find(r => r.id === regionId);
    const total    = state.questions.length;
    const passed   = state.correct / total >= 0.7;

    if (passed && !state.achievements.includes(`placement_${regionId}`)) {
        state.achievements.push(`placement_${regionId}`);
        persist();
        sndUnlock();
    }

    $('resultStars').innerHTML = passed ? 'ðŸŽ¯' : 'ðŸ“š';
    $('resultMsg').textContent = passed ? `${reg.name} desbloqueada!` : 'Continue estudando';
    $('resultDetail').innerHTML = passed
        ? `VocÃª acertou <b>${state.correct}/${total}</b>. Pode comeÃ§ar em <b>${esc(reg.name)}</b>!`
        : `VocÃª acertou <b>${state.correct}/${total}</b>. Precisa de pelo menos <b>${Math.ceil(total * 0.7)}/${total}</b> para desbloquear esta regiÃ£o.`;
    $('btnRetry').textContent = 'Repetir teste';
    $('resultView').style.display = '';
    $('phaseView').style.display  = 'none';
    if (passed) {
        setTimeout(() => { toast(`ðŸŽ‰ ${reg.name} desbloqueada!`, 'success'); sndStar(); }, 400);
        // Store the region to highlight after returning to map
        localStorage.setItem('mq_expanded_region', String(regionId));
    }
}

/* â”€â”€â”€ RenderizaÃ§Ã£o: header HUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function renderHud() {
    $('hudNick').textContent      = state.nickname || 'Aluno(a)';
    $('hudXp').textContent        = state.xp;
    $('hudStars').textContent     = totalStars();
    $('hudPhases').textContent    = `${completedCount()}/${TOTAL_PHASES}`;
    $('btnMute').textContent      = state.muted ? 'ðŸ”‡' : 'ðŸ”Š';
    if ($('avatarEmoji')) $('avatarEmoji').textContent = state.avatar || 'ðŸŽ“';
    const streakBadge = $('hudStreakBadge');
    if (streakBadge) {
        if (state.streak >= 2) {
            $('hudStreak').textContent = state.streak;
            streakBadge.style.display = '';
        } else {
            streakBadge.style.display = 'none';
        }
    }
}

/* â”€â”€â”€ RenderizaÃ§Ã£o: mapa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function autoExpandRegion() {
    const saved = parseInt(localStorage.getItem('mq_expanded_region') || '0');
    if (saved) return saved;
    // Use school year preference if set
    const schoolYear = parseInt(localStorage.getItem('mq_school_year') || '0');
    if (schoolYear >= 1 && schoolYear <= 9) {
        const targetReg = REGIONS.find(r => r.id === schoolYear);
        if (targetReg) return targetReg.id;
    }
    // Abre automaticamente a regiÃ£o onde estÃ¡ a prÃ³xima fase desbloqueada
    for (const reg of REGIONS) {
        const rPhases = PHASES.filter(p => p.region === reg.id);
        if (rPhases.some(p => isUnlocked(p.id) && !state.stars[p.id])) return reg.id;
    }
    return 1;
}

function renderMap() {
    const root = $('map');
    root.innerHTML = '';
    const expandId = autoExpandRegion();
    REGIONS.forEach(reg => {
        const phases = PHASES.filter(p => p.region === reg.id);
        const total  = phases.length;
        const got    = phases.filter(p => state.stars[p.id]).length;
        const pct    = Math.round((got / total) * 100);
        const starCount = phases.reduce((s, p) => s + (state.stars[p.id] || 0), 0);
        const maxStars = total * 3;
        const firstPhaseId = phases[0].id;
        const regionLocked = !isUnlocked(firstPhaseId);
        const isExpanded   = reg.id === expandId;
        const wrap = document.createElement('section');
        wrap.className = `region${isExpanded ? '' : ' collapsed'}`;
        wrap.style.setProperty('--rcolor', reg.color);
        wrap.innerHTML = `
            <header class="region-head" role="button" tabindex="0" aria-expanded="${isExpanded}">
                <div class="region-icon">${reg.icon}</div>
                <div class="region-info">
                    <h2><span class="region-num">MÃ³dulo ${reg.id}</span> ${esc(reg.name)} <small>${reg.year}</small></h2>
                    <p>${esc(reg.desc)}</p>
                    <div class="region-bar"><div class="region-bar-fill" style="width:${pct}%"></div></div>
                </div>
                <div class="region-actions">
                    ${regionLocked ? `<button class="btn-placement" data-region="${reg.id}" title="Responda 10 questÃµes para ver se vocÃª jÃ¡ sabe este nÃ­vel">ðŸ§ª Testar nÃ­vel</button>` : ''}
                    <div class="region-progress">${got}/${total} <small class="region-stars-count">â˜…${starCount}/${maxStars}</small></div>
                </div>
                <div class="region-chevron" aria-hidden="true">â€º</div>
            </header>
            <div class="phases" id="reg-${reg.id}"></div>
        `;
        root.appendChild(wrap);

        // Toggle colapso ao clicar no cabeÃ§alho (exceto nos botÃµes internos)
        const head = wrap.querySelector('.region-head');
        const toggle = () => {
            const nowExpanded = wrap.classList.toggle('collapsed') === false;
            head.setAttribute('aria-expanded', nowExpanded);
            if (nowExpanded) localStorage.setItem('mq_expanded_region', reg.id);
            else if (parseInt(localStorage.getItem('mq_expanded_region')) === reg.id)
                localStorage.removeItem('mq_expanded_region');
        };
        head.addEventListener('click', e => { if (!e.target.closest('.btn-placement')) toggle(); });
        head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

        const placementBtn = wrap.querySelector('.btn-placement');
        if (placementBtn) placementBtn.addEventListener('click', () => startPlacementTest(reg.id));

        const node = wrap.querySelector('.phases');
        phases.forEach((p, idx) => {
            const unlocked = isUnlocked(p.id);
            const stars = starsFor(p.id);
            const el = document.createElement('button');
            el.className = `phase ${unlocked ? 'unlocked' : 'locked'} ${stars ? 'done' : ''}`;
            el.style.setProperty('--side', idx % 2 === 0 ? '-30px' : '30px');
            el.innerHTML = `
                <span class="phase-num">${p.id}</span>
                <span class="phase-name">${esc(p.name)}</span>
                <span class="phase-stars">${'â˜…'.repeat(stars)}${'â˜†'.repeat(3 - stars)}</span>
            `;
            el.disabled = !unlocked;
            el.title = unlocked ? `Fase ${p.id}: ${p.name}` : 'Complete a fase anterior para desbloquear';
            el.addEventListener('click', () => unlocked && startPhase(p));
            node.appendChild(el);
        });
    });
    renderHud();
}

/* â”€â”€â”€ Tela de fase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function startPhase(phase) {
    // Mostra modal de escolha de modo
    const modal = document.createElement('div');
    modal.className = 'phase-start-modal';
    modal.innerHTML = `
        <div class="phase-start-card">
            <h3>${phase.name}</h3>
            <p>Como vocÃª quer jogar?</p>
            <div class="phase-mode-grid">
                <button class="btn-mode btn-mode-normal" id="btnModeNormal">âš”ï¸ Normal<br><small>3 vidas, XP</small></button>
                <button class="btn-mode btn-mode-train"  id="btnModeTrain">ðŸ“š Treino<br><small>Sem pressÃ£o</small></button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const launch = (training) => {
        modal.remove();
        state.trainingMode = training;
        state.currentPhase = phase;
        state.questions    = phase.gen();
        state.qIndex       = 0;
        state.correct      = 0;
        state.hearts       = 3;
        state.earnedXp     = 0;
        state.answered     = false;
        state._answerStreak  = 0;
        $('mapView').style.display = 'none';
        $('phaseView').style.display = '';
        renderQuestion();
    };
    $('btnModeNormal').addEventListener('click', () => launch(false));
    $('btnModeTrain').addEventListener('click',  () => launch(true));
}

function formatOpt(raw) {
    const str = String(raw ?? '');
    return str.replace(/(-?[\d\u221a]+)\/(-?[\d\u221a]+)/g,
        '<span class="frac-inline"><sup>$1</sup><span class="frac-bar-char">â„</span><sub>$2</sub></span>');
}
const OPT_LABELS = ['A', 'B', 'C', 'D'];

/** Renders the current question in the active game session. */
function renderQuestion() {
    const q = state.questions[state.qIndex];
    const isPlacement = state.currentPhase?.isPlacement;
    state.wrongCount = 0;
    $('phaseTitle').textContent = isPlacement
        ? state.currentPhase.name
        : `${state.currentPhase.id}. ${state.currentPhase.name}`;

    const total   = state.questions.length;
    const current = state.qIndex;
    let progBar = $('qProgressBarWrap');
    if (!progBar) {
        progBar = document.createElement('div');
        progBar.id = 'qProgressBarWrap';
        progBar.style.cssText = 'width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;margin:6px 0 2px;overflow:hidden';
        const fill = document.createElement('div');
        fill.id = 'qProgressBarFill';
        fill.style.cssText = 'height:100%;border-radius:3px;background:linear-gradient(90deg,#f0883e,#f0c419);transition:width .35s ease';
        progBar.appendChild(fill);
        const progRow = $('phaseProg')?.parentElement;
        if (progRow) progRow.insertAdjacentElement('afterend', progBar);
    }
    const fill = document.getElementById('qProgressBarFill');
    if (fill) fill.style.width = `${Math.round((current / total) * 100)}%`;
    $('phaseProg').textContent = `${current + 1} / ${total}`;
    if (state.trainingMode) {
        state._trainingSessions = (state._trainingSessions || 0) + 1;
        checkAchievements();
        saveLocal();
        $('hearts').innerHTML = '<span class="training-badge">ðŸ“š Treino</span>';
    } else {
        $('hearts').innerHTML = isPlacement
            ? '<span class="placement-label">ðŸ“Š DiagnÃ³stico</span>'
            : 'â¤'.repeat(state.hearts) + '<span class="lost">â¤</span>'.repeat(3 - state.hearts);
    }
    $('qStem').innerHTML        = q.stem;
    $('qExplain').style.display = 'none';
    // TTS button
    if (window.speechSynthesis) {
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'tts-btn'; ttsBtn.title = 'Ouvir pergunta'; ttsBtn.textContent = 'ðŸ”Š';
        ttsBtn.addEventListener('click', speakQuestion);
        $('qStem').style.position = 'relative';
        $('qStem').appendChild(ttsBtn);
    }
    const opts = $('qOpts'); opts.innerHTML = '';
    q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = `<span class="opt-label-badge">${OPT_LABELS[i]}</span><span class="opt-text">${formatOpt(opt)}</span>`;
        b.dataset.optIndex = i;
        b.addEventListener('click', () => answer(i));
        opts.appendChild(b);
    });
    state.answered = false;
    $('btnNext').style.display = 'none';
    if (window._mqKeyHandler) document.removeEventListener('keydown', window._mqKeyHandler);
    window._mqKeyHandler = (e) => {
        if (state.answered) return;
        const idx = OPT_LABELS.indexOf(e.key.toUpperCase());
        if (idx !== -1 && idx < q.options.length) answer(idx);
        if (e.key === 'Enter' && state.answered && $('btnNext').style.display !== 'none') nextQuestion();
    };
    document.addEventListener('keydown', window._mqKeyHandler);
}

function answer(i) {
    if (state.answered) return;
    state.answered = true;
    const q = state.questions[state.qIndex];
    const isPlacement = state.currentPhase?.isPlacement;
    const buttons = $('qOpts').querySelectorAll('.opt');
    buttons.forEach((b, idx) => {
        b.disabled = true;
        if (idx === q.correctIndex) b.classList.add('correct');
        if (idx === i && i !== q.correctIndex) b.classList.add('wrong');
    });
    if (i === q.correctIndex) {
        state.correct++;
        if (state.currentPhase?.id === 3 && String(q.options[i]) === '0' && !state.achievements.includes('secret_zero')) {
            state.achievements.push('secret_zero');
        }
        if (!isPlacement && !state.trainingMode) state.earnedXp += 10;
        sndCorrect();
        haptic('success');
        state._answerStreak = (state._answerStreak || 0) + 1;
        if (state._answerStreak >= 3 && state._answerStreak % 3 === 0) {
            setTimeout(() => { sndStreak(); toast(`ðŸ”¥ ${state._answerStreak} acertos seguidos!`, 'success'); }, 300);
        } else {
            const remaining = state.questions.length - state.qIndex - 1;
            toast(remaining > 0 ? `âœ… Acertou! (${state.correct}/${state.qIndex + 1})` : 'âœ… Acertou!', 'success');
        }
    } else {
        sndWrong();
        haptic('error');
        state._answerStreak = 0;
        toast('âŒ Errou.', 'error');
        state.wrongCount = (state.wrongCount || 0) + 1;
        if (state.wrongCount === 1 && q.explain && !isPlacement) {
            const hint = q.explain.replace(/<[^>]+>/g,'').slice(0, 80);
            setTimeout(() => toast(`ðŸ’¡ Dica: ${hint}â€¦`, 'info'), 800);
        }
        if (!isPlacement && !state.trainingMode) {
            state.hearts--;
            if (state.hearts <= 0) return setTimeout(() => endPhase(false), 700);
        }
    }
    if (q.explain) {
        const el = $('qExplain');
        el.innerHTML = `<div class="q-explain-title">ðŸ’¡ Entendendo o conceito</div>${q.explain}`;
        el.style.display = '';
    }
    if (state.qIndex >= state.questions.length - 1) {
        return setTimeout(() => isPlacement ? endPlacementTest() : endPhase(true), 700);
    }
    $('btnNext').style.display = '';
}

function nextQuestion() {
    state.qIndex++;
    renderQuestion();
}

function endPhase(completed) {
    const total = state.questions.length;
    const pct   = state.correct / total;
    let stars = 0;
    if (completed) {
        if (pct >= 1)        stars = 3;
        else if (pct >= 0.8) stars = 2;
        else if (pct >= 0.5) stars = 1;
        else                 stars = 0;
    }

    // Modo treino: nÃ£o salva, nÃ£o ganha XP
    if (state.trainingMode) {
        $('btnRetry').textContent = 'Tentar de novo';
        $('resultStars').innerHTML = 'â˜…'.repeat(stars) + 'â˜†'.repeat(3 - stars);
        $('resultMsg').textContent = stars >= 3 ? 'Perfeito! (Treino)' : stars >= 2 ? 'Muito bem! (Treino)' : stars >= 1 ? 'Boa! (Treino)' : 'Tente de novo!';
        $('resultDetail').innerHTML = `
            Acertos: <b>${state.correct}/${total}</b> Â·
            <span style="color:var(--text-dim)">Modo Treino â€” Sem XP</span>
        `;
        $('resultView').style.display = '';
        $('phaseView').style.display  = 'none';
        return;
    }

    // mantÃ©m o melhor desempenho histÃ³rico da fase
    const prev = state.stars[state.currentPhase.id] || 0;
    if (stars > prev) state.stars[state.currentPhase.id] = stars;
    if (completed) state.xp += state.earnedXp;
    // bÃ´nus por estrelas novas
    if (stars > prev) state.xp += (stars - prev) * 25;

    checkAchievements();
    persist();
    if (stars > 0) sndStar();

    // MissÃµes
    if (stars > 0) {
        updateMissions('phases');
        updateMissions('stars', stars);
        updateMissions('correct', state.correct);
        if (stars === 3) updateMissions('perfect');
    } else {
        updateMissions('correct', state.correct);
    }

    renderHud();

    // Gap detector (falha)
    if (!completed) {
        const pid = state.currentPhase.id;
        state.failStreak[pid] = (state.failStreak[pid] || 0) + 1;
        if (state.failStreak[pid] >= 2) {
            const phase = PHASES.find(p => p.id === pid);
            if (phase && phase.region > 1) {
                const prevReg = REGIONS.find(r => r.id === phase.region - 1);
                if (prevReg) {
                    setTimeout(() => {
                        const gt = document.createElement('div');
                        gt.className = 'gap-toast show';
                        gt.innerHTML = `Dificuldade aqui? <b>Revise ${prevReg.name}</b> antes!
                            <button onclick="this.parentElement.remove();localStorage.setItem('mq_expanded_region',${prevReg.id});backToMap()">Ir revisar</button>`;
                        document.body.appendChild(gt);
                        setTimeout(() => gt.remove(), 8000);
                    }, 1500);
                }
            }
        }
    } else {
        // Resetar failStreak ao passar
        if (state.currentPhase.id) delete state.failStreak[state.currentPhase.id];
    }

    // Confetti ao 3 estrelas
    if (stars === 3) {
        setTimeout(fireConfetti, 300);
    }

    $('btnRetry').textContent = 'Tentar de novo';
    $('resultStars').innerHTML = 'â˜…'.repeat(stars) + 'â˜†'.repeat(3 - stars);
    $('resultMsg').textContent = stars >= 3 ? 'Perfeito!' : stars >= 2 ? 'Muito bem!' : stars >= 1 ? 'Boa!' : 'Tente de novo!';
    $('resultDetail').innerHTML = `
        Acertos: <b>${state.correct}/${total}</b> Â·
        XP ganho: <b>+${state.earnedXp + (stars > prev ? (stars - prev) * 25 : 0)}</b>
    `;
    $('resultView').style.display = '';
    $('phaseView').style.display  = 'none';
    if (completed && stars > 0 && state.currentPhase.id < TOTAL_PHASES && !state.stars[state.currentPhase.id + 1]) {
        setTimeout(() => { sndUnlock(); toast('Nova fase desbloqueada!', 'success'); }, 800);
    }
}

function backToMap() {
    $('resultView').style.display = 'none';
    $('phaseView').style.display  = 'none';
    $('mapView').style.display    = '';
    if (state.currentPhase?.region)
        localStorage.setItem('mq_expanded_region', state.currentPhase.region);
    renderMap();
    const next = $(`reg-${state.currentPhase?.region}`);
    if (next) next.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function retryPhase() {
    $('resultView').style.display = 'none';
    if (state.currentPhase?.isPlacement) {
        startPlacementTest(state.currentPhase.region);
    } else {
        startPhase(state.currentPhase);
    }
}

/* â”€â”€â”€ Conquistas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function checkAchievements() {
    const newly = [];
    ACHIEVEMENTS.forEach(a => {
        if (!state.achievements.includes(a.id) && a.check(state)) {
            state.achievements.push(a.id);
            newly.push(a);
        }
    });
    if (newly.length) {
        newly.forEach((a, i) => setTimeout(() => toast(`ðŸ… ${a.name}: ${a.desc}`, 'success'), i * 1600 + 1200));
    }
}

function renderAchievements() {
    const root = $('achList'); root.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
        const got = state.achievements.includes(a.id);
        const el = document.createElement('div');
        el.className = `ach ${got ? 'got' : ''}`;
        el.innerHTML = `<div class="ach-icon">${got ? 'ðŸ…' : 'ðŸ”’'}</div>
                        <div><b>${esc(a.name)}</b><br><small>${esc(a.desc)}</small></div>`;
        root.appendChild(el);
    });
}

/* â”€â”€â”€ Sair (trocar aluno) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function logout() {
    const modal = document.createElement('div');
    modal.className = 'logout-modal';
    modal.innerHTML = `
        <div class="logout-card">
            <div class="logout-icon">â»</div>
            <h3>Sair do MathQuest?</h3>
            <p>Seu progresso estÃ¡ salvo. Para voltar, entre no mesmo dispositivo ou peÃ§a o cÃ³digo pro professor.</p>
            <div class="logout-actions">
                <button class="btn-secondary" id="btnLogoutCancel">Cancelar</button>
                <button class="btn-danger" id="btnLogoutConfirm">Sair</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    $('btnLogoutCancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    $('btnLogoutConfirm').addEventListener('click', async () => {
        $('btnLogoutConfirm').textContent = 'â€¦';
        $('btnLogoutConfirm').disabled = true;
        try { await sb.auth.signOut(); } catch (_) {}
        ['mq_localuid', 'mq_class_code'].forEach(k => localStorage.removeItem(k));
        Object.keys(localStorage).filter(k => k.startsWith('mq_progress_')).forEach(k => localStorage.removeItem(k));
        location.reload();
    });
}

/* â”€â”€â”€ Boas-vindas (cadastra apelido) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function showWelcome() {
    $('welcome').style.display = '';
    $('app').style.display     = 'none';
}

function hideWelcome() {
    $('welcome').style.display = 'none';
    $('app').style.display     = '';
}

async function startGame() {
    const nick = $('nickInput').value.trim();
    if (!nick) { $('welcomeError').textContent = 'Digite seu nome para comeÃ§ar.'; return; }
    if (nick.length > 30) { $('welcomeError').textContent = 'Nome longo demais (mÃ¡x. 30).'; return; }
    state.nickname = nick;
    // CÃ³digo de turma Ã© opcional. Se digitado, normaliza pra uppercase e tenta entrar.
    const codeRaw = $('classCodeInput')?.value.trim().toUpperCase() || '';
    if (codeRaw) {
        // Persiste o apelido NO BANCO antes de entrar na turma, pra que o
        // professor jÃ¡ veja o aluno com nome no roster (em vez de "entrou
        // agora" sem identificaÃ§Ã£o).
        await persistAwait();
        const joined = await joinClass(codeRaw);
        if (!joined) { return; }  // joinClass jÃ¡ mostrou o erro
        state.classCode = codeRaw;
        localStorage.setItem('mq_class_code', codeRaw);
    } else {
        persist();
    }
    hideWelcome();
    // Primeiro acesso: mostra tutorial antes do mapa.  Depois disso a flag fica
    // em localStorage e o aluno vai direto pro mapa nas prÃ³ximas visitas.
    if (!localStorage.getItem('mq_onboarded')) {
        showOnboarding();
    } else {
        renderMap();
    }
}

/* â”€â”€â”€ Turma (opcional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Aluno digita o cÃ³digo que o professor passou e vira membro da turma.
 * Professor entÃ£o vÃª o progresso no painel.  Sem cÃ³digo, o jogo funciona
 * normalmente â€” sÃ³ nÃ£o aparece em nenhum painel.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function joinClass(code) {
    if (!state.userId) {
        $('welcomeError').textContent = 'Aguarde a conexÃ£o e tente de novo.';
        return false;
    }
    if (!BACKEND_CONFIGURED || state.userId.startsWith('local-')) {
        $('welcomeError').textContent = 'Turmas indisponÃ­veis: backend Firebase ainda nÃ£o configurado.';
        return false;
    }
    const { data, error: e1 } = await sb.rpc('join_class', { p_code: code });
    const cls = Array.isArray(data) ? data[0] : data;
    if (e1 || !cls) {
        $('welcomeError').textContent = 'CÃ³digo de turma nÃ£o encontrado.';
        return false;
    }
    toast(`Entrou na turma "${cls.name}"!`, 'success');
    return true;
}

/* â”€â”€â”€ Onboarding (primeira visita) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function showOnboarding() {
    $('onboarding').style.display = '';
    $('app').style.display        = 'none';
}

function finishOnboarding() {
    localStorage.setItem('mq_onboarded', '1');
    $('onboarding').style.display = 'none';
    $('app').style.display        = '';
    renderMap();
}

/* â”€â”€â”€ InicializaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function init() {
    $('loader').style.display = '';
    await initAuth();
    const remote = await loadRemote();
    if (!remote) loadLocal();
    updateStreak();
    if (!state.nickname) {
        $('loader').style.display = 'none';
        showWelcome();
    } else {
        hideWelcome();
        renderMap();
        $('loader').style.display = 'none';
    }
}

/* â”€â”€â”€ Streak â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const last  = localStorage.getItem('mq_last_play') || '';
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (last === today) return;
    if (last === yesterday) {
        state.streak = (state.streak || 0) + 1;
    } else if (last !== today) {
        state.streak = 1;
    }
    localStorage.setItem('mq_last_play', today);
    saveLocal();
}

/* â”€â”€â”€ MissÃµes diÃ¡rias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const MISSIONS_DEFS = [
    { id: 'play3',    name: 'Jogar 3 fases',          target: 3,  reward: 50,  icon: 'ðŸŽ®', track: 'phases' },
    { id: 'stars5',   name: 'Ganhar 5 estrelas',       target: 5,  reward: 75,  icon: 'â­', track: 'stars' },
    { id: 'correct10',name: '10 respostas certas',     target: 10, reward: 60,  icon: 'âœ…', track: 'correct' },
    { id: 'play5',    name: 'Jogar 5 fases',           target: 5,  reward: 100, icon: 'ðŸŽ¯', track: 'phases' },
    { id: 'noerror',  name: 'Fase perfeita (3â˜…)',       target: 1,  reward: 80,  icon: 'ðŸ’Ž', track: 'perfect' },
    { id: 'region',   name: 'Complete uma regiÃ£o',     target: 1,  reward: 150, icon: 'ðŸ—ºï¸', track: 'region' },
    { id: 'play1',    name: 'Jogue pelo menos 1 fase', target: 1,  reward: 25,  icon: 'ðŸ‘Ÿ', track: 'phases' },
    { id: 'stars3',   name: 'Ganhar 3 estrelas',       target: 3,  reward: 45,  icon: 'ðŸŒŸ', track: 'stars' },
];

function getDailyMissions() {
    const today = new Date().toISOString().slice(0, 10);
    const saved = localStorage.getItem('mq_missions_date');
    if (saved === today) {
        try { return JSON.parse(localStorage.getItem('mq_missions')); } catch { }
    }
    const seed  = today.replace(/-/g,'');
    const idx   = [parseInt(seed) % MISSIONS_DEFS.length,
                   (parseInt(seed) + 3) % MISSIONS_DEFS.length,
                   (parseInt(seed) + 5) % MISSIONS_DEFS.length];
    const missions = idx.map(i => ({ ...MISSIONS_DEFS[i], progress: 0, done: false }));
    localStorage.setItem('mq_missions_date', today);
    localStorage.setItem('mq_missions', JSON.stringify(missions));
    return missions;
}

function updateMissions(track, amount = 1) {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('mq_missions_date') !== today) getDailyMissions();
    let missions = getDailyMissions();
    let changed = false;
    missions.forEach(m => {
        if (m.done || m.track !== track) return;
        m.progress = Math.min(m.target, (m.progress || 0) + amount);
        if (m.progress >= m.target && !m.done) {
            m.done = true;
            state.xp += m.reward;
            toast(`âœ… MissÃ£o "${m.name}" completa! +${m.reward} XP`, 'success');
            changed = true;
        }
    });
    localStorage.setItem('mq_missions', JSON.stringify(missions));
    if (changed) persist();
    renderMissions();
}

function renderMissions() {
    const list = $('missionsList');
    if (!list) return;
    const missions = getDailyMissions();
    list.innerHTML = missions.map(m => `
        <div class="mission-item ${m.done ? 'done' : ''}">
            <div class="mission-top">
                <span class="mission-name">${m.icon} ${m.name}</span>
                <span class="mission-reward">+${m.reward} XP</span>
            </div>
            <div class="mission-bar">
                <div class="mission-bar-fill" style="width:${Math.min(100,(m.progress||0)/m.target*100)}%"></div>
            </div>
            <div class="mission-progress">${m.progress||0}/${m.target} ${m.done ? 'âœ“' : ''}</div>
        </div>
    `).join('');
}

/* â”€â”€â”€ Confetti â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function fireConfetti() {
    const colors = ['#f0c419','#f0883e','#3fb950','#d2a8ff','#79c0ff','#ff7b72'];
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    for (let i = 0; i < 60; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.cssText = `
            left:${Math.random()*100}%;
            background:${colors[Math.floor(Math.random()*colors.length)]};
            width:${6+Math.random()*8}px;
            height:${6+Math.random()*8}px;
            --dx:${(Math.random()-0.5)*200}px;
            animation-duration:${1.5+Math.random()*2}s;
            animation-delay:${Math.random()*0.5}s;
            border-radius:${Math.random()>0.5?'50%':'2px'};
        `;
        container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 4000);
}

/* â”€â”€â”€ Haptic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const haptic = (type = 'light') => {
    if (!navigator.vibrate) return;
    if (type === 'success') navigator.vibrate([30, 20, 60]);
    else if (type === 'error') navigator.vibrate([80]);
    else navigator.vibrate(20);
};

/* â”€â”€â”€ Swipe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function initSwipe(el) {
    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive:true});
    el.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (dx < -60 && state.answered && $('btnNext').style.display !== 'none') nextQuestion();
    }, {passive:true});
}

/* â”€â”€â”€ TTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function speakQuestion() {
    if (!window.speechSynthesis) return;
    const text = $('qStem').textContent;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'pt-BR'; utt.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
}

/* â”€â”€â”€ Leaderboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function loadLeaderboard() {
    if (!state.classCode) {
        $('lbList').innerHTML = '<p class="lb-empty">Entre em uma turma para ver o ranking.</p>';
        return;
    }
    const list = $('lbList');
    list.innerHTML = '<p class="lb-empty">Carregandoâ€¦</p>';
    try {
        const { data: rows, error } = await sb.rpc('class_leaderboard', { p_class_code: state.classCode });
        if (error) throw error;
        if (!rows?.length) { list.innerHTML = '<p class="lb-empty">Sem dados ainda.</p>'; return; }
        const medals = ['ðŸ¥‡','ðŸ¥ˆ','ðŸ¥‰'];
        const rankClasses = ['gold','silver','bronze'];
        list.innerHTML = rows.map((r, i) => {
            const totalStarsLb = Object.values(r.stars||{}).reduce((a,b)=>a+b,0);
            const isMe = r.nickname === state.nickname;
            return `<div class="lb-row ${isMe?'me':''}">
                <span class="lb-rank ${rankClasses[i]||''}">${medals[i] || (i+1)}</span>
                <span class="lb-name">${esc(r.nickname || '?')}${isMe?' ðŸ‘ˆ':''}</span>
                <span class="lb-stars">â˜…${totalStarsLb}</span>
                <span class="lb-xp">âš¡${r.xp}</span>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = '<p class="lb-empty">Erro ao carregar.</p>';
    }
}

/* â”€â”€â”€ RevisÃ£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function showRevision() {
    const view = $('revisionView');
    if (!view) return;
    $('mapView').style.display = 'none';
    view.style.display = '';
    const needsWork = Object.entries(state.stars)
        .filter(([,s]) => s < 3)
        .sort(([,a],[,b]) => a - b)
        .slice(0, 20)
        .map(([id]) => PHASES.find(p => p.id === parseInt(id)))
        .filter(Boolean);
    const grid = $('revisionGrid');
    if (!needsWork.length) {
        grid.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:2rem">ParabÃ©ns! Todas as fases tÃªm 3 estrelas! ðŸ†</p>';
        return;
    }
    grid.innerHTML = needsWork.map(p => `
        <div class="revision-phase" data-id="${p.id}">
            <div class="revision-stars">${'â˜…'.repeat(state.stars[p.id]||0)}${'â˜†'.repeat(3-(state.stars[p.id]||0))}</div>
            <div class="revision-info">
                <b>${p.name}</b>
                <small>Fase ${p.id} Â· RegiÃ£o ${p.region}</small>
            </div>
            <span>â†’</span>
        </div>
    `).join('');
    grid.querySelectorAll('.revision-phase').forEach(el => {
        el.addEventListener('click', () => {
            view.style.display = 'none';
            $('mapView').style.display = '';
            const p = PHASES.find(ph => ph.id === parseInt(el.dataset.id));
            if (p) startPhase(p);
        });
    });
}

function hideRevision() {
    const view = $('revisionView');
    if (view) view.style.display = 'none';
    $('mapView').style.display = '';
}

/* â”€â”€â”€ Avatar Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const AVATARS = ['ðŸŽ“','ðŸ¦Š','ðŸ¼','ðŸš€','âš¡','ðŸŒŸ','ðŸ¦','ðŸ‰','ðŸŽ¯','ðŸ†','ðŸŒˆ','ðŸŽ¸','ðŸ¤–','ðŸ¦„','ðŸº','ðŸŽª','ðŸŒŠ','ðŸ”¥','ðŸ’Ž','ðŸ§™'];

function showAvatarPicker() {
    const modal = document.createElement('div');
    modal.className = 'avatar-modal';
    modal.innerHTML = `<div class="avatar-card">
        <h3>Escolha seu avatar</h3>
        <div class="avatar-grid">${AVATARS.map(a=>`<button class="avatar-opt ${a===state.avatar?'selected':''}" data-a="${a}">${a}</button>`).join('')}</div>
        <button class="btn-secondary" id="btnAvatarClose" style="width:100%">Fechar</button>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.avatar-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            state.avatar = btn.dataset.a;
            persist();
            renderHud();
            modal.remove();
        });
    });
    $('btnAvatarClose').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

(function injectStyles() {
    const css = `.opt{display:flex;align-items:center;gap:.6rem;text-align:left}.opt-label-badge{display:inline-flex;align-items:center;justify-content:center;min-width:1.6rem;height:1.6rem;border-radius:50%;background:rgba(255,255,255,.12);font-size:.75rem;font-weight:700;flex-shrink:0;color:var(--text-dim,#8b949e);transition:background .2s}.opt:hover .opt-label-badge,.opt:focus .opt-label-badge{background:rgba(240,136,62,.3);color:#f0883e}.opt.correct .opt-label-badge{background:#3fb95022;color:#3fb950}.opt.wrong .opt-label-badge{background:#f8514922;color:#f85149}.opt-text{flex:1}.frac-inline{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1.1;font-size:.9em;margin:0 .1em}.frac-inline sup,.frac-inline sub{font-size:1em;line-height:1}.frac-bar-char{font-size:.85em;line-height:.8}#qProgressBarWrap{margin-bottom:.4rem!important}.kbd-hint{text-align:center;font-size:.7rem;color:var(--text-dim,.4);margin-top:.4rem;letter-spacing:.03em}`;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

document.addEventListener('DOMContentLoaded', () => {
    // Bind UI
    $('btnStart')      .addEventListener('click', startGame);
    $('nickInput')     .addEventListener('keydown', e => e.key === 'Enter' && startGame());
    $('btnNext')       .addEventListener('click', nextQuestion);
    $('btnBackMap')    .addEventListener('click', () => {
        const msg = state.currentPhase?.isPlacement
            ? 'Sair do teste de nivelamento? Seu progresso neste teste serÃ¡ perdido.'
            : 'Sair da fase? O progresso desta tentativa serÃ¡ perdido.';
        if (confirm(msg)) backToMap();
    });
    $('btnBackFromRes').addEventListener('click', backToMap);
    $('btnRetry')      .addEventListener('click', retryPhase);
    $('btnMute')       .addEventListener('click', () => {
        state.muted = !state.muted;
        localStorage.setItem('mq_muted', state.muted ? '1' : '0');
        renderHud();
    });
    $('btnLogout')     .addEventListener('click', logout);
    $('btnAch')        .addEventListener('click', () => {
        renderAchievements();
        $('achDrawer').classList.toggle('open');
    });
    $('btnCloseAch')   .addEventListener('click', () => $('achDrawer').classList.remove('open'));
    $('btnSwapName')   .addEventListener('click', () => {
        const n = prompt('Novo nome:', state.nickname);
        if (n && n.trim()) { state.nickname = n.trim().slice(0, 30); persist(); renderHud(); }
        showAvatarPicker();
    });
    $('btnOnboardingDone')?.addEventListener('click', finishOnboarding);

    // Seletor de ano escolar no onboarding
    document.querySelectorAll('.ob-year-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ob-year-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            localStorage.setItem('mq_school_year', btn.dataset.year);
        });
    });

    // PWA: prompt de instalaÃ§Ã£o. Browser dispara beforeinstallprompt quando a
    // pÃ¡gina atende aos critÃ©rios (HTTPS, manifest, SW). Guardamos o evento e
    // mostramos um botÃ£o no HUD que o aluno pode tocar pra instalar como app.
    let deferredInstall = null;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredInstall = e;
        const btn = $('btnInstall');
        if (btn) btn.style.display = '';
    });
    $('btnInstall')?.addEventListener('click', async () => {
        if (!deferredInstall) return;
        deferredInstall.prompt();
        const { outcome } = await deferredInstall.userChoice;
        if (outcome === 'accepted') {
            toast('App instalado! Procure o Ã­cone na tela inicial.', 'success');
        }
        deferredInstall = null;
        $('btnInstall').style.display = 'none';
    });

    // Missions drawer
    $('btnMissions')?.addEventListener('click', () => {
        renderMissions();
        $('missionsDrawer')?.classList.toggle('open');
    });
    $('btnCloseMissions')?.addEventListener('click', () => {
        $('missionsDrawer')?.classList.remove('open');
    });

    // Leaderboard drawer
    $('btnLeaderboard')?.addEventListener('click', () => {
        loadLeaderboard();
        $('lbDrawer')?.classList.toggle('open');
    });
    $('btnCloseLb')?.addEventListener('click', () => {
        $('lbDrawer')?.classList.remove('open');
    });

    // Revision
    $('btnRevision')?.addEventListener('click', showRevision);
    $('btnBackRevision')?.addEventListener('click', hideRevision);

    // High contrast
    $('btnContrast')?.addEventListener('click', () => {
        document.body.classList.toggle('high-contrast');
        localStorage.setItem('mq_hc', document.body.classList.contains('high-contrast') ? '1' : '0');
    });

    // Font size
    $('btnFontUp')?.addEventListener('click', () => {
        const cur = parseFloat(localStorage.getItem('mq_font') || '1');
        const next = Math.min(1.4, cur + 0.1);
        document.documentElement.style.setProperty('--font-scale', next);
        localStorage.setItem('mq_font', next);
    });
    $('btnFontDown')?.addEventListener('click', () => {
        const cur = parseFloat(localStorage.getItem('mq_font') || '1');
        const next = Math.max(0.8, cur - 0.1);
        document.documentElement.style.setProperty('--font-scale', next);
        localStorage.setItem('mq_font', next);
    });

    // Swipe
    initSwipe($('phaseView'));

    // Restore preferences
    if (localStorage.getItem('mq_hc') === '1') document.body.classList.add('high-contrast');
    const savedFont = localStorage.getItem('mq_font');
    if (savedFont) document.documentElement.style.setProperty('--font-scale', savedFont);

    // Service Worker
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
    if (new URLSearchParams(location.search).get('view') !== ROLES.TEACHER) {
        ensureConsent().then(init);
    }
});


/* â”€â”€â”€ MathQuest â€” Extras v2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Funcionalidades adicionais carregadas apÃ³s script.js.
 * Acessa globals: state, toast, persist, renderHud, PHASES, REGIONS, etc.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€ Gems (moeda virtual) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let gems = parseInt(localStorage.getItem('mq_gems') || '0');

function addGems(amount, reason = '') {
    gems += amount;
    localStorage.setItem('mq_gems', gems);
    updateGemsHud();
    if (reason) toast(`ðŸ’Ž +${amount} gemas${reason ? ' â€” ' + reason : ''}`, 'success');
}

function updateGemsHud() {
    const el = document.getElementById('hudGems');
    if (el) el.textContent = gems;
}

// Patch renderHud para incluir gems (sem modificar script.js)
const _origRenderHud = window.renderHud;
window.renderHud = function() {
    _origRenderHud?.apply(this, arguments);
    updateGemsHud();
};

// Patch endPhase para ganhar gems
const _origEndPhase = window.endPhase;
window.endPhase = function(completed) {
    _origEndPhase?.apply(this, arguments);
    if (!completed) return;
    const stars = state.stars[state.currentPhase?.id] || 0;
    if (stars === 3) addGems(5, 'fase perfeita!');
    else if (stars > 0) addGems(1);
    // MissÃ£o: dias com missÃµes completadas
    const today = new Date().toISOString().slice(0,10);
    const missionDays = new Set(JSON.parse(localStorage.getItem('mq_mission_days') || '[]'));
    const missions = JSON.parse(localStorage.getItem('mq_missions') || '[]');
    if (missions.some(m => m.done)) {
        missionDays.add(today);
        localStorage.setItem('mq_mission_days', JSON.stringify([...missionDays]));
        state._missionDays = missionDays.size;
    }
};

/* â”€â”€ Modo Maratona â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let marathonActive = false;
let marathonPhaseIndex = 0;
let marathonCorrect = 0;
let marathonTotal = 0;
let marathonRegion = null;

function startMarathon(regionId) {
    marathonActive = true;
    marathonPhaseIndex = 0;
    marathonCorrect = 0;
    marathonTotal = 0;
    marathonRegion = regionId;
    const regionPhases = PHASES.filter(p => p.region === regionId && window.isUnlocked?.(p.id));
    if (!regionPhases.length) { toast('Nenhuma fase desbloqueada nesta regiÃ£o.', 'error'); return; }
    const phase = regionPhases[marathonPhaseIndex % regionPhases.length];
    toast(`ðŸƒ Maratona iniciada! ${regionPhases.length} fases.`, 'info');
    startPhase(phase);
}

// IntervÃ©m apÃ³s endPhase na maratona: se passou, vai para a prÃ³xima
const _origBackToMap = window.backToMap;
window._marathonNextPhase = function() {
    if (!marathonActive) return false;
    const regionPhases = PHASES.filter(p => p.region === marathonRegion && window.isUnlocked?.(p.id));
    marathonPhaseIndex++;
    if (marathonPhaseIndex >= regionPhases.length) {
        marathonActive = false;
        toast(`ðŸ† Maratona completa! ${marathonCorrect}/${marathonTotal} acertos.`, 'success');
        return false;
    }
    const next = regionPhases[marathonPhaseIndex];
    setTimeout(() => startPhase(next), 400);
    return true;
};

/* â”€â”€ QR Code (URL do jogo) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function showQRCode() {
    const url = location.href.split('?')[0].replace('teacher.html','index.html');
    const modal = document.createElement('div');
    modal.className = 'qr-modal';
    modal.innerHTML = `<div class="qr-card">
        <h3>ðŸ“² Acesso rÃ¡pido</h3>
        <p>Aponte a cÃ¢mera para entrar no MathQuest</p>
        <div id="qrCodeEl" style="display:flex;justify-content:center;margin:1rem 0"></div>
        <p style="color:#555;font-size:.75rem;word-break:break-all">${url}</p>
        <button class="qr-close" id="btnQrClose">Fechar</button>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('btnQrClose').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
    // Usa QRCode.js se disponÃ­vel, senÃ£o usa img do Google Charts API
    const container = document.getElementById('qrCodeEl');
    if (window.QRCode) {
        new QRCode(container, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    } else {
        const img = document.createElement('img');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
        img.width = 200; img.height = 200; img.alt = 'QR Code';
        img.style.borderRadius = '8px';
        container.appendChild(img);
    }
}
window.showQRCode = showQRCode;

/* â”€â”€ Eventos Semanais TemÃ¡ticos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const WEEKLY_EVENTS = [
    { name: 'Semana das FraÃ§Ãµes',    regions: [4,5],   bonus: 2, icon: 'ðŸ•' },
    { name: 'Semana das EquaÃ§Ãµes',   regions: [6,7],   bonus: 2, icon: 'âš–ï¸' },
    { name: 'Semana da Geometria',   regions: [7,8],   bonus: 2, icon: 'ðŸ“' },
    { name: 'Semana dos NÃºmeros',    regions: [1,2,3], bonus: 1, icon: 'ðŸ”¢' },
    { name: 'Semana do Vestibular',  regions: [9,10],  bonus: 3, icon: 'ðŸŽ“' },
    { name: 'Semana das PotÃªncias',  regions: [8],     bonus: 2, icon: 'âš¡' },
    { name: 'Semana da Probabilidade', regions: [5,9], bonus: 2, icon: 'ðŸŽ²' },
];

function getCurrentWeeklyEvent() {
    const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    return WEEKLY_EVENTS[weekNum % WEEKLY_EVENTS.length];
}

function showWeeklyEventBanner() {
    const existing = document.getElementById('weeklyEventBanner');
    if (existing) return;
    const event = getCurrentWeeklyEvent();
    const banner = document.createElement('div');
    banner.id = 'weeklyEventBanner';
    banner.style.cssText = `
        background: linear-gradient(135deg, #f0883e22, #d2a8ff22);
        border: 1px solid #f0883e55; border-radius: 12px;
        padding: .65rem 1rem; margin: .5rem 1rem;
        display: flex; align-items: center; gap: .65rem;
        font-size: .875rem; cursor: pointer;
        max-width: 720px; margin-left: auto; margin-right: auto;
    `;
    banner.innerHTML = `
        <span style="font-size:1.4rem">${event.icon}</span>
        <div style="flex:1">
            <b style="color:#f0883e">${event.name}</b>
            <span style="color:#8b949e;font-size:.8rem"> â€” +${event.bonus}x XP nas regiÃµes destaque esta semana!</span>
        </div>
        <button onclick="this.parentElement.remove()" style="color:#8b949e;font-size:1rem;background:none;border:none;cursor:pointer">âœ•</button>
    `;
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.parentElement.insertBefore(banner, mapEl);
}

// XP bÃ´nus na semana temÃ¡tica
const _origEndPhase2 = window.endPhase;
window.endPhase = function(completed) {
    _origEndPhase2?.apply(this, arguments);
    if (!completed || !state.currentPhase) return;
    const event = getCurrentWeeklyEvent();
    const phase = PHASES.find(p => p.id === state.currentPhase.id);
    if (phase && event.regions.includes(phase.region) && (state.stars[phase.id] || 0) > 0) {
        const bonus = (state.earnedXp || 0) * (event.bonus - 1);
        if (bonus > 0) {
            state.xp += bonus;
            toast(`${event.icon} BÃ´nus da semana: +${bonus} XP!`, 'success');
            persist?.();
            renderHud();
        }
    }
};

/* â”€â”€ Tracking de tempo de resposta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let questionStartTime = 0;

const _origRenderQuestion = window.renderQuestion;
window.renderQuestion = function() {
    _origRenderQuestion?.apply(this, arguments);
    questionStartTime = Date.now();
};

const _origAnswer = window.answer;
window.answer = function(i) {
    const elapsed = Date.now() - questionStartTime;
    // Armazena tempo mÃ©dio de resposta
    const key = 'mq_avg_time';
    const prev = JSON.parse(localStorage.getItem(key) || '{"sum":0,"count":0}');
    prev.sum += elapsed; prev.count++;
    localStorage.setItem(key, JSON.stringify(prev));
    // Conquista relÃ¢mpago: resposta em menos de 5 segundos
    const q = state.questions[state.qIndex];
    if (elapsed < 5000 && q && i === q.correctIndex) {
        state._correctStreak = (state._correctStreak || 0) + 1;
    } else {
        state._correctStreak = 0;
    }
    _origAnswer?.apply(this, arguments);
};

/* â”€â”€ LGPD / Consentimento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let consentPromise;
function ensureConsent() {
    if (localStorage.getItem('mq_lgpd_ok')) return Promise.resolve();
    if (consentPromise) return consentPromise;
    consentPromise = new Promise(resolve => {
    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:flex-end;padding:1rem`;
    modal.innerHTML = `
        <div style="background:#1c2128;border:1px solid #30363d;border-radius:16px 16px 12px 12px;padding:1.5rem;width:100%;max-width:600px;margin:0 auto">
            <h3 style="margin-bottom:.5rem">ðŸ”’ Privacidade e LGPD</h3>
            <p style="color:#8b949e;font-size:.85rem;line-height:1.5;margin-bottom:1rem">
                O MathQuest salva seu progresso (apelido, estrelas, XP) no servidor para que vocÃª possa continuar de qualquer lugar.
                Nenhum dado pessoal identificÃ¡vel Ã© coletado.
                <a href="privacy.html" style="color:#f0883e" target="_blank">Ver polÃ­tica de privacidade completa</a>.
            </p>
            <div style="display:flex;align-items:center;gap:.65rem;margin-bottom:1rem">
                <input type="checkbox" id="lgpdAge" style="width:18px;height:18px">
                <label for="lgpdAge" style="font-size:.85rem;color:#8b949e">Tenho 13 anos ou mais (ou meus pais autorizam o uso)</label>
            </div>
            <button id="btnLgpdOk" style="width:100%;padding:.85rem;background:#f0883e;color:#0d1117;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit">
                Entendi e aceito
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btnLgpdOk').addEventListener('click', () => {
        if (!document.getElementById('lgpdAge').checked) {
            alert('Por favor, confirme sua idade antes de continuar.');
            return;
        }
        localStorage.setItem('mq_lgpd_ok', '1');
        modal.remove();
        resolve();
    });
    });
    return consentPromise;
}

/* â”€â”€ Mensagens da turma (receber do professor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function checkClassMessages() {
    if (!localStorage.getItem('mq_lgpd_ok') || !state?.classCode || !window.sb || !BACKEND_CONFIGURED) return;
    try {
        const since = new Date(Date.now() - 24*60*60*1000).toISOString();
        const { data } = await sb.from('class_messages')
            .select('message,created_at')
            .eq('class_code', state.classCode)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(1);
        if (!data?.length) return;
        const lastMsg = data[0];
        const key = 'mq_last_msg';
        if (localStorage.getItem(key) === lastMsg.created_at) return;
        localStorage.setItem(key, lastMsg.created_at);
        // Mostra banner da mensagem do professor
        const banner = document.createElement('div');
        banner.style.cssText = `
            position:fixed;top:70px;left:50%;transform:translateX(-50%);
            background:#1c2128;border:1px solid #f0883e;border-radius:12px;
            padding:1rem 1.25rem;z-index:50;max-width:90vw;text-align:center;
            box-shadow:0 8px 24px rgba(0,0,0,.35);animation:slideUp .25s ease-out;
        `;
        banner.innerHTML = `<div style="font-size:.75rem;color:#8b949e;margin-bottom:.35rem">ðŸ“¢ Mensagem do professor</div>
            <div style="font-weight:600">${esc(lastMsg.message)}</div>
            <button onclick="this.parentElement.remove()" style="margin-top:.65rem;color:#8b949e;font-size:.8rem;background:none;border:none;cursor:pointer">Fechar âœ•</button>`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 12000);
    } catch(e) { /* ignora erros de rede */ }
}

/* â”€â”€ InicializaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
document.addEventListener('DOMContentLoaded', () => {
    // Gems HUD element (se nÃ£o existir, adiciona)
    setTimeout(() => {
        const hudStats = document.querySelector('.hud-stats');
        if (hudStats && !document.getElementById('hudGems')) {
            const gemEl = document.createElement('div');
            gemEl.className = 'stat';
            gemEl.title = 'Gemas';
            gemEl.innerHTML = `<span>ðŸ’Ž</span><b id="hudGems">${gems}</b>`;
            hudStats.appendChild(gemEl);
        }

        // BotÃ£o QR no HUD (se nÃ£o existir)
        const hudRight = document.querySelector('.hud-right');
        if (hudRight && !document.getElementById('btnQR')) {
            const qrBtn = document.createElement('button');
            qrBtn.id = 'btnQR';
            qrBtn.className = 'hud-btn';
            qrBtn.title = 'QR Code de acesso';
            qrBtn.textContent = 'ðŸ“²';
            qrBtn.addEventListener('click', showQRCode);
            hudRight.insertBefore(qrBtn, hudRight.firstChild);
        }
    }, 500);

    // Mensagens da turma (checa a cada 5 minutos)
    setTimeout(checkClassMessages, 3000);
    setInterval(checkClassMessages, 5 * 60 * 1000);

    // Evento semanal: mostra banner ao abrir o mapa
    const _origRenderMap = window.renderMap;
    if (_origRenderMap) {
        window.renderMap = function() {
            _origRenderMap.apply(this, arguments);
            setTimeout(showWeeklyEventBanner, 300);
        };
    }
});

// ExpÃµe funÃ§Ãµes globais
window.addGems     = addGems;
window.startMarathon = startMarathon;
window.showQRCode  = showQRCode;
window.getCurrentWeeklyEvent = getCurrentWeeklyEvent;
window.$ = $;
window.esc = esc;
window.REGIONS = REGIONS;
window.sb = sb;
window.MQ_BACKEND_CONFIGURED = BACKEND_CONFIGURED;


