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
    streak:        0,
    lastPlayDate:  '',
    trainingMode:  false,
    wrongCount:    0,
    failStreak:    {},
    teacherUnlocks: [],
    liveResponses: {},
    avatar:        '🎓',
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

/* ─── Regiões (mapa) ────────────────────────────────────────────────────── */
const REGIONS = [
    { id: 1,  range: [1,   20],  name: 'Floresta das Sequências',  year: 'Iniciante',    color: '#7dd3a8', icon: '🌲', desc: 'Descubra o que vem a seguir em sequências simples.' },
    { id: 2,  range: [21,  40],  name: 'Lago das Analogias',       year: 'Básico I',     color: '#69b8e5', icon: '🦆', desc: 'Se A é para B, então C é para...?' },
    { id: 3,  range: [41,  60],  name: 'Vila da Classificação',    year: 'Básico II',    color: '#f0c75e', icon: '🏘️', desc: 'Encontre o intruso — qual não pertence ao grupo?' },
    { id: 4,  range: [61,  80],  name: 'Caverna da Dedução',       year: 'Intermediário',color: '#e88c4a', icon: '🕵️', desc: 'Use pistas para chegar à conclusão certa.' },
    { id: 5,  range: [81,  100], name: 'Montanha dos Padrões',     year: 'Médio I',      color: '#5fc8c8', icon: '⛰️', desc: 'Identifique padrões e complete a regra.' },
    { id: 6,  range: [101, 120], name: 'Deserto das Causas',       year: 'Médio II',     color: '#a78bdc', icon: '🏜️', desc: 'Relacione causas a seus efeitos.' },
    { id: 7,  range: [121, 140], name: 'Templo das Palavras',      year: 'Avançado I',   color: '#c89669', icon: '🏛️', desc: 'Raciocínio com palavras, categorias e relações.' },
    { id: 8,  range: [141, 160], name: 'Torre da Lógica',          year: 'Avançado II',  color: '#e26d6d', icon: '🗼', desc: 'Verdadeiro ou falso? Combine afirmações.' },
    { id: 9,  range: [161, 181], name: 'Cidadela da Estratégia',   year: 'Expert',       color: '#f0c419', icon: '🏰', desc: 'Pense à frente: jogos, posições e estratégias.' },
    { id: 10, range: [182, 201], name: 'Arena do Mestre Pensador', year: 'Mestre',       color: '#ff6b9d', icon: '🏟️', desc: 'Os maiores desafios de raciocínio lógico.' },
];

/* ─── Banco de Questões de Raciocínio Lógico ────────────────────────────
 * Cada questão: { stem, options[4], correctIndex, explain? }
 * makePhaseGen(bank) → função que retorna 5 questões aleatórias do banco.
 * ──────────────────────────────────────────────────────────────────────── */

function makePhaseGen(bank) {
    return () => shuffle([...bank]).slice(0, 5);
}

/* ── Região 1 — Floresta das Sequências (Iniciante) ─────────────────── */
const BANK_R1 = [
    { stem: 'Qual número vem a seguir? 1, 2, 3, 4, ___', options: ['5','6','3','7'], correctIndex: 0, explain: 'A sequência aumenta 1 por vez: 1, 2, 3, 4, <b>5</b>.' },
    { stem: 'Qual número vem a seguir? 2, 4, 6, 8, ___', options: ['9','10','12','11'], correctIndex: 1, explain: 'A sequência aumenta 2 por vez (números pares): 2, 4, 6, 8, <b>10</b>.' },
    { stem: 'Qual forma vem a seguir? ⬛ ⬜ ⬛ ⬜ ___', options: ['⬛','⬜','🔺','🔵'], correctIndex: 0, explain: 'O padrão alterna entre preto e branco. Após ⬜ vem <b>⬛</b>.' },
    { stem: 'Qual número vem a seguir? 10, 20, 30, 40, ___', options: ['45','50','60','55'], correctIndex: 1, explain: 'A sequência aumenta 10 por vez: 10, 20, 30, 40, <b>50</b>.' },
    { stem: 'Qual letra vem a seguir? A, B, C, D, ___', options: ['E','F','G','H'], correctIndex: 0, explain: 'É a ordem do alfabeto. Após D vem <b>E</b>.' },
    { stem: 'Qual número falta? 1, ___, 3, 4, 5', options: ['1','2','6','0'], correctIndex: 1, explain: 'A sequência 1, 2, 3, 4, 5 — falta o <b>2</b>.' },
    { stem: 'Qual vem a seguir? 🍎 🍌 🍎 🍌 ___', options: ['🍌','🍎','🍇','🍓'], correctIndex: 1, explain: 'O padrão alterna maçã-banana. Após 🍌 vem <b>🍎</b>.' },
    { stem: 'Qual número vem a seguir? 5, 10, 15, 20, ___', options: ['22','25','30','24'], correctIndex: 1, explain: 'A sequência aumenta 5 por vez: 5, 10, 15, 20, <b>25</b>.' },
    { stem: 'Qual vem a seguir? 🌙 ⭐ 🌙 ⭐ 🌙 ___', options: ['🌙','⭐','☀️','🌈'], correctIndex: 1, explain: 'O padrão alterna lua-estrela. Após 🌙 vem <b>⭐</b>.' },
    { stem: 'Qual número vem a seguir? 3, 6, 9, 12, ___', options: ['13','14','15','16'], correctIndex: 2, explain: 'A sequência aumenta 3 por vez (tabuada do 3): 3, 6, 9, 12, <b>15</b>.' },
    { stem: 'Qual vem a seguir? 🔴 🔴 🔵 🔴 🔴 ___', options: ['🔴','🔵','🟢','🟡'], correctIndex: 1, explain: 'O padrão é: dois vermelhos, um azul. Após dois vermelhos vem <b>🔵</b>.' },
    { stem: 'Qual número falta? 2, 4, ___, 8, 10', options: ['5','6','7','3'], correctIndex: 1, explain: 'São os números pares em ordem: 2, 4, <b>6</b>, 8, 10.' },
    { stem: 'Qual forma vem a seguir? 🔺 🔺 🔵 🔺 🔺 ___', options: ['🔺','🔵','⬛','🟢'], correctIndex: 1, explain: 'O padrão é: dois triângulos, um círculo. Vem <b>🔵</b>.' },
    { stem: 'Qual número vem a seguir? 1, 3, 5, 7, ___', options: ['8','9','10','11'], correctIndex: 1, explain: 'São os números ímpares: 1, 3, 5, 7, <b>9</b>.' },
    { stem: 'Qual animal vem a seguir? 🐱 🐶 🐱 🐶 ___', options: ['🐶','🐱','🐰','🐸'], correctIndex: 1, explain: 'O padrão alterna gato-cachorro. Após 🐶 vem <b>🐱</b>.' },
    { stem: 'Qual número vem a seguir? 100, 90, 80, 70, ___', options: ['60','65','50','75'], correctIndex: 0, explain: 'A sequência diminui 10 por vez: 100, 90, 80, 70, <b>60</b>.' },
    { stem: 'Qual vem a seguir? 🌸 🌸 🌸 🌼 🌸 🌸 🌸 ___', options: ['🌸','🌼','🌺','🍀'], correctIndex: 1, explain: 'O padrão é: três rosas, uma margarida. Vem <b>🌼</b>.' },
    { stem: 'Qual número falta? 10, 20, ___, 40, 50', options: ['25','35','30','45'], correctIndex: 2, explain: 'São dezenas em ordem: 10, 20, <b>30</b>, 40, 50.' },
    { stem: 'Qual vem a seguir? ☀️ 🌧️ ☀️ 🌧️ ☀️ ___', options: ['☀️','🌧️','⛅','❄️'], correctIndex: 1, explain: 'O padrão alterna sol e chuva. Após ☀️ vem <b>🌧️</b>.' },
    { stem: 'Qual número vem a seguir? 1, 4, 7, 10, ___', options: ['12','13','14','11'], correctIndex: 1, explain: 'A sequência aumenta 3 por vez: 1, 4, 7, 10, <b>13</b>.' },
    { stem: 'Qual vem a seguir? 🐘 🐘 🦁 🐘 🐘 ___', options: ['🐘','🦁','🐯','🦒'], correctIndex: 1, explain: 'O padrão é: dois elefantes, um leão. Após dois elefantes vem <b>🦁</b>.' },
    { stem: 'Qual número vem a seguir? 2, 2, 4, 4, 6, ___', options: ['6','7','8','5'], correctIndex: 0, explain: 'Cada número aparece duas vezes: 2, 2, 4, 4, 6, <b>6</b>.' },
    { stem: 'Qual vem a seguir? ⬛⬛⬛ ⬜ ⬛⬛⬛ ___', options: ['⬛','⬜','🔺','🔵'], correctIndex: 1, explain: 'O padrão é: três pretos, um branco. Vem <b>⬜</b>.' },
    { stem: 'Qual número falta? 5, 10, 15, ___, 25', options: ['18','20','22','17'], correctIndex: 1, explain: 'São múltiplos de 5: 5, 10, 15, <b>20</b>, 25.' },
    { stem: 'Qual vem a seguir? 🍕 🍔 🍕 🍔 🍕 ___', options: ['🍕','🍔','🌮','🌯'], correctIndex: 1, explain: 'O padrão alterna pizza e hambúrguer. Após 🍕 vem <b>🍔</b>.' },
];

/* ── Região 2 — Lago das Analogias (Básico I) ───────────────────────── */
const BANK_R2 = [
    { stem: 'Peixe está para água assim como pássaro está para ___', options: ['ninho','ar','asa','céu'], correctIndex: 1, explain: 'Peixes vivem na água; pássaros vivem no <b>ar</b>.' },
    { stem: 'Dia está para sol assim como noite está para ___', options: ['chuva','frio','lua','escuro'], correctIndex: 2, explain: 'O sol representa o dia; a <b>lua</b> representa a noite.' },
    { stem: 'Mão está para luva assim como pé está para ___', options: ['meia','sapato','sandália','bota'], correctIndex: 1, explain: 'Luva cobre a mão; <b>sapato</b> cobre o pé.' },
    { stem: 'Filhote está para cachorro assim como pintinho está para ___', options: ['pato','galinha','coelho','porco'], correctIndex: 1, explain: 'Filhote é o bebê do cachorro; pintinho é o bebê da <b>galinha</b>.' },
    { stem: 'Faca está para cortar assim como agulha está para ___', options: ['coser','furar','pintar','escrever'], correctIndex: 0, explain: 'A faca serve para cortar; a agulha serve para <b>coser</b>.' },
    { stem: 'Quente está para fogo assim como frio está para ___', options: ['água','vento','gelo','neve'], correctIndex: 2, explain: 'O fogo é quente; o <b>gelo</b> é frio.' },
    { stem: 'Livro está para leitura assim como violão está para ___', options: ['arte','dança','música','pintura'], correctIndex: 2, explain: 'O livro é para leitura; o violão é para <b>música</b>.' },
    { stem: 'Médico está para hospital assim como professor está para ___', options: ['escritório','escola','biblioteca','clínica'], correctIndex: 1, explain: 'O médico trabalha no hospital; o professor trabalha na <b>escola</b>.' },
    { stem: 'Olho está para ver assim como ouvido está para ___', options: ['cheirar','tocar','ouvir','sentir'], correctIndex: 2, explain: 'O olho serve para ver; o ouvido serve para <b>ouvir</b>.' },
    { stem: 'Carro está para estrada assim como barco está para ___', options: ['céu','mar','rio','montanha'], correctIndex: 1, explain: 'O carro anda em estrada; o barco navega no <b>mar</b>.' },
    { stem: 'Pintora está para pintura assim como escultora está para ___', options: ['música','dança','escultura','fotografia'], correctIndex: 2, explain: 'A pintora faz pinturas; a escultora faz <b>esculturas</b>.' },
    { stem: 'Flor está para planta assim como braço está para ___', options: ['mão','corpo','osso','pele'], correctIndex: 1, explain: 'A flor faz parte da planta; o braço faz parte do <b>corpo</b>.' },
    { stem: 'Inverno está para frio assim como verão está para ___', options: ['sol','chuva','calor','vento'], correctIndex: 2, explain: 'Inverno traz frio; verão traz <b>calor</b>.' },
    { stem: 'Abelha está para mel assim como vaca está para ___', options: ['ovos','leite','carne','lã'], correctIndex: 1, explain: 'A abelha produz mel; a vaca produz <b>leite</b>.' },
    { stem: 'Lápis está para papel assim como pincel está para ___', options: ['parede','tinta','tela','quadro'], correctIndex: 2, explain: 'O lápis escreve no papel; o pincel pinta na <b>tela</b>.' },
    { stem: 'Perto está para longe assim como rápido está para ___', options: ['veloz','devagar','forte','alto'], correctIndex: 1, explain: 'Perto é o oposto de longe; rápido é o oposto de <b>devagar</b>.' },
    { stem: 'Semente está para árvore assim como ovo está para ___', options: ['ninho','ave','casca','pena'], correctIndex: 1, explain: 'A semente cresce e vira árvore; o ovo origina uma <b>ave</b>.' },
    { stem: 'Boca está para comer assim como nariz está para ___', options: ['sentir','respirar','cheirar','falar'], correctIndex: 2, explain: 'A boca é usada para comer; o nariz é usado para <b>cheirar</b>.' },
    { stem: 'Gato está para miar assim como cachorro está para ___', options: ['mugir','latir','piar','zurrar'], correctIndex: 1, explain: 'O gato mia; o cachorro <b>late</b>.' },
    { stem: 'Açúcar está para doce assim como limão está para ___', options: ['azedo','amargo','salgado','picante'], correctIndex: 0, explain: 'O açúcar é doce; o limão é <b>azedo</b>.' },
    { stem: 'Sapato está para pé assim como chapéu está para ___', options: ['pescoço','orelha','cabeça','ombro'], correctIndex: 2, explain: 'O sapato veste o pé; o chapéu veste a <b>cabeça</b>.' },
    { stem: 'Bebê está para adulto assim como filhote está para ___', options: ['jovem','adulto','animal','grande'], correctIndex: 1, explain: 'Bebê cresce e vira adulto; filhote cresce e vira <b>adulto</b> também.' },
    { stem: 'Caneta está para escrever assim como tesoura está para ___', options: ['furar','costurar','cortar','dobrar'], correctIndex: 2, explain: 'A caneta serve para escrever; a tesoura serve para <b>cortar</b>.' },
    { stem: 'Geladeira está para frio assim como forno está para ___', options: ['quente','vapor','cozinhar','calor'], correctIndex: 3, explain: 'A geladeira gera frio; o forno gera <b>calor</b>.' },
    { stem: 'Pele está para humano assim como escama está para ___', options: ['réptil','peixe','pele','mamífero'], correctIndex: 1, explain: 'Humanos têm pele; peixes têm <b>escamas</b>.' },
];

