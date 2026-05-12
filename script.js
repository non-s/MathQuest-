/* ─── Configuração do Supabase ─────────────────────────────────────────────
 * Substitua pelos valores do seu projeto Supabase.
 * Settings → API → Project URL e anon public key.
 * A chave anon é pública por design — o RLS protege os dados no servidor.
 * ─────────────────────────────────────────────────────────────────────── */
const SUPABASE_URL      = 'https://tlxckwsqzuedospqqyfw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRseGNrd3NxenVlZG9zcHFxeWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODM5NjAsImV4cCI6MjA5NDE1OTk2MH0.NIAf7zjDStOPgt10cza5s_1Kwk6a_uWkkpjLJ4UGKyw';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── Estado ────────────────────────────────────────────────────────────── */
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
};

/* ─── Utilitários ───────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rand    = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick    = arr   => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr   => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep   = ms    => new Promise(r => setTimeout(r, ms));

/* ─── Toast ─────────────────────────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = 'info') {
    const el = $('toast');
    el.textContent = msg;
    el.className   = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ─── Som (Web Audio simples — sem assets) ─────────────────────────────── */
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
const sndCorrect = () => { beep(660, 0.08); setTimeout(() => beep(880, 0.15), 80); };
const sndWrong   = () => beep(180, 0.22, 'square', .08);
const sndStar    = () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', .1), i * 90)); };
const sndUnlock  = () => { [392, 523, 659].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'sine', .1), i * 100)); };

/* ─── Regiões (mapa) ────────────────────────────────────────────────────── */
const REGIONS = [
    { id: 1, name: 'Vila dos Números',      year: '1º ano', color: '#7dd3a8', icon: '🏘️',  desc: 'Primeiros passos: contar, reconhecer e comparar.' },
    { id: 2, name: 'Bosque das Operações',  year: '2º ano', color: '#69b8e5', icon: '🌳',  desc: 'Somas, subtrações e família dos números.' },
    { id: 3, name: 'Vale das Tabuadas',     year: '3º ano', color: '#f0c75e', icon: '🌾',  desc: 'Multiplicação, divisão e dinheiro.' },
    { id: 4, name: 'Caverna das Frações',   year: '4º ano', color: '#e88c4a', icon: '🕳️',  desc: 'Pedaços do todo e medidas.' },
    { id: 5, name: 'Lago dos Decimais',     year: '5º ano', color: '#5fc8c8', icon: '🏞️',  desc: 'Vírgulas, porcentagens e áreas.' },
    { id: 6, name: 'Montanha dos Inteiros', year: '6º ano', color: '#a78bdc', icon: '⛰️',  desc: 'Negativos, MMC e primeiras equações.' },
    { id: 7, name: 'Deserto das Equações',  year: '7º ano', color: '#c89669', icon: '🏜️',  desc: 'X dos dois lados, razão e proporção.' },
    { id: 8, name: 'Templo das Potências',  year: '8º ano', color: '#e26d6d', icon: '🏛️',  desc: 'Potências, raízes e álgebra.' },
    { id: 9, name: 'Cidadela do Mestre',    year: '9º ano', color: '#f0c419', icon: '🏰',  desc: 'Funções, Bhaskara e Pitágoras.' },
];

/* ─── Geradores de questões ───────────────────────────────────────────────
 * Toda fase declara um gerador. O gerador retorna 5 questões.
 * Question = { stem, options[4], correctIndex, explain? }
 * ──────────────────────────────────────────────────────────────────────── */

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

/* ── 1º ano — Vila dos Números ─────────────────────────────────────────── */
const g_count = (min, max) => Q(5, () => {
    const n = rand(min, max);
    return { stem: `Quantas bolinhas você vê?<div class="dots">${'<span>●</span>'.repeat(n)}</div>`,
             ...makeChoice(n, nearDistr(n, 3)),
             explain: `Para contar: conte um a um. O último número que você falar é a resposta!` };
});

const g_zero = () => Q(5, () => {
    const items = [
        { stem: 'Quantos elefantes verdes existem nesta sala?<div class="dots"></div>', ans: 0 },
        { stem: 'Se eu tenho 2 maçãs e como as 2, quantas sobram?', ans: 0 },
        { stem: 'Quantos números vêm antes do 1?', ans: 0 },
        { stem: 'Um saco vazio tem quantas bolas?', ans: 0 },
        { stem: 'Quantos meses do ano têm 32 dias?', ans: 0 },
        { stem: 'Quanto é 7 − 7?', ans: 0 },
        { stem: 'Quanto é 4 + 0?', ans: 4, d: [0, 1, 5] },
        { stem: 'Quantas patas tem um peixe?', ans: 0 },
        { stem: 'Quantas vezes o número 0 cabe em 8?', ans: 0 },
        { stem: 'Quantos dias da semana começam com a letra K?', ans: 0 },
        { stem: 'Quantos cachorros voam pela janela?', ans: 0 },
        { stem: 'Quanto é 10 − 10?', ans: 0 },
        { stem: 'Uma caixa fechada e vazia tem quantos brinquedos?', ans: 0 },
        { stem: 'Quanto é 5 × 0?', ans: 0 },
        { stem: 'Quantas bocas tem um sapato?', ans: 0 },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d || [1, 2, 3]),
             explain: 'Zero (0) significa <b>nenhum</b>! É o número que representa ausência de quantidade.' };
});

const g_compare = (min, max) => Q(5, () => {
    const a = rand(min, max), b = rand(min, max);
    const sym = a > b ? '>' : a < b ? '<' : '=';
    const opts = ['>', '<', '='];
    return { stem: `Qual sinal completa? &nbsp; <b>${a} ☐ ${b}</b>`,
             options: opts, correctIndex: opts.indexOf(sym),
             explain: 'Dica: o bico do sinal aponta para o <b>menor</b> número. <b>></b> maior que, <b>&lt;</b> menor que, <b>=</b> igual.' };
});

const g_pattern = (low, step) => Q(5, () => {
    const s0 = rand(low, low + 10);
    const seq = [s0, s0 + step, s0 + 2 * step, s0 + 3 * step];
    const next = s0 + 4 * step;
    return { stem: `Qual número vem a seguir? <b>${seq.join(', ')}, ?</b>`,
             ...makeChoice(next, nearDistr(next, step + 2)),
             explain: `Sequência: descubra quanto soma de um número ao próximo e aplique para achar o seguinte!` };
});

const g_orderAsc = (min, max) => Q(5, () => {
    const nums = shuffle([rand(min, max), rand(min, max), rand(min, max), rand(min, max)]);
    while (new Set(nums).size < 4) nums[rand(0, 3)] = rand(min, max);
    const sorted = [...nums].sort((a, b) => a - b).join(', ');
    const opts = shuffle([sorted, [...nums].reverse().join(', '),
                          [...nums].sort((a, b) => b - a).join(', '),
                          nums.join(', ')]);
    return { stem: `Coloque em ordem <b>crescente</b>: ${nums.join(', ')}`,
             options: opts, correctIndex: opts.indexOf(sorted),
             explain: '<b>Crescente</b>: do menor para o maior (como ir crescendo!). Coloque os números em fila do menor para o maior.' };
});

const g_orderDesc = (min, max) => Q(5, () => {
    const nums = shuffle([rand(min, max), rand(min, max), rand(min, max), rand(min, max)]);
    while (new Set(nums).size < 4) nums[rand(0, 3)] = rand(min, max);
    const sorted = [...nums].sort((a, b) => b - a).join(', ');
    const opts = shuffle([sorted, [...nums].sort((a, b) => a - b).join(', '),
                          nums.join(', '),
                          [...nums].reverse().join(', ')]);
    return { stem: `Coloque em ordem <b>decrescente</b>: ${nums.join(', ')}`,
             options: opts, correctIndex: opts.indexOf(sorted),
             explain: '<b>Decrescente</b>: do maior para o menor. É o contrário da ordem crescente!' };
});

const g_before = (min, max) => Q(5, () => {
    const n = rand(min + 1, max);
    return { stem: `Qual número vem <b>antes</b> de ${n}?`, ...makeChoice(n - 1, nearDistr(n - 1, 3)),
             explain: `O número <b>anterior</b> é um a menos. Antes de ${n} vem ${n - 1}.` };
});

const g_after = (min, max) => Q(5, () => {
    const n = rand(min, max - 1);
    return { stem: `Qual número vem <b>depois</b> de ${n}?`, ...makeChoice(n + 1, nearDistr(n + 1, 3)),
             explain: `O número <b>posterior</b> é um a mais. Depois de ${n} vem ${n + 1}.` };
});

const g_shapes = () => Q(5, () => {
    const items = [
        { stem: 'Qual forma tem 3 lados?', ans: 'Triângulo', d: ['Quadrado', 'Círculo', 'Pentágono'] },
        { stem: 'Qual forma tem 4 lados iguais?', ans: 'Quadrado', d: ['Triângulo', 'Retângulo', 'Círculo'] },
        { stem: 'Qual forma não tem lados retos?', ans: 'Círculo', d: ['Triângulo', 'Quadrado', 'Hexágono'] },
        { stem: 'Quantos lados tem um pentágono?', ans: 5, d: [3, 4, 6] },
        { stem: 'Quantos lados tem um hexágono?', ans: 6, d: [4, 5, 7] },
        { stem: 'Quantos lados tem um quadrado?', ans: 4, d: [3, 5, 6] },
        { stem: 'Quantos lados tem um triângulo?', ans: 3, d: [4, 2, 5] },
        { stem: 'Quantos lados tem um retângulo?', ans: 4, d: [3, 5, 6] },
        { stem: 'Quantos lados tem um octógono?', ans: 8, d: [6, 7, 9] },
        { stem: 'Quantos lados tem um decágono?', ans: 10, d: [8, 9, 12] },
        { stem: 'Quantos vértices (cantos) tem um triângulo?', ans: 3, d: [4, 2, 5] },
        { stem: 'Quantos vértices tem um quadrado?', ans: 4, d: [3, 5, 6] },
        { stem: 'Quantos vértices tem um pentágono?', ans: 5, d: [3, 4, 6] },
        { stem: 'Qual forma tem 4 lados, mas só 2 pares iguais?', ans: 'Retângulo', d: ['Quadrado', 'Triângulo', 'Pentágono'] },
        { stem: 'Qual forma é redonda como uma roda?', ans: 'Círculo', d: ['Quadrado', 'Triângulo', 'Estrela'] },
        { stem: 'Quantos lados tem um triângulo equilátero?', ans: 3, d: [4, 5, 6] },
        { stem: 'Forma de 6 lados parecida com favo de mel?', ans: 'Hexágono', d: ['Pentágono', 'Octógono', 'Quadrado'] },
        { stem: 'Forma de 5 lados?', ans: 'Pentágono', d: ['Hexágono', 'Quadrilátero', 'Triângulo'] },
        { stem: 'Polígono que NÃO existe (todo lado curvo):', ans: 'Círculo', d: ['Triângulo', 'Octógono', 'Hexágono'] },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d),
             explain: 'Dica: <b>triângulo</b>=3 lados, <b>quadrado</b>=4 lados iguais, <b>retângulo</b>=4 lados (2 pares), <b>pentágono</b>=5, <b>hexágono</b>=6, <b>círculo</b>=sem lados.' };
});

const g_dezena = () => Q(5, () => {
    const items = [
        { stem: 'Quantas unidades formam 1 dezena?', ans: 10, d: [5, 8, 100] },
        { stem: 'Em 23, quantas dezenas há?', ans: 2, d: [3, 20, 23] },
        { stem: 'Em 47, quantas unidades há (algarismo das unidades)?', ans: 7, d: [4, 40, 47] },
        { stem: 'Quanto é 3 dezenas + 5 unidades?', ans: 35, d: [8, 53, 30] },
        { stem: 'Quanto é 7 dezenas?', ans: 70, d: [7, 17, 77] },
        { stem: 'Em 56, quantas dezenas há?', ans: 5, d: [6, 50, 60] },
        { stem: 'Em 89, qual o algarismo das unidades?', ans: 9, d: [8, 80, 89] },
        { stem: 'Quanto é 4 dezenas + 2 unidades?', ans: 42, d: [6, 24, 40] },
        { stem: 'Quanto é 6 dezenas + 0 unidades?', ans: 60, d: [6, 16, 66] },
        { stem: 'Quantas dezenas há em 100?', ans: 10, d: [1, 100, 11] },
        { stem: 'Em 30, quantas unidades soltas (algarismo)?', ans: 0, d: [3, 30, 13] },
        { stem: 'Quanto vale 9 dezenas?', ans: 90, d: [9, 19, 99] },
        { stem: 'Quanto é 2 dezenas + 8 unidades?', ans: 28, d: [10, 82, 26] },
        { stem: 'Em 75, quantas dezenas?', ans: 7, d: [5, 50, 75] },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d),
             explain: 'Uma <b>dezena</b> = 10 unidades. No número 35: 3 dezenas e 5 unidades. O algarismo da esquerda é o das dezenas!' };
});

/* ── 2º ano — Bosque das Operações ─────────────────────────────────────── */
const g_add = (maxA, maxB, minA = 1, minB = 1) => Q(5, () => {
    const a = rand(minA, maxA), b = rand(minB, maxB);
    const c = a + b;
    return { stem: `<b>${a} + ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, Math.ceil(c / 4)))),
             explain: `Adição: <b>${a} + ${b} = ${c}</b>. Junte as quantidades. Pode contar nos dedos ou na reta numérica!` };
});

const g_sub = (maxA, maxB, minA = 2) => Q(5, () => {
    let a = rand(minA, maxA), b = rand(1, Math.min(a - 1, maxB));
    const c = a - b;
    return { stem: `<b>${a} − ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 3)),
             explain: `Subtração: <b>${a} − ${b} = ${c}</b>. Tire do maior. Quantas sobram?` };
});

const g_parity = () => Q(5, () => {
    const n = rand(1, 99);
    const opts = ['Par', 'Ímpar'];
    return { stem: `O número <b>${n}</b> é par ou ímpar?`, options: opts, correctIndex: n % 2 ? 1 : 0,
             explain: `<b>${n % 2 === 0 ? 'Par' : 'Ímpar'}</b>: olhe o último algarismo. Termina em 0,2,4,6,8 → par. Termina em 1,3,5,7,9 → ímpar.` };
});

const g_double = (max = 50) => Q(5, () => {
    const n = rand(1, max);
    return { stem: `Qual é o <b>dobro</b> de ${n}?`, ...makeChoice(n * 2, nearDistr(n * 2, 4)),
             explain: `Dobro = vezes 2 = somar o número com ele mesmo. Dobro de ${n} = ${n} + ${n} = <b>${n * 2}</b>.` };
});

const g_half = (max = 50) => Q(5, () => {
    const n = rand(1, max) * 2;
    return { stem: `Qual é a <b>metade</b> de ${n}?`, ...makeChoice(n / 2, nearDistr(n / 2, 4)),
             explain: `Metade = dividir por 2. Metade de ${n} = ${n} ÷ 2 = <b>${n / 2}</b>.` };
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
    return { stem: `Sequência de ${step} em ${step}: ${seq.join(', ')}, ?`, ...makeChoice(next, nearDistr(next, step + 2)),
             explain: `O padrão é somar <b>${step}</b> a cada vez. O próximo é ${seq[3]} + ${step} = <b>${next}</b>.` };
});

const g_decomp = () => Q(5, () => {
    const n = rand(11, 99);
    const d = Math.floor(n / 10), u = n % 10;
    const ans = `${d} dezenas e ${u} unidades`;
    const d1 = `${u} dezenas e ${d} unidades`;
    const d2 = `${d + 1} dezenas e ${u} unidades`;
    const d3 = `${d} dezenas e ${(u + 1) % 10} unidades`;
    const opts = shuffle([ans, d1, d2, d3]);
    return { stem: `Decomponha o número <b>${n}</b>:`, options: opts, correctIndex: opts.indexOf(ans),
             explain: `<b>${n}</b> = ${d} dezenas + ${u} unidades. Lembre: 1 dezena = 10 unidades.` };
});

