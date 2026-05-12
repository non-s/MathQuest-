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
    { name: 'Semana das Frações',    regions: [4,5],   bonus: 2, icon: '🍕' },
    { name: 'Semana das Equações',   regions: [6,7],   bonus: 2, icon: '⚖️' },
    { name: 'Semana da Geometria',   regions: [7,8],   bonus: 2, icon: '📐' },
    { name: 'Semana dos Números',    regions: [1,2,3], bonus: 1, icon: '🔢' },
    { name: 'Semana do Vestibular',  regions: [9,10],  bonus: 3, icon: '🎓' },
    { name: 'Semana das Potências',  regions: [8],     bonus: 2, icon: '⚡' },
    { name: 'Semana da Probabilidade', regions: [5,9], bonus: 2, icon: '🎲' },
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
    if (elapsed < 5000) {
        state._correctStreak = (state._correctStreak || 0) + 1;
    } else {
        state._correctStreak = 0;
    }
    _origAnswer?.apply(this, arguments);
};

/* ── LGPD / Consentimento ──────────────────────────────────────────── */
function checkLGPD() {
    if (localStorage.getItem('mq_lgpd_ok')) return;
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
    });
}

/* ── Mensagens da turma (receber do professor) ──────────────────────── */
async function checkClassMessages() {
    if (!state?.classCode || !window.sb) return;
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
            <div style="font-weight:600">${lastMsg.message}</div>
            <button onclick="this.parentElement.remove()" style="margin-top:.65rem;color:#8b949e;font-size:.8rem;background:none;border:none;cursor:pointer">Fechar ✕</button>`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 12000);
    } catch(e) { /* ignora erros de rede */ }
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

    // LGPD
    checkLGPD();

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

// Expõe funções globais
window.addGems     = addGems;
window.startMarathon = startMarathon;
window.showQRCode  = showQRCode;
window.getCurrentWeeklyEvent = getCurrentWeeklyEvent;