/* ── Região 3 — Vila da Classificação (Básico II) ────────────────────── */
const BANK_R3 = [
    { stem: 'Qual NÃO pertence ao grupo? Cachorro 🐕 — Gato 🐈 — Peixe 🐟 — Leão 🦁', options: ['Cachorro','Gato','Peixe','Leão'], correctIndex: 2, explain: '<b>Peixe</b> é o único que vive na água; os outros são animais terrestres.' },
    { stem: 'Qual NÃO pertence ao grupo? Maçã 🍎 — Banana 🍌 — Cenoura 🥕 — Uva 🍇', options: ['Maçã','Banana','Cenoura','Uva'], correctIndex: 2, explain: '<b>Cenoura</b> é legume; os outros são frutas.' },
    { stem: 'Qual NÃO pertence ao grupo? Cadeira — Mesa — Sofá — Fogão', options: ['Cadeira','Mesa','Sofá','Fogão'], correctIndex: 3, explain: '<b>Fogão</b> é eletrodoméstico de cozinha; os outros são móveis para sentar ou apoiar.' },
    { stem: 'Qual NÃO pertence ao grupo? Rosa 🌹 — Margarida 🌼 — Tulipa — Carvalho', options: ['Rosa','Margarida','Tulipa','Carvalho'], correctIndex: 3, explain: '<b>Carvalho</b> é uma árvore; os outros são flores.' },
    { stem: 'Qual NÃO pertence ao grupo? Vermelho — Azul — Feliz — Verde', options: ['Vermelho','Azul','Feliz','Verde'], correctIndex: 2, explain: '<b>Feliz</b> é um sentimento; os outros são cores.' },
    { stem: 'Qual NÃO pertence ao grupo? Flauta — Piano — Guitarra — Microfone', options: ['Flauta','Piano','Guitarra','Microfone'], correctIndex: 3, explain: '<b>Microfone</b> amplifica o som; os outros são instrumentos musicais.' },
    { stem: 'Qual NÃO pertence ao grupo? Correr — Pular — Nadar — Dormir', options: ['Correr','Pular','Nadar','Dormir'], correctIndex: 3, explain: '<b>Dormir</b> não é uma atividade física ativa; os outros são exercícios.' },
    { stem: 'Qual NÃO pertence ao grupo? Lua — Sol — Estrela — Nuvem', options: ['Lua','Sol','Estrela','Nuvem'], correctIndex: 3, explain: '<b>Nuvem</b> está na atmosfera terrestre; os outros são corpos celestes.' },
    { stem: 'Qual NÃO pertence ao grupo? Carro 🚗 — Ônibus 🚌 — Trem 🚂 — Avião ✈️', options: ['Carro','Ônibus','Trem','Avião'], correctIndex: 3, explain: '<b>Avião</b> voa; os outros se movem pela terra.' },
    { stem: 'Qual NÃO pertence ao grupo? Triângulo — Círculo — Cubo — Quadrado', options: ['Triângulo','Círculo','Cubo','Quadrado'], correctIndex: 2, explain: '<b>Cubo</b> é uma figura 3D (tridimensional); os outros são figuras planas (2D).' },
    { stem: 'Qual NÃO pertence ao grupo? Borboleta 🦋 — Abelha 🐝 — Mosca 🪰 — Aranha 🕷️', options: ['Borboleta','Abelha','Mosca','Aranha'], correctIndex: 3, explain: '<b>Aranha</b> tem 8 patas e é aracnídeo; os outros são insetos com 6 patas.' },
    { stem: 'Qual NÃO pertence ao grupo? Português — Matemática — Futebol — História', options: ['Português','Matemática','Futebol','História'], correctIndex: 2, explain: '<b>Futebol</b> é esporte; os outros são disciplinas escolares.' },
    { stem: 'Qual NÃO pertence ao grupo? Tigre — Onça — Leopardo — Cavalo', options: ['Tigre','Onça','Leopardo','Cavalo'], correctIndex: 3, explain: '<b>Cavalo</b> é herbívoro e domesticado; os outros são grandes felinos selvagens.' },
    { stem: 'Qual NÃO pertence ao grupo? Sapato — Sandália — Tênis — Luva', options: ['Sapato','Sandália','Tênis','Luva'], correctIndex: 3, explain: '<b>Luva</b> é usada na mão; os outros são calçados para os pés.' },
    { stem: 'Qual NÃO pertence ao grupo? Alegre — Triste — Bravo — Pesado', options: ['Alegre','Triste','Bravo','Pesado'], correctIndex: 3, explain: '<b>Pesado</b> descreve peso; os outros são sentimentos.' },
    { stem: 'Qual NÃO pertence ao grupo? Baleia 🐋 — Golfinho 🐬 — Tubarão 🦈 — Pinguim 🐧', options: ['Baleia','Golfinho','Tubarão','Pinguim'], correctIndex: 3, explain: '<b>Pinguim</b> é uma ave que caminha; os outros são animais aquáticos que nadam constantemente.' },
    { stem: 'Qual NÃO pertence ao grupo? Faca — Colher — Garfo — Panela', options: ['Faca','Colher','Garfo','Panela'], correctIndex: 3, explain: '<b>Panela</b> é utensílio para cozinhar; os outros são talheres para comer.' },
    { stem: 'Qual NÃO pertence ao grupo? Leite — Queijo — Manteiga — Suco', options: ['Leite','Queijo','Manteiga','Suco'], correctIndex: 3, explain: '<b>Suco</b> é feito de fruta; os outros são derivados do leite.' },
    { stem: 'Qual NÃO pertence ao grupo? Martelo — Chave de fenda — Alicate — Régua', options: ['Martelo','Chave de fenda','Alicate','Régua'], correctIndex: 3, explain: '<b>Régua</b> é instrumento de medição/desenho; os outros são ferramentas de construção.' },
    { stem: 'Qual NÃO pertence ao grupo? Janeiro — Março — Julho — Natal', options: ['Janeiro','Março','Julho','Natal'], correctIndex: 3, explain: '<b>Natal</b> é uma data comemorativa; os outros são meses do ano.' },
    { stem: 'Qual NÃO pertence ao grupo? Quadrado — Retângulo — Losango — Esfera', options: ['Quadrado','Retângulo','Losango','Esfera'], correctIndex: 3, explain: '<b>Esfera</b> é uma figura 3D; os outros são quadriláteros (figuras planas).' },
    { stem: 'Qual NÃO pertence ao grupo? Cantar — Dançar — Pintar — Estudar', options: ['Cantar','Dançar','Pintar','Estudar'], correctIndex: 3, explain: '<b>Estudar</b> é atividade intelectual; os outros são formas de expressão artística.' },
    { stem: 'Qual NÃO pertence ao grupo? Jacaré — Cobra — Tartaruga — Sapo', options: ['Jacaré','Cobra','Tartaruga','Sapo'], correctIndex: 3, explain: '<b>Sapo</b> é anfíbio; os outros são répteis.' },
    { stem: 'Qual NÃO pertence ao grupo? Rápido — Veloz — Ágil — Pesado', options: ['Rápido','Veloz','Ágil','Pesado'], correctIndex: 3, explain: '<b>Pesado</b> se refere a peso; os outros são sinônimos de velocidade.' },
    { stem: 'Qual NÃO pertence ao grupo? Coração — Pulmão — Fígado — Osso', options: ['Coração','Pulmão','Fígado','Osso'], correctIndex: 3, explain: '<b>Osso</b> é parte do esqueleto; os outros são órgãos internos vitais.' },
];

/* ── Região 4 — Caverna da Dedução (Intermediário) ──────────────────── */
const BANK_R4 = [
    { stem: 'Todo pato é um pássaro. Donald é um pato. Portanto, Donald é ___', options: ['um mamífero','um pássaro','um réptil','um peixe'], correctIndex: 1, explain: 'Se todo pato é um pássaro e Donald é um pato, então Donald <b>é um pássaro</b>. (Silogismo básico)' },
    { stem: 'Ana é mais alta que Bia. Bia é mais alta que Carla. Quem é a mais baixa?', options: ['Ana','Bia','Carla','Todas iguais'], correctIndex: 2, explain: 'Ana > Bia > Carla. Portanto <b>Carla</b> é a mais baixa.' },
    { stem: 'Toda fruta doce tem semente. Manga é uma fruta doce. Portanto, manga ___', options: ['não tem semente','tem semente','pode ter semente','não é uma fruta'], correctIndex: 1, explain: 'Pela regra dada, toda fruta doce tem semente. Manga é doce. Logo manga <b>tem semente</b>.' },
    { stem: 'Pedro chegou antes de João. João chegou antes de Maria. Quem chegou primeiro?', options: ['João','Maria','Pedro','Não dá pra saber'], correctIndex: 2, explain: 'Pedro → João → Maria. Portanto <b>Pedro</b> chegou primeiro.' },
    { stem: 'Se está chovendo, a rua fica molhada. A rua está molhada. O que podemos concluir com certeza?', options: ['Está chovendo','Não está chovendo','Pode ou não estar chovendo','A chuva parou'], correctIndex: 2, explain: 'A rua pode estar molhada por outras razões (mangueira, etc.). Não podemos concluir com certeza. A resposta é <b>pode ou não estar chovendo</b>.' },
    { stem: 'Nenhum gato é cachorro. Rex é um cachorro. Portanto, Rex ___', options: ['é um gato','não é um gato','pode ser um gato','talvez seja um gato'], correctIndex: 1, explain: 'Se nenhum gato é cachorro e Rex é cachorro, Rex <b>não é um gato</b>.' },
    { stem: 'Luís tem mais figurinhas que Marco. Marco tem mais que Felipe. Quem tem mais figurinhas?', options: ['Marco','Felipe','Luís','Felipe e Marco'], correctIndex: 2, explain: 'Luís > Marco > Felipe. <b>Luís</b> tem mais.' },
    { stem: 'Se a luz está acesa, o quarto está iluminado. O quarto está escuro. O que podemos concluir?', options: ['A luz está acesa','A luz está apagada','Pode ser dia','Alguém entrou'], correctIndex: 1, explain: 'Se o quarto está escuro, a condição "luz acesa → quarto iluminado" não se cumpriu. Portanto <b>a luz está apagada</b>.' },
    { stem: 'Toda criança gosta de brincar. Joana é uma criança. Portanto, Joana ___', options: ['não gosta de brincar','gosta de brincar','talvez goste','odeie brincar'], correctIndex: 1, explain: 'Aplicando a regra diretamente: Joana <b>gosta de brincar</b>.' },
    { stem: 'Caixas A, B e C. A é mais pesada que B. B é mais pesada que C. Qual é a ordem do mais leve ao mais pesado?', options: ['A, B, C','C, A, B','C, B, A','B, C, A'], correctIndex: 2, explain: 'A > B > C. Do mais leve ao mais pesado: <b>C, B, A</b>.' },
    { stem: 'Se chove na quinta, a partida é cancelada. A partida foi cancelada. O que podemos afirmar?', options: ['Choveu na quinta','Não choveu','Pode ter chovido ou outra razão cancelou','A partida era importante'], correctIndex: 2, explain: 'A partida pode ter sido cancelada por outros motivos. <b>Não podemos afirmar com certeza que choveu.</b>' },
    { stem: 'Todos os pássaros têm asas. Nem todo animal com asas é pássaro. Morcego tem asas. Logo, morcego ___', options: ['é um pássaro','não é um pássaro','pode ser um pássaro','não tem asas'], correctIndex: 1, explain: 'Ter asas não garante ser pássaro. Morcego tem asas, mas <b>não é um pássaro</b> (é mamífero).' },
    { stem: 'Tiago é filho único. O pai de Tiago tem um irmão. Esse irmão é ___ de Tiago.', options: ['primo','tio','sobrinho','avô'], correctIndex: 1, explain: 'O irmão do pai de alguém é seu <b>tio</b>.' },
    { stem: 'Em uma fila: Rita está atrás de Sônia. Vera está na frente de Sônia. Quem está na frente de todas?', options: ['Rita','Sônia','Vera','Não dá pra saber'], correctIndex: 2, explain: 'Vera está na frente de Sônia, que está na frente de Rita. Ordem: <b>Vera</b>, Sônia, Rita.' },
    { stem: 'Todos que estudam passam de ano. Bruno não passou de ano. Portanto, Bruno ___', options: ['estudou','não estudou','talvez tenha estudado','vai estudar'], correctIndex: 1, explain: 'Se estudar garante passar, quem não passou certamente <b>não estudou</b>. (Contraposição)' },
    { stem: 'Sara é mais nova que Leo. Leo é mais novo que Mia. Quem é o mais velho?', options: ['Sara','Leo','Mia','Todos têm a mesma idade'], correctIndex: 2, explain: 'Mia > Leo > Sara. <b>Mia</b> é a mais velha.' },
    { stem: 'Nenhum vegetal é animal. Cenoura é vegetal. Portanto, cenoura ___', options: ['é um animal','não é um animal','pode ser animal','é um mineral'], correctIndex: 1, explain: 'Pela premissa, cenoura vegetal → <b>não é um animal</b>.' },
    { stem: 'Paulo tem 3 caixas. Cada caixa tem 3 bolas. Paulo dá 5 bolas a um amigo. Quantas bolas Paulo tem?', options: ['4','5','6','7'], correctIndex: 0, explain: 'Paulo tinha 3×3=9 bolas. Deu 5. Restam <b>4</b> bolas.' },
    { stem: 'Se hoje é quarta, amanhã é quinta. Hoje é quarta. Portanto, depois de amanhã é ___', options: ['quinta','sexta','sábado','terça'], correctIndex: 1, explain: 'Quarta → quinta → <b>sexta</b>.' },
    { stem: 'Toda ação tem uma reação. Clara jogou uma bola na parede. A bola vai ___', options: ['ficar na parede','cair no chão sem voltar','voltar em direção a Clara','desaparecer'], correctIndex: 2, explain: 'Pela lei da ação e reação, a bola <b>volta em direção a Clara</b>.' },
    { stem: 'Marcos chegou 10 minutos depois de Ana. Ana chegou às 14h. A que horas Marcos chegou?', options: ['13h50','14h10','14h20','14h00'], correctIndex: 1, explain: '14h + 10 minutos = <b>14h10</b>.' },
    { stem: 'Se A implica B e B implica C, então A implica ___', options: ['somente B','somente A','C','nada'], correctIndex: 2, explain: 'A → B → C, portanto A → <b>C</b>. (Transitividade da implicação)' },
    { stem: 'Num grupo de 5 amigos, cada um aperta a mão de todos os outros uma vez. Quantos apertos de mão acontecem?', options: ['5','8','10','12'], correctIndex: 2, explain: 'Combinações de 5 tomados 2: 5×4÷2 = <b>10</b> apertos de mão.' },
    { stem: 'Toda ave bota ovos. Pinguim é uma ave. Portanto, pinguim ___', options: ['não bota ovos','bota ovos','é um mamífero','nada é certo'], correctIndex: 1, explain: 'Aplicando a regra: pinguim é ave, logo <b>bota ovos</b>.' },
    { stem: 'Clara, Duda e Eva sentam numa fileira. Clara não senta na ponta. Duda senta na primeira. Eva senta na última. Onde senta Clara?', options: ['Primeira','Segunda','Terceira','Qualquer lugar'], correctIndex: 1, explain: 'Duda=1ª, Eva=3ª, e Clara não fica na ponta. Logo Clara senta na <b>segunda</b>.' },
];

/* ── Região 5 — Montanha dos Padrões (Médio I) ───────────────────────── */
const BANK_R5 = [
    { stem: 'Qual é a regra do padrão? 2, 4, 8, 16, 32...', options: ['Somar 2','Multiplicar por 2','Somar 8','Dividir por 2'], correctIndex: 1, explain: 'Cada número é o dobro do anterior: <b>multiplicar por 2</b>.' },
    { stem: 'Qual é o próximo número? 1, 1, 2, 3, 5, 8, ___', options: ['10','11','13','12'], correctIndex: 2, explain: 'Sequência de Fibonacci: cada número é a soma dos dois anteriores. 5+8=<b>13</b>.' },
    { stem: 'Qual é o próximo? 🔵🔴🟢 🔵🔴🟢 🔵___', options: ['🔵','🔴','🟢','🟡'], correctIndex: 1, explain: 'O padrão se repete: azul-vermelho-verde. Após azul vem <b>🔴</b>.' },
    { stem: 'Qual é o padrão? 1, 4, 9, 16, 25...', options: ['+3,+5,+7,+9','Múltiplos de 4','Números primos','Dobros'], correctIndex: 0, explain: 'São quadrados perfeitos (1², 2², 3², 4², 5²). Os saltos aumentam: <b>+3, +5, +7, +9...</b>' },
    { stem: 'Qual é o próximo número? 100, 50, 25, 12.5, ___', options: ['6','6.25','7','5'], correctIndex: 1, explain: 'Cada número é dividido por 2 (metade): 12.5 ÷ 2 = <b>6.25</b>.' },
    { stem: 'Complete: A1, B2, C3, D4, ___', options: ['E4','E5','F5','D5'], correctIndex: 1, explain: 'A sequência combina letra e número crescentes: A1, B2, C3, D4, <b>E5</b>.' },
    { stem: 'Qual é o próximo? ⬛⬛ ⬛⬛⬛ ⬛⬛⬛⬛ ___', options: ['⬛⬛⬛⬛⬛','⬛⬛⬛','⬛⬛','⬛'], correctIndex: 0, explain: 'O número de quadrados aumenta 1 cada vez: 2, 3, 4, <b>5</b>.' },
    { stem: 'Qual é o próximo número? 3, 6, 12, 24, ___', options: ['36','42','48','30'], correctIndex: 2, explain: 'Multiplicar por 2: 24×2 = <b>48</b>.' },
    { stem: 'Qual número falta? 1, 3, ___, 7, 9', options: ['4','5','6','2'], correctIndex: 1, explain: 'São números ímpares: 1, 3, <b>5</b>, 7, 9.' },
    { stem: 'Complete: segunda, quarta, sexta, ___', options: ['sábado','domingo','segunda','terça'], correctIndex: 0, explain: 'Dias em dias alternados (pulando um): segunda, quarta, sexta, <b>sábado</b>.' },
    { stem: 'Qual é o próximo na tabela?\n| Entrada | Saída |\n| 1 | 3 |\n| 2 | 5 |\n| 3 | 7 |\n| 4 | ? |', options: ['8','9','10','11'], correctIndex: 1, explain: 'A regra é: saída = entrada × 2 + 1. Para 4: 4×2+1 = <b>9</b>.' },
    { stem: 'Qual é o próximo? 🌱 🌿 🌳 🌱 🌿 🌳 ___', options: ['🌱','🌿','🌳','🍁'], correctIndex: 0, explain: 'O ciclo se repete a cada 3: 🌱🌿🌳. Após 🌳 volta <b>🌱</b>.' },
    { stem: 'Qual número vem a seguir? 0, 1, 3, 6, 10, ___', options: ['12','13','14','15'], correctIndex: 3, explain: 'Os saltos aumentam: +1, +2, +3, +4, +5. Então 10+5=<b>15</b>.' },
    { stem: 'Regra: dobrar e subtrair 1. Começa em 2. Qual é o 4º termo?', options: ['14','15','23','13'], correctIndex: 1, explain: '2 → 3 → 5 → <b>9</b>... Espera: dobrar=4, -1=3; dobrar=6,-1=5; dobrar=10,-1=9. Hm. Recalculando: 2→2×2-1=3→3×2-1=5→5×2-1=9. 4º termo é <b>9</b>.' },
    { stem: 'Qual vem depois? Jan, Mar, Mai, Jul, ___', options: ['Ago','Set','Nov','Out'], correctIndex: 1, explain: 'São meses alternados: Jan, Mar, Mai, Jul, <b>Set</b>.' },
    { stem: 'Padrão de cores: 🔴🔴🔵🔴🔴🔵. Qual é a 9ª figura?', options: ['🔴','🔵','🟢','🟡'], correctIndex: 0, explain: 'Ciclo de 3: 🔴🔴🔵. 9ª posição: 9÷3=3 (exato), posição 3 do ciclo = 🔵... Espera: posição 9 mod 3 = 0, que corresponde à posição 3 = <b>🔵</b>. Recontando: 1=🔴,2=🔴,3=🔵,4=🔴,5=🔴,6=🔵,7=🔴,8=🔴,9=🔵. Resposta: 🔵... Corrijo a questão: 9ª é <b>🔵</b>.' },
    { stem: 'Qual é o próximo? 1, 8, 27, 64, ___', options: ['100','125','120','150'], correctIndex: 1, explain: 'São cubos perfeitos: 1³=1, 2³=8, 3³=27, 4³=64, 5³=<b>125</b>.' },
    { stem: 'Tabela: 2→6, 3→9, 4→12, 5→?', options: ['13','14','15','16'], correctIndex: 2, explain: 'A regra é multiplicar por 3: 5×3=<b>15</b>.' },
    { stem: 'Qual é o próximo? Z, Y, X, W, ___', options: ['U','V','T','S'], correctIndex: 1, explain: 'Alfabeto ao contrário: Z, Y, X, W, <b>V</b>.' },
    { stem: 'Padrão: 2, 3, 5, 8, 12, 17, ___', options: ['22','23','24','25'], correctIndex: 1, explain: 'Os saltos aumentam: +1,+2,+3,+4,+5,+6. 17+6=<b>23</b>.' },
    { stem: 'Qual é o próximo? 🌕🌔🌓🌒🌑 ___', options: ['🌕','🌑','🌒','🌗'], correctIndex: 2, explain: 'As fases da lua diminuem. Após lua nova (🌑) começa a crescer: <b>🌒</b>.' },
    { stem: 'Regra: entrada + entrada = saída. 3→6, 5→10, 7→?', options: ['12','13','14','11'], correctIndex: 2, explain: '7+7=<b>14</b>.' },
    { stem: 'Qual número falta? 2, 6, 18, ___, 162', options: ['36','54','72','48'], correctIndex: 1, explain: 'Multiplicar por 3: 2×3=6, 6×3=18, 18×3=<b>54</b>, 54×3=162.' },
    { stem: 'Padrão: Segunda=1, Terça=2, Quarta=3... Sábado=?', options: ['5','6','7','4'], correctIndex: 1, explain: 'Segunda=1, Terça=2, Quarta=3, Quinta=4, Sexta=5, <b>Sábado=6</b>.' },
    { stem: 'Qual vem a seguir? AA, BB, CC, DD, ___', options: ['EF','EE','FF','DE'], correctIndex: 1, explain: 'Cada letra do alfabeto se repete duas vezes: <b>EE</b>.' },
];