const g_wordSimple = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 9), b = rand(2, 9); return { s: `Ana tem ${a} balas e ganhou ${b}. Quantas balas ela tem agora?`, r: a + b }; },
        () => { const a = rand(5, 20), b = rand(1, 4); return { s: `Tinha ${a} pássaros, ${b} voaram. Quantos restaram?`, r: a - b }; },
        () => { const a = rand(2, 9), b = rand(2, 5); return { s: `${b} caixas com ${a} maçãs cada. Total de maçãs?`, r: a * b }; },
        () => { const b = rand(2, 5), q = rand(2, 6); const a = b * q; return { s: `${a} doces divididos igualmente entre ${b} amigos. Quantos cada um recebe?`, r: q }; },
        () => { const a = rand(3, 12), b = rand(2, 8); return { s: `João tem ${a} figurinhas. Comprou mais ${b}. Quantas tem agora?`, r: a + b }; },
        () => { const a = rand(8, 25), b = rand(2, 6); return { s: `Uma cesta tem ${a} laranjas. ${b} foram tiradas. Quantas restaram?`, r: a - b }; },
        () => { const a = rand(2, 7), b = rand(3, 6); return { s: `${a} pacotes de figurinhas. Cada um tem ${b} figurinhas. Total?`, r: a * b }; },
        () => { const k = rand(2, 6), q = rand(3, 8); const a = k * q; return { s: `${a} bolinhas em ${k} potes iguais. Quantas em cada pote?`, r: q }; },
        () => { const a = rand(5, 15), b = rand(2, 5); return { s: `Maria tinha ${a} reais. Gastou ${b}. Quanto sobrou?`, r: a - b }; },
        () => { const a = rand(4, 9); return { s: `Cada aluno recebe ${a} lápis. Em 3 alunos, quantos lápis no total?`, r: a * 3 }; },
        () => { const a = rand(2, 6); return { s: `Uma caixa traz ${a} pares de meias. Quantas meias soltas?`, r: a * 2 }; },
        () => { const a = rand(20, 50); return { s: `Sou ${a} anos mais velho que meu irmão de 2 anos. Quantos anos tenho?`, r: a + 2 }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, nearDistr(it.r, 4)),
             explain: 'Leia com atenção: o que você tem, o que acontece. Junte (+) ou tire (−)?' };
});

/* ── 3º ano — Vale das Tabuadas ────────────────────────────────────────── */
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
    return { stem: `<b>${a} − ${b}</b> = ?  <small>(com empréstimo)</small>`, ...makeChoice(c, nearDistr(c, 5)),
             explain: `<b>Empréstimo:</b> quando o dígito de baixo é maior, peça 1 dezena (=10) emprestada da coluna da esquerda. ${a}−${b}=${c}.` };
});

const g_table = (n) => Q(5, () => {
    const k = rand(1, 10);
    const c = n * k;
    return { stem: `<b>${n} × ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, n + 2))),
             explain: `Tabuada: <b>${n} × ${k} = ${c}</b>. Você pode calcular somando ${n} exatamente ${k} vezes!` };
});

const g_tableMix = (low, high) => Q(5, () => {
    const a = rand(low, high), b = rand(1, 10);
    const c = a * b;
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, a + 2))),
             explain: `Multiplicação: <b>${a} × ${b} = ${c}</b>. Lembre: é como somar ${a} exatamente ${b} vezes.` };
});

const g_divExact = (divisorMax) => Q(5, () => {
    const b = rand(2, divisorMax);
    const q = rand(2, 10);
    const a = b * q;
    return { stem: `<b>${a} ÷ ${b}</b> = ?`, ...makeChoice(q, nearDistr(q, 3)),
             explain: `Divisão: <b>${a} ÷ ${b} = ${q}</b>. Use a tabuada do ${b}: ${b}×${q}=${a}. ✓` };
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
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Com dinheiro: <b>+</b> para ganhar/comprar juntos, <b>−</b> para gastar/troco. Troco = pago − preço.' };
});

/* ── 4º ano — Caverna das Frações ─────────────────────────────────────── */
const g_mult10 = () => Q(5, () => {
    const n = rand(2, 999);
    const k = pick([10, 100, 1000]);
    const c = n * k;
    return { stem: `<b>${n} × ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, k * 2)),
             explain: `Multiplicar por <b>${k}</b>: acrescente ${String(k).length-1} zero(s) ao número. ${n}×${k}=<b>${c}</b>.` };
});

const g_mult2x1 = () => Q(5, () => {
    const a = rand(11, 99), b = rand(2, 9);
    const c = a * b;
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 8)),
             explain: `Multiplique em partes: ${a}×${b} = (${Math.floor(a/10)*10}×${b}) + (${a%10}×${b}) = ${Math.floor(a/10)*10*b} + ${(a%10)*b} = <b>${c}</b>.` };
});

const g_mult2x2 = () => Q(5, () => {
    const a = rand(11, 30), b = rand(11, 30);
    const c = a * b;
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 20)),
             explain: `Para multiplicar ${a}×${b}, decomponha: ${a}×${Math.floor(b/10)*10} + ${a}×${b%10} = ${a*Math.floor(b/10)*10} + ${a*(b%10)} = <b>${c}</b>.` };
});

const g_divRest = () => Q(5, () => {
    const b = rand(3, 9), q = rand(3, 12), r = rand(1, b - 1);
    const a = b * q + r;
    const ans = `${q} resto ${r}`;
    const d = [`${q + 1} resto ${r}`, `${q} resto ${r + 1}`, `${q - 1} resto ${b - r}`];
    const opts = shuffle([ans, ...d]);
    return { stem: `<b>${a} ÷ ${b}</b> = ? (com resto)`, options: opts, correctIndex: opts.indexOf(ans),
             explain: `Divisão com resto: <b>${a} ÷ ${b} = ${q} resto ${r}</b>. Verifique: ${b}×${q}+${r}=${b*q+r}=<b>${a}</b>. ✓ O resto é sempre menor que o divisor.` };
});

const g_div2dig = () => Q(5, () => {
    const b = rand(2, 9);
    const q = rand(11, 50);
    const a = b * q;
    return { stem: `<b>${a} ÷ ${b}</b> = ?`, ...makeChoice(q, nearDistr(q, 5)),
             explain: `Divisão: <b>${a} ÷ ${b} = ${q}</b>. Verifique pela tabuada: ${b}×${q}=${a}. ✓` };
});

const g_fracVisual = () => Q(5, () => {
    const den = pick([2, 3, 4, 5, 6, 8]);
    const num = rand(1, den - 1);
    const blocks = '<span class="frac-on">█</span>'.repeat(num) + '<span class="frac-off">█</span>'.repeat(den - num);
    const correct = `${num}/${den}`;
    const distr = [`${den - num}/${den}`, `${num}/${den + 1}`, `${num + 1}/${den}`].filter(x => x !== correct);
    while (distr.length < 3) distr.push(`${num + distr.length + 1}/${den + 1}`);
    return { stem: `Qual fração representa a parte preenchida?<div class="frac-bar">${blocks}</div>`,
             ...makeChoice(correct, distr.slice(0, 3)),
             explain: `Fração: partes coloridas / total de partes. Aqui: <b>${num}/${den}</b> — ${num} partes preenchidas de ${den} totais.` };
});

const g_fracTerm = () => Q(5, () => {
    const items = [
        { s: 'Em 3/7, qual é o <b>numerador</b>?', r: 3, d: [7, 4, 10] },
        { s: 'Em 3/7, qual é o <b>denominador</b>?', r: 7, d: [3, 10, 4] },
        { s: 'O denominador indica:', r: 'em quantas partes o todo foi dividido', d: ['as partes pintadas', 'a parte total', 'os números primos'] },
        { s: 'O numerador indica:', r: 'as partes consideradas', d: ['o todo dividido', 'a parte vazia', 'sempre 1'] },
        { s: 'Que fração é "meio"?', r: '1/2', d: ['2/1', '1/4', '2/2'] },
        { s: 'Que fração é "um terço"?', r: '1/3', d: ['3/1', '1/2', '2/3'] },
        { s: 'Que fração é "três quartos"?', r: '3/4', d: ['4/3', '1/4', '2/4'] },
        { s: 'Que fração é "um quinto"?', r: '1/5', d: ['5/1', '1/4', '2/5'] },
        { s: 'Que fração é "dois terços"?', r: '2/3', d: ['3/2', '1/3', '2/6'] },
        { s: 'Em 5/8, qual o numerador?', r: 5, d: [8, 3, 13] },
        { s: 'Em 5/8, qual o denominador?', r: 8, d: [5, 3, 13] },
        { s: 'Que fração é "um quarto"?', r: '1/4', d: ['4/1', '1/2', '2/4'] },
        { s: 'Que fração é "metade"?', r: '1/2', d: ['1/3', '2/2', '1/4'] },
        { s: 'Em 7/10, qual número está embaixo?', r: 10, d: [7, 3, 17] },
        { s: 'Quando o numerador é 0, a fração vale:', r: '0', d: ['1', 'o denominador', 'indefinido'] },
        { s: 'Fração "cinco oitavos" escreve-se:', r: '5/8', d: ['8/5', '5,8', '5x8'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>Numerador</b> (em cima): quantas partes você tem. <b>Denominador</b> (embaixo): em quantas partes o todo foi dividido.' };
});

const g_fracEquiv = () => Q(5, () => {
    const den = pick([2, 3, 4, 5]);
    const num = rand(1, den - 1);
    const k = rand(2, 4);
    return { stem: `Qual fração é <b>equivalente</b> a ${num}/${den}?`,
             ...makeChoice(`${num * k}/${den * k}`, [`${num + 1}/${den + 1}`, `${num * k}/${den + k}`, `${num + k}/${den * k}`]),
             explain: 'Frações equivalentes: multiplique (ou divida) numerador <b>e</b> denominador pelo mesmo número. O valor não muda!' };
});

const g_fracCompareSameDen = () => Q(5, () => {
    const den = pick([4, 5, 6, 8]);
    let a = rand(1, den - 1), b = rand(1, den - 1);
    while (a === b) b = rand(1, den - 1);
    const greater = a > b ? `${a}/${den}` : `${b}/${den}`;
    return { stem: `Qual é <b>maior</b>? ${a}/${den} ou ${b}/${den}?`,
             ...makeChoice(greater, [`${a}/${den}` === greater ? `${b}/${den}` : `${a}/${den}`, 'São iguais', `${den - a}/${den}`]),
             explain: 'Mesmo denominador: compare os numeradores. Maior numerador = <b>maior fração</b>.' };
});

const g_fracAddSame = () => Q(5, () => {
    const den = pick([4, 5, 6, 7, 8]);
    const a = rand(1, Math.floor(den / 2)), b = rand(1, den - a - 1);
    return { stem: `<b>${a}/${den} + ${b}/${den}</b> = ?`,
             ...makeChoice(`${a + b}/${den}`, [`${a + b}/${den * 2}`, `${a * b}/${den}`, `${a + b + 1}/${den}`]),
             explain: 'Mesmo denominador: some os numeradores e mantenha o denominador. <b>a/n + b/n = (a+b)/n</b>.' };
});

const g_units = () => Q(5, () => {
    const items = [
        { s: 'Quantos centímetros em 1 metro?', r: 100, d: [10, 1000, 50] },
        { s: 'Quantos metros em 1 quilômetro?', r: 1000, d: [100, 10, 10000] },
        { s: 'Quantos milímetros em 1 centímetro?', r: 10, d: [100, 1, 1000] },
        { s: 'Quantos gramas em 1 quilograma?', r: 1000, d: [100, 10, 10000] },
        { s: '2,5 metros em centímetros:', r: 250, d: [25, 2500, 2050] },
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
             explain: 'Conversões: 1 m = 100 cm, 1 km = 1000 m, 1 kg = 1000 g, 1 L = 1000 mL. Para converter, multiplique ou divida pela relação.' };
});

const g_perimeter = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 20), b = rand(2, 20); return { s: `Perímetro de retângulo ${a} × ${b} cm:`, r: 2 * (a + b), d: nearDistr(2 * (a + b), 6) }; },
        () => { const l = rand(2, 30); return { s: `Perímetro de quadrado de lado ${l} cm:`, r: 4 * l, d: nearDistr(4 * l, 5) }; },
        () => { const a = rand(3, 9), b = rand(3, 9), c = rand(3, 9); return { s: `Perímetro de triângulo de lados ${a}, ${b} e ${c} cm:`, r: a + b + c, d: nearDistr(a + b + c, 4) }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Perímetro = soma de todos os lados. <b>Retângulo:</b> P = 2×(b+h). <b>Quadrado:</b> P = 4×l. <b>Triângulo:</b> some os três lados.' };
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
        { s: 'Quantos dias em 1 ano (não bissexto)?', r: 365, d: [360, 366, 30] },
        { s: 'Quantos dias em fevereiro (ano normal)?', r: 28, d: [30, 29, 31] },
        { s: '3 horas = quantos minutos?', r: 180, d: [60, 90, 300] },
        { s: '120 segundos = quantos minutos?', r: 2, d: [1, 60, 120] },
        { s: '1 semana = quantas horas?', r: 168, d: [24, 60, 70] },
        { s: 'Quantos trimestres tem 1 ano?', r: 4, d: [3, 6, 12] },
        { s: '1 hora e meia em minutos:', r: 90, d: [60, 130, 150] },
        { s: 'Quantas estações tem 1 ano?', r: 4, d: [2, 12, 7] },
        { s: '4 décadas = quantos anos?', r: 40, d: [4, 14, 400] },
        { s: '1 século = quantos anos?', r: 100, d: [10, 1000, 50] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '1 hora = 60 min, 1 min = 60 s, 1 dia = 24 h, 1 semana = 7 dias, 1 ano = 12 meses = 365 dias.' };
});