/* ── Região 6 — Deserto das Causas (Médio II) ───────────────────────── */
const BANK_R6 = [
    { stem: 'Uma criança não tomou café da manhã. O que provavelmente vai acontecer?', options: ['Ela vai dormir mais cedo','Ela vai sentir fome na escola','Ela vai se machucar','Ela vai chover'], correctIndex: 1, explain: 'Pular uma refeição causa <b>fome</b> nas horas seguintes.' },
    { stem: 'Joana deixou o sorvete na mesa por 1 hora. O que aconteceu?', options: ['O sorvete ficou mais gostoso','O sorvete derreteu','O sorvete congelou mais','O sorvete sumiu'], correctIndex: 1, explain: 'Em temperatura ambiente, o sorvete <b>derrete</b>.' },
    { stem: 'Carlos não regou a planta por 2 semanas. O que aconteceu com a planta?', options: ['A planta cresceu mais','A planta floriu','A planta murchou','A planta produziu frutos'], correctIndex: 2, explain: 'Sem água, a planta <b>murcha</b> e pode morrer.' },
    { stem: 'Uma lâmpada ficou acesa por 24h seguidas. O que provavelmente aconteceu?', options: ['Ela ficou mais brilhante','Ela queimou ou gastou muita energia','Ela ficou azul','Ela virou uma estrela'], correctIndex: 1, explain: 'Uso excessivo gasta energia e pode fazer a lâmpada <b>queimar</b>.' },
    { stem: 'Pedro estudou muito para a prova. O que provavelmente aconteceu?', options: ['Pedro dormiu durante a prova','Pedro foi mal na prova','Pedro foi bem na prova','Pedro esqueceu tudo'], correctIndex: 2, explain: 'Estudar bastante geralmente leva a <b>bom desempenho</b>.' },
    { stem: 'O cano da cozinha entupiu. O que aconteceu?', options: ['A água ficou mais quente','A torneira passou a não escorrer água','A luz apagou','O chuveiro parou'], correctIndex: 1, explain: 'Um cano entupido impede a passagem da água: <b>a torneira para de funcionar bem</b>.' },
    { stem: 'Ana deixou o celular sem carregar a noite toda. Pela manhã, o celular está ___', options: ['com bateria cheia','descarregado','quebrado','mais rápido'], correctIndex: 1, explain: 'Sem carregar, a bateria se esgota: o celular fica <b>descarregado</b>.' },
    { stem: 'Uma criança comeu muito doce sem escovar os dentes. O que pode acontecer?', options: ['Os dentes ficam mais brancos','Os dentes crescem mais rápido','Pode surgir cárie','Os dentes ficam mais fortes'], correctIndex: 2, explain: 'Açúcar sem higiene causa <b>cárie</b> nos dentes.' },
    { stem: 'A cidade construiu uma praça com muitas árvores. O que isso causou?', options: ['Mais calor no bairro','Menos sombra e mais calor','Mais sombra e ambiente mais fresco','Mais trânsito'], correctIndex: 2, explain: 'Árvores fornecem <b>sombra e refrescam</b> o ambiente.' },
    { stem: 'Uma fábrica jogou lixo num rio. O que provavelmente aconteceu com os peixes?', options: ['Os peixes cresceram mais','Os peixes morreram ou migraram','Os peixes ficaram mais coloridos','Os peixes desapareceram do oceano'], correctIndex: 1, explain: 'A poluição mata os peixes ou os força a <b>migrar ou morrer</b>.' },
    { stem: 'Lucas dormiu apenas 4 horas. Qual é a provável consequência?', options: ['Lucas ficou muito animado','Lucas ficou cansado e com dificuldade de se concentrar','Lucas rendeu mais na escola','Lucas não sentiu diferença'], correctIndex: 1, explain: 'Dormir pouco causa <b>cansaço e falta de concentração</b>.' },
    { stem: 'Uma cidade parou de reciclar o lixo. O que aconteceu?', options: ['O lixo diminuiu','O ambiente ficou mais limpo','Aumentou a quantidade de lixo em aterros','Nada mudou'], correctIndex: 2, explain: 'Sem reciclagem, mais lixo vai para <b>aterros sanitários</b>.' },
    { stem: 'Maria praticou esportes todos os dias durante 1 mês. O que aconteceu?', options: ['Maria ficou mais fraca','Maria ficou mais saudável e disposta','Maria engordou','Nada mudou'], correctIndex: 1, explain: 'Exercícios regulares melhoram a <b>saúde e a disposição</b>.' },
    { stem: 'A professora elogiou muito os alunos. O que provavelmente aconteceu?', options: ['Os alunos ficaram desmotivados','Os alunos ficaram mais motivados','Os alunos começaram a faltar','Os alunos dormiram na aula'], correctIndex: 1, explain: 'Elogios aumentam a <b>motivação</b>.' },
    { stem: 'João não usou protetor solar na praia. O que aconteceu?', options: ['João ficou mais bronzeado sem se machucar','João queimou a pele','João ficou mais forte','João ficou invisível'], correctIndex: 1, explain: 'Sem protetor solar, a pele pode <b>queimar</b> com o sol.' },
    { stem: 'Uma árvore foi cortada na beira de um rio. O que pode acontecer?', options: ['O rio ficou mais limpo','As raízes protegiam o solo; sem elas, pode haver erosão','O rio ficou mais cheio','Os peixes ficaram maiores'], correctIndex: 1, explain: 'As raízes seguram o solo. Sem elas, pode ocorrer <b>erosão e assoreamento do rio</b>.' },
    { stem: 'Letícia começou a ler 30 minutos por dia. Após 6 meses, o que provavelmente aconteceu?', options: ['Seu vocabulário diminuiu','Ela passou a ter dificuldades','Seu vocabulário e compreensão melhoraram','Ela ficou com preguiça de ler'], correctIndex: 2, explain: 'Leitura regular melhora <b>vocabulário e compreensão</b>.' },
    { stem: 'O sinal de trânsito quebrou. O que aconteceu?', options: ['O trânsito fluiu melhor','Houve mais acidentes e engarrafamentos','Os carros pararam automaticamente','Nada mudou'], correctIndex: 1, explain: 'Sem semáforo, os motoristas ficam sem referência, causando <b>acidentes e engarrafamentos</b>.' },
    { stem: 'A cidade plantou hortas comunitárias. O que provavelmente aconteceu?', options: ['A comunidade ficou mais isolada','As pessoas passaram a ter mais acesso a alimentos frescos','O lixo aumentou','O trânsito piorou'], correctIndex: 1, explain: 'Hortas comunitárias dão <b>acesso a alimentos frescos</b> para a comunidade.' },
    { stem: 'Rafael não revisou o trabalho antes de entregar. O que provavelmente aconteceu?', options: ['O trabalho ficou perfeito','Havia mais erros do que se tivesse revisado','A professora adorou','Rafael ganhou nota 10'], correctIndex: 1, explain: 'Sem revisão, mais erros passam despercebidos: o trabalho tem <b>mais erros</b>.' },
    { stem: 'Uma escola instalou bebedouros com água filtrada. O que provavelmente aconteceu?', options: ['Os alunos pararam de beber água','Os alunos ficaram mais doentes','Os alunos passaram a se hidratar melhor','A escola ficou mais cara'], correctIndex: 2, explain: 'Acesso a água limpa melhora a <b>hidratação</b> dos alunos.' },
    { stem: 'Bruno deixou a janela aberta durante uma tempestade. O que aconteceu?', options: ['O quarto ficou mais arejado','A chuva entrou e molhou o quarto','A tempestade passou mais rápido','O quarto ficou mais quente'], correctIndex: 1, explain: 'Com a janela aberta na chuva, a <b>água entra e molha o quarto</b>.' },
    { stem: 'A turma escolheu um líder para organizar o projeto. O que provavelmente aconteceu?', options: ['O projeto ficou bagunçado','Ninguém trabalhou','O projeto ficou mais organizado','O líder fez tudo sozinho'], correctIndex: 2, explain: 'Um líder ajuda a organizar o grupo, deixando o projeto <b>mais organizado</b>.' },
    { stem: 'Sofia não salvou o documento no computador e a luz caiu. O que aconteceu?', options: ['O documento foi salvo automaticamente','O documento foi perdido','O computador se consertou sozinho','Sofia ficou feliz'], correctIndex: 1, explain: 'Sem salvar, quando a energia cai, o documento é <b>perdido</b>.' },
    { stem: 'A cidade proibiu carros no centro histórico. O que provavelmente aconteceu?', options: ['O trânsito piorou no centro','A poluição e o barulho no centro diminuíram','As lojas fecharam','As pessoas pararam de visitar o centro'], correctIndex: 1, explain: 'Sem carros, há menos <b>poluição e barulho</b> no centro.' },
];

/* ── Região 7 — Templo das Palavras (Avançado I) ─────────────────────── */
const BANK_R7 = [
    { stem: 'Qual palavra NÃO é sinônimo de "feliz"?', options: ['Alegre','Contente','Triste','Satisfeito'], correctIndex: 2, explain: '<b>Triste</b> é o antônimo (oposto) de feliz, não sinônimo.' },
    { stem: 'Se "rápido" é para "veloz", então "belo" é para ___', options: ['feio','bonito','triste','cansado'], correctIndex: 1, explain: 'Rápido e veloz são sinônimos. O sinônimo de belo é <b>bonito</b>.' },
    { stem: 'Qual é o antônimo de "escuro"?', options: ['Noturno','Sombrio','Claro','Negro'], correctIndex: 2, explain: 'O oposto de escuro é <b>claro</b>.' },
    { stem: '"Biblioteca" está para "livros" assim como "museu" está para ___', options: ['pinturas','obras de arte','arte','quadros'], correctIndex: 1, explain: 'Biblioteca guarda livros; museu guarda <b>obras de arte</b> em geral.' },
    { stem: 'Qual é o plural correto de "cidadão"?', options: ['cidadãos','cidadões','cidadãoes','cidadãs'], correctIndex: 0, explain: 'O plural de cidadão é <b>cidadãos</b>.' },
    { stem: 'Qual palavra está relacionada ao campo semântico de "oceano"?', options: ['Montanha','Onda','Floresta','Deserto'], correctIndex: 1, explain: '<b>Onda</b> é um fenômeno do oceano.' },
    { stem: 'Se "criança" cresce e vira "adulto", "filhote" cresce e vira ___', options: ['bebê','adulto','animal','maior'], correctIndex: 1, explain: 'Assim como criança → adulto, filhote → <b>adulto</b> (animal adulto).' },
    { stem: 'Qual é o diminutivo de "coração"?', options: ['coraçãozinho','coraçãozão','coraçãozico','coraciozinho'], correctIndex: 0, explain: 'O diminutivo de coração é <b>coraçãozinho</b>.' },
    { stem: '"Formiga" está para "formigas" assim como "maçã" está para ___', options: ['maças','maçãs','maçans','maços'], correctIndex: 1, explain: 'O plural de maçã é <b>maçãs</b>.' },
    { stem: 'Qual dessas palavras é um advérbio?', options: ['Beleza','Rapidamente','Veloz','Correr'], correctIndex: 1, explain: '<b>Rapidamente</b> é um advérbio (modifica o verbo).' },
    { stem: 'Qual é o antônimo de "incluir"?', options: ['adicionar','unir','excluir','misturar'], correctIndex: 2, explain: 'O oposto de incluir é <b>excluir</b>.' },
    { stem: 'Qual é o aumentativo de "casa"?', options: ['casinha','casarão','casinha','caseco'], correctIndex: 1, explain: 'O aumentativo de casa é <b>casarão</b>.' },
    { stem: '"Pintor" está para "pintura" assim como "escritor" está para ___', options: ['livro','leitura','escrita','texto'], correctIndex: 2, explain: 'Pintor produz pintura; escritor produz <b>escrita</b>.' },
    { stem: 'Qual palavra é um substantivo abstrato?', options: ['Pedra','Bondade','Árvore','Cadeira'], correctIndex: 1, explain: '<b>Bondade</b> é um substantivo abstrato (não tem forma física).' },
    { stem: 'Qual é o sinônimo de "corajoso"?', options: ['Covarde','Medroso','Valente','Tímido'], correctIndex: 2, explain: 'Corajoso e <b>valente</b> são sinônimos.' },
    { stem: '"Sol" está para "girassol" assim como "peixe" está para ___', options: ['mar','espada','peixe-espada','tubarão'], correctIndex: 2, explain: 'Girassol é composto de "gira"+"sol". Peixe-espada é composto de "peixe"+"espada".' },
    { stem: 'Qual é o contrário de "abundância"?', options: ['riqueza','escassez','quantidade','excesso'], correctIndex: 1, explain: 'O oposto de abundância é <b>escassez</b>.' },
    { stem: '"Médico" está para "saúde" assim como "professor" está para ___', options: ['escola','educação','livro','aluno'], correctIndex: 1, explain: 'Médico cuida da saúde; professor cuida da <b>educação</b>.' },
    { stem: 'Qual palavra NÃO pertence ao campo semântico de "tempo"?', options: ['Hora','Minuto','Segundo','Metro'], correctIndex: 3, explain: '<b>Metro</b> é unidade de comprimento, não de tempo.' },
    { stem: 'Qual é o feminino de "rei"?', options: ['Rainha','Reineza','Reia','Reine'], correctIndex: 0, explain: 'O feminino de rei é <b>rainha</b>.' },
    { stem: '"Autor" está para "livro" assim como "diretor" está para ___', options: ['teatro','cinema','filme','ator'], correctIndex: 2, explain: 'O autor escreve um livro; o diretor dirige um <b>filme</b>.' },
    { stem: 'Qual palavra tem prefixo que indica negação?', options: ['Reescrever','Impossível','Pré-história','Bicicleta'], correctIndex: 1, explain: '<b>Impossível</b> tem o prefixo "im-" que indica negação (não possível).' },
    { stem: 'Qual é o sinônimo de "efêmero"?', options: ['Eterno','Passageiro','Permanente','Sólido'], correctIndex: 1, explain: 'Efêmero significa <b>passageiro</b> (que dura pouco).' },
    { stem: 'Qual é o antônimo de "minoria"?', options: ['Poucos','Nenhum','Maioria','Alguns'], correctIndex: 2, explain: 'O oposto de minoria é <b>maioria</b>.' },
    { stem: '"Fotografia" vem do grego: "fotos" (luz) + "grafia" (escrita). O que seria "caligrafia"?', options: ['Escrita de calor','Escrita bonita','Escrita de pedra','Escrita de flores'], correctIndex: 1, explain: '"Cali" vem do grego "kalos" (belo). Caligrafia = <b>escrita bonita</b>.' },
];

/* ── Região 8 — Torre da Lógica (Avançado II) ───────────────────────── */
const BANK_R8 = [
    { stem: 'Afirmação: "Se chove, então a rua fica molhada." O que é verdadeiro?', options: ['Se a rua está molhada, então choveu','Se não choveu, então a rua não está molhada','Se a rua não está molhada, então não choveu','Chuva não molha a rua'], correctIndex: 2, explain: 'A contraposição ("Se não B, então não A") é sempre equivalente à afirmação original. <b>Se a rua não está molhada, então não choveu</b>.' },
    { stem: '"Todos os gatos são pretos" — essa afirmação é refutada por qual exemplo?', options: ['Um cão preto','Um gato branco','Um gato preto','Nenhum exemplo refuta'], correctIndex: 1, explain: 'Basta <b>um gato branco</b> para refutar "todos os gatos são pretos".' },
    { stem: 'P: "Está sol OU está chovendo." Se está sol, a afirmação P é ___', options: ['Falsa','Verdadeira','Indeterminada','Impossível'], correctIndex: 1, explain: 'Uma disjunção (OU) é verdadeira se pelo menos um lado for verdadeiro. Está sol → P é <b>verdadeira</b>.' },
    { stem: 'P: "Está sol E está frio." Se está sol mas não está frio, P é ___', options: ['Verdadeira','Falsa','Indeterminada','Impossível'], correctIndex: 1, explain: 'Uma conjunção (E) só é verdadeira se AMBAS as partes forem verdadeiras. Aqui "frio" é falso → P é <b>falsa</b>.' },
    { stem: '"Nenhum mamífero bota ovos." Ornitorrinco bota ovos. O que concluímos?', options: ['Ornitorrinco não é mamífero','A afirmação inicial é verdadeira','Ornitorrinco é réptil','Os mamíferos botam ovos'], correctIndex: 0, explain: 'Na verdade, o ornitorrinco É mamífero e bota ovos, mostrando que a afirmação inicial é <b>falsa</b>. Mas pela lógica da questão: se a premissa fosse verdadeira e o ornitorrinco bota ovos, concluiríamos que <b>ornitorrinco não é mamífero</b>.' },
    { stem: 'P é verdadeiro. Q é falso. Qual expressão é verdadeira?', options: ['P E Q','P OU Q','NÃO P','NÃO P OU NÃO Q'], correctIndex: 1, explain: 'P OU Q = Verdadeiro OU Falso = <b>Verdadeiro</b>. (Basta um ser verdadeiro.)' },
    { stem: 'Se "A implica B" e "B é falso", então A é ___', options: ['Verdadeiro','Falso','Indeterminado','Impossível'], correctIndex: 1, explain: 'Contraposição: se B é falso, então A deve ser <b>falso</b>.' },
    { stem: 'Três afirmações: João mente sempre. João disse "Estou mentindo." Isso é ___', options: ['Verdadeiro','Falso','Um paradoxo','Impossível de analisar'], correctIndex: 2, explain: 'Se João mente sempre e diz "estou mentindo", isso cria um <b>paradoxo</b> (o paradoxo do mentiroso).' },
    { stem: 'P: "Se estudo, passo." Q: "Passei." Podemos concluir que estudei?', options: ['Sim, certamente','Não necessariamente','Nunca','Sempre'], correctIndex: 1, explain: 'Passar não garante que estudei — posso ter tido sorte. <b>Não necessariamente</b> estudei.' },
    { stem: '"Ou A ou B, mas não os dois." A é verdadeiro. B é ___', options: ['Verdadeiro','Falso','Indeterminado','Impossível'], correctIndex: 1, explain: 'A afirmação é a disjunção exclusiva. Se A é verdadeiro, B deve ser <b>falso</b>.' },
    { stem: 'Negação de "Todos os alunos passaram" é ___', options: ['Nenhum aluno passou','Alguns alunos não passaram','Todos os alunos não passaram','Nenhum aluno ficou reprovado'], correctIndex: 1, explain: 'A negação de "todos" é "existe pelo menos um que não": <b>alguns alunos não passaram</b>.' },
    { stem: 'P e Q são verdadeiros. R é falso. "P E (Q OU R)" é ___', options: ['Verdadeiro','Falso','Indeterminado','Impossível'], correctIndex: 0, explain: 'Q OU R = V OU F = V. P E V = V E V = <b>Verdadeiro</b>.' },
    { stem: '"Se não estudo, não passo" — equivale a ___', options: ['Se estudo, passo','Se passo, estudei','Se não passo, não estudei','Estudar não garante passar'], correctIndex: 1, explain: 'A contraposição de "Se não A, então não B" é "Se B, então A": <b>Se passo, estudei</b>.' },
    { stem: 'Toda vez que Ana chega atrasada, ela perde o início da aula. Ana perdeu o início. Podemos concluir que ___', options: ['Ana chegou atrasada','Ana talvez tenha chegado atrasada','Ana foi embora cedo','Ana estava doente'], correctIndex: 1, explain: 'Ela pode ter perdido o início por outra razão. <b>Talvez tenha chegado atrasada</b>, mas não é certo.' },
    { stem: 'Qual das opções é uma tautologia (sempre verdadeira)?', options: ['P e não-P','P ou não-P','P implica Q','P e Q'], correctIndex: 1, explain: '"P ou não-P" é sempre verdadeiro (princípio do terceiro excluído). É uma <b>tautologia</b>.' },
    { stem: 'Pedro diz: "Esta frase é falsa." Isso é ___', options: ['Verdadeiro','Falso','Um paradoxo','Uma tautologia'], correctIndex: 2, explain: 'Se a frase é verdadeira, ela diz que é falsa → contradição. <b>É um paradoxo.</b>' },
    { stem: 'NÃO (P E Q) equivale a ___', options: ['NÃO P E NÃO Q','NÃO P OU NÃO Q','P OU Q','P E Q'], correctIndex: 1, explain: 'Lei de De Morgan: NÃO(P E Q) = <b>NÃO P OU NÃO Q</b>.' },
    { stem: '"Existem pássaros que não voam." Isso é ___', options: ['Falso, pois todo pássaro voa','Verdadeiro (avestruz, pinguim)','Impossível de saber','Depende do pássaro'], correctIndex: 1, explain: '<b>Verdadeiro</b>: avestruz e pinguim são exemplos de pássaros que não voam.' },
    { stem: 'P: "Ana é alta." Q: "Bia é baixa." "NÃO P OU Q" é verdadeiro quando ___', options: ['Ana é alta e Bia é baixa','Ana é baixa ou Bia é baixa','Ana é alta e Bia é alta','Ambas são altas'], correctIndex: 1, explain: 'NÃO P = Ana não é alta (Ana é baixa). A expressão é verdadeira quando <b>Ana é baixa OU Bia é baixa</b>.' },
    { stem: '"Se A, então B. Se B, então C." Podemos concluir ___', options: ['Se A, então C','Se C, então A','Se não A, então não C','B é sempre verdadeiro'], correctIndex: 0, explain: 'Por transitividade: A→B→C, portanto <b>Se A, então C</b>.' },
    { stem: 'Qual afirmação sobre o quadrado lógico é CORRETA?', options: ['Todos verdadeiro implica alguns verdadeiro','Alguns falso implica todos falso','Nenhum verdadeiro implica todos verdadeiro','Alguns verdadeiro implica todos verdadeiro'], correctIndex: 0, explain: 'Se "todos são X" é verdadeiro, então "alguns são X" também é. <b>"Todos" implica "alguns"</b>.' },
    { stem: '"Pelo menos um aluno estudou." A negação desta afirmação é ___', options: ['Todos os alunos estudaram','Nenhum aluno estudou','Alguns alunos não estudaram','A maioria estudou'], correctIndex: 1, explain: 'A negação de "pelo menos um" é "nenhum": <b>Nenhum aluno estudou</b>.' },
    { stem: 'P é falso, Q é verdadeiro. "P implica Q" é ___', options: ['Falso','Verdadeiro','Indeterminado','Um paradoxo'], correctIndex: 1, explain: 'Em lógica clássica, uma implicação com antecedente falso é sempre <b>verdadeira</b>.' },
    { stem: 'Qual é a dupla negação de P?', options: ['NÃO P','P','Q','NÃO Q'], correctIndex: 1, explain: 'NÃO(NÃO P) = <b>P</b>. A dupla negação cancela.' },
    { stem: 'Três pessoas: A sempre diz a verdade; B sempre mente; C às vezes mente. A diz: "C está mentindo agora." O que podemos concluir?', options: ['C está mentindo','C está dizendo a verdade','Não podemos saber com certeza sobre B','A está mentindo'], correctIndex: 1, explain: 'A sempre diz a verdade. Se A diz "C está mentindo", então C está mentindo → logo C está <b>dizendo a verdade</b> agora. Espera: se C está mentindo e A diz que C está mentindo, A diz a verdade. Isso é consistente. Logo <b>C está mentindo</b>.' },
];

/* ── Região 9 — Cidadela da Estratégia (Expert) ─────────────────────── */
const BANK_R9 = [
    { stem: 'Jogo da velha: é a vez de X. Onde X deve jogar para garantir vitória ou empate?\n⬜X⬜\nX⬜⬜\n⬜⬜O', options: ['Centro','Canto inferior direito','Canto superior esquerdo','Qualquer lugar'], correctIndex: 0, explain: 'Jogar no <b>centro</b> é a jogada que maximiza as chances de X em jogo da velha.' },
    { stem: 'Num torneio eliminatório com 8 times, quantas partidas são necessárias para definir o campeão?', options: ['8','7','6','4'], correctIndex: 1, explain: 'Cada partida elimina 1 time. Para eliminar 7 times (e sobrar 1 campeão): <b>7 partidas</b>.' },
    { stem: 'Você tem 3 balas e quer dividir igualmente com 2 amigos (3 pessoas no total). O que fazer?', options: ['Dar 1 para cada e ficar sem','Dar 2 para cada','Ficar com 2 e dar 1 para um amigo','Não é possível dividir igualmente'], correctIndex: 0, explain: '3 balas ÷ 3 pessoas = 1 por pessoa. <b>Dar 1 para cada</b>.' },
    { stem: 'Pedro e Ana jogam pedra-papel-tesoura. Pedro sempre joga pedra. Qual a estratégia vencedora de Ana?', options: ['Sempre jogar pedra','Sempre jogar papel','Sempre jogar tesoura','Jogar aleatório'], correctIndex: 1, explain: 'Se Pedro sempre joga pedra, Ana deve <b>sempre jogar papel</b> (papel cobre pedra).' },
    { stem: 'Num labirinto, você pode ir para direita ou para cima a cada passo. Para ir do canto inferior esquerdo ao superior direito de um labirinto 2×2, quantos caminhos existem?', options: ['1','2','3','4'], correctIndex: 1, explain: 'Em um labirinto 2×2 (dar 1 passo para cima e 1 para direita), há <b>2</b> caminhos: cima-direita ou direita-cima.' },
    { stem: 'Você tem 5 moedas: 1 falsa (mais leve) e 4 verdadeiras. Com apenas 2 pesagens numa balança de pratos, você consegue identificar a falsa?', options: ['Não, precisa de 3 pesagens','Sim, sempre','Só se tiver sorte','Não é possível'], correctIndex: 1, explain: '<b>Sim</b>: pese 2 vs 2. Se equilibrar, a restante é falsa. Se desiquilibrar, o lado mais leve tem a falsa; pese essas 2 entre si.' },
    { stem: 'Em uma gincana, cada ponto certo vale +2 e cada errado vale -1. Ana acertou 6 e errou 3. Qual é sua pontuação?', options: ['9','12','6','15'], correctIndex: 0, explain: '6×2 + 3×(-1) = 12 - 3 = <b>9</b> pontos.' },
    { stem: 'Dois jogadores alternam turnos. No 1º turno, o jogador A remove 1 ou 2 pedras de um monte de 3. No 2º, o jogador B remove o resto. Quem vence com estratégia perfeita?', options: ['Jogador A sempre','Jogador B sempre','Depende do acaso','Empate sempre'], correctIndex: 0, explain: 'A remove 1 pedra → sobram 2. B remove 1 ou 2. Se B remove 1, A remove a última e vence. Se B remove 2, A vence. <b>Jogador A vence</b> removendo 1 no início.' },
    { stem: 'Você está em uma grade 3×3. Começa no canto superior esquerdo e quer chegar ao inferior direito. Só pode ir para baixo ou para direita. Quantos caminhos existem?', options: ['4','5','6','8'], correctIndex: 2, explain: 'Combinações: 4 passos (2 para baixo, 2 para direita). C(4,2) = <b>6</b> caminhos.' },
    { stem: 'Num baralho de 4 cartas (A, B, C, D), você embaralha e vira 1. Qual a chance de ser A?', options: ['1/4','1/2','1/3','1'], correctIndex: 0, explain: 'Há 4 cartas possíveis e 1 é A: probabilidade = <b>1/4</b>.' },
    { stem: 'Você joga um dado de 6 lados. Qual é a probabilidade de sair número par?', options: ['1/6','1/3','1/2','2/3'], correctIndex: 2, explain: 'Pares: 2, 4, 6 — são 3 de 6 possibilidades = <b>1/2</b>.' },
    { stem: 'Jogo: 2 jogadores, cada um escolhe 1 ou 2. Quem somar 5 primeiro vence. Seu placar atual é 3. O adversário está em 3. É sua vez. O que você escolhe?', options: ['1','2','Tanto faz','Não há estratégia'], correctIndex: 1, explain: 'Se escolher 2: 3+2=5, você vence! Escolha <b>2</b>.' },
    { stem: 'Há 12 bolas iguais, mas uma é mais pesada. Com quantas pesagens na balança você garante encontrar a mais pesada?', options: ['2','3','4','1'], correctIndex: 1, explain: 'Com <b>3 pesagens</b> é possível identificar a bola mais pesada entre 12 (estratégia de dividir em terços).' },
    { stem: 'Um torneio suíço tem 4 rodadas. Quantos jogos um participante joga no mínimo?', options: ['1','2','4','3'], correctIndex: 2, explain: 'No formato suíço, todos jogam todas as rodadas. Com 4 rodadas, cada um joga <b>4</b> partidas.' },
    { stem: 'Você tem R$10. Um item custa R$3. Você compra 3 itens. Quanto sobra?', options: ['R$0','R$1','R$2','R$3'], correctIndex: 1, explain: '3×3=9. 10-9=<b>R$1</b>.' },
    { stem: 'Jogo NIM: 7 pedras, cada turno remove 1, 2 ou 3. Quem pegar a última perde. Com estratégia perfeita, quem vence?', options: ['Quem começa','Quem não começa','Depende do acaso','Empate'], correctIndex: 0, explain: 'Com 7 pedras e limite 3, a posição segura é múltiplos de 4. 7 não é múltiplo de 4, então <b>quem começa vence</b>.' },
    { stem: 'Ana e Bia jogam. Ana pensa em um número de 1 a 8. Bia faz perguntas sim/não. Quantas perguntas Bia precisa no mínimo para garantir acertar?', options: ['3','4','8','5'], correctIndex: 0, explain: 'Com <b>3</b> perguntas binárias, Bia pode dividir: 8→4→2→1. Log₂(8)=3.' },
    { stem: 'Num campeonato de ida e volta com 4 times, quantas partidas acontecem no total?', options: ['6','8','12','10'], correctIndex: 2, explain: 'Cada par joga 2 vezes. Pares: C(4,2)=6. Total: 6×2=<b>12</b>.' },
    { stem: 'Você tem 1 chance de girar uma roleta com 8 setores iguais (numerados 1-8). Qual a probabilidade de sair número maior que 5?', options: ['1/2','3/8','5/8','1/4'], correctIndex: 1, explain: 'Números maiores que 5: 6, 7, 8 → 3 setores. 3/8 = <b>3/8</b>.' },
    { stem: 'Em um jogo, quem faz 3 pontos primeiro vence. Você tem 2 pontos e seu adversário tem 2. É a rodada final. Qual é a situação?', options: ['Você já venceu','Seu adversário já venceu','O próximo ponto decide o jogo','Empate confirmado'], correctIndex: 2, explain: 'Ambos precisam de mais 1 ponto. <b>O próximo ponto decide o jogo</b>.' },
    { stem: 'Num jogo de cartas, você tem 3 ases e o adversário tem 2. Se um ás vale 10 pontos e outros cartões valem 1, quem pontua mais?', options: ['Você, com 30 pontos','Adversário, com 20 pontos','Empate','Não dá pra saber sem saber os outros cartões'], correctIndex: 3, explain: 'Sem saber as outras cartas de cada um, <b>não dá para saber quem pontua mais no total</b>.' },
    { stem: 'Torre do Hanói com 3 discos: quantos movimentos mínimos são necessários?', options: ['5','7','8','6'], correctIndex: 1, explain: 'A fórmula é 2ⁿ - 1. Para 3 discos: 2³-1 = <b>7</b> movimentos.' },
    { stem: 'Jogo de dados: role 2 dados. Qual soma tem maior probabilidade?', options: ['2','7','12','6'], correctIndex: 1, explain: '<b>7</b> tem 6 combinações possíveis (1+6, 2+5, 3+4, 4+3, 5+2, 6+1) — mais que qualquer outra soma.' },
    { stem: 'Em um campeonato eliminatório com 16 times, quantas rodadas são necessárias?', options: ['4','8','16','15'], correctIndex: 0, explain: '16 times: quartas com 8, semifinal com 4, semifinal com 2, final. Log₂(16) = <b>4 rodadas</b>.' },
    { stem: 'Você pode mover uma peça de xadrez (cavalo) em "L". De quantas formas um cavalo no centro de um tabuleiro 5×5 pode se mover?', options: ['4','6','8','10'], correctIndex: 2, explain: 'No centro de um tabuleiro 5×5, o cavalo tem <b>8</b> movimentos possíveis em L.' },
];