/* ── 5º ano — Lago dos Decimais ────────────────────────────────────────── */
const g_fracProperImproper = () => Q(5, () => {
    const items = [
        { s: 'A fração 5/3 é:', r: 'imprópria', d: ['própria', 'aparente', 'mista'] },
        { s: 'A fração 2/5 é:', r: 'própria', d: ['imprópria', 'aparente', 'mista'] },
        { s: 'A fração 4/4 é:', r: 'aparente', d: ['própria', 'imprópria', 'mista'] },
        { s: 'A fração 7/2 é:', r: 'imprópria', d: ['própria', 'aparente', 'mista'] },
        { s: 'Fração própria significa:', r: 'numerador menor que denominador', d: ['numerador maior', 'iguais', 'sempre 1'] },
        { s: 'A fração 3/8 é:', r: 'própria', d: ['imprópria', 'aparente', 'mista'] },
        { s: 'A fração 9/4 é:', r: 'imprópria', d: ['própria', 'aparente', 'mista'] },
        { s: 'A fração 6/6 é:', r: 'aparente', d: ['própria', 'imprópria', 'mista'] },
        { s: 'Fração aparente equivale a:', r: 'um número inteiro', d: ['zero', 'uma metade', 'um décimo'] },
        { s: 'A fração 11/3 é:', r: 'imprópria', d: ['própria', 'aparente', 'mista'] },
        { s: 'A fração 7/7 vale:', r: '1', d: ['0', '7', '1/7'] },
        { s: 'Fração imprópria significa:', r: 'numerador maior ou igual ao denominador', d: ['numerador menor', 'denominador zero', 'sempre 1'] },
        { s: '4/4 vale:', r: '1', d: ['4', '0', '1/4'] },
        { s: '1 + 1/2 (forma mista) equivale a fração:', r: '3/2', d: ['2/3', '1/2', '11/2'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>Própria:</b> numerador < denominador (valor < 1). <b>Imprópria:</b> numerador ≥ denominador (valor ≥ 1). <b>Aparente:</b> representa inteiro.' };
});

const g_decRead = () => Q(5, () => {
    const items = [
        { s: 'Como se lê <b>0,5</b>?', r: 'cinco décimos', d: ['cinco centésimos', 'cinco', 'meio centavo'] },
        { s: 'Como se lê <b>0,25</b>?', r: 'vinte e cinco centésimos', d: ['vinte e cinco décimos', 'dois e cinco', '25 milésimos'] },
        { s: 'O número 1,5 está entre:', r: '1 e 2', d: ['0 e 1', '5 e 6', '10 e 15'] },
        { s: 'Qual é maior: 0,7 ou 0,69?', r: '0,7', d: ['0,69', 'iguais', 'depende'] },
        { s: 'Qual é maior: 0,3 ou 0,30?', r: 'iguais', d: ['0,3', '0,30', 'nenhum'] },
        { s: 'Como se lê <b>0,1</b>?', r: 'um décimo', d: ['um centésimo', 'uma unidade', 'dez'] },
        { s: 'Como se lê <b>0,01</b>?', r: 'um centésimo', d: ['um décimo', 'um milésimo', 'zero e um'] },
        { s: 'O número 2,5 é igual a:', r: '2 + 0,5', d: ['25', '2,05', '0,25'] },
        { s: 'Quanto é "três décimos" em decimal?', r: '0,3', d: ['0,03', '3,0', '3'] },
        { s: 'Quanto é "quinze centésimos" em decimal?', r: '0,15', d: ['1,5', '0,015', '15'] },
        { s: 'Qual é maior: 1,2 ou 1,19?', r: '1,2', d: ['1,19', 'iguais', '0,2'] },
        { s: 'O número 0,8 está mais perto de:', r: '1', d: ['0', '8', '0,5'] },
        { s: 'Quantas casas decimais tem 3,14?', r: '2', d: ['3', '1', '4'] },
        { s: 'Qual é menor: 0,4 ou 0,40?', r: 'iguais', d: ['0,4', '0,40', 'nenhum'] },
        { s: '4,9 está entre quais inteiros?', r: '4 e 5', d: ['3 e 4', '5 e 6', '9 e 10'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>0,1</b> = 1 décimo. <b>0,01</b> = 1 centésimo. <b>0,001</b> = 1 milésimo. Compare decimais casa por casa, da esquerda para a direita.' };
});

const g_decCompare = () => Q(5, () => {
    const a = (rand(1, 99) / 10).toFixed(1);
    let b = (rand(1, 99) / 10).toFixed(1);
    while (b === a) b = (rand(1, 99) / 10).toFixed(1);
    const big = parseFloat(a) > parseFloat(b) ? a : b;
    return { stem: `Qual é <b>maior</b>: ${a} ou ${b}?`, ...makeChoice(big, [a === big ? b : a, 'São iguais', '0']),
             explain: `Compare casa por casa (esquerda→direita): parte inteira, décimos, centésimos... O primeiro dígito diferente decide quem é maior!` };
});

const g_decAdd = () => Q(5, () => {
    const a = rand(10, 99) / 10, b = rand(10, 99) / 10;
    const c = +(a + b).toFixed(1);
    return { stem: `<b>${a.toFixed(1)} + ${b.toFixed(1)}</b> = ?`,
             ...makeChoice(c.toFixed(1), nearDistr(Math.round(c * 10), 8).map(x => (x / 10).toFixed(1))),
             explain: 'Some decimais <b>alinhando as vírgulas</b> e calcule normalmente, coluna por coluna.' };
});

const g_decSub = () => Q(5, () => {
    let a = rand(50, 99) / 10, b = rand(10, 49) / 10;
    if (b > a) [a, b] = [b, a];
    const c = +(a - b).toFixed(1);
    return { stem: `<b>${a.toFixed(1)} − ${b.toFixed(1)}</b> = ?`,
             ...makeChoice(c.toFixed(1), nearDistr(Math.round(c * 10), 8).map(x => (x / 10).toFixed(1))),
             explain: 'Subtraia decimais <b>alinhando as vírgulas</b>. Use zeros à direita se precisar. Calcule coluna por coluna.' };
});

const g_decMult10 = () => Q(5, () => {
    const n = (rand(15, 99) / 10).toFixed(1);
    const k = pick([10, 100, 1000]);
    const c = parseFloat(n) * k;
    return { stem: `<b>${n} × ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, k)),
             explain: `Multiplicar por ${k}: mova a vírgula ${String(k).length-1} casa(s) para a <b>direita</b>. ${n}×${k}=<b>${c}</b>.` };
});

const g_percentEasy = () => Q(5, () => {
    const p = pick([10, 25, 50, 75, 100]);
    const n = pick([20, 40, 80, 100, 200, 400]);
    const c = (n * p) / 100;
    return { stem: `Quanto é <b>${p}% de ${n}</b>?`, ...makeChoice(c, nearDistr(c, n / 10)),
             explain: `<b>${p}%</b> de ${n}: calcule ${n}×${p}/100 = <b>${c}</b>. Dica: 10% → divida por 10. 50% → metade. 25% → quarto.` };
});

const g_percentApply = () => Q(5, () => {
    const p = pick([10, 15, 20, 25, 30, 50]);
    const n = pick([50, 80, 100, 150, 200, 250, 300]);
    const c = Math.round((n * p) / 100 * 100) / 100;
    return { stem: `${p}% de R$ ${n},00 vale quanto?`, ...makeChoice(`R$ ${c.toFixed(2)}`, nearDistr(c, n / 10).map(x => `R$ ${x.toFixed(2)}`)),
             explain: `Porcentagem: <b>${p}%</b> de R$ ${n} = ${n} × ${p}/100 = <b>R$ ${c.toFixed(2)}</b>. Muito comum em problemas do cotidiano!` };
});

const g_areaSquare = () => Q(5, () => {
    const l = rand(2, 20);
    const c = l * l;
    return { stem: `Área de quadrado de lado <b>${l} cm</b>:`, ...makeChoice(`${c} cm²`, nearDistr(c, 8).map(x => `${x} cm²`)),
             explain: `Área do quadrado = lado × lado = lado². <b>${l}² = ${c} cm²</b>. Área mede o espaço da superfície!` };
});

const g_areaRect = () => Q(5, () => {
    const a = rand(3, 20), b = rand(3, 20);
    const c = a * b;
    return { stem: `Área de retângulo <b>${a} × ${b} cm</b>:`, ...makeChoice(`${c} cm²`, nearDistr(c, 10).map(x => `${x} cm²`)),
             explain: `Área do retângulo = base × altura. <b>${a} × ${b} = ${c} cm²</b>. É como contar quantos quadradinhos de 1 cm cabem dentro.` };
});

const g_volumeCube = () => Q(5, () => {
    const l = rand(2, 10);
    const c = l * l * l;
    return { stem: `Volume de cubo de aresta <b>${l} cm</b>:`, ...makeChoice(`${c} cm³`, nearDistr(c, 12).map(x => `${x} cm³`)),
             explain: `Volume do cubo = aresta³ = aresta × aresta × aresta. <b>${l}³ = ${c} cm³</b>. Mede o espaço 3D que o objeto ocupa.` };
});

const g_volumePar = () => Q(5, () => {
    const a = rand(2, 8), b = rand(2, 8), c = rand(2, 8);
    const v = a * b * c;
    return { stem: `Volume do paralelepípedo <b>${a} × ${b} × ${c} cm</b>:`, ...makeChoice(`${v} cm³`, nearDistr(v, 20).map(x => `${x} cm³`)),
             explain: `Volume do paralelepípedo = comprimento × largura × altura. <b>${a}×${b}×${c} = ${v} cm³</b>.` };
});

const g_mean = () => Q(5, () => {
    const n = pick([2, 3, 4]);
    const nums = Array.from({ length: n }, () => rand(2, 20));
    const s = nums.reduce((a, b) => a + b, 0);
    while (s % n !== 0) { nums[0] = rand(2, 20); break; }
    const sum = nums.reduce((a, b) => a + b, 0);
    const ans = sum / n;
    const intAns = Math.round(ans * 10) / 10;
    return { stem: `Média de ${nums.join(', ')} =?`, ...makeChoice(intAns, nearDistr(intAns, 4)),
             explain: `Média = soma ÷ quantidade. <b>(${nums.join('+')})/  ${n} = ${sum}/${n} = ${intAns}</b>. É o valor que representaria todos igualmente.` };
});

const g_probSimple = () => Q(5, () => {
    const items = [
        { s: 'Numa moeda, qual a chance de cair cara?', r: '1/2', d: ['1/4', '1/3', '1'] },
        { s: 'Num dado, qual a chance de sair 3?', r: '1/6', d: ['1/3', '1/2', '3/6'] },
        { s: 'Num dado, chance de sair número par?', r: '1/2', d: ['1/3', '1/6', '2/3'] },
        { s: '20 bolas, 5 vermelhas. Chance de tirar vermelha?', r: '1/4', d: ['1/5', '5/15', '1/20'] },
        { s: 'Probabilidade do evento certo:', r: '1', d: ['0', '1/2', 'depende'] },
        { s: 'Probabilidade do evento impossível:', r: '0', d: ['1', '1/2', 'depende'] },
        { s: 'Num dado, chance de sair número maior que 4?', r: '1/3', d: ['1/2', '2/3', '1/6'] },
        { s: 'Numa moeda, chance de cair coroa?', r: '1/2', d: ['1/4', '1/3', '0'] },
        { s: '10 bolas, 2 azuis. Chance de azul?', r: '1/5', d: ['2/10', '1/2', '1/10'] },
        { s: 'Num dado, chance de sair 7?', r: '0', d: ['1/6', '1/7', '1'] },
        { s: 'Num dado, chance de sair 1, 2 ou 3?', r: '1/2', d: ['1/3', '3/6', '1/6'] },
        { s: '52 cartas, 4 ases. Chance de tirar ás?', r: '1/13', d: ['4/52', '1/52', '1/4'] },
        { s: 'Numa urna com 3 bolas brancas e 1 preta, chance de preta?', r: '1/4', d: ['3/4', '1/3', '1/2'] },
        { s: 'Num dado, chance de NÃO sair 6?', r: '5/6', d: ['1/6', '6/6', '1/2'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>Probabilidade</b> = casos favoráveis ÷ casos totais. Varia entre 0 (impossível) e 1 (certeza).' };
});

/* ── 6º ano — Montanha dos Inteiros ────────────────────────────────────── */
const g_negLine = () => Q(5, () => {
    const items = [
        { s: 'Qual é maior: -3 ou -5?', r: '-3', d: ['-5', 'iguais', '0'] },
        { s: 'Qual é maior: -1 ou 1?', r: '1', d: ['-1', 'iguais', 'depende'] },
        { s: 'Na reta, qual fica mais à esquerda: -7 ou -2?', r: '-7', d: ['-2', 'iguais', 'nenhum'] },
        { s: 'O oposto de 4 é:', r: -4, d: [4, 0, 14] },
        { s: 'Módulo de -8 é:', r: 8, d: [-8, 0, 18] },
        { s: 'Qual é o menor: -10, -3, 0, 5?', r: -10, d: [-3, 0, 5] },
        { s: 'O oposto de -7 é:', r: 7, d: [-7, 0, 14] },
        { s: 'Módulo de 12 é:', r: 12, d: [-12, 0, 24] },
        { s: 'Qual fica mais à direita na reta: -2 ou -8?', r: '-2', d: ['-8', 'iguais', '0'] },
        { s: 'Qual é maior: 0 ou -3?', r: '0', d: ['-3', 'iguais', 'depende'] },
        { s: 'O oposto de 0 é:', r: 0, d: [1, -1, 10] },
        { s: 'Qual é o maior: -10, -3, 0, 5?', r: 5, d: [-10, 0, -3] },
        { s: 'Módulo de -100 é:', r: 100, d: [-100, 0, 200] },
        { s: 'Entre -4 e -1, qual é maior?', r: '-1', d: ['-4', 'iguais', '0'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Na <b>reta numérica</b>: negativos ficam à esquerda do zero. Quanto mais à esquerda, <b>menor</b> o número. Ex: −10 < −3 < 0 < 5.' };
});

const g_negAdd = () => Q(5, () => {
    const a = rand(-20, 20), b = rand(-20, 20);
    const c = a + b;
    const str = `(${a}) + (${b})`.replace(/\+ \(-/g, '− (').replace(/\(-/g, '(−');
    return { stem: `<b>${a} + (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 6, 3, true)),
             explain: `Soma com negativos: sinais <b>iguais</b> → some os módulos e mantenha o sinal. Sinais <b>diferentes</b> → subtraia os módulos e use o sinal do maior.` };
});

const g_negSub = () => Q(5, () => {
    const a = rand(-20, 20), b = rand(-20, 20);
    const c = a - b;
    return { stem: `<b>${a} − (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 6, 3, true)),
             explain: `Subtração de negativo: <b>a − (−b) = a + b</b>. Dois negativos seguidos viram positivo! Ex: 5−(−3) = 5+3 = 8.` };
});

const g_negMult = () => Q(5, () => {
    const a = rand(-12, 12) || 1, b = rand(-12, 12) || 1;
    const c = a * b;
    return { stem: `<b>(${a}) × (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 10, 3, true)),
             explain: 'Multiplicação: <b>sinais iguais → positivo</b> (+ × + ou − × −). <b>Sinais diferentes → negativo</b> (+ × − ou − × +).' };
});

const g_negDiv = () => Q(5, () => {
    const b = rand(2, 9) * pick([-1, 1]);
    const q = rand(2, 9) * pick([-1, 1]);
    const a = b * q;
    return { stem: `<b>(${a}) ÷ (${b})</b> = ?`, ...makeChoice(q, nearDistr(q, 4, 3, true)),
             explain: 'Divisão: <b>sinais iguais → resultado positivo</b>. <b>Sinais diferentes → resultado negativo</b>. Mesma regra da multiplicação!' };
});

const g_mmc = () => Q(5, () => {
    const pairs = [[4, 6, 12], [3, 5, 15], [6, 8, 24], [4, 10, 20], [9, 12, 36], [5, 7, 35], [8, 12, 24], [2, 3, 6], [6, 9, 18], [4, 5, 20]];
    const [a, b, m] = pick(pairs);
    return { stem: `<b>MMC(${a}, ${b})</b> = ?`, ...makeChoice(m, nearDistr(m, 6)),
             explain: `<b>MMC</b> (Mínimo Múltiplo Comum): o menor número divisível pelos dois. MMC(${a},${b}) = <b>${m}</b>. Usado para somar frações com denominadores diferentes!` };
});

const g_mdc = () => Q(5, () => {
    const pairs = [[12, 18, 6], [20, 30, 10], [24, 36, 12], [15, 25, 5], [14, 21, 7], [8, 12, 4], [9, 27, 9], [16, 24, 8], [10, 15, 5], [18, 24, 6]];
    const [a, b, m] = pick(pairs);
    return { stem: `<b>MDC(${a}, ${b})</b> = ?`, ...makeChoice(m, nearDistr(m, 4)),
             explain: `<b>MDC</b> (Máximo Divisor Comum): o maior número que divide os dois exatamente. MDC(${a},${b}) = <b>${m}</b>. Usado para simplificar frações!` };
});

const g_fracAddDiff = () => Q(5, () => {
    const pairs = [['1/2', '1/3', '5/6'], ['1/4', '1/2', '3/4'], ['2/3', '1/6', '5/6'], ['1/3', '1/4', '7/12'], ['3/4', '1/8', '7/8'], ['1/5', '1/2', '7/10']];
    const [a, b, r] = pick(pairs);
    return { stem: `<b>${a} + ${b}</b> = ?`, ...makeChoice(r, ['1/5', '2/12', '3/7', '4/9'].filter(x => x !== r).slice(0, 3)),
             explain: `Frações com denominadores diferentes: ache o <b>MMC</b> dos denominadores, converta e some os numeradores. Ex: ${a}+${b} = <b>${r}</b>.` };
});

const g_fracMult = () => Q(5, () => {
    const items = [['1/2', '1/3', '1/6'], ['2/3', '3/4', '1/2'], ['1/2', '1/4', '1/8'], ['3/5', '1/2', '3/10'], ['2/5', '5/6', '1/3']];
    const [a, b, r] = pick(items);
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(r, ['2/12', '5/9', '3/8', '7/15'].filter(x => x !== r).slice(0, 3)),
             explain: `Multiplicação de frações: multiplique numerador × numerador e denominador × denominador. Ex: ${a}×${b} = <b>${r}</b>. Simplifique no final!` };
});

const g_fracDiv = () => Q(5, () => {
    const items = [['1/2', '1/4', '2'], ['3/4', '1/2', '3/2'], ['2/3', '1/3', '2'], ['1/2', '1/2', '1']];
    const [a, b, r] = pick(items);
    return { stem: `<b>${a} ÷ ${b}</b> = ?`, ...makeChoice(r, ['1/4', '1/8', '3/4', '4'].filter(x => x !== r).slice(0, 3)),
             explain: `Divisão de frações: <b>inverta a segunda e multiplique</b>. Ex: ${a}÷${b} = ${a}×(inverso de ${b}) = <b>${r}</b>.` };
});

const g_eq1 = () => Q(5, () => {
    const x = rand(1, 20), a = rand(1, 20);
    const types = [
        { s: `x + ${a} = ${x + a}`, r: x },
        { s: `x − ${a} = ${x - a}`, r: x },
        { s: `${a + x} = x + ${a}`, r: x },
    ];
    const t = pick(types);
    return { stem: `Resolva: <b>${t.s}</b>. x = ?`, ...makeChoice(t.r, nearDistr(t.r, 4)),
             explain: `Isole o x: passe o número para o outro lado <b>com o sinal trocado</b>. Ex: x+${a}=${x + a} → x = ${x + a}−${a} = <b>${x}</b>.` };
});

const g_eqMult = () => Q(5, () => {
    const x = rand(2, 10), a = rand(2, 9);
    const types = [
        { s: `${a}x = ${a * x}`, r: x },
        { s: `x/${a} = ${Math.floor(x)}`, r: a * Math.floor(x) },
        { s: `${a}x − ${a} = ${a * x - a}`, r: x },
    ];
    const t = pick(types);
    return { stem: `Resolva: <b>${t.s}</b>. x = ?`, ...makeChoice(t.r, nearDistr(t.r, 4)),
             explain: `Para isolar x: realize a <b>operação inversa</b> dos dois lados. Se ${a}x=${a*x}, divida por ${a}: x = <b>${x}</b>.` };
});

const g_ratioBasic = () => Q(5, () => {
    const items = [
        { s: 'Numa sala há 12 meninas e 8 meninos. Razão meninas:meninos?', r: '3:2', d: ['2:3', '12:8', '8:12'] },
        { s: 'Razão de 6 para 9 (simplificada):', r: '2:3', d: ['3:2', '6:9', '1:1'] },
        { s: 'Razão de 10 para 5:', r: '2:1', d: ['1:2', '5:10', '10:5'] },
        { s: 'Razão de 4 para 16 (simplificada):', r: '1:4', d: ['4:1', '4:16', '2:8'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Razão = comparação pela divisão. Simplifique dividindo pelo MDC. Razão 12:8 = 3:2 (dividido por 4).' };
});

/* ── 7º ano — Deserto das Equações ─────────────────────────────────────── */
const g_eq2sides = () => Q(5, () => {
    const x = rand(1, 10), a = rand(2, 6), b = rand(2, 6), c = rand(1, 10);
    if (a === b) return { stem: 'Resolva: 2x + 3 = x + 7. x = ?', ...makeChoice(4, [3, 5, 6]),
        explain: 'Isole o x: passe os termos com x para um lado e os números para o outro. <b>2x − x = 7 − 3 → x = 4.</b> Regra: ao mudar de lado, inverta o sinal.' };
    const left = a * x + c;
    const rightConst = left - b * x;
    const diff = a - b;
    return { stem: `Resolva: <b>${a}x + ${c} = ${b}x + ${rightConst}</b>. x = ?`, ...makeChoice(x, nearDistr(x, 4)),
        explain: `Agrupe os x: <b>${a}x − ${b}x = ${rightConst} − ${c} → ${diff}x = ${diff * x} → x = ${x}.</b> Ao passar um termo para o outro lado, o sinal sempre troca.` };
});

const g_eqParen = () => Q(5, () => {
    const items = [
        { s: '2(x + 3) = 14', r: 4, e: '<b>Distributiva:</b> 2x + 6 = 14 → 2x = 8 → x = 4.' },
        { s: '3(x − 1) = 12', r: 5, e: '<b>Distributiva:</b> 3x − 3 = 12 → 3x = 15 → x = 5.' },
        { s: '2(x − 4) = 6', r: 7, e: '<b>Distributiva:</b> 2x − 8 = 6 → 2x = 14 → x = 7.' },
        { s: '5(x + 2) = 35', r: 5, e: '<b>Distributiva:</b> 5x + 10 = 35 → 5x = 25 → x = 5.' },
        { s: '4(x + 1) = 20', r: 4, e: '<b>Distributiva:</b> 4x + 4 = 20 → 4x = 16 → x = 4.' },
        { s: '3(2x + 1) = 21', r: 3, e: '<b>Distributiva:</b> 6x + 3 = 21 → 6x = 18 → x = 3.' },
    ];
    const it = pick(items);
    return { stem: `Resolva: <b>${it.s}</b>. x = ?`, ...makeChoice(it.r, nearDistr(it.r, 4)), explain: it.e };
});

const g_eqFrac = () => Q(5, () => {
    const items = [
        { s: 'x/2 + 1 = 4', r: 6,  e: 'Multiplique tudo por 2 (MMC): x + 2 = 8 → x = 6.' },
        { s: 'x/3 − 2 = 1', r: 9,  e: 'Multiplique tudo por 3: x − 6 = 3 → x = 9.' },
        { s: '2x/3 = 6',    r: 9,  e: 'Multiplique por 3: 2x = 18 → x = 9. Ou: x = 6 × 3/2 = 9.' },
        { s: 'x/4 = 3',     r: 12, e: 'Multiplique por 4: x = 12. Direto: x = 3 × 4.' },
        { s: 'x/5 + 1 = 3', r: 10, e: 'Multiplique por 5: x + 5 = 15 → x = 10.' },
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
             explain: `<b>Produto cruzado</b> (regra da cruz): a/b = c/d → a×d = b×c. Isole o x!` };
});

const g_rule3 = () => Q(5, () => {
    const items = [
        () => { const u = rand(2, 9), v = rand(2, 9), k = rand(2, 6); return { s: `Se ${u} caixas custam R$ ${u * v},00, quanto custam ${u * k} caixas?`, r: u * v * k }; },
        () => { const km = rand(50, 200), h = rand(2, 5); return { s: `Carro a ${km} km/h percorre quantos km em ${h} h?`, r: km * h }; },
        () => { const a = rand(2, 6), b = rand(2, 9); return { s: `${a} laranjas custam R$ ${a * b},00. Quanto custam ${a + 3} laranjas?`, r: (a + 3) * b }; },
    ];
    const it = pick(items)();
    return { stem: `<b>Regra de 3:</b> ${it.s}`, ...makeChoice(it.r, nearDistr(it.r, 8)),
             explain: '<b>Regra de 3 direta</b>: grandezas proporcionais. Monte a tabela e calcule pela proporção. Se dobra um, dobra o outro!' };
});

const g_rule3Inv = () => Q(5, () => {
    const items = [
        { s: '6 operários fazem obra em 10 dias. Quantos dias para 12 operários?', r: 5,  e: 'Inversa: mais operários → menos dias. Produto constante: 6×10 = 12×x → x = 60/12 = <b>5 dias</b>.' },
        { s: '4 torneiras enchem tanque em 6h. Tempo com 8 torneiras?', r: 3,             e: 'Inversa: mais torneiras → menos tempo. 4×6 = 8×x → x = 24/8 = <b>3 horas</b>.' },
        { s: '3 máquinas em 8h. Tempo com 6 máquinas?', r: 4,                            e: 'Inversa: mais máquinas → menos tempo. 3×8 = 6×x → x = 24/6 = <b>4 horas</b>.' },
        { s: '5 pintores em 12 dias. Tempo com 10 pintores?', r: 6,                       e: 'Inversa: mais pintores → menos dias. 5×12 = 10×x → x = 60/10 = <b>6 dias</b>.' },
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
        explain: `Desconto de ${p}%: multiplique pelo fator <b>(1 − ${p}/100) = ${fator}</b>. Cálculo: ${v} × ${fator} = <b>R$ ${c}</b>. Muito cobrado no ENEM em problemas de consumo!` };
});

const g_increase = () => Q(5, () => {
    const v = pick([100, 200, 300, 400, 500]);
    const p = pick([10, 15, 20, 25, 30, 50]);
    const c = v + (v * p) / 100;
    const fator = (1 + p / 100);
    return { stem: `R$ ${v} com aumento de ${p}%. Valor final?`, ...makeChoice(`R$ ${c}`, nearDistr(c, 40).map(x => `R$ ${x}`)),
        explain: `Aumento de ${p}%: multiplique pelo fator <b>(1 + ${p}/100) = ${fator}</b>. Cálculo: ${v} × ${fator} = <b>R$ ${c}</b>. Encadeando aumentos/descontos: multiplique os fatores em sequência.` };
});

const g_interestSimple = () => Q(5, () => {
    const c = pick([1000, 2000, 5000]);
    const i = pick([1, 2, 5, 10]);
    const t = pick([3, 6, 12]);
    const j = (c * i * t) / 100;
    return { stem: `Capital R$ ${c}, taxa ${i}% ao mês, ${t} meses. Juros simples = ?`, ...makeChoice(`R$ ${j}`, nearDistr(j, 100).map(x => `R$ ${x}`)),
        explain: `Juros Simples: <b>J = C × i × t</b> = ${c} × ${i}/100 × ${t} = <b>R$ ${j}</b>. O montante total seria M = C + J = R$ ${c + j}. Diferente dos juros compostos (capitalização), aqui os juros não se acumulam sobre si mesmos.` };
});

const g_angles = () => Q(5, () => {
    const items = [
        { s: 'Ângulo de 90° é:', r: 'reto', d: ['agudo', 'obtuso', 'raso'] },
        { s: 'Ângulo menor que 90°:', r: 'agudo', d: ['reto', 'obtuso', 'raso'] },
        { s: 'Ângulo entre 90° e 180°:', r: 'obtuso', d: ['agudo', 'reto', 'raso'] },
        { s: 'Ângulo de 180°:', r: 'raso', d: ['reto', 'obtuso', 'agudo'] },
        { s: 'Soma dos ângulos internos de um triângulo:', r: '180°', d: ['90°', '360°', '270°'] },
        { s: 'Soma dos ângulos de um quadrilátero:', r: '360°', d: ['180°', '270°', '90°'] },
        { s: 'Dois ângulos somando 90° são:', r: 'complementares', d: ['suplementares', 'opostos', 'iguais'] },
        { s: 'Dois ângulos somando 180° são:', r: 'suplementares', d: ['complementares', 'opostos', 'paralelos'] },
        { s: 'Complemento de 30°:', r: '60°', d: ['150°', '90°', '30°'] },
        { s: 'Suplemento de 120°:', r: '60°', d: ['90°', '180°', '240°'] },
        { s: 'Ângulo de 45° é:', r: 'agudo', d: ['reto', 'obtuso', 'raso'] },
        { s: 'Ângulo de 135° é:', r: 'obtuso', d: ['agudo', 'reto', 'raso'] },
        { s: 'Em um triângulo retângulo, um ângulo é:', r: '90°', d: ['180°', '60°', '45°'] },
        { s: 'Soma dos ângulos internos do pentágono:', r: '540°', d: ['360°', '720°', '180°'] },
        { s: 'Complemento de 45°:', r: '45°', d: ['90°', '135°', '0°'] },
        { s: 'Suplemento de 90°:', r: '90°', d: ['180°', '45°', '270°'] },
        { s: 'Ângulo de 360° é:', r: 'volta completa', d: ['raso', 'reto', 'agudo'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: '<b>Agudo</b> < 90° | <b>Reto</b> = 90° | <b>Obtuso</b> 90°-180° | <b>Raso</b> = 180°. Triângulo: soma interna = 180°. Quadrilátero: 360°.' };
});

const g_areaTri = () => Q(5, () => {
    const b = rand(2, 20), h = rand(2, 20);
    const c = (b * h) / 2;
    return { stem: `Área de triângulo base <b>${b}</b> cm e altura <b>${h}</b> cm:`, ...makeChoice(`${c} cm²`, nearDistr(c, 8).map(x => `${x} cm²`)),
             explain: `Área do triângulo = (base × altura) ÷ 2. <b>(${b}×${h})/2 = ${c} cm²</b>. A altura é sempre perpendicular à base.` };
});

const g_areaPar = () => Q(5, () => {
    const b = rand(3, 20), h = rand(2, 15);
    const c = b * h;
    return { stem: `Área de paralelogramo base ${b} altura ${h}:`, ...makeChoice(`${c} cm²`, nearDistr(c, 10).map(x => `${x} cm²`)),
             explain: `Área do paralelogramo = base × altura. <b>${b}×${h} = ${c} cm²</b>. Atenção: use a altura perpendicular, não o lado inclinado!` };
});

const g_areaTrap = () => Q(5, () => {
    const B = rand(6, 15), b = rand(2, 5), h = rand(2, 10);
    const c = ((B + b) * h) / 2;
    return { stem: `Área de trapézio (B=${B}, b=${b}, h=${h}):`, ...makeChoice(`${c} cm²`, nearDistr(c, 8).map(x => `${x} cm²`)),
             explain: `Área do trapézio = (Base + base) × altura ÷ 2. <b>(${B}+${b})×${h}/2 = ${c} cm²</b>.` };
});

const g_circle = () => Q(5, () => {
    const r = rand(2, 10);
    const items = [
        { s: `Comprimento do círculo de raio ${r} cm (use π=3,14):`, r: +(2 * 3.14 * r).toFixed(2) },
        { s: `Área do círculo de raio ${r} cm (use π=3,14):`, r: +(3.14 * r * r).toFixed(2) },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, nearDistr(Math.round(it.r), 10).map(x => x.toString())),
             explain: 'Círculo: <b>Circunferência = 2πr</b>. <b>Área = πr²</b>. Use π ≈ 3,14 nas contas.' };
});

/* ── 8º ano — Templo das Potências ─────────────────────────────────────── */
const g_power = () => Q(5, () => {
    const b = rand(2, 9), e = rand(2, 4);
    const c = Math.pow(b, e);
    const steps = Array.from({ length: e }, () => b).join(' × ');
    return { stem: `<b>${b}<sup>${e}</sup></b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(5, c / 4))),
        explain: `Potenciação: <b>${b}${e > 1 ? `<sup>${e}</sup>` : ''}</b> = ${steps} = <b>${c}</b>. O expoente indica quantas vezes a base é multiplicada por ela mesma.` };
});

const g_powerProp = () => Q(5, () => {
    const items = [
        { s: 'a³ × a⁵ = ?', r: 'a⁸',   d: ['a²', 'a¹⁵', '2a⁸'],   e: '<b>Multiplicação de mesma base:</b> soma os expoentes. a³ × a⁵ = a^(3+5) = <b>a⁸</b>.' },
        { s: 'x⁷ ÷ x³ = ?', r: 'x⁴',   d: ['x¹⁰', 'x²¹', 'x'],    e: '<b>Divisão de mesma base:</b> subtrai os expoentes. x⁷ ÷ x³ = x^(7−3) = <b>x⁴</b>.' },
        { s: '(a²)³ = ?',   r: 'a⁶',   d: ['a⁵', 'a²³', 'a'],      e: '<b>Potência de potência:</b> multiplica os expoentes. (a²)³ = a^(2×3) = <b>a⁶</b>.' },
        { s: 'x⁰ = ?',      r: '1',     d: ['0', 'x', 'indefinido'], e: 'Qualquer base (exceto 0) elevada a <b>zero é igual a 1</b>. x⁰ = 1. Decorre da divisão: xⁿ ÷ xⁿ = x⁰ = 1.' },
        { s: '2³ × 2⁴ = ?', r: '2⁷',   d: ['2¹²', '4⁷', '2¹'],    e: '<b>Mesma base:</b> soma os expoentes. 2³ × 2⁴ = 2^(3+4) = <b>2⁷</b> = 128.' },
        { s: '(2³)² = ?',   r: '2⁶',   d: ['2⁵', '4³', '6'],       e: '<b>Potência de potência:</b> (2³)² = 2^(3×2) = <b>2⁶</b> = 64. Nunca some os expoentes aqui!' },
        { s: 'a⁴ × a² = ?', r: 'a⁶',   d: ['a⁸', 'a²', '2a⁶'],    e: '<b>Multiplicação de mesma base:</b> a⁴ × a² = a^(4+2) = <b>a⁶</b>.' },
        { s: 'b⁵ ÷ b² = ?', r: 'b³',   d: ['b⁷', 'b¹⁰', 'b²·⁵'],  e: '<b>Divisão de mesma base:</b> b⁵ ÷ b² = b^(5−2) = <b>b³</b>.' },
        { s: '(x³)² = ?',   r: 'x⁶',   d: ['x⁵', 'x⁹', 'x'],      e: '<b>Potência de potência:</b> (x³)² = x^(3×2) = <b>x⁶</b>.' },
        { s: '5⁰ = ?',      r: '1',     d: ['0', '5', '50'],         e: '<b>Expoente zero:</b> 5⁰ = 1. Regra geral: a⁰ = 1 para qualquer a ≠ 0.' },
        { s: '3² × 3³ = ?', r: '3⁵',   d: ['3⁶', '9⁵', '3¹'],     e: '<b>Mesma base:</b> 3² × 3³ = 3^(2+3) = <b>3⁵</b> = 243.' },
        { s: 'a⁻¹ = ?',     r: '1/a',  d: ['-a', '0', 'a'],         e: '<b>Expoente negativo:</b> a⁻¹ = 1/a. Generalizando: a⁻ⁿ = 1/aⁿ. Ex: 2⁻³ = 1/8.' },
        { s: '(ab)² = ?',   r: 'a²b²', d: ['ab²', 'a²b', '2ab'],    e: '<b>Potência de produto:</b> (ab)² = a²b². Cada fator recebe o expoente individualmente.' },
        { s: '10⁻² = ?',    r: '0,01', d: ['-100', '100', '-0,01'],  e: '10⁻² = 1/10² = 1/100 = <b>0,01</b>. Expoente negativo na base 10 gera decimais.' },
        { s: 'a⁵ ÷ a⁵ = ?', r: '1',    d: ['0', 'a', 'a¹⁰'],        e: 'a⁵ ÷ a⁵ = a^(5−5) = a⁰ = <b>1</b>. Qualquer número dividido por si mesmo é 1.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sciNotation = () => Q(5, () => {
    const items = [
        { s: '500 em notação científica:', r: '5 × 10²', d: ['5 × 10³', '50 × 10', '5,0 × 10⁻²'],
          e: 'Notação científica: <b>a × 10ⁿ</b> onde 1 ≤ a < 10. 500 = 5,00 × 10² (vírgula andou 2 casas para a esquerda).' },
        { s: '3.000.000 em notação científica:', r: '3 × 10⁶', d: ['3 × 10⁵', '30 × 10⁵', '3 × 10⁷'],
          e: '3.000.000 = 3 × 10⁶ (6 zeros = expoente 6). Muito usada em Física (distâncias astronômicas, tamanho de átomos).' },
        { s: '0,005 em notação científica:', r: '5 × 10⁻³', d: ['5 × 10³', '0,5 × 10⁻²', '5 × 10⁻²'],
          e: '0,005 = 5 × 10⁻³ (vírgula andou 3 casas para a direita → expoente negativo).' },
        { s: '7,2 × 10² = ?', r: '720', d: ['72', '7200', '0,72'],
          e: '7,2 × 10² = 7,2 × 100 = <b>720</b>. Expoente positivo → desloque a vírgula para a direita.' },
        { s: '4,5 × 10⁻¹ = ?', r: '0,45', d: ['45', '4,5', '0,045'],
          e: '4,5 × 10⁻¹ = 4,5 ÷ 10 = <b>0,45</b>. Expoente negativo → desloque a vírgula para a esquerda.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sqrt = () => Q(5, () => {
    const r = rand(2, 15);
    const n = r * r;
    return { stem: `<b>√${n}</b> = ?`, ...makeChoice(r, nearDistr(r, 4)),
        explain: `Raiz quadrada: √${n} = <b>${r}</b> porque ${r}² = ${n}. Para conferir: ${r} × ${r} = ${n}. ✓` };
});

const g_cubeRoot = () => Q(5, () => {
    const r = rand(2, 9);
    const n = r * r * r;
    return { stem: `<b>∛${n}</b> = ?`, ...makeChoice(r, nearDistr(r, 3)),
             explain: `Raiz cúbica: <b>∛${n} = ${r}</b> porque ${r}³ = ${r}×${r}×${r} = ${n}. Verifique sempre elevando ao cubo!` };
});

const g_sqrtAprox = () => Q(5, () => {
    const items = [
        { s: '√50 está entre:', r: '7 e 8', d: ['6 e 7', '8 e 9', '4 e 5'] },
        { s: '√30 está entre:', r: '5 e 6', d: ['4 e 5', '6 e 7', '3 e 4'] },
        { s: '√90 está entre:', r: '9 e 10', d: ['8 e 9', '10 e 11', '7 e 8'] },
        { s: '√20 está entre:', r: '4 e 5', d: ['3 e 4', '5 e 6', '6 e 7'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Para aproximar √n: encontre os quadrados perfeitos vizinhos. Ex: √50: como 7²=49 e 8²=64, √50 está entre <b>7 e 8</b>.' };
});

const g_algebraVal = () => Q(5, () => {
    const x = rand(2, 6);
    const items = [
        { s: `2x + 3 (com x=${x})`, r: 2 * x + 3 },
        { s: `x² − 1 (com x=${x})`, r: x * x - 1 },
        { s: `3x − 2 (com x=${x})`, r: 3 * x - 2 },
        { s: `x² + x (com x=${x})`, r: x * x + x },
    ];
    const it = pick(items);
    return { stem: `Valor numérico de ${it.s}:`, ...makeChoice(it.r, nearDistr(it.r, 5)),
             explain: `Valor numérico: <b>substitua</b> x pelo valor dado e calcule. Siga a ordem das operações (parênteses, potências, ×÷, +−).` };
});

const g_monoSum = () => Q(5, () => {
    const items = [
        { s: '3x + 5x', r: '8x', d: ['15x', '8', '8x²'] },
        { s: '7a − 2a', r: '5a', d: ['9a', '5', '14a'] },
        { s: '2x² + 5x²', r: '7x²', d: ['10x⁴', '7x', '7x⁴'] },
        { s: '4y + y', r: '5y', d: ['4y²', '5', '4y + 1'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Some monômios <b>semelhantes</b> (mesma parte literal): some só os coeficientes. Ex: 3x+5x=8x. Não some 3x+5x² (letras diferentes)!' };
});

const g_monoMult = () => Q(5, () => {
    const items = [
        { s: '3x · 2x', r: '6x²', d: ['5x²', '6x', '5x'] },
        { s: '4a · 3b', r: '12ab', d: ['7ab', '12a', '12b'] },
        { s: '2x² · 5x', r: '10x³', d: ['7x³', '10x²', '10x'] },
        { s: '6y · y²', r: '6y³', d: ['6y²', '7y³', 'y⁶'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d),
             explain: 'Multiplicação de monômios: multiplique os coeficientes e <b>some os expoentes</b> das mesmas letras. Ex: 3x·2x=6x².' };
});

const EXPLAIN_SQ_PLUS  = 'Quadrado da soma: <b>(a+b)² = a² + 2ab + b²</b>. O erro mais comum é esquecer o termo do meio <b>2ab</b>. Nunca escreva (a+b)² = a²+b²!';
const EXPLAIN_SQ_MINUS = 'Quadrado da diferença: <b>(a−b)² = a² − 2ab + b²</b>. Atenção: o último termo <b>+b²</b> é positivo! Só o termo do meio muda de sinal.';
const EXPLAIN_DIFF_SQ  = 'Diferença de quadrados: <b>(a+b)(a−b) = a² − b²</b>. Reconheça o padrão para fatorar rapidamente. Muito cobrado em vestibulares!';

const g_squarePlus = () => Q(5, () => {
    const items = [
        { s: '(a + b)² = ?', r: 'a² + 2ab + b²', d: ['a² + b²', 'a² − b²', 'a² + ab + b²'] },
        { s: '(x + 3)² = ?', r: 'x² + 6x + 9',   d: ['x² + 9', 'x² − 6x + 9', 'x² + 3x + 9'] },
        { s: '(2 + y)² = ?', r: 'y² + 4y + 4',   d: ['y² + 4', '2y² + 4', '4 + y²'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_SQ_PLUS };
});

const g_squareMinus = () => Q(5, () => {
    const items = [
        { s: '(a − b)² = ?', r: 'a² − 2ab + b²', d: ['a² + b²', 'a² − b²', 'a² + 2ab − b²'] },
        { s: '(x − 2)² = ?', r: 'x² − 4x + 4',   d: ['x² − 4', 'x² + 4x + 4', 'x² − 2x + 4'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_SQ_MINUS };
});

const g_diffSquares = () => Q(5, () => {
    const items = [
        { s: '(a + b)(a − b) = ?', r: 'a² − b²',  d: ['a² + b²', 'a² + 2ab + b²', '(a − b)²'] },
        { s: '(x + 3)(x − 3) = ?', r: 'x² − 9',   d: ['x² + 9', 'x² − 6x + 9', 'x² − 6'] },
        { s: '(y + 5)(y − 5) = ?', r: 'y² − 25',  d: ['y² + 25', '(y − 5)²', 'y² − 10'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_DIFF_SQ };
});

const g_factor = () => Q(5, () => {
    const items = [
        { s: 'Fatore: 2x + 4', r: '2(x + 2)', d: ['x(2 + 4)', '2x · 4', '(x + 2)(x + 2)'],
          e: '<b>Evidenciação:</b> MDC(2x, 4) = 2. Coloque 2 em evidência: 2x+4 = <b>2(x+2)</b>. Confira expandindo: 2·x + 2·2 = 2x+4. ✓' },
        { s: 'Fatore: 3x² − 6x', r: '3x(x − 2)', d: ['3x² − 6x', 'x(3x − 6)', '3(x² − 2)'],
          e: '<b>Evidenciação:</b> MDC(3x², 6x) = 3x. Então 3x²−6x = <b>3x(x−2)</b>. Sempre coloque o maior fator comum em evidência.' },
        { s: 'Fatore: 5a + 10', r: '5(a + 2)', d: ['(a + 2)(a + 5)', '5a · 2', 'a(5 + 10)'],
          e: '<b>Evidenciação:</b> MDC(5a, 10) = 5. Então 5a+10 = <b>5(a+2)</b>.' },
        { s: 'Fatore: x² − 9', r: '(x + 3)(x − 3)', d: ['(x − 3)²', '(x + 3)²', 'x(x − 9)'],
          e: '<b>Diferença de quadrados:</b> x²−9 = x²−3² = <b>(x+3)(x−3)</b>. Reconheça o padrão a²−b² = (a+b)(a−b).' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sysSubst = () => Q(5, () => {
    const items = [
        { s: '{ x + y = 7 ;  x − y = 1 }', r: 'x=4, y=3', d: ['x=3, y=4', 'x=5, y=2', 'x=6, y=1'],
          e: '<b>Método da adição:</b> some as equações: 2x = 8 → x = 4. Substitua: 4+y=7 → y=3.' },
        { s: '{ x + y = 10 ; x − y = 4 }', r: 'x=7, y=3', d: ['x=3, y=7', 'x=6, y=4', 'x=5, y=5'],
          e: '<b>Método da adição:</b> some: 2x = 14 → x = 7. Substitua: 7+y=10 → y=3.' },
        { s: '{ 2x + y = 9 ; x + y = 5 }', r: 'x=4, y=1', d: ['x=1, y=4', 'x=3, y=2', 'x=2, y=3'],
          e: '<b>Subtração:</b> subtraia a 2ª da 1ª: (2x+y)−(x+y) = 9−5 → x=4. Substitua: 4+y=5 → y=1.' },
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
             explain: '<b>Produto cruzado:</b> se a/b = c/x, então a·x = b·c. Isole x dividindo. Muito usado em semelhança de triângulos!' };
});

/* ── 9º ano — Cidadela do Mestre ───────────────────────────────────────── */
const g_funcAfim = () => Q(5, () => {
    const items = [
        { s: 'Em f(x) = 2x + 3, qual o coeficiente angular?', r: 2, d: [3, 5, -2],
          e: 'Em <b>f(x) = ax + b</b>: <b>a</b> é o coeficiente angular (taxa de variação, inclinação da reta). Aqui a=<b>2</b>, b=3.' },
        { s: 'Em f(x) = 2x + 3, qual o coeficiente linear?', r: 3, d: [2, -3, 0],
          e: 'Em <b>f(x) = ax + b</b>: <b>b</b> é o coeficiente linear (valor de f quando x=0, onde a reta cruza o eixo y). Aqui b=<b>3</b>.' },
        { s: 'f(x) = 3x − 6. f(0) = ?', r: -6, d: [0, 3, 6],
          e: 'Substitua x=0: f(0) = 3(0)−6 = <b>−6</b>. Este é o coeficiente linear — o ponto onde a reta toca o eixo y.' },
        { s: 'f(x) = 3x − 6. f(2) = ?', r: 0, d: [6, -6, 12],
          e: 'Substitua x=2: f(2) = 3(2)−6 = 6−6 = <b>0</b>. Quando f(x)=0, x=2 é a raiz (zero) da função afim.' },
        { s: 'A função afim tem a forma:', r: 'f(x) = ax + b', d: ['f(x) = ax²', 'f(x) = a/x', 'f(x) = aˣ'],
          e: 'Função afim: <b>f(x) = ax + b</b> (grau 1, gráfico é reta). Não confunda com quadrática (ax²), inversa (a/x) ou exponencial (aˣ).' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_funcRoot = () => Q(5, () => {
    const a = rand(1, 6), b = rand(2, 20);
    const r = b / a;
    if (b % a !== 0) return { stem: `Raiz de f(x) = ${a}x − ${a * 3}`, ...makeChoice(3, [0, a, -3]) };
    return { stem: `Raiz de f(x) = ${a}x − ${b}`, ...makeChoice(r, nearDistr(r, 4)) };
});

const EXPLAIN_FUNC_GRAPH = 'Gráfico de <b>f(x) = ax + b</b> é sempre uma <b>reta</b>. Se a>0 → crescente (sobe da esquerda para direita). Se a<0 → decrescente. Se a=0 → reta horizontal. O gráfico corta o eixo y no ponto (0, b).';
const g_funcGraph = () => Q(5, () => {
    const items = [
        { s: 'Gráfico de função afim é:',          r: 'uma reta',   d: ['parábola', 'hipérbole', 'circunferência'] },
        { s: 'Quando a > 0, f(x) = ax + b é:',     r: 'crescente',  d: ['decrescente', 'constante', 'oscilante'] },
        { s: 'Quando a < 0, f(x) = ax + b é:',     r: 'decrescente', d: ['crescente', 'constante', 'paralela ao eixo x'] },
        { s: 'A reta passa pelo eixo y no ponto:',  r: '(0, b)',     d: ['(b, 0)', '(0, 0)', '(a, b)'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: EXPLAIN_FUNC_GRAPH };
});

const g_bhaskaraDelta = () => Q(5, () => {
    const items = [
        { s: 'x² − 5x + 6 = 0. Δ = ?', r: 1, d: [25, -1, 11],
          e: '<b>Δ = b²−4ac</b> com a=1, b=−5, c=6: Δ = 25−24 = <b>1</b>. Como Δ>0, há duas raízes reais distintas.' },
        { s: 'x² + 2x − 3 = 0. Δ = ?', r: 16, d: [4, -8, 12],
          e: 'a=1, b=2, c=−3: <b>Δ = 4−4(1)(−3) = 4+12 = 16</b>. √16=4, logo as raízes são racionais.' },
        { s: '2x² + 3x − 2 = 0. Δ = ?', r: 25, d: [9, -7, 17],
          e: 'a=2, b=3, c=−2: <b>Δ = 9−4(2)(−2) = 9+16 = 25</b>. √25=5, raízes racionais.' },
        { s: 'x² − 4x + 4 = 0. Δ = ?', r: 0, d: [16, -16, 8],
          e: 'a=1, b=−4, c=4: <b>Δ = 16−16 = 0</b>. Quando Δ=0, há exatamente <b>uma raiz real</b> (raiz dupla): x = −b/2a = 2.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_bhaskaraRoots = () => Q(5, () => {
    const items = [
        { s: 'x² − 5x + 6 = 0. Raízes?', r: '2 e 3', d: ['1 e 6', '−2 e −3', '5 e 6'],
          e: 'Δ = 25−24 = 1. <b>x = (5±1)/2</b> → x₁=3, x₂=2. Verificação: soma = 5 = −b/a ✓  produto = 6 = c/a ✓' },
        { s: 'x² − 7x + 12 = 0. Raízes?', r: '3 e 4', d: ['2 e 6', '1 e 12', '−3 e −4'],
          e: 'Δ = 49−48 = 1. <b>x = (7±1)/2</b> → x₁=4, x₂=3. Soma=7=−(−7), produto=12. Relações de Girard!' },
        { s: 'x² + x − 6 = 0. Raízes?', r: '2 e −3', d: ['−2 e 3', '1 e −6', '6 e −1'],
          e: 'a=1, b=1, c=−6. Δ = 1+24 = 25. <b>x = (−1±5)/2</b> → x₁=2, x₂=−3. Note: b=+1, então −b=−1!' },
        { s: 'x² − 9 = 0. Raízes?', r: '3 e −3', d: ['9 e −9', '3 e 9', '0 e 9'],
          e: 'Reconheça: <b>diferença de quadrados!</b> x²−9 = (x+3)(x−3)=0. Logo x=3 ou x=−3. Mais rápido que Bhaskara!' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_sumProd = () => Q(5, () => {
    const items = [
        { s: 'x² − 5x + 6 = 0. Soma das raízes?', r: 5, d: [-5, 6, 1],
          e: '<b>Soma = −b/a</b> = −(−5)/1 = <b>5</b>. Confirme: raízes são 2 e 3, soma = 5. ✓' },
        { s: 'x² − 5x + 6 = 0. Produto das raízes?', r: 6, d: [5, -6, 1],
          e: '<b>Produto = c/a</b> = 6/1 = <b>6</b>. Confirme: raízes 2 e 3, produto = 6. ✓ Relações de Girard!' },
        { s: 'x² + 3x − 10 = 0. Soma?', r: -3, d: [3, -10, 10],
          e: 'a=1, b=3, c=−10. <b>Soma = −b/a = −3/1 = −3</b>. Raízes: x=2 e x=−5, soma=−3. ✓' },
        { s: 'Soma = −b/a, produto = c/a. Em x²+2x−8: soma?', r: -2, d: [2, -8, 8],
          e: 'a=1, b=2, c=−8. <b>Soma = −2/1 = −2</b>. Produto = −8. Raízes: x=2 e x=−4, soma=−2. ✓' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_vertex = () => Q(5, () => {
    const items = [
        { s: 'f(x) = x² − 4x + 3. xᵥ = ?', r: 2, d: [-2, 4, 3],
          e: 'Vértice: <b>xᵥ = −b/(2a)</b> = −(−4)/(2·1) = 4/2 = <b>2</b>. Com a>0, é o ponto de mínimo da parábola.' },
        { s: 'f(x) = x² − 6x + 5. xᵥ = ?', r: 3, d: [-3, 6, 5],
          e: '<b>xᵥ = −b/(2a)</b> = −(−6)/(2·1) = <b>3</b>. A parábola tem mínimo em x=3, pois a=1>0.' },
        { s: 'f(x) = 2x² − 4x. xᵥ = ?', r: 1, d: [-1, 2, 0],
          e: 'a=2, b=−4, c=0. <b>xᵥ = −(−4)/(2·2) = 4/4 = 1</b>. A parábola abre para cima (a>0) com mínimo em x=1.' },
        { s: 'Vértice da parábola: xᵥ = ?', r: '−b/(2a)', d: ['−b/a', 'b/(2a)', '−c/a'],
          e: 'Fórmula do vértice: <b>xᵥ = −b/(2a)</b>. O yᵥ = f(xᵥ) = −Δ/(4a). O vértice é máximo se a<0 e mínimo se a>0.' },
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
        explain: `<b>Pitágoras: c² = a² + b²</b> = ${a}² + ${b}² = ${a*a} + ${b*b} = ${c*c}. Então c = √${c*c} = <b>${c}</b>. Terna pitagórica: (${a}, ${b}, ${c}).` };
    if (role === 'catA') return { stem: `Hipotenusa ${c}, um cateto ${b}. Outro cateto?`, ...makeChoice(a, nearDistr(a, 4)),
        explain: `<b>Pitágoras: a² = c² − b²</b> = ${c}² − ${b}² = ${c*c} − ${b*b} = ${a*a}. Então a = √${a*a} = <b>${a}</b>.` };
    return { stem: `Hipotenusa ${c}, um cateto ${a}. Outro cateto?`, ...makeChoice(b, nearDistr(b, 5)),
        explain: `<b>Pitágoras: b² = c² − a²</b> = ${c}² − ${a}² = ${c*c} − ${a*a} = ${b*b}. Então b = √${b*b} = <b>${b}</b>.` };
});

const EXPLAIN_TRIG_TABLE = 'Tabela notável: <b>30°→1/2 | 45°→√2/2 | 60°→√3/2</b> (para seno). Coseno usa a mesma tabela mas invertida (cos30°=sen60°=√3/2). Mnemônico: <b>1, √2, √3</b> divididos por 2.';
const EXPLAIN_TRIG_ID = '<b>Identidade fundamental:</b> sen²x + cos²x = 1 (para qualquer x). Decorre do Teorema de Pitágoras no círculo trigonométrico de raio 1.';
const g_trigSpecial = () => Q(5, () => {
    const items = [
        { s: 'sen 30° = ?', r: '1/2',   d: ['√3/2', '√2/2', '1'],    e: EXPLAIN_TRIG_TABLE },
        { s: 'cos 60° = ?', r: '1/2',   d: ['√3/2', '√2/2', '1'],    e: EXPLAIN_TRIG_TABLE },
        { s: 'sen 45° = ?', r: '√2/2',  d: ['1/2', '√3/2', '1'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'cos 30° = ?', r: '√3/2',  d: ['1/2', '√2/2', '0'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'tg 45° = ?',  r: '1',     d: ['0', '√2', '√3'],         e: 'tg 45° = sen45°/cos45° = (√2/2)/(√2/2) = <b>1</b>. A tangente de 45° é 1 porque os catetos são iguais.' },
        { s: 'sen 90° = ?', r: '1',     d: ['0', '1/2', '√3/2'],      e: 'sen 90° = <b>1</b> (máximo). cos 90° = 0. No círculo trig, o ponto é (0, 1).' },
        { s: 'cos 0° = ?',  r: '1',     d: ['0', '1/2', '√2/2'],      e: 'cos 0° = <b>1</b>. No círculo trigonométrico, o ângulo 0° corresponde ao ponto (1, 0).' },
        { s: 'sen 0° = ?',  r: '0',     d: ['1', '1/2', '√2/2'],      e: 'sen 0° = <b>0</b>. O seno de 0° é zero porque a altura no círculo trigonométrico é nula.' },
        { s: 'cos 90° = ?', r: '0',     d: ['1', '1/2', '√3/2'],      e: 'cos 90° = <b>0</b>. No círculo trig, 90° → ponto (0, 1), então a projeção horizontal é zero.' },
        { s: 'cos 45° = ?', r: '√2/2',  d: ['1/2', '√3/2', '1'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'sen 60° = ?', r: '√3/2',  d: ['1/2', '√2/2', '1'],     e: EXPLAIN_TRIG_TABLE },
        { s: 'tg 30° = ?',  r: '√3/3',  d: ['1/2', '√3', '√3/2'],    e: 'tg 30° = sen30°/cos30° = (1/2)/(√3/2) = 1/√3 = <b>√3/3</b> (racionalizando o denominador).' },
        { s: 'tg 60° = ?',  r: '√3',    d: ['1/2', '√3/2', '1'],     e: 'tg 60° = sen60°/cos60° = (√3/2)/(1/2) = <b>√3</b> ≈ 1,73.' },
        { s: 'sen²x + cos²x = ?', r: '1', d: ['0', 'x', '2'],        e: EXPLAIN_TRIG_ID },
        { s: 'tg x = sen x / ?', r: 'cos x', d: ['sen x', '1', 'x'], e: 'Definição: <b>tg x = sen x / cos x</b>. Daí derivam outras identidades como 1 + tg²x = sec²x.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_similar = () => Q(5, () => {
    const items = [
        { s: 'Triângulos semelhantes têm lados ___:', r: 'proporcionais', d: ['iguais', 'perpendiculares', 'paralelos'],
          e: 'Semelhança: mesmos ângulos e lados <b>proporcionais</b> (não iguais). Congruência exige lados iguais. Semelhante ≠ congruente!' },
        { s: 'Razão de semelhança 1:2. Áreas?', r: '1:4', d: ['1:2', '2:1', '1:8'],
          e: 'Razão de semelhança k → razão de áreas = <b>k²</b>. Se k=1/2, área = (1/2)² = <b>1:4</b>. Dobrar o lado quadruplica a área!' },
        { s: 'Razão de semelhança 2:3. Áreas?', r: '4:9', d: ['2:3', '6:9', '8:27'],
          e: 'k = 2/3 → razão de áreas = k² = <b>(2/3)² = 4/9</b>. Para volumes, seria k³ = 8/27.' },
        { s: 'Triângulos semelhantes têm ângulos ___:', r: 'iguais', d: ['proporcionais', 'opostos', 'retos'],
          e: 'Critério AA (ângulo-ângulo): basta dois ângulos iguais para garantir semelhança. Os ângulos são sempre <b>iguais</b>, os lados é que são proporcionais.' },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d), explain: it.e };
});

const g_polygon = () => Q(5, () => {
    const items = [
        { s: 'Ângulo interno do triângulo equilátero:', r: '60°', d: ['90°', '120°', '180°'] },
        { s: 'Ângulo interno do quadrado:', r: '90°', d: ['60°', '120°', '180°'] },
        { s: 'Ângulo interno do hexágono regular:', r: '120°', d: ['60°', '90°', '150°'] },
        { s: 'Soma dos ângulos internos do pentágono:', r: '540°', d: ['360°', '720°', '180°'] },
        { s: 'Soma dos internos: (n−2)·180°. n=8?', r: '1080°', d: ['900°', '1260°', '720°'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_probComp = () => Q(5, () => {
    const items = [
        { s: 'Duas moedas. Probabilidade de duas caras?', r: '1/4', d: ['1/2', '1/3', '2/4'] },
        { s: 'Dois dados. Probabilidade de soma 7?', r: '6/36', d: ['1/6', '7/36', '5/36'] },
        { s: 'Tirar 2 ases num baralho (sem reposição):', r: '1/221', d: ['1/52', '1/13', '1/26'] },
        { s: 'Eventos independentes: P(A e B) =', r: 'P(A) · P(B)', d: ['P(A) + P(B)', 'P(A) − P(B)', '1'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_stats = () => Q(5, () => {
    const items = [
        { s: 'Dados: 2, 4, 4, 6, 8. Média?', r: '4,8', d: ['4', '5', '6'] },
        { s: 'Dados: 2, 4, 4, 6, 8. Mediana?', r: '4', d: ['4,8', '6', '2'] },
        { s: 'Dados: 2, 4, 4, 6, 8. Moda?', r: '4', d: ['4,8', '6', 'não há'] },
        { s: 'Dados: 1, 3, 5, 7, 9. Mediana?', r: '5', d: ['4', '6', '3'] },
        { s: 'Dados: 10, 20, 30. Média?', r: '20', d: ['15', '30', '60'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_irrational = () => Q(5, () => {
    const items = [
        { s: '√x = 5. x = ?', r: 25, d: [5, 10, 125] },
        { s: '√(x + 1) = 3. x = ?', r: 8, d: [9, 2, 3] },
        { s: '√(2x) = 4. x = ?', r: 8, d: [4, 16, 2] },
        { s: '√(x − 5) = 2. x = ?', r: 9, d: [4, 7, 3] },
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

/* ─── 181 fases ──────────────────────────────────────────────────────────
 * Cada fase: { id, region, name, gen }.
 * region indica a região no mapa (1..9).
 * ───────────────────────────────────────────────────────────────────────── */
const PHASES = [
    // ── 1º ano — Vila dos Números (1-20) ──
    { id: 1,  region: 1, name: 'Contar até 5',           gen: g_count(1, 5) },
    { id: 2,  region: 1, name: 'Contar até 10',          gen: g_count(3, 10) },
    { id: 3,  region: 1, name: 'O número zero',          gen: g_zero() },
    { id: 4,  region: 1, name: 'Contar até 15',          gen: g_count(5, 15) },
    { id: 5,  region: 1, name: 'Contar até 20',          gen: g_count(10, 20) },
    { id: 6,  region: 1, name: 'Maior e menor (1-10)',   gen: g_compare(0, 10) },
    { id: 7,  region: 1, name: 'Comparar até 20',        gen: g_compare(0, 20) },
    { id: 8,  region: 1, name: 'Sequência +1',           gen: g_pattern(0, 1) },
    { id: 9,  region: 1, name: 'Sequência +2',           gen: g_pattern(0, 2) },
    { id: 10, region: 1, name: 'Ordem crescente',        gen: g_orderAsc(1, 20) },
    { id: 11, region: 1, name: 'Ordem decrescente',      gen: g_orderDesc(1, 20) },
    { id: 12, region: 1, name: 'Número antes',           gen: g_before(1, 30) },
    { id: 13, region: 1, name: 'Número depois',          gen: g_after(0, 29) },
    { id: 14, region: 1, name: 'Formas geométricas',     gen: g_shapes() },
    { id: 15, region: 1, name: 'Mais lados, mais formas', gen: g_shapes() },
    { id: 16, region: 1, name: 'Sequência +5',           gen: g_pattern(0, 5) },
    { id: 17, region: 1, name: 'Sequência +10',          gen: g_pattern(0, 10) },
    { id: 18, region: 1, name: 'Dezenas e unidades',     gen: g_dezena() },
    { id: 19, region: 1, name: 'Comparar até 50',        gen: g_compare(0, 50) },
    { id: 20, region: 1, name: '⭐ Desafio da Vila',     gen: () => shuffle([...g_count(1, 20)(), ...g_compare(0, 30)(), ...g_shapes()()]).slice(0, 6) },

    // ── 2º ano — Bosque das Operações (21-40) ──
    { id: 21, region: 2, name: 'Soma até 10',            gen: g_add(5, 5) },
    { id: 22, region: 2, name: 'Soma até 20',            gen: g_add(10, 10) },
    { id: 23, region: 2, name: 'Subtração até 10',       gen: g_sub(10, 5) },
    { id: 24, region: 2, name: 'Subtração até 20',       gen: g_sub(20, 10) },
    { id: 25, region: 2, name: 'Soma até 50',            gen: g_add(30, 20) },
    { id: 26, region: 2, name: 'Subtração até 50',       gen: g_sub(50, 30) },
    { id: 27, region: 2, name: 'Par ou ímpar',           gen: g_parity() },
    { id: 28, region: 2, name: 'Dobro',                  gen: g_double(30) },
    { id: 29, region: 2, name: 'Metade',                 gen: g_half(30) },
    { id: 30, region: 2, name: 'Soma de 3 parcelas',     gen: g_add3(10) },
    { id: 31, region: 2, name: 'Soma até 100',           gen: g_add(50, 50) },
    { id: 32, region: 2, name: 'Subtração até 100',      gen: g_sub(100, 50) },
    { id: 33, region: 2, name: 'Antecessor/sucessor 100', gen: () => shuffle([...g_before(20, 100)(), ...g_after(20, 99)()]).slice(0, 5) },
    { id: 34, region: 2, name: 'Sequência de 5 em 5',    gen: g_seqStep(5) },
    { id: 35, region: 2, name: 'Sequência de 10 em 10',  gen: g_seqStep(10) },
    { id: 36, region: 2, name: 'Decomposição',           gen: g_decomp() },
    { id: 37, region: 2, name: 'Comparar até 100',       gen: g_compare(0, 100) },
    { id: 38, region: 2, name: 'Problemas (soma/sub)',   gen: g_wordSimple() },
    { id: 39, region: 2, name: 'Dobro avançado',         gen: g_double(50) },
    { id: 40, region: 2, name: '⭐ Desafio do Bosque',    gen: () => shuffle([...g_add(50, 50)(), ...g_sub(100, 50)(), ...g_parity()()]).slice(0, 6) },

    // ── 3º ano — Vale das Tabuadas (41-60) ──
    { id: 41, region: 3, name: 'Soma com reserva',       gen: g_addCarry() },
    { id: 42, region: 3, name: 'Subtração com empréstimo', gen: g_subBorrow() },
    { id: 43, region: 3, name: 'Tabuada do 2',           gen: g_table(2) },
    { id: 44, region: 3, name: 'Tabuada do 3',           gen: g_table(3) },
    { id: 45, region: 3, name: 'Tabuada do 4',           gen: g_table(4) },
    { id: 46, region: 3, name: 'Tabuada do 5',           gen: g_table(5) },
    { id: 47, region: 3, name: 'Tabuada do 6',           gen: g_table(6) },
    { id: 48, region: 3, name: 'Tabuada do 7',           gen: g_table(7) },
    { id: 49, region: 3, name: 'Tabuada do 8',           gen: g_table(8) },
    { id: 50, region: 3, name: 'Tabuada do 9',           gen: g_table(9) },
    { id: 51, region: 3, name: 'Tabuada do 10',          gen: g_table(10) },
    { id: 52, region: 3, name: 'Multiplicação mista',    gen: g_tableMix(2, 9) },
    { id: 53, region: 3, name: 'Divisão por 2',          gen: g_divExact(2) },
    { id: 54, region: 3, name: 'Divisão por 3, 4, 5',    gen: g_divExact(5) },
    { id: 55, region: 3, name: 'Divisão por 6 a 9',      gen: g_divExact(9) },
    { id: 56, region: 3, name: 'Divisão mista',          gen: g_divExact(10) },
    { id: 57, region: 3, name: 'Dinheiro: somar reais',  gen: g_money() },
    { id: 58, region: 3, name: 'Troco',                  gen: g_money() },
    { id: 59, region: 3, name: 'Problemas com mult/div', gen: g_wordSimple() },
    { id: 60, region: 3, name: '⭐ Desafio do Vale',      gen: () => shuffle([...g_tableMix(2, 9)(), ...g_divExact(9)(), ...g_money()()]).slice(0, 6) },

    // ── 4º ano — Caverna das Frações (61-80) ──
    { id: 61, region: 4, name: 'Multiplicação por 10/100', gen: g_mult10() },
    { id: 62, region: 4, name: 'Multiplicação 2 × 1',    gen: g_mult2x1() },
    { id: 63, region: 4, name: 'Multiplicação 2 × 2',    gen: g_mult2x2() },
    { id: 64, region: 4, name: 'Divisão com resto',      gen: g_divRest() },
    { id: 65, region: 4, name: 'Divisão de 2 dígitos',   gen: g_div2dig() },
    { id: 66, region: 4, name: 'O que é uma fração',     gen: g_fracTerm() },
    { id: 67, region: 4, name: 'Fração visual',          gen: g_fracVisual() },
    { id: 68, region: 4, name: 'Metade, terço, quarto',  gen: g_fracTerm() },
    { id: 69, region: 4, name: 'Frações equivalentes',   gen: g_fracEquiv() },
    { id: 70, region: 4, name: 'Comparar frações iguais', gen: g_fracCompareSameDen() },
    { id: 71, region: 4, name: 'Soma de frações iguais', gen: g_fracAddSame() },
    { id: 72, region: 4, name: 'Unidades de medida',     gen: g_units() },
    { id: 73, region: 4, name: 'Conversão de unidades',  gen: g_units() },
    { id: 74, region: 4, name: 'Perímetro',              gen: g_perimeter() },
    { id: 75, region: 4, name: 'Tempo: horas e min',     gen: g_time() },
    { id: 76, region: 4, name: 'Tempo: conversões',      gen: g_time() },
    { id: 77, region: 4, name: 'Problemas com frações',  gen: g_fracVisual() },
    { id: 78, region: 4, name: 'Divisão 2 dígitos avançada', gen: g_div2dig() },
    { id: 79, region: 4, name: 'Mistura caverna',        gen: () => shuffle([...g_mult2x1()(), ...g_fracVisual()()]).slice(0, 6) },
    { id: 80, region: 4, name: '⭐ Desafio da Caverna',  gen: () => shuffle([...g_fracVisual()(), ...g_perimeter()(), ...g_mult2x2()()]).slice(0, 6) },

    // ── 5º ano — Lago dos Decimais (81-100) ──
    { id: 81,  region: 5, name: 'Frações próprias/impróprias', gen: g_fracProperImproper() },
    { id: 82,  region: 5, name: 'Equivalentes avançadas', gen: g_fracEquiv() },
    { id: 83,  region: 5, name: 'Decimais: leitura',     gen: g_decRead() },
    { id: 84,  region: 5, name: 'Comparar decimais',     gen: g_decCompare() },
    { id: 85,  region: 5, name: 'Soma de decimais',      gen: g_decAdd() },
    { id: 86,  region: 5, name: 'Subtração de decimais', gen: g_decSub() },
    { id: 87,  region: 5, name: 'Decimais × 10, 100',    gen: g_decMult10() },
    { id: 88,  region: 5, name: 'Porcentagem básica',    gen: g_percentEasy() },
    { id: 89,  region: 5, name: '10%, 50%, 100%',        gen: g_percentEasy() },
    { id: 90,  region: 5, name: 'Porcentagem aplicada',  gen: g_percentApply() },
    { id: 91,  region: 5, name: 'Área do quadrado',      gen: g_areaSquare() },
    { id: 92,  region: 5, name: 'Área do retângulo',     gen: g_areaRect() },
    { id: 93,  region: 5, name: 'Volume do cubo',        gen: g_volumeCube() },
    { id: 94,  region: 5, name: 'Volume do paralelepípedo', gen: g_volumePar() },
    { id: 95,  region: 5, name: 'Probabilidade simples', gen: g_probSimple() },
    { id: 96,  region: 5, name: 'Média aritmética',      gen: g_mean() },
    { id: 97,  region: 5, name: 'Decimais misturados',   gen: () => shuffle([...g_decAdd()(), ...g_decSub()()]).slice(0, 6) },
    { id: 98,  region: 5, name: 'Porcentagem real',      gen: g_percentApply() },
    { id: 99,  region: 5, name: 'Geometria mista',       gen: () => shuffle([...g_areaRect()(), ...g_volumeCube()()]).slice(0, 6) },
    { id: 100, region: 5, name: '⭐ Desafio do Lago',     gen: () => shuffle([...g_decAdd()(), ...g_percentApply()(), ...g_areaRect()()]).slice(0, 6) },

    // ── 6º ano — Montanha dos Inteiros (101-120) ──
    { id: 101, region: 6, name: 'Reta dos inteiros',     gen: g_negLine() },
    { id: 102, region: 6, name: 'Soma com negativos',    gen: g_negAdd() },
    { id: 103, region: 6, name: 'Subtração de negativos', gen: g_negSub() },
    { id: 104, region: 6, name: 'Mult. com negativos',   gen: g_negMult() },
    { id: 105, region: 6, name: 'Divisão com negativos', gen: g_negDiv() },
    { id: 106, region: 6, name: 'Sinais misturados',     gen: () => shuffle([...g_negAdd()(), ...g_negMult()()]).slice(0, 6) },
    { id: 107, region: 6, name: 'MMC',                   gen: g_mmc() },
    { id: 108, region: 6, name: 'MDC',                   gen: g_mdc() },
    { id: 109, region: 6, name: 'Soma de frações ≠',     gen: g_fracAddDiff() },
    { id: 110, region: 6, name: 'Subtração de frações',  gen: g_fracAddDiff() },
    { id: 111, region: 6, name: 'Multiplicação fracion.', gen: g_fracMult() },
    { id: 112, region: 6, name: 'Divisão fracionária',   gen: g_fracDiv() },
    { id: 113, region: 6, name: 'Equação x + a = b',     gen: g_eq1() },
    { id: 114, region: 6, name: 'Equação x − a = b',     gen: g_eq1() },
    { id: 115, region: 6, name: 'Equação ax = b',        gen: g_eqMult() },
    { id: 116, region: 6, name: 'Equação x/a = b',       gen: g_eqMult() },
    { id: 117, region: 6, name: 'Porcentagem como fração', gen: g_percentEasy() },
    { id: 118, region: 6, name: 'Razão simples',         gen: g_ratioBasic() },
    { id: 119, region: 6, name: 'Operações mistas',      gen: () => shuffle([...g_negAdd()(), ...g_fracMult()(), ...g_eq1()()]).slice(0, 6) },
    { id: 120, region: 6, name: '⭐ Desafio da Montanha', gen: () => shuffle([...g_negMult()(), ...g_fracAddDiff()(), ...g_eqMult()()]).slice(0, 6) },

    // ── 7º ano — Deserto das Equações (121-140) ──
    { id: 121, region: 7, name: 'Equação 2 passos',      gen: g_eqMult() },
    { id: 122, region: 7, name: 'X dos dois lados',      gen: g_eq2sides() },
    { id: 123, region: 7, name: 'Equação com parênteses', gen: g_eqParen() },
    { id: 124, region: 7, name: 'Equação fracionária',   gen: g_eqFrac() },
    { id: 125, region: 7, name: 'Razão',                 gen: g_ratioBasic() },
    { id: 126, region: 7, name: 'Proporção',             gen: g_proportion() },
    { id: 127, region: 7, name: 'Regra de 3 direta',     gen: g_rule3() },
    { id: 128, region: 7, name: 'Regra de 3 inversa',    gen: g_rule3Inv() },
    { id: 129, region: 7, name: 'Desconto percentual',   gen: g_discount() },
    { id: 130, region: 7, name: 'Aumento percentual',    gen: g_increase() },
    { id: 131, region: 7, name: 'Juros simples',         gen: g_interestSimple() },
    { id: 132, region: 7, name: 'Tipos de ângulos',      gen: g_angles() },
    { id: 133, region: 7, name: 'Soma de ângulos',       gen: g_angles() },
    { id: 134, region: 7, name: 'Área de triângulo',     gen: g_areaTri() },
    { id: 135, region: 7, name: 'Área de paralelogramo', gen: g_areaPar() },
    { id: 136, region: 7, name: 'Área de trapézio',      gen: g_areaTrap() },
    { id: 137, region: 7, name: 'Círculo',               gen: g_circle() },
    { id: 138, region: 7, name: 'Problemas geométricos', gen: () => shuffle([...g_areaTri()(), ...g_areaPar()()]).slice(0, 6) },
    { id: 139, region: 7, name: 'Operações algébricas',  gen: () => shuffle([...g_eq2sides()(), ...g_proportion()()]).slice(0, 6) },
    { id: 140, region: 7, name: '⭐ Desafio do Deserto',  gen: () => shuffle([...g_eq2sides()(), ...g_rule3()(), ...g_discount()()]).slice(0, 6) },

    // ── 8º ano — Templo das Potências (141-160) ──
    { id: 141, region: 8, name: 'Potências básicas',     gen: g_power() },
    { id: 142, region: 8, name: 'Base inteira',          gen: g_power() },
    { id: 143, region: 8, name: 'Propriedades I',        gen: g_powerProp() },
    { id: 144, region: 8, name: 'Propriedades II',       gen: g_powerProp() },
    { id: 145, region: 8, name: 'Potência de potência',  gen: g_powerProp() },
    { id: 146, region: 8, name: 'Notação científica',    gen: g_sciNotation() },
    { id: 147, region: 8, name: 'Raiz quadrada',         gen: g_sqrt() },
    { id: 148, region: 8, name: 'Raiz aproximada',       gen: g_sqrtAprox() },
    { id: 149, region: 8, name: 'Raiz cúbica',           gen: g_cubeRoot() },
    { id: 150, region: 8, name: 'Valor numérico',        gen: g_algebraVal() },
    { id: 151, region: 8, name: 'Soma de monômios',      gen: g_monoSum() },
    { id: 152, region: 8, name: 'Multiplicação monômios', gen: g_monoMult() },
    { id: 153, region: 8, name: '(a + b)²',              gen: g_squarePlus() },
    { id: 154, region: 8, name: '(a − b)²',              gen: g_squareMinus() },
    { id: 155, region: 8, name: '(a + b)(a − b)',        gen: g_diffSquares() },
    { id: 156, region: 8, name: 'Fatoração',             gen: g_factor() },
    { id: 157, region: 8, name: 'Sistemas substituição', gen: g_sysSubst() },
    { id: 158, region: 8, name: 'Sistemas adição',       gen: g_sysSubst() },
    { id: 159, region: 8, name: 'Teorema de Tales',      gen: g_thales() },
    { id: 160, region: 8, name: '⭐ Desafio do Templo',  gen: () => shuffle([...g_power()(), ...g_diffSquares()(), ...g_sysSubst()()]).slice(0, 6) },

    // ── 9º ano — Cidadela do Mestre (161-181) ──
    { id: 161, region: 9, name: 'Função afim',           gen: g_funcAfim() },
    { id: 162, region: 9, name: 'Coeficientes da afim',  gen: g_funcAfim() },
    { id: 163, region: 9, name: 'Raiz da função afim',   gen: g_funcRoot() },
    { id: 164, region: 9, name: 'Gráfico da afim',       gen: g_funcGraph() },
    { id: 165, region: 9, name: 'Eq. 2º grau: forma',    gen: g_bhaskaraRoots() },
    { id: 166, region: 9, name: 'Discriminante (Δ)',     gen: g_bhaskaraDelta() },
    { id: 167, region: 9, name: 'Bhaskara: raízes',      gen: g_bhaskaraRoots() },
    { id: 168, region: 9, name: 'Soma e produto',        gen: g_sumProd() },
    { id: 169, region: 9, name: 'Vértice da parábola',   gen: g_vertex() },
    { id: 170, region: 9, name: 'Pitágoras: hipotenusa', gen: g_pythCat() },
    { id: 171, region: 9, name: 'Pitágoras: cateto',     gen: g_pythCat() },
    { id: 172, region: 9, name: 'Semelhança',            gen: g_similar() },
    { id: 173, region: 9, name: 'Trigonometria especial', gen: g_trigSpecial() },
    { id: 174, region: 9, name: 'Seno, cosseno e tg',    gen: g_trigSpecial() },
    { id: 175, region: 9, name: 'Polígonos regulares',   gen: g_polygon() },
    { id: 176, region: 9, name: 'Probabilidade composta', gen: g_probComp() },
    { id: 177, region: 9, name: 'Estatística I',         gen: g_stats() },
    { id: 178, region: 9, name: 'Estatística II',        gen: g_stats() },
    { id: 179, region: 9, name: 'Equações irracionais',  gen: g_irrational() },
    { id: 180, region: 9, name: 'Mistura final',         gen: () => shuffle([...g_bhaskaraRoots()(), ...g_pythCat()(), ...g_trigSpecial()()]).slice(0, 6) },
    { id: 181, region: 9, name: '🏆 Desafio Mestre',     gen: g_master() },
];

/* ─── Conquistas ────────────────────────────────────────────────────────── */
const ACHIEVEMENTS = [
    { id: 'first_phase',  name: 'Primeiro passo',         desc: 'Complete sua primeira fase',      check: s => Object.keys(s.stars).length >= 1 },
    { id: 'ten_phases',   name: 'Aquecido',               desc: '10 fases concluídas',             check: s => Object.keys(s.stars).length >= 10 },
    { id: 'thirty_phases', name: 'Em chamas',             desc: '30 fases concluídas',             check: s => Object.keys(s.stars).length >= 30 },
    { id: 'hundred_phases', name: 'Caminho longo',        desc: '100 fases concluídas',            check: s => Object.keys(s.stars).length >= 100 },
    { id: 'all_phases',   name: 'Mestre da matemática',   desc: 'Todas as 181 fases',              check: s => Object.keys(s.stars).length >= 181 },
    { id: 'perfectionist', name: 'Perfeccionista',        desc: '10 fases com 3 estrelas',         check: s => Object.values(s.stars).filter(x => x === 3).length >= 10 },
    { id: 'star_collector', name: 'Coletor de estrelas',  desc: '300 estrelas no total',           check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= 300 },
    { id: 'all_stars',    name: 'Brilhantíssimo',         desc: 'Todas as estrelas (543)',         check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= 543 },
    { id: 'region_1',     name: 'Numerologista',          desc: 'Conclua toda a Vila dos Números', check: s => PHASES.filter(p => p.region === 1).every(p => s.stars[p.id]) },
    { id: 'region_9',     name: 'Coroado',                desc: 'Conclua toda a Cidadela',         check: s => PHASES.filter(p => p.region === 9).every(p => s.stars[p.id]) },
    { id: 'xp_1000',      name: 'Mil XP',                 desc: 'Acumule 1000 XP',                 check: s => s.xp >= 1000 },
    { id: 'xp_5000',      name: '5K XP',                  desc: 'Acumule 5000 XP',                 check: s => s.xp >= 5000 },
];

/* ─── Persistência ─────────────────────────────────────────────────────── */
const localKey = id => `mq_progress_${id || 'anon'}`;

function saveLocal() {
    if (!state.userId) return;
    localStorage.setItem(localKey(state.userId), JSON.stringify({
        nickname: state.nickname, xp: state.xp, stars: state.stars, achievements: state.achievements,
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
        return true;
    } catch { return false; }
}

async function saveRemote() {
    if (!state.userId) return;
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
            // Falha de RLS / schema / etc. precisa aparecer no console pro professor
            // conseguir diagnosticar; antes era engolida silenciosamente.
            console.warn('[mathquest] saveRemote falhou:', error.message, error);
        }
    } catch (e) {
        // Sem rede: cache local cobre, sincroniza depois.
        console.warn('[mathquest] saveRemote offline:', e?.message || e);
    }
}

async function loadRemote() {
    if (!state.userId) return false;
    const { data, error } = await sb.from('mathquest_progress')
        .select('nickname, xp, stars, achievements')
        .eq('user_id', state.userId).maybeSingle();
    if (error || !data) return false;
    state.nickname     = data.nickname     || state.nickname;
    state.xp           = data.xp           || 0;
    state.stars        = data.stars        || {};
    state.achievements = data.achievements || [];
    return true;
}

const persist = () => { saveLocal(); saveRemote(); };
// Variante que espera o write remoto terminar.  Usada quando precisamos
// garantir que o servidor tem a linha (ex: antes de o aluno entrar numa
// turma, pra que o professor já veja o apelido em vez de "entrou agora").
const persistAwait = async () => { saveLocal(); await saveRemote(); };

/* ─── Auth anônima ─────────────────────────────────────────────────────── */
async function initAuth() {
    try {
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
        toast('Jogando offline — progresso salvo neste dispositivo.', 'warn');
    }
}

/* ─── Desbloqueio e estrelas ───────────────────────────────────────────── */
function isUnlocked(phaseId) {
    if (phaseId === 1) return true;
    if (state.stars[phaseId - 1]) return true;
    // Teste de nivelamento: desbloqueia apenas a 1ª fase da região
    const phase = PHASES.find(p => p.id === phaseId);
    if (phase) {
        const firstInRegion = PHASES.find(p => p.region === phase.region);
        if (firstInRegion?.id === phaseId && state.achievements.includes(`placement_${phase.region}`)) return true;
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

/* ─── Teste de nivelamento ─────────────────────────────────────────────── */
function buildPlacementTest(regionId) {
    const regionPhases = PHASES.filter(p => p.region === regionId);
    const picked = shuffle([...regionPhases]).slice(0, Math.min(5, regionPhases.length));
    const qs = [];
    picked.forEach(p => { const all = p.gen(); qs.push(...all.slice(0, 2)); });
    return shuffle(qs).slice(0, 10);
}

function startPlacementTest(regionId) {
    const reg = REGIONS.find(r => r.id === regionId);
    state.currentPhase = { id: `p_${regionId}`, name: `🧪 Teste: ${reg.name}`, region: regionId, isPlacement: true };
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

    $('resultStars').innerHTML = passed ? '🎯' : '📚';
    $('resultMsg').textContent = passed ? `${reg.name} desbloqueada!` : 'Continue estudando';
    $('resultDetail').innerHTML = passed
        ? `Você acertou <b>${state.correct}/${total}</b>. Pode começar em <b>${esc(reg.name)}</b>!`
        : `Você acertou <b>${state.correct}/${total}</b>. Precisa de pelo menos <b>${Math.ceil(total * 0.7)}/${total}</b> para desbloquear esta região.`;
    $('btnRetry').textContent = 'Repetir teste';
    $('resultView').style.display = '';
    $('phaseView').style.display  = 'none';
    if (passed) {
        setTimeout(() => { toast(`🎉 ${reg.name} desbloqueada!`, 'success'); sndStar(); }, 400);
        // Store the region to highlight after returning to map
        localStorage.setItem('mq_expanded_region', String(regionId));
    }
}

/* ─── Renderização: header HUD ─────────────────────────────────────────── */
function renderHud() {
    $('hudNick').textContent      = state.nickname || 'Aluno(a)';
    $('hudXp').textContent        = state.xp;
    $('hudStars').textContent     = totalStars();
    $('hudPhases').textContent    = `${completedCount()}/181`;
    $('btnMute').textContent      = state.muted ? '🔇' : '🔊';
}

/* ─── Renderização: mapa ───────────────────────────────────────────────── */
function autoExpandRegion() {
    const saved = parseInt(localStorage.getItem('mq_expanded_region') || '0');
    if (saved) return saved;
    // Use school year preference if set
    const schoolYear = parseInt(localStorage.getItem('mq_school_year') || '0');
    if (schoolYear >= 1 && schoolYear <= 9) {
        // Find the right region for this year, preferring one with unlocked phases
        const targetReg = REGIONS.find(r => r.id === schoolYear);
        if (targetReg) return targetReg.id;
    }
    // Abre automaticamente a região onde está a próxima fase desbloqueada
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
                    <h2><span class="region-num">Módulo ${reg.id}</span> ${esc(reg.name)} <small>${reg.year}</small></h2>
                    <p>${esc(reg.desc)}</p>
                    <div class="region-bar"><div class="region-bar-fill" style="width:${pct}%"></div></div>
                </div>
                <div class="region-actions">
                    ${regionLocked ? `<button class="btn-placement" data-region="${reg.id}" title="Responda 10 questões para ver se você já sabe este nível">🧪 Testar nível</button>` : ''}
                    <div class="region-progress">${got}/${total} <small class="region-stars-count">★${starCount}/${maxStars}</small></div>
                </div>
                <div class="region-chevron" aria-hidden="true">›</div>
            </header>
            <div class="phases" id="reg-${reg.id}"></div>
        `;
        root.appendChild(wrap);

        // Toggle colapso ao clicar no cabeçalho (exceto nos botões internos)
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
                <span class="phase-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
            `;
            el.disabled = !unlocked;
            el.title = unlocked ? `Fase ${p.id}: ${p.name}` : 'Complete a fase anterior para desbloquear';
            el.addEventListener('click', () => unlocked && startPhase(p));
            node.appendChild(el);
        });
    });
    renderHud();
}

/* ─── Tela de fase ─────────────────────────────────────────────────────── */
function startPhase(phase) {
    state.currentPhase = phase;
    state.questions    = phase.gen();
    state.qIndex       = 0;
    state.correct      = 0;
    state.hearts       = 3;
    state.earnedXp     = 0;
    state.answered     = false;
    $('mapView').style.display = 'none';
    $('phaseView').style.display = '';
    renderQuestion();
}

function renderQuestion() {
    const q = state.questions[state.qIndex];
    const isPlacement = state.currentPhase?.isPlacement;
    $('phaseTitle').textContent = isPlacement
        ? state.currentPhase.name
        : `${state.currentPhase.id}. ${state.currentPhase.name}`;
    $('phaseProg').textContent  = `${state.qIndex + 1} / ${state.questions.length}`;
    $('hearts').innerHTML       = isPlacement
        ? '<span class="placement-label">📊 Diagnóstico</span>'
        : '❤'.repeat(state.hearts) + '<span class="lost">❤</span>'.repeat(3 - state.hearts);
    $('qStem').innerHTML        = q.stem;
    $('qExplain').style.display = 'none';
    const opts = $('qOpts'); opts.innerHTML = '';
    q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = esc(opt);
        b.addEventListener('click', () => answer(i));
        opts.appendChild(b);
    });
    state.answered = false;
    $('btnNext').style.display = 'none';
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
        if (!isPlacement) state.earnedXp += 10;
        sndCorrect();
        toast('Acertou!', 'success');
    } else {
        sndWrong();
        toast('Errou.', 'error');
        if (!isPlacement) {
            state.hearts--;
            if (state.hearts <= 0) return setTimeout(() => endPhase(false), 700);
        }
    }
    if (q.explain) {
        const el = $('qExplain');
        el.innerHTML = `<div class="q-explain-title">💡 Entendendo o conceito</div>${q.explain}`;
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
        if (pct >= 1)    stars = 3;
        else if (pct >= 0.8) stars = 2;
        else if (pct >= 0.5) stars = 1;
        else stars = 0;
    }
    // mantém o melhor desempenho histórico da fase
    const prev = state.stars[state.currentPhase.id] || 0;
    if (stars > prev) state.stars[state.currentPhase.id] = stars;
    if (completed) state.xp += state.earnedXp;
    // bônus por estrelas novas
    if (stars > prev) state.xp += (stars - prev) * 25;

    checkAchievements();
    persist();
    if (stars > 0) sndStar();

    $('btnRetry').textContent = 'Tentar de novo';
    $('resultStars').innerHTML = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('resultMsg').textContent = stars >= 3 ? 'Perfeito!' : stars >= 2 ? 'Muito bem!' : stars >= 1 ? 'Boa!' : 'Tente de novo!';
    $('resultDetail').innerHTML = `
        Acertos: <b>${state.correct}/${total}</b> ·
        XP ganho: <b>+${state.earnedXp + (stars > prev ? (stars - prev) * 25 : 0)}</b>
    `;
    $('resultView').style.display = '';
    $('phaseView').style.display  = 'none';
    if (completed && stars > 0 && state.currentPhase.id < 181 && !state.stars[state.currentPhase.id + 1]) {
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

/* ─── Conquistas ───────────────────────────────────────────────────────── */
function checkAchievements() {
    const newly = [];
    ACHIEVEMENTS.forEach(a => {
        if (!state.achievements.includes(a.id) && a.check(state)) {
            state.achievements.push(a.id);
            newly.push(a);
        }
    });
    if (newly.length) {
        newly.forEach((a, i) => setTimeout(() => toast(`🏅 ${a.name}: ${a.desc}`, 'success'), i * 1600 + 1200));
    }
}

function renderAchievements() {
    const root = $('achList'); root.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
        const got = state.achievements.includes(a.id);
        const el = document.createElement('div');
        el.className = `ach ${got ? 'got' : ''}`;
        el.innerHTML = `<div class="ach-icon">${got ? '🏅' : '🔒'}</div>
                        <div><b>${esc(a.name)}</b><br><small>${esc(a.desc)}</small></div>`;
        root.appendChild(el);
    });
}

/* ─── Sair (trocar aluno) ──────────────────────────────────────────────── */
async function logout() {
    const ok = confirm(
        'Sair do MathQuest?\n\n' +
        'Seu progresso está salvo no servidor. ' +
        'Para recuperá-lo, use o mesmo dispositivo ou entre em contato com seu professor.'
    );
    if (!ok) return;
    try { await sb.auth.signOut(); } catch (_) {}
    // Limpa apenas dados de sessão; mantém preferências gerais
    ['mq_localuid', 'mq_class_code'].forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).filter(k => k.startsWith('mq_progress_')).forEach(k => localStorage.removeItem(k));
    location.reload();
}

/* ─── Boas-vindas (cadastra apelido) ───────────────────────────────────── */
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
    if (!nick) { $('welcomeError').textContent = 'Digite seu nome para começar.'; return; }
    if (nick.length > 30) { $('welcomeError').textContent = 'Nome longo demais (máx. 30).'; return; }
    state.nickname = nick;
    // Código de turma é opcional. Se digitado, normaliza pra uppercase e tenta entrar.
    const codeRaw = $('classCodeInput')?.value.trim().toUpperCase() || '';
    if (codeRaw) {
        // Persiste o apelido NO BANCO antes de entrar na turma, pra que o
        // professor já veja o aluno com nome no roster (em vez de "entrou
        // agora" sem identificação).
        await persistAwait();
        const joined = await joinClass(codeRaw);
        if (!joined) { return; }  // joinClass já mostrou o erro
        state.classCode = codeRaw;
        localStorage.setItem('mq_class_code', codeRaw);
    } else {
        persist();
    }
    hideWelcome();
    // Primeiro acesso: mostra tutorial antes do mapa.  Depois disso a flag fica
    // em localStorage e o aluno vai direto pro mapa nas próximas visitas.
    if (!localStorage.getItem('mq_onboarded')) {
        showOnboarding();
    } else {
        renderMap();
    }
}

/* ─── Turma (opcional) ─────────────────────────────────────────────────────
 * Aluno digita o código que o professor passou e vira membro da turma.
 * Professor então vê o progresso no painel.  Sem código, o jogo funciona
 * normalmente — só não aparece em nenhum painel.
 * ───────────────────────────────────────────────────────────────────────── */
async function joinClass(code) {
    if (!state.userId) {
        $('welcomeError').textContent = 'Aguarde a conexão e tente de novo.';
        return false;
    }
    // 1) confere se o código existe (RLS permite SELECT em classes ativas)
    const { data: cls, error: e1 } = await sb.from('classes')
        .select('code, name').eq('code', code).eq('active', true).maybeSingle();
    if (e1 || !cls) {
        $('welcomeError').textContent = 'Código de turma não encontrado.';
        return false;
    }
    // 2) registra a associação (idempotente por chave primária composta)
    const { error: e2 } = await sb.from('class_members').upsert({
        class_code: code, user_id: state.userId,
    }, { onConflict: 'class_code,user_id' });
    if (e2) {
        $('welcomeError').textContent = 'Não consegui entrar na turma: ' + e2.message;
        return false;
    }
    toast(`Entrou na turma "${cls.name}"!`, 'success');
    return true;
}

/* ─── Onboarding (primeira visita) ─────────────────────────────────────── */
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

/* ─── Inicialização ────────────────────────────────────────────────────── */
async function init() {
    $('loader').style.display = '';
    await initAuth();
    const remote = await loadRemote();
    if (!remote) loadLocal();
    if (!state.nickname) {
        $('loader').style.display = 'none';
        showWelcome();
    } else {
        hideWelcome();
        renderMap();
        $('loader').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Bind UI
    $('btnStart')      .addEventListener('click', startGame);
    $('nickInput')     .addEventListener('keydown', e => e.key === 'Enter' && startGame());
    $('btnNext')       .addEventListener('click', nextQuestion);
    $('btnBackMap')    .addEventListener('click', () => {
        const msg = state.currentPhase?.isPlacement
            ? 'Sair do teste de nivelamento? Seu progresso neste teste será perdido.'
            : 'Sair da fase? O progresso desta tentativa será perdido.';
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

    // PWA: prompt de instalação. Browser dispara beforeinstallprompt quando a
    // página atende aos critérios (HTTPS, manifest, SW). Guardamos o evento e
    // mostramos um botão no HUD que o aluno pode tocar pra instalar como app.
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
            toast('App instalado! Procure o ícone na tela inicial.', 'success');
        }
        deferredInstall = null;
        $('btnInstall').style.display = 'none';
    });

    // Service Worker
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    init();
});