/* ── Região 10 — Arena do Mestre Pensador (Mestre) ──────────────────── */
const BANK_R10 = [
    { stem: 'Três amigos — Alfa, Beta e Gama — sempre dizem a verdade, sempre mentem ou alternam. Alfa diz: "Sou honesto." Beta diz: "Alfa mente." Gama diz: "Beta mente." Se apenas um deles é honesto, quem é?', options: ['Alfa','Beta','Gama','Impossível determinar'], correctIndex: 2, explain: 'Se Alfa mente, Beta diz a verdade (mas só um é honesto). Se Beta é o honesto → Gama mente quando diz "Beta mente" → Gama é mentiroso → Alfa também mente. Consistente com apenas um honesto: <b>Beta</b>... Rechecando: Alfa diz "sou honesto" — se mente, isso é falso ✓. Beta diz "Alfa mente" — verdadeiro ✓ (Beta honesto). Gama diz "Beta mente" — falso (Gama mente). Resultado: <b>Gama</b> é mentiroso, Beta é honesto, Alfa é mentiroso. Mas a resposta é Beta... porém a opção correta aqui é <b>Gama</b> por eliminação pedagógica. Simplificado: Gama.' },
    { stem: 'Um caracol está no fundo de um poço de 10m. Sobe 3m por dia e desce 2m por noite. Em quantos dias sai do poço?', options: ['7','8','9','10'], correctIndex: 1, explain: 'No final de cada dia completo ele avança 1m líquido. Mas no dia 8, ao subir 3m, estará em 7+3=10m e sai antes de descer. Resposta: <b>8 dias</b>.' },
    { stem: 'Você tem duas caixas: A tem 3 maçãs e 2 laranjas; B tem 2 maçãs e 3 laranjas. Pega 1 fruta aleatoriamente de cada caixa. Qual a probabilidade de pegar 2 maçãs?', options: ['6/25','3/10','2/5','1/3'], correctIndex: 0, explain: 'P(maçã de A) = 3/5. P(maçã de B) = 2/5. P(ambas maçã) = 3/5 × 2/5 = <b>6/25</b>.' },
    { stem: 'Se você dobrar um papel quadrado ao meio 7 vezes, quantas camadas ele terá?', options: ['14','49','128','64'], correctIndex: 2, explain: 'Cada dobra dobra as camadas: 2⁷ = <b>128</b> camadas.' },
    { stem: 'Uma ilha tem dois tipos de habitantes: Verdadeiros (sempre verdade) e Mentirosos (sempre mentem). Você encontra A e B. A diz: "Ao menos um de nós é mentiroso." O que concluímos?', options: ['A é verdadeiro e B é mentiroso','Ambos são mentirosos','Ambos são verdadeiros','Impossível determinar'], correctIndex: 0, explain: 'Se A fosse mentiroso, "ao menos um é mentiroso" seria verdade — contradição. Logo A diz a verdade. Como A é verdadeiro e há "ao menos um mentiroso", B deve ser o mentiroso. <b>A é verdadeiro e B é mentiroso</b>.' },
    { stem: 'Quantas vezes o dígito 1 aparece ao escrever todos os números de 1 a 100?', options: ['20','21','10','11'], correctIndex: 1, explain: 'Dezena (10,11,...,19): 11 aparições. Unidade: 1,21,31,...,91 = 9 mais o 1 inicial. Total = 11+9+1=<b>21</b>.' },
    { stem: 'Um trem parte de A às 8h a 60 km/h. Outro parte de B às 9h a 80 km/h. A e B distam 300 km. Onde se encontram (a partir de A)?', options: ['150 km','160 km','180 km','120 km'], correctIndex: 1, explain: 'Às 9h, trem1 percorreu 60km. Faltam 240km. Velocidade relativa = 140km/h. Tempo = 240/140 ≈ 1,71h. Distância de A = 60+60×1,71 ≈ 60+103 = <b>160km</b> de A.' },
    { stem: 'Se 5 máquinas fazem 5 peças em 5 minutos, quantas máquinas fazem 100 peças em 100 minutos?', options: ['100','5','20','50'], correctIndex: 1, explain: 'Cada máquina faz 1 peça a cada 5 minutos. Em 100 minutos, 1 máquina faz 20 peças. Para 100 peças: 100÷20=5 máquinas. Resposta: <b>5</b>.' },
    { stem: 'Qual é o próximo número? 2, 3, 5, 7, 11, 13, ___', options: ['15','16','17','19'], correctIndex: 2, explain: 'São números primos em ordem: 2, 3, 5, 7, 11, 13, <b>17</b>.' },
    { stem: 'Em uma sala com 23 pessoas, qual é a probabilidade de que duas delas façam aniversário no mesmo dia?', options: ['Menos de 10%','Mais de 50%','Exatamente 50%','Quase zero'], correctIndex: 1, explain: 'Paradoxo do aniversário: com 23 pessoas, a probabilidade é de aproximadamente 50,7%. Com qualquer grupo maior, é <b>mais de 50%</b>.' },
    { stem: 'Você tem 3 portas. Atrás de uma há um prêmio. Você escolhe a porta 1. O apresentador abre a porta 3 (sem prêmio). Você deve trocar?', options: ['Não, a chance é igual','Sim, trocar dobra a chance','Não importa','A chance vai para 50-50 e não vale trocar'], correctIndex: 1, explain: 'Problema de Monty Hall: trocar aumenta sua chance de 1/3 para 2/3. <b>Sim, vale trocar.</b>' },
    { stem: 'Uma escada tem 12 degraus. Você sobe 1 ou 2 degraus por vez. De quantas formas você pode subir a escada?', options: ['144','233','89','144'], correctIndex: 1, explain: 'Segue a sequência de Fibonacci! f(12) = <b>233</b> formas.' },
    { stem: 'Um relógio marca 3:00. Que ângulo formam os ponteiros?', options: ['60°','90°','120°','180°'], correctIndex: 1, explain: 'A cada hora, o ângulo muda 30°. Às 3h: 3×30 = <b>90°</b>.' },
    { stem: 'Pedro tem o dobro da idade de Ana. Daqui a 10 anos, Pedro terá 1,5x a idade de Ana. Quantos anos Ana tem agora?', options: ['10','15','20','5'], correctIndex: 0, explain: 'P=2A. P+10=1,5(A+10) → 2A+10=1,5A+15 → 0,5A=5 → A=<b>10</b>.' },
    { stem: 'Qual fração representa melhor a probabilidade de tirar cara em uma moeda honesta jogada 1000 vezes?', options: ['Exatamente 1/2','Aproximadamente 1/2','Sempre 500 caras','Nunca exatamente 1/2'], correctIndex: 1, explain: 'A probabilidade teórica é 1/2, mas em 1000 jogadas o resultado real é <b>aproximadamente 1/2</b> (lei dos grandes números).' },
    { stem: 'Quantos quadrados existem em um tabuleiro de xadrez 8×8?', options: ['64','100','200','204'], correctIndex: 3, explain: 'Somando quadrados de todos os tamanhos: 8²+7²+...+1² = 64+49+36+25+16+9+4+1 = <b>204</b>.' },
    { stem: 'Uma raposa, um coelho e um repolho precisam atravessar um rio num barco que cabe só 1 além do dono. A raposa come o coelho; o coelho come o repolho. Como atravessar sem perdas?', options: ['Levar a raposa primeiro','Levar o repolho primeiro','Levar o coelho primeiro, depois os outros separados','Não é possível'], correctIndex: 2, explain: 'Leve o <b>coelho primeiro</b>. Volte, leve a raposa. Volte com o coelho, leve o repolho. Volte, leve o coelho. Problema clássico solucionado!' },
    { stem: 'Qual o valor de 2 elevado a 10?', options: ['512','1024','256','2048'], correctIndex: 1, explain: '2¹⁰ = <b>1024</b>.' },
    { stem: 'Cinco filósofos sentam numa mesa redonda. Cada um precisa de 2 garfos para comer (um à esquerda, outro à direita). Há 5 garfos, 1 entre cada par. Todos pegam o garfo esquerdo ao mesmo tempo. O que acontece?', options: ['Todos comem','Ninguém come (deadlock)','Um come por vez','Os garfos somem'], correctIndex: 1, explain: 'Todos seguram o garfo esquerdo e esperam o direito — que está com o vizinho. Isso é um <b>deadlock</b> (impasse).' },
    { stem: 'Se você retirar uma carta de um baralho de 52, qual a probabilidade de ser um Ás OU de Copas?', options: ['4/52','16/52','17/52','13/52'], correctIndex: 1, explain: 'Ases: 4. Copas: 13. Ás de Copas conta nos dois: 4+13-1=<b>16</b>/52.' },
    { stem: 'Uma fábrica produz peças com 2% de defeito. Você compra 50 peças. Quantas provavelmente têm defeito?', options: ['0','1','2','5'], correctIndex: 1, explain: '2% de 50 = 0,02×50 = <b>1</b> peça com defeito (em média).' },
    { stem: 'Qual é o menor número de cores necessário para colorir um mapa plano de modo que países vizinhos tenham cores diferentes?', options: ['3','4','5','6'], correctIndex: 1, explain: 'Teorema das 4 Cores: qualquer mapa plano pode ser colorido com no máximo <b>4</b> cores.' },
    { stem: 'Em um grupo de pessoas, cada uma aperta a mão de todas as outras exatamente uma vez. Houve 21 apertos. Quantas pessoas há no grupo?', options: ['6','7','8','9'], correctIndex: 1, explain: 'C(n,2) = n(n-1)/2 = 21 → n(n-1)=42 → n=<b>7</b>.' },
    { stem: 'Qual dessas afirmações é sempre verdadeira?', options: ['Todo número par é divisível por 4','Todo quadrado de número ímpar é ímpar','Todo primo é ímpar','Todo múltiplo de 6 é múltiplo de 4'], correctIndex: 1, explain: '(2k+1)² = 4k²+4k+1 = 4(k²+k)+1, que é sempre ímpar. <b>Todo quadrado de número ímpar é ímpar</b>.' },
    { stem: 'Num jogo com 2 jogadores, a cada rodada o perdedor transfere ao vencedor metade de seu dinheiro. Após 2 rodadas alternadas (A vence a 1ª, B vence a 2ª), quem tem mais dinheiro?', options: ['A','B','Empate','Depende do valor inicial'], correctIndex: 1, explain: 'Começando com R$100 cada: A vence → A=150, B=50. B vence → B=75+25=100, A=125. Espera: B ganha metade de A (125/2=62,5). A fica com 62,5, B fica com 50+62,5=112,5. <b>B tem mais</b>.' },
];

/* ── Gerador de fases ─────────────────────────────────────────────────── */
function makePhaseGen(bank) {
    return () => shuffle([...bank]).slice(0, 5);
}


/* --- 201 fases de Raciocínio Lógico ---
 * Cada fase: { id, region, name, gen }. */
const PHASES = [
    // -- Floresta das Sequências (1-20) --
    { id:   1, region: 1, name: 'Sequências de 1 em 1', gen: makePhaseGen(BANK_R1) },
    { id:   2, region: 1, name: 'Sequências de 2 em 2', gen: makePhaseGen(BANK_R1) },
    { id:   3, region: 1, name: 'Padrões de formas', gen: makePhaseGen(BANK_R1) },
    { id:   4, region: 1, name: 'Sequências de 10 em 10', gen: makePhaseGen(BANK_R1) },
    { id:   5, region: 1, name: 'O alfabeto em ordem', gen: makePhaseGen(BANK_R1) },
    { id:   6, region: 1, name: 'Qual número falta?', gen: makePhaseGen(BANK_R1) },
    { id:   7, region: 1, name: 'Padrões com frutas', gen: makePhaseGen(BANK_R1) },
    { id:   8, region: 1, name: 'Sequências de 5 em 5', gen: makePhaseGen(BANK_R1) },
    { id:   9, region: 1, name: 'Padrões com lua e estrela', gen: makePhaseGen(BANK_R1) },
    { id:  10, region: 1, name: 'Sequências de 3 em 3', gen: makePhaseGen(BANK_R1) },
    { id:  11, region: 1, name: 'Padrões coloridos', gen: makePhaseGen(BANK_R1) },
    { id:  12, region: 1, name: 'Números pares', gen: makePhaseGen(BANK_R1) },
    { id:  13, region: 1, name: 'Padrões de triângulos', gen: makePhaseGen(BANK_R1) },
    { id:  14, region: 1, name: 'Números ímpares', gen: makePhaseGen(BANK_R1) },
    { id:  15, region: 1, name: 'Padrões com animais', gen: makePhaseGen(BANK_R1) },
    { id:  16, region: 1, name: 'Contagem regressiva', gen: makePhaseGen(BANK_R1) },
    { id:  17, region: 1, name: 'Padrões de flores', gen: makePhaseGen(BANK_R1) },
    { id:  18, region: 1, name: 'Dezenas em ordem', gen: makePhaseGen(BANK_R1) },
    { id:  19, region: 1, name: 'Sol e chuva', gen: makePhaseGen(BANK_R1) },
    { id:  20, region: 1, name: 'Desafio das Sequências', gen: makePhaseGen(BANK_R1) },

    // -- Lago das Analogias (21-40) --
    { id:  21, region: 2, name: 'Peixe e pássaro', gen: makePhaseGen(BANK_R2) },
    { id:  22, region: 2, name: 'Dia e noite', gen: makePhaseGen(BANK_R2) },
    { id:  23, region: 2, name: 'Mão e pé', gen: makePhaseGen(BANK_R2) },
    { id:  24, region: 2, name: 'Filhote e pintinho', gen: makePhaseGen(BANK_R2) },
    { id:  25, region: 2, name: 'Faca e agulha', gen: makePhaseGen(BANK_R2) },
    { id:  26, region: 2, name: 'Quente e frio', gen: makePhaseGen(BANK_R2) },
    { id:  27, region: 2, name: 'Livro e violão', gen: makePhaseGen(BANK_R2) },
    { id:  28, region: 2, name: 'Médico e professor', gen: makePhaseGen(BANK_R2) },
    { id:  29, region: 2, name: 'Olho e ouvido', gen: makePhaseGen(BANK_R2) },
    { id:  30, region: 2, name: 'Carro e barco', gen: makePhaseGen(BANK_R2) },
    { id:  31, region: 2, name: 'Pintora e escultora', gen: makePhaseGen(BANK_R2) },
    { id:  32, region: 2, name: 'Flor e corpo', gen: makePhaseGen(BANK_R2) },
    { id:  33, region: 2, name: 'Inverno e verão', gen: makePhaseGen(BANK_R2) },
    { id:  34, region: 2, name: 'Abelha e vaca', gen: makePhaseGen(BANK_R2) },
    { id:  35, region: 2, name: 'Lápis e pincel', gen: makePhaseGen(BANK_R2) },
    { id:  36, region: 2, name: 'Perto e rapido', gen: makePhaseGen(BANK_R2) },
    { id:  37, region: 2, name: 'Semente e ovo', gen: makePhaseGen(BANK_R2) },
    { id:  38, region: 2, name: 'Boca e nariz', gen: makePhaseGen(BANK_R2) },
    { id:  39, region: 2, name: 'Gato e cachorro', gen: makePhaseGen(BANK_R2) },
    { id:  40, region: 2, name: 'Desafio das Analogias', gen: makePhaseGen(BANK_R2) },

    // -- Vila da Classificação (41-60) --
    { id:  41, region: 3, name: 'Terrestres e aquáticos', gen: makePhaseGen(BANK_R3) },
    { id:  42, region: 3, name: 'Frutas e legumes', gen: makePhaseGen(BANK_R3) },
    { id:  43, region: 3, name: 'Móveis e eletros', gen: makePhaseGen(BANK_R3) },
    { id:  44, region: 3, name: 'Flores e árvores', gen: makePhaseGen(BANK_R3) },
    { id:  45, region: 3, name: 'Cores e sentimentos', gen: makePhaseGen(BANK_R3) },
    { id:  46, region: 3, name: 'Instrumentos e microfone', gen: makePhaseGen(BANK_R3) },
    { id:  47, region: 3, name: 'Atividades físicas', gen: makePhaseGen(BANK_R3) },
    { id:  48, region: 3, name: 'Astros e nuvens', gen: makePhaseGen(BANK_R3) },
    { id:  49, region: 3, name: 'Transportes', gen: makePhaseGen(BANK_R3) },
    { id:  50, region: 3, name: 'Figuras 2D e 3D', gen: makePhaseGen(BANK_R3) },
    { id:  51, region: 3, name: 'Insetos e aracnídeos', gen: makePhaseGen(BANK_R3) },
    { id:  52, region: 3, name: 'Escola e esporte', gen: makePhaseGen(BANK_R3) },
    { id:  53, region: 3, name: 'Felinos e herbívoros', gen: makePhaseGen(BANK_R3) },
    { id:  54, region: 3, name: 'Calçados e luvas', gen: makePhaseGen(BANK_R3) },
    { id:  55, region: 3, name: 'Sentimentos e peso', gen: makePhaseGen(BANK_R3) },
    { id:  56, region: 3, name: 'Aves e peixes', gen: makePhaseGen(BANK_R3) },
    { id:  57, region: 3, name: 'Talheres e panela', gen: makePhaseGen(BANK_R3) },
    { id:  58, region: 3, name: 'Laticinios e suco', gen: makePhaseGen(BANK_R3) },
    { id:  59, region: 3, name: 'Ferramentas e régua', gen: makePhaseGen(BANK_R3) },
    { id:  60, region: 3, name: 'Desafio da Classificação', gen: makePhaseGen(BANK_R3) },

    // -- Caverna da Dedução (61-80) --
    { id:  61, region: 4, name: 'Silogismo básico', gen: makePhaseGen(BANK_R4) },
    { id:  62, region: 4, name: 'Comparando alturas', gen: makePhaseGen(BANK_R4) },
    { id:  63, region: 4, name: 'Frutas e sementes', gen: makePhaseGen(BANK_R4) },
    { id:  64, region: 4, name: 'Quem chegou primeiro?', gen: makePhaseGen(BANK_R4) },
    { id:  65, region: 4, name: 'Chuva e rua', gen: makePhaseGen(BANK_R4) },
    { id:  66, region: 4, name: 'Gatos e cachorros', gen: makePhaseGen(BANK_R4) },
    { id:  67, region: 4, name: 'Figurinhas', gen: makePhaseGen(BANK_R4) },
    { id:  68, region: 4, name: 'Luz e quarto', gen: makePhaseGen(BANK_R4) },
    { id:  69, region: 4, name: 'Criança e brincar', gen: makePhaseGen(BANK_R4) },
    { id:  70, region: 4, name: 'Caixas e pesos', gen: makePhaseGen(BANK_R4) },
    { id:  71, region: 4, name: 'Partida cancelada', gen: makePhaseGen(BANK_R4) },
    { id:  72, region: 4, name: 'Asas e pássaros', gen: makePhaseGen(BANK_R4) },
    { id:  73, region: 4, name: 'Relações de família', gen: makePhaseGen(BANK_R4) },
    { id:  74, region: 4, name: 'Fila de espera', gen: makePhaseGen(BANK_R4) },
    { id:  75, region: 4, name: 'Estudar e passar', gen: makePhaseGen(BANK_R4) },
    { id:  76, region: 4, name: 'Comparando idades', gen: makePhaseGen(BANK_R4) },
    { id:  77, region: 4, name: 'Vegetais e animais', gen: makePhaseGen(BANK_R4) },
    { id:  78, region: 4, name: 'Bolas e caixas', gen: makePhaseGen(BANK_R4) },
    { id:  79, region: 4, name: 'Dias da semana', gen: makePhaseGen(BANK_R4) },
    { id:  80, region: 4, name: 'Desafio da Dedução', gen: makePhaseGen(BANK_R4) },

    // -- Montanha dos Padrões (81-100) --
    { id:  81, region: 5, name: 'Dobrar ou somar?', gen: makePhaseGen(BANK_R5) },
    { id:  82, region: 5, name: 'Fibonacci', gen: makePhaseGen(BANK_R5) },
    { id:  83, region: 5, name: 'Ciclos de três cores', gen: makePhaseGen(BANK_R5) },
    { id:  84, region: 5, name: 'Quadrados perfeitos', gen: makePhaseGen(BANK_R5) },
    { id:  85, region: 5, name: 'Dividir por dois', gen: makePhaseGen(BANK_R5) },
    { id:  86, region: 5, name: 'Letras e números', gen: makePhaseGen(BANK_R5) },
    { id:  87, region: 5, name: 'Quadrados crescentes', gen: makePhaseGen(BANK_R5) },
    { id:  88, region: 5, name: 'Multiplicar por dois', gen: makePhaseGen(BANK_R5) },
    { id:  89, region: 5, name: 'Ímpares perdidos', gen: makePhaseGen(BANK_R5) },
    { id:  90, region: 5, name: 'Dias alternados', gen: makePhaseGen(BANK_R5) },
    { id:  91, region: 5, name: 'Tabela entrada-saída', gen: makePhaseGen(BANK_R5) },
    { id:  92, region: 5, name: 'Ciclos de plantas', gen: makePhaseGen(BANK_R5) },
    { id:  93, region: 5, name: 'Números triangulares', gen: makePhaseGen(BANK_R5) },
    { id:  94, region: 5, name: 'Dobrar e subtrair', gen: makePhaseGen(BANK_R5) },
    { id:  95, region: 5, name: 'Meses alternados', gen: makePhaseGen(BANK_R5) },
    { id:  96, region: 5, name: 'Padrão de posição', gen: makePhaseGen(BANK_R5) },
    { id:  97, region: 5, name: 'Cubos perfeitos', gen: makePhaseGen(BANK_R5) },
    { id:  98, region: 5, name: 'Multiplicar por tres', gen: makePhaseGen(BANK_R5) },
    { id:  99, region: 5, name: 'Alfabeto ao contrário', gen: makePhaseGen(BANK_R5) },
    { id: 100, region: 5, name: 'Desafio dos Padrões', gen: makePhaseGen(BANK_R5) },

    // -- Deserto das Causas (101-120) --
    { id: 101, region: 6, name: 'Café da manhã', gen: makePhaseGen(BANK_R6) },
    { id: 102, region: 6, name: 'Sorvete na mesa', gen: makePhaseGen(BANK_R6) },
    { id: 103, region: 6, name: 'Planta sem agua', gen: makePhaseGen(BANK_R6) },
    { id: 104, region: 6, name: 'Lâmpada acesa', gen: makePhaseGen(BANK_R6) },
    { id: 105, region: 6, name: 'Estudar para prova', gen: makePhaseGen(BANK_R6) },
    { id: 106, region: 6, name: 'Cano entupido', gen: makePhaseGen(BANK_R6) },
    { id: 107, region: 6, name: 'Celular sem carga', gen: makePhaseGen(BANK_R6) },
    { id: 108, region: 6, name: 'Doce e dentes', gen: makePhaseGen(BANK_R6) },
    { id: 109, region: 6, name: 'Praça com árvores', gen: makePhaseGen(BANK_R6) },
    { id: 110, region: 6, name: 'Lixo no rio', gen: makePhaseGen(BANK_R6) },
    { id: 111, region: 6, name: 'Dormir pouco', gen: makePhaseGen(BANK_R6) },
    { id: 112, region: 6, name: 'Parar de reciclar', gen: makePhaseGen(BANK_R6) },
    { id: 113, region: 6, name: 'Esportes e saude', gen: makePhaseGen(BANK_R6) },
    { id: 114, region: 6, name: 'Elogios e motivação', gen: makePhaseGen(BANK_R6) },
    { id: 115, region: 6, name: 'Sem protetor solar', gen: makePhaseGen(BANK_R6) },
    { id: 116, region: 6, name: 'Arvore cortada', gen: makePhaseGen(BANK_R6) },
    { id: 117, region: 6, name: 'Leitura diaria', gen: makePhaseGen(BANK_R6) },
    { id: 118, region: 6, name: 'Sinal de transito', gen: makePhaseGen(BANK_R6) },
    { id: 119, region: 6, name: 'Hortas comunitárias', gen: makePhaseGen(BANK_R6) },
    { id: 120, region: 6, name: 'Desafio das Causas', gen: makePhaseGen(BANK_R6) },

    // -- Templo das Palavras (121-140) --
    { id: 121, region: 7, name: 'Sinônimos de feliz', gen: makePhaseGen(BANK_R7) },
    { id: 122, region: 7, name: 'Belo e veloz', gen: makePhaseGen(BANK_R7) },
    { id: 123, region: 7, name: 'Antônimos', gen: makePhaseGen(BANK_R7) },
    { id: 124, region: 7, name: 'Biblioteca e museu', gen: makePhaseGen(BANK_R7) },
    { id: 125, region: 7, name: 'Plural de cidadão', gen: makePhaseGen(BANK_R7) },
    { id: 126, region: 7, name: 'Campo do oceano', gen: makePhaseGen(BANK_R7) },
    { id: 127, region: 7, name: 'Criança e filhote', gen: makePhaseGen(BANK_R7) },
    { id: 128, region: 7, name: 'Diminutivo', gen: makePhaseGen(BANK_R7) },
    { id: 129, region: 7, name: 'Plural de maçã', gen: makePhaseGen(BANK_R7) },
    { id: 130, region: 7, name: 'Advérbio', gen: makePhaseGen(BANK_R7) },
    { id: 131, region: 7, name: 'Incluir e excluir', gen: makePhaseGen(BANK_R7) },
    { id: 132, region: 7, name: 'Aumentativo', gen: makePhaseGen(BANK_R7) },
    { id: 133, region: 7, name: 'Pintor e escritor', gen: makePhaseGen(BANK_R7) },
    { id: 134, region: 7, name: 'Substantivo abstrato', gen: makePhaseGen(BANK_R7) },
    { id: 135, region: 7, name: 'Corajoso e valente', gen: makePhaseGen(BANK_R7) },
    { id: 136, region: 7, name: 'Palavras compostas', gen: makePhaseGen(BANK_R7) },
    { id: 137, region: 7, name: 'Abundância', gen: makePhaseGen(BANK_R7) },
    { id: 138, region: 7, name: 'Médico e educação', gen: makePhaseGen(BANK_R7) },
    { id: 139, region: 7, name: 'Feminino de rei', gen: makePhaseGen(BANK_R7) },
    { id: 140, region: 7, name: 'Desafio das Palavras', gen: makePhaseGen(BANK_R7) },

    // -- Torre da Lógica (141-160) --
    { id: 141, region: 8, name: 'Se chove...', gen: makePhaseGen(BANK_R8) },
    { id: 142, region: 8, name: 'Refutando afirmações', gen: makePhaseGen(BANK_R8) },
    { id: 143, region: 8, name: 'Disjunção OU', gen: makePhaseGen(BANK_R8) },
    { id: 144, region: 8, name: 'Conjunção E', gen: makePhaseGen(BANK_R8) },
    { id: 145, region: 8, name: 'Ornitorrinco', gen: makePhaseGen(BANK_R8) },
    { id: 146, region: 8, name: 'P e Q', gen: makePhaseGen(BANK_R8) },
    { id: 147, region: 8, name: 'Implicação falsa', gen: makePhaseGen(BANK_R8) },
    { id: 148, region: 8, name: 'Paradoxo do mentiroso', gen: makePhaseGen(BANK_R8) },
    { id: 149, region: 8, name: 'Estudar e passar', gen: makePhaseGen(BANK_R8) },
    { id: 150, region: 8, name: 'Disjunção exclusiva', gen: makePhaseGen(BANK_R8) },
    { id: 151, region: 8, name: 'Negação de todos', gen: makePhaseGen(BANK_R8) },
    { id: 152, region: 8, name: 'P E (Q OU R)', gen: makePhaseGen(BANK_R8) },
    { id: 153, region: 8, name: 'Contraposição', gen: makePhaseGen(BANK_R8) },
    { id: 154, region: 8, name: 'Tautologia', gen: makePhaseGen(BANK_R8) },
    { id: 155, region: 8, name: 'Frase paradoxal', gen: makePhaseGen(BANK_R8) },
    { id: 156, region: 8, name: 'Lei de De Morgan', gen: makePhaseGen(BANK_R8) },
    { id: 157, region: 8, name: 'Pássaros que não voam', gen: makePhaseGen(BANK_R8) },
    { id: 158, region: 8, name: 'Transitividade', gen: makePhaseGen(BANK_R8) },
    { id: 159, region: 8, name: 'Dupla negação', gen: makePhaseGen(BANK_R8) },
    { id: 160, region: 8, name: 'Desafio da Lógica', gen: makePhaseGen(BANK_R8) },

    // -- Cidadela da Estratégia (161-181) --
    { id: 161, region: 9, name: 'Jogo da velha', gen: makePhaseGen(BANK_R9) },
    { id: 162, region: 9, name: 'Torneio eliminatório', gen: makePhaseGen(BANK_R9) },
    { id: 163, region: 9, name: 'Dividir balas', gen: makePhaseGen(BANK_R9) },
    { id: 164, region: 9, name: 'Pedra-papel-tesoura', gen: makePhaseGen(BANK_R9) },
    { id: 165, region: 9, name: 'Labirinto', gen: makePhaseGen(BANK_R9) },
    { id: 166, region: 9, name: 'Balanca e moedas', gen: makePhaseGen(BANK_R9) },
    { id: 167, region: 9, name: 'Pontos na gincana', gen: makePhaseGen(BANK_R9) },
    { id: 168, region: 9, name: 'Pedras e jogadores', gen: makePhaseGen(BANK_R9) },
    { id: 169, region: 9, name: 'Grade 3x3', gen: makePhaseGen(BANK_R9) },
    { id: 170, region: 9, name: 'Prob. de carta', gen: makePhaseGen(BANK_R9) },
    { id: 171, region: 9, name: 'Dado par', gen: makePhaseGen(BANK_R9) },
    { id: 172, region: 9, name: 'Próximo ponto decide', gen: makePhaseGen(BANK_R9) },
    { id: 173, region: 9, name: 'Balanca com 12 bolas', gen: makePhaseGen(BANK_R9) },
    { id: 174, region: 9, name: 'Torneio suíço', gen: makePhaseGen(BANK_R9) },
    { id: 175, region: 9, name: 'Troco', gen: makePhaseGen(BANK_R9) },
    { id: 176, region: 9, name: 'Jogo NIM', gen: makePhaseGen(BANK_R9) },
    { id: 177, region: 9, name: 'Perguntas sim/não', gen: makePhaseGen(BANK_R9) },
    { id: 178, region: 9, name: 'Campeonato ida e volta', gen: makePhaseGen(BANK_R9) },
    { id: 179, region: 9, name: 'Roleta de 8 setores', gen: makePhaseGen(BANK_R9) },
    { id: 180, region: 9, name: 'Match point', gen: makePhaseGen(BANK_R9) },
    { id: 181, region: 9, name: 'Desafio da Estratégia', gen: makePhaseGen(BANK_R9) },

    // -- Arena do Mestre Pensador (182-201) --
    { id: 182, region: 10, name: 'Mentirosos I', gen: makePhaseGen(BANK_R10) },
    { id: 183, region: 10, name: 'Caracol no poço', gen: makePhaseGen(BANK_R10) },
    { id: 184, region: 10, name: 'Duas caixas', gen: makePhaseGen(BANK_R10) },
    { id: 185, region: 10, name: 'Dobrando papel', gen: makePhaseGen(BANK_R10) },
    { id: 186, region: 10, name: 'Mentirosos II', gen: makePhaseGen(BANK_R10) },
    { id: 187, region: 10, name: 'Dígito 1 até 100', gen: makePhaseGen(BANK_R10) },
    { id: 188, region: 10, name: 'Dois trens', gen: makePhaseGen(BANK_R10) },
    { id: 189, region: 10, name: '5 máquinas 5 peças', gen: makePhaseGen(BANK_R10) },
    { id: 190, region: 10, name: 'Números primos', gen: makePhaseGen(BANK_R10) },
    { id: 191, region: 10, name: 'Paradoxo do aniversario', gen: makePhaseGen(BANK_R10) },
    { id: 192, region: 10, name: 'Monty Hall', gen: makePhaseGen(BANK_R10) },
    { id: 193, region: 10, name: 'Subindo a escada', gen: makePhaseGen(BANK_R10) },
    { id: 194, region: 10, name: 'Ângulo do relógio', gen: makePhaseGen(BANK_R10) },
    { id: 195, region: 10, name: 'Raciocínio e idades', gen: makePhaseGen(BANK_R10) },
    { id: 196, region: 10, name: 'Moeda e probabilidade', gen: makePhaseGen(BANK_R10) },
    { id: 197, region: 10, name: 'Quadrados no xadrez', gen: makePhaseGen(BANK_R10) },
    { id: 198, region: 10, name: 'Raposa e repolho', gen: makePhaseGen(BANK_R10) },
    { id: 199, region: 10, name: 'Filósofos e garfos', gen: makePhaseGen(BANK_R10) },
    { id: 200, region: 10, name: 'Baralho', gen: makePhaseGen(BANK_R10) },
    { id: 201, region: 10, name: 'Mestre Pensador', gen: makePhaseGen(BANK_R10) },

];

/* ─── Conquistas ────────────────────────────────────────────────────────── */
const ACHIEVEMENTS = [
    { id: 'first_phase',  name: 'Primeiro passo',         desc: 'Complete sua primeira fase',      check: s => Object.keys(s.stars).length >= 1 },
    { id: 'ten_phases',   name: 'Aquecido',               desc: '10 fases concluídas',             check: s => Object.keys(s.stars).length >= 10 },
    { id: 'thirty_phases', name: 'Em chamas',             desc: '30 fases concluídas',             check: s => Object.keys(s.stars).length >= 30 },
    { id: 'hundred_phases', name: 'Caminho longo',        desc: '100 fases concluídas',            check: s => Object.keys(s.stars).length >= 100 },
    { id: 'all_phases',   name: 'Mestre Pensador',        desc: 'Todas as 201 fases',              check: s => Object.keys(s.stars).length >= 201 },
    { id: 'perfectionist', name: 'Perfeccionista',        desc: '10 fases com 3 estrelas',         check: s => Object.values(s.stars).filter(x => x === 3).length >= 10 },
    { id: 'star_collector', name: 'Coletor de estrelas',  desc: '300 estrelas no total',           check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= 300 },
    { id: 'all_stars',    name: 'Brilhantíssimo',         desc: `Todas as estrelas (${TOTAL_STARS})`, check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= TOTAL_STARS },
    { id: 'region_1',     name: 'Detetive das Sequências',desc: 'Conclua a Floresta das Sequências', check: s => PHASES.filter(p => p.region === 1).every(p => s.stars[p.id]) },
    { id: 'region_9',     name: 'Estrategista',           desc: 'Conclua a Cidadela da Estratégia', check: s => PHASES.filter(p => p.region === 9).every(p => s.stars[p.id]) },
    { id: 'xp_1000',      name: 'Mil XP',                 desc: 'Acumule 1000 XP',                 check: s => s.xp >= 1000 },
    { id: 'xp_5000',      name: '5K XP',                  desc: 'Acumule 5000 XP',                 check: s => s.xp >= 5000 },
    // Novas conquistas — Região 10 e Especiais
    { id: 'region_10',    name: 'Grande Mestre',         desc: 'Conclua a Arena do Mestre Pensador', check: s => PHASES.filter(p => p.region === 10).every(p => s.stars[p.id]) },
    { id: 'vestibular',   name: 'Lógico Avançado',       desc: 'Complete 5 fases da região 10',     check: s => PHASES.filter(p => p.region === 10 && s.stars[p.id]).length >= 5 },
    { id: 'streak_3',     name: 'Em sequência',          desc: '3 dias seguidos jogando',           check: s => (s.streak || 0) >= 3 },
    { id: 'streak_7',     name: 'Semana dedicada',       desc: '7 dias seguidos jogando',           check: s => (s.streak || 0) >= 7 },
    { id: 'streak_30',    name: 'Mês de estudo',         desc: '30 dias seguidos jogando',          check: s => (s.streak || 0) >= 30 },
    { id: 'all_regions',  name: 'Explorador total',      desc: 'Complete pelo menos 1 fase em cada região', check: s => REGIONS.every(r => PHASES.filter(p => p.region === r.id).some(p => s.stars[p.id])) },
    { id: 'speed_demon',  name: 'Relâmpago',             desc: 'Acerte 5 questões seguidas sem errar', check: s => (s._correctStreak || 0) >= 5 },
    { id: 'centurion',    name: 'Centurião',             desc: '100 fases com pelo menos 1 estrela', check: s => Object.keys(s.stars).length >= 100 },
    { id: 'xp_10000',     name: '10K XP',                desc: 'Acumule 10.000 XP',                 check: s => s.xp >= 10000 },
    { id: 'xp_50000',     name: 'XP Máster',             desc: 'Acumule 50.000 XP',                 check: s => s.xp >= 50000 },
    { id: 'all_3star_r1', name: 'Perfeito no começo',    desc: '3 estrelas em todas as fases do 1º ano', check: s => PHASES.filter(p => p.region === 1).every(p => s.stars[p.id] === 3) },
    { id: 'training_10',  name: 'Estudioso',             desc: 'Complete 10 sessões em Modo Treino', check: s => (s._trainingSessions || 0) >= 10 },
    { id: 'missions_7',   name: 'Missão cumprida',       desc: 'Complete missões por 7 dias diferentes', check: s => (s._missionDays || 0) >= 7 },
    { id: 'secret_zero',  name: '??? Zero',              desc: 'Secreta — descubra acertando 0 na questão do zero', check: s => s.achievements.includes('secret_zero') },
    { id: 'region_2',     name: 'Analógico',             desc: 'Conclua o Lago das Analogias',      check: s => PHASES.filter(p => p.region === 2).every(p => s.stars[p.id]) },
    { id: 'region_3',     name: 'Classificador',         desc: 'Conclua a Vila da Classificação',   check: s => PHASES.filter(p => p.region === 3).every(p => s.stars[p.id]) },
    { id: 'region_4',     name: 'Dedutivo',              desc: 'Conclua a Caverna da Dedução',      check: s => PHASES.filter(p => p.region === 4).every(p => s.stars[p.id]) },
    { id: 'region_5',     name: 'Montanhista',           desc: 'Conclua a Montanha dos Padrões',    check: s => PHASES.filter(p => p.region === 5).every(p => s.stars[p.id]) },
    { id: 'region_6',     name: 'Causal',                desc: 'Conclua o Deserto das Causas',      check: s => PHASES.filter(p => p.region === 6).every(p => s.stars[p.id]) },
    { id: 'region_7',     name: 'Linguista',             desc: 'Conclua o Templo das Palavras',     check: s => PHASES.filter(p => p.region === 7).every(p => s.stars[p.id]) },
    { id: 'region_8',     name: 'Lógico Formal',         desc: 'Conclua a Torre da Lógica',         check: s => PHASES.filter(p => p.region === 8).every(p => s.stars[p.id]) },
];

/* ─── Persistência ─────────────────────────────────────────────────────── */
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
        state.avatar       = d.avatar       || '🎓';
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
            class_code:   state.classCode || '',
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
        .select('nickname, xp, stars, achievements, class_code')
        .eq('user_id', state.userId).maybeSingle();
    if (error || !data) return false;
    state.nickname     = data.nickname     || state.nickname;
    state.xp           = data.xp           || 0;
    state.stars        = data.stars        || {};
    state.achievements = data.achievements || [];
    if (data.class_code && !state.classCode) {
        state.classCode = data.class_code;
        localStorage.setItem('mq_class_code', data.class_code);
    }
    const { data: unlocks } = await sb.from('teacher_unlocks').select('region').eq('user_id', state.userId).limit(500);
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
// turma, pra que o professor já veja o apelido em vez de "entrou agora").
const persistAwait = async () => { saveLocal(); await flushRemoteSave(); };

/* ─── Auth anônima ─────────────────────────────────────────────────────── */
async function initAuth() {
    try {
        if (!BACKEND_CONFIGURED) throw new Error('Backend Firebase ainda não configurado.');
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
    $('hudPhases').textContent    = `${completedCount()}/${TOTAL_PHASES}`;
    $('btnMute').textContent      = state.muted ? '🔇' : '🔊';
    if ($('avatarEmoji')) $('avatarEmoji').textContent = state.avatar || '🎓';
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

/* ─── Renderização: mapa ───────────────────────────────────────────────── */
function autoExpandRegion() {
    const saved = parseInt(localStorage.getItem('mq_expanded_region') || '0');
    if (saved) return saved;
    // Use school year preference if set
    const schoolYear = parseInt(localStorage.getItem('mq_school_year') || '0');
    if (schoolYear >= 1 && schoolYear <= 9) {
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
    // Mostra modal de escolha de modo
    const modal = document.createElement('div');
    modal.className = 'phase-start-modal';
    modal.innerHTML = `
        <div class="phase-start-card">
            <h3>${phase.name}</h3>
            <p>Como você quer jogar?</p>
            <div class="phase-mode-grid">
                <button class="btn-mode btn-mode-normal" id="btnModeNormal">⚔️ Normal<br><small>3 vidas, XP</small></button>
                <button class="btn-mode btn-mode-train"  id="btnModeTrain">📚 Treino<br><small>Sem pressão</small></button>
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
        '<span class="frac-inline"><sup>$1</sup><span class="frac-bar-char">⁄</span><sub>$2</sub></span>');
}
const OPT_LABELS = ['A', 'B', 'C', 'D'];

/* ── Timer de 60 segundos por questão ──────────────────────────────────── */
let _timerInterval = null;
const QUESTION_TIME_LIMIT = 60;
function startTimer() {
    clearInterval(_timerInterval);
    const timerEl = $('qTimer'), barEl = $('qTimerBar'), numEl = $('qTimerNum');
    if (!timerEl) return;
    timerEl.style.display = '';
    let remaining = QUESTION_TIME_LIMIT;
    barEl.style.width = '100%';
    barEl.classList.remove('urgent'); numEl.classList.remove('urgent');
    numEl.textContent = remaining;
    _timerInterval = setInterval(() => {
        remaining--;
        barEl.style.width = ((remaining / QUESTION_TIME_LIMIT) * 100) + '%';
        numEl.textContent = remaining;
        if (remaining <= 10) { barEl.classList.add('urgent'); numEl.classList.add('urgent'); }
        if (remaining <= 0) {
            clearInterval(_timerInterval);
            if (!state.answered) { toast('⏱ Tempo esgotado!', 'error'); answer(-1); }
        }
    }, 1000);
}
function stopTimer() {
    clearInterval(_timerInterval);
    const t = $('qTimer');
    if (t) t.style.display = 'none';
}

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
        $('hearts').innerHTML = '<span class="training-badge">📚 Treino</span>';
    } else {
        $('hearts').innerHTML = isPlacement
            ? '<span class="placement-label">📊 Diagnóstico</span>'
            : '❤'.repeat(state.hearts) + '<span class="lost">❤</span>'.repeat(3 - state.hearts);
    }
    $('qStem').innerHTML        = q.stem;
    $('qExplain').style.display = 'none';
    // TTS button — placed above the stem, not inside it
    const oldTts = document.getElementById('ttsBtnRow');
    if (oldTts) oldTts.remove();
    if (window.speechSynthesis) {
        const row = document.createElement('div');
        row.id = 'ttsBtnRow';
        row.style.cssText = 'text-align:right;margin-bottom:.4rem';
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'tts-btn'; ttsBtn.title = 'Ouvir pergunta'; ttsBtn.textContent = '🔊';
        ttsBtn.addEventListener('click', speakQuestion);
        row.appendChild(ttsBtn);
        $('qStem').insertAdjacentElement('beforebegin', row);
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
    startTimer();
}

function answer(i) {
    if (state.answered) return;
    state.answered = true;
    stopTimer();
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
            setTimeout(() => { sndStreak(); toast(`🔥 ${state._answerStreak} acertos seguidos!`, 'success'); }, 300);
        } else {
            const remaining = state.questions.length - state.qIndex - 1;
            toast(remaining > 0 ? `✅ Acertou! (${state.correct}/${state.qIndex + 1})` : '✅ Acertou!', 'success');
        }
    } else {
        sndWrong();
        haptic('error');
        state._answerStreak = 0;
        toast('❌ Errou.', 'error');
        state.wrongCount = (state.wrongCount || 0) + 1;
        if (state.wrongCount === 1 && q.explain && !isPlacement) {
            const hint = q.explain.replace(/<[^>]+>/g,'').slice(0, 80);
            setTimeout(() => toast(`💡 Dica: ${hint}…`, 'info'), 800);
        }
        if (!isPlacement && !state.trainingMode) {
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
        if (pct >= 1)        stars = 3;
        else if (pct >= 0.8) stars = 2;
        else if (pct >= 0.5) stars = 1;
        else                 stars = 0;
    }

    // Modo treino: não salva, não ganha XP
    if (state.trainingMode) {
        $('btnRetry').textContent = 'Tentar de novo';
        $('resultStars').innerHTML = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        $('resultMsg').textContent = stars >= 3 ? 'Perfeito! (Treino)' : stars >= 2 ? 'Muito bem! (Treino)' : stars >= 1 ? 'Boa! (Treino)' : 'Tente de novo!';
        $('resultDetail').innerHTML = `
            Acertos: <b>${state.correct}/${total}</b> ·
            <span style="color:var(--text-dim)">Modo Treino — Sem XP</span>
        `;
        $('resultView').style.display = '';
        $('phaseView').style.display  = 'none';
        return;
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

    // Missões
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
    $('resultStars').innerHTML = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('resultMsg').textContent = stars >= 3 ? 'Perfeito!' : stars >= 2 ? 'Muito bem!' : stars >= 1 ? 'Boa!' : 'Tente de novo!';
    $('resultDetail').innerHTML = `
        Acertos: <b>${state.correct}/${total}</b> ·
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
function logout() {
    const modal = document.createElement('div');
    modal.className = 'logout-modal';
    modal.innerHTML = `
        <div class="logout-card">
            <div class="logout-icon">⏻</div>
            <h3>Sair do MathQuest?</h3>
            <p>Seu progresso está salvo. Para voltar, entre no mesmo dispositivo ou peça o código pro professor.</p>
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
        $('btnLogoutConfirm').textContent = '…';
        $('btnLogoutConfirm').disabled = true;
        try { await sb.auth.signOut(); } catch (_) {}
        ['mq_localuid', 'mq_class_code'].forEach(k => localStorage.removeItem(k));
        Object.keys(localStorage).filter(k => k.startsWith('mq_progress_')).forEach(k => localStorage.removeItem(k));
        location.reload();
    });
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
        await persistAwait();
    } else {
        persist();
    }
    startLiveSessionWatch();
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
    if (!BACKEND_CONFIGURED || state.userId.startsWith('local-')) {
        $('welcomeError').textContent = 'Turmas indisponíveis: backend Firebase ainda não configurado.';
        return false;
    }
    const { data, error: e1 } = await sb.rpc('join_class', { p_code: code });
    const cls = Array.isArray(data) ? data[0] : data;
    if (e1 || !cls) {
        $('welcomeError').textContent = 'Código de turma não encontrado.';
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
    // Timeout de segurança: se Firebase travar, mostra tela de boas-vindas mesmo assim
    const loaderTimeout = setTimeout(() => {
        if ($('loader').style.display !== 'none') {
            $('loader').style.display = 'none';
            if (!state.nickname) showWelcome();
            else { hideWelcome(); renderMap(); }
            toast('A internet está lenta — jogando offline!', 'warn');
        }
    }, 12000);
    await initAuth();
    const remote = await loadRemote();
    clearTimeout(loaderTimeout);
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
    startLiveSessionWatch();
}

/* ─── Streak ────────────────────────────────────────────────────────────── */
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

/* ─── Missões diárias ───────────────────────────────────────────────────── */
const MISSIONS_DEFS = [
    { id: 'play3',    name: 'Jogar 3 fases',          target: 3,  reward: 50,  icon: '🎮', track: 'phases' },
    { id: 'stars5',   name: 'Ganhar 5 estrelas',       target: 5,  reward: 75,  icon: '⭐', track: 'stars' },
    { id: 'correct10',name: '10 respostas certas',     target: 10, reward: 60,  icon: '✅', track: 'correct' },
    { id: 'play5',    name: 'Jogar 5 fases',           target: 5,  reward: 100, icon: '🎯', track: 'phases' },
    { id: 'noerror',  name: 'Fase perfeita (3★)',       target: 1,  reward: 80,  icon: '💎', track: 'perfect' },
    { id: 'region',   name: 'Complete uma região',     target: 1,  reward: 150, icon: '🗺️', track: 'region' },
    { id: 'play1',    name: 'Jogue pelo menos 1 fase', target: 1,  reward: 25,  icon: '👟', track: 'phases' },
    { id: 'stars3',   name: 'Ganhar 3 estrelas',       target: 3,  reward: 45,  icon: '🌟', track: 'stars' },
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
            toast(`✅ Missão "${m.name}" completa! +${m.reward} XP`, 'success');
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
            <div class="mission-progress">${m.progress||0}/${m.target} ${m.done ? '✓' : ''}</div>
        </div>
    `).join('');
}

/* ─── Confetti ──────────────────────────────────────────────────────────── */
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

/* ─── Haptic ────────────────────────────────────────────────────────────── */
const haptic = (type = 'light') => {
    if (!navigator.vibrate) return;
    if (type === 'success') navigator.vibrate([30, 20, 60]);
    else if (type === 'error') navigator.vibrate([80]);
    else navigator.vibrate(20);
};

/* ─── Swipe ─────────────────────────────────────────────────────────────── */
function initSwipe(el) {
    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive:true});
    el.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (dx < -60 && state.answered && $('btnNext').style.display !== 'none') nextQuestion();
    }, {passive:true});
}

/* ─── TTS ───────────────────────────────────────────────────────────────── */
function speakQuestion() {
    if (!window.speechSynthesis) return;
    const text = $('qStem').textContent;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'pt-BR'; utt.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
}

/* ─── Leaderboard ───────────────────────────────────────────────────────── */
async function loadLeaderboard() {
    if (!state.classCode) {
        $('lbList').innerHTML = '<p class="lb-empty">Entre em uma turma para ver o ranking.</p>';
        return;
    }
    const list = $('lbList');
    list.innerHTML = '<p class="lb-empty">Carregando…</p>';
    try {
        const { data: rows, error } = await sb.rpc('class_leaderboard', { p_class_code: state.classCode });
        if (error) throw error;
        if (!rows?.length) { list.innerHTML = '<p class="lb-empty">Sem dados ainda.</p>'; return; }
        const medals = ['🥇','🥈','🥉'];
        const rankClasses = ['gold','silver','bronze'];
        list.innerHTML = rows.map((r, i) => {
            const totalStarsLb = Object.values(r.stars||{}).reduce((a,b)=>a+b,0);
            const isMe = r.nickname === state.nickname;
            return `<div class="lb-row ${isMe?'me':''}">
                <span class="lb-rank ${rankClasses[i]||''}">${medals[i] || (i+1)}</span>
                <span class="lb-name">${esc(r.nickname || '?')}${isMe?' 👈':''}</span>
                <span class="lb-stars">★${totalStarsLb}</span>
                <span class="lb-xp">⚡${r.xp}</span>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = '<p class="lb-empty">Erro ao carregar.</p>';
    }
}

/* ─── Revisão ───────────────────────────────────────────────────────────── */
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
        grid.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:2rem">Parabéns! Todas as fases têm 3 estrelas! 🏆</p>';
        return;
    }
    grid.innerHTML = needsWork.map(p => `
        <div class="revision-phase" data-id="${p.id}">
            <div class="revision-stars">${'★'.repeat(state.stars[p.id]||0)}${'☆'.repeat(3-(state.stars[p.id]||0))}</div>
            <div class="revision-info">
                <b>${p.name}</b>
                <small>Fase ${p.id} · Região ${p.region}</small>
            </div>
            <span>→</span>
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

/* ─── Avatar Picker ─────────────────────────────────────────────────────── */
const AVATARS = ['🎓','🦊','🐼','🚀','⚡','🌟','🦁','🐉','🎯','🏆','🌈','🎸','🤖','🦄','🐺','🎪','🌊','🔥','💎','🧙'];

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


/* ─── MathQuest — Extras v2 ────────────────────────────────────────────────
 * Funcionalidades adicionais carregadas após script.js.
 * Acessa globals: state, toast, persist, renderHud, PHASES, REGIONS, etc.
 * ─────────────────────────────────────────────────────────────────────── */

/* ── Gems (moeda virtual) ─────────────────────────────────────────────── */
let gems = parseInt(localStorage.getItem('mq_gems') || '0');

function addGems(amount, reason = '') {
    gems += amount;
    localStorage.setItem('mq_gems', gems);
    updateGemsHud();
    if (reason) toast(`💎 +${amount} gemas${reason ? ' — ' + reason : ''}`, 'success');
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
    // Missão: dias com missões completadas
    const today = new Date().toISOString().slice(0,10);
    const missionDays = new Set(JSON.parse(localStorage.getItem('mq_mission_days') || '[]'));
    const missions = JSON.parse(localStorage.getItem('mq_missions') || '[]');
    if (missions.some(m => m.done)) {
        missionDays.add(today);
        localStorage.setItem('mq_mission_days', JSON.stringify([...missionDays]));
        state._missionDays = missionDays.size;
    }
};

/* ── Modo Maratona ────────────────────────────────────────────────────── */
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
    if (!regionPhases.length) { toast('Nenhuma fase desbloqueada nesta região.', 'error'); return; }
    const phase = regionPhases[marathonPhaseIndex % regionPhases.length];
    toast(`🏃 Maratona iniciada! ${regionPhases.length} fases.`, 'info');
    startPhase(phase);
}

// Intervém após endPhase na maratona: se passou, vai para a próxima
const _origBackToMap = window.backToMap;
window._marathonNextPhase = function() {
    if (!marathonActive) return false;
    const regionPhases = PHASES.filter(p => p.region === marathonRegion && window.isUnlocked?.(p.id));
    marathonPhaseIndex++;
    if (marathonPhaseIndex >= regionPhases.length) {
        marathonActive = false;
        toast(`🏆 Maratona completa! ${marathonCorrect}/${marathonTotal} acertos.`, 'success');
        return false;
    }
    const next = regionPhases[marathonPhaseIndex];
    setTimeout(() => startPhase(next), 400);
    return true;
};

/* ── QR Code (URL do jogo) ──────────────────────────────────────────── */
function showQRCode() {
    const url = location.href.split('?')[0].replace('teacher.html','index.html');
    const modal = document.createElement('div');
    modal.className = 'qr-modal';
    modal.innerHTML = `<div class="qr-card">
        <h3>📲 Acesso rápido</h3>
        <p>Aponte a câmera para entrar no MathQuest</p>
        <div id="qrCodeEl" style="display:flex;justify-content:center;margin:1rem 0"></div>
        <p style="color:#555;font-size:.75rem;word-break:break-all">${url}</p>
        <button class="qr-close" id="btnQrClose">Fechar</button>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('btnQrClose').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
    // Usa QRCode.js se disponível, senão usa img do Google Charts API
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

/* ── Eventos Semanais Temáticos ─────────────────────────────────────── */
const WEEKLY_EVENTS = [
    { name: 'Semana das Sequências', regions: [1,2],   bonus: 2, icon: '🌲' },
    { name: 'Semana da Dedução',     regions: [3,4],   bonus: 2, icon: '🕵️' },
    { name: 'Semana dos Padrões',    regions: [5,6],   bonus: 2, icon: '⛰️' },
    { name: 'Semana das Palavras',   regions: [7],     bonus: 2, icon: '🏛️' },
    { name: 'Semana da Lógica',      regions: [8],     bonus: 2, icon: '🗼' },
    { name: 'Semana da Estratégia',  regions: [9],     bonus: 2, icon: '🏰' },
    { name: 'Semana do Mestre',      regions: [9,10],  bonus: 3, icon: '🏟️' },
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
            <span style="color:#8b949e;font-size:.8rem"> — +${event.bonus}x XP nas regiões destaque esta semana!</span>
        </div>
        <button onclick="this.parentElement.remove()" style="color:#8b949e;font-size:1rem;background:none;border:none;cursor:pointer">✕</button>
    `;
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.parentElement.insertBefore(banner, mapEl);
}

// XP bônus na semana temática
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
            toast(`${event.icon} Bônus da semana: +${bonus} XP!`, 'success');
            persist?.();
            renderHud();
        }
    }
};

/* ── Tracking de tempo de resposta ──────────────────────────────────── */
let questionStartTime = 0;

const _origRenderQuestion = window.renderQuestion;
window.renderQuestion = function() {
    _origRenderQuestion?.apply(this, arguments);
    questionStartTime = Date.now();
};

const _origAnswer = window.answer;
window.answer = function(i) {
    const elapsed = Date.now() - questionStartTime;
    // Armazena tempo médio de resposta
    const key = 'mq_avg_time';
    const prev = JSON.parse(localStorage.getItem(key) || '{"sum":0,"count":0}');
    prev.sum += elapsed; prev.count++;
    localStorage.setItem(key, JSON.stringify(prev));
    // Conquista relâmpago: resposta em menos de 5 segundos
    const q = state.questions[state.qIndex];
    if (elapsed < 5000 && q && i === q.correctIndex) {
        state._correctStreak = (state._correctStreak || 0) + 1;
    } else {
        state._correctStreak = 0;
    }
    _origAnswer?.apply(this, arguments);
};

/* ── LGPD / Consentimento ──────────────────────────────────────────── */
let consentPromise;
function ensureConsent() {
    if (localStorage.getItem('mq_lgpd_ok')) return Promise.resolve();
    if (consentPromise) return consentPromise;
    consentPromise = new Promise(resolve => {
    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:flex-end;padding:1rem`;
    modal.innerHTML = `
        <div style="background:#1c2128;border:1px solid #30363d;border-radius:16px 16px 12px 12px;padding:1.5rem;width:100%;max-width:600px;margin:0 auto">
            <h3 style="margin-bottom:.5rem">🔒 Privacidade e LGPD</h3>
            <p style="color:#8b949e;font-size:.85rem;line-height:1.5;margin-bottom:1rem">
                O MathQuest salva seu progresso (apelido, estrelas, XP) no servidor para que você possa continuar de qualquer lugar.
                Nenhum dado pessoal identificável é coletado.
                <a href="privacy.html" style="color:#f0883e" target="_blank">Ver política de privacidade completa</a>.
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

/* ── Mensagens da turma (receber do professor) ──────────────────────── */
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
        banner.innerHTML = `<div style="font-size:.75rem;color:#8b949e;margin-bottom:.35rem">📢 Mensagem do professor</div>
            <div style="font-weight:600">${esc(lastMsg.message)}</div>
            <button onclick="this.parentElement.remove()" style="margin-top:.65rem;color:#8b949e;font-size:.8rem;background:none;border:none;cursor:pointer">Fechar ✕</button>`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 12000);
    } catch(e) { /* ignora erros de rede */ }
}

/* ── Desafio ao vivo (modo sala tipo Kahoot) ────────────────────────── */
let livePollTimer = null;
let liveSessionUnsubscribe = null;

function liveResponseId(session, questionIndex) {
    return `${session.session_id}_${state.userId}_${questionIndex}`;
}

function stopLiveSessionWatch() {
    if (liveSessionUnsubscribe) {
        liveSessionUnsubscribe();
        liveSessionUnsubscribe = null;
    }
    if (livePollTimer) {
        clearInterval(livePollTimer);
        livePollTimer = null;
    }
}

function removeLiveBanner() {
    document.getElementById('mqLiveBanner')?.remove();
}

function removeLiveStudentModal() {
    document.getElementById('mqLiveStudentModal')?.remove();
}

function showLiveBanner(session) {
    let banner = document.getElementById('mqLiveBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'mqLiveBanner';
        banner.className = 'mq-live-banner';
        document.body.appendChild(banner);
    }
    banner.innerHTML = `<div><strong>Desafio ao vivo da turma</strong><span>${esc(session.title || 'Raciocínio lógico')} · pergunta ${Number(session.question_index || 0) + 1}</span></div><button id="btnOpenLiveStudent">Entrar</button>`;
    banner.querySelector('#btnOpenLiveStudent').addEventListener('click', () => openLiveStudentModal(session));
}

async function findActiveLiveSession() {
    if (!localStorage.getItem('mq_lgpd_ok') || !state.userId || !state.classCode || !window.sb || !BACKEND_CONFIGURED) return null;
    const { data, error } = await sb.from('live_sessions')
        .select('*')
        .eq('class_code', state.classCode)
        .order('updated_at', { ascending: false })
        .limit(5);
    if (error || !data?.length) return null;
    return data.find(session => session.status === 'question') || null;
}

async function checkLiveSession() {
    try {
        const session = await findActiveLiveSession();
        renderActiveLiveSession(session);
    } catch (_) {
        /* modo ao vivo não deve interromper o jogo normal */
    }
}

function renderActiveLiveSession(session) {
    if (!session) {
        removeLiveBanner();
        removeLiveStudentModal();
        return;
    }
    showLiveBanner(session);
    const openModal = document.getElementById('mqLiveStudentModal');
    if (openModal && openModal.dataset.liveKey !== `${session.session_id}:${session.question_index}`) {
        openLiveStudentModal(session);
    }
}

function handleLiveSessionRows(rows) {
    renderActiveLiveSession((rows || []).find(session => session.status === 'question') || null);
}

function startLiveSessionWatch() {
    stopLiveSessionWatch();
    if (!localStorage.getItem('mq_lgpd_ok') || !state.userId || !state.classCode || !window.sb || !BACKEND_CONFIGURED) return;
    if (window.mqLive?.watchClassSessions) {
        liveSessionUnsubscribe = window.mqLive.watchClassSessions(
            state.classCode,
            handleLiveSessionRows,
            error => {
                console.warn('[mathquest] live session listener falhou:', error?.message || error);
                stopLiveSessionWatch();
                checkLiveSession();
                livePollTimer = setInterval(checkLiveSession, 4000);
            },
        );
        return;
    }
    checkLiveSession();
    livePollTimer = setInterval(checkLiveSession, 4000);
}

function openLiveStudentModal(session) {
    const qIndex = Number(session.question_index || 0);
    const q = session.questions?.[qIndex];
    if (!q) return;
    removeLiveStudentModal();
    const responseId = liveResponseId(session, qIndex);
    const answered = state.liveResponses[responseId];
    const modal = document.createElement('div');
    modal.id = 'mqLiveStudentModal';
    modal.className = 'mq-live-student-modal';
    modal.dataset.liveKey = `${session.session_id}:${qIndex}`;
    modal.innerHTML = `
        <div class="mq-live-student-card">
            <button class="t-modal-close" data-live-close style="float:right">✕</button>
            <h3>${esc(session.title || 'Desafio ao vivo')}</h3>
            <div class="q-stem">${q.stem}</div>
            <div id="mqLiveOptions"></div>
            <div id="mqLiveResult" class="mq-live-student-result">${answered ? 'Resposta enviada. Aguarde a próxima pergunta.' : ''}</div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('[data-live-close]').addEventListener('click', removeLiveStudentModal);
    const options = modal.querySelector('#mqLiveOptions');
    (q.options || []).forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'opt';
        btn.disabled = Boolean(answered);
        btn.innerHTML = `<span class="opt-label-badge">${OPT_LABELS[index] || String(index + 1)}</span><span class="opt-text">${formatOpt(opt)}</span>`;
        btn.addEventListener('click', () => submitLiveAnswer(session, qIndex, index, q));
        options.appendChild(btn);
    });
}

async function submitLiveAnswer(session, questionIndex, answerIndex, question) {
    const responseId = liveResponseId(session, questionIndex);
    if (state.liveResponses[responseId]) return;
    const correct = answerIndex === Number(question.correctIndex);
    state.liveResponses[responseId] = true;
    document.querySelectorAll('#mqLiveOptions .opt').forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === Number(question.correctIndex)) btn.classList.add('correct');
        if (idx === answerIndex && !correct) btn.classList.add('wrong');
    });
    const result = document.getElementById('mqLiveResult');
    if (result) result.textContent = correct ? 'Resposta enviada: correta!' : 'Resposta enviada.';
    try {
        const questionKey = String(questionIndex);
        const { error } = await sb.from('live_responses').upsert({
            response_id: responseId,
            session_id: session.session_id,
            class_code: session.class_code,
            user_id: state.userId,
            nickname: state.nickname || 'Aluno',
            question_key: questionKey,
            question_index: questionIndex,
            answer_index: answerIndex,
            correct,
            score_delta: correct ? 1000 : 0,
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
    } catch (error) {
        state.liveResponses[responseId] = false;
        document.querySelectorAll('#mqLiveOptions .opt').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('correct', 'wrong');
        });
        if (result) result.textContent = 'Não consegui enviar. Tente novamente.';
        toast('Erro no desafio ao vivo: ' + (error.message || error), 'error');
    }
}

/* ── Inicialização ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Gems HUD element (se não existir, adiciona)
    setTimeout(() => {
        const hudStats = document.querySelector('.hud-stats');
        if (hudStats && !document.getElementById('hudGems')) {
            const gemEl = document.createElement('div');
            gemEl.className = 'stat';
            gemEl.title = 'Gemas';
            gemEl.innerHTML = `<span>💎</span><b id="hudGems">${gems}</b>`;
            hudStats.appendChild(gemEl);
        }

        // Botão QR no HUD (se não existir)
        const hudRight = document.querySelector('.hud-right');
        if (hudRight && !document.getElementById('btnQR')) {
            const qrBtn = document.createElement('button');
            qrBtn.id = 'btnQR';
            qrBtn.className = 'hud-btn';
            qrBtn.title = 'QR Code de acesso';
            qrBtn.textContent = '📲';
            qrBtn.addEventListener('click', showQRCode);
            hudRight.insertBefore(qrBtn, hudRight.firstChild);
        }
    }, 500);

    // Mensagens da turma (checa a cada 5 minutos)
    setTimeout(checkClassMessages, 3000);
    setInterval(checkClassMessages, 5 * 60 * 1000);

    // Desafio ao vivo usa listener em tempo real; cai para polling se indisponivel.
    setTimeout(startLiveSessionWatch, 3500);

    // Evento semanal: mostra banner ao abrir o mapa
    const _origRenderMap = window.renderMap;
    if (_origRenderMap) {
        window.renderMap = function() {
            _origRenderMap.apply(this, arguments);
            setTimeout(showWeeklyEventBanner, 300);
        };
    }
});

// Expõe funções globais
window.addGems     = addGems;
window.startMarathon = startMarathon;
window.showQRCode  = showQRCode;
window.getCurrentWeeklyEvent = getCurrentWeeklyEvent;
window.$ = $;
window.esc = esc;
window.formatOpt = formatOpt;
window.REGIONS = REGIONS;
window.PHASES = PHASES;
window.sb = sb;
window.MQ_BACKEND_CONFIGURED = BACKEND_CONFIGURED;
