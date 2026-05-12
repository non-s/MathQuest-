# MathQuest — Aprenda matemática jogando

Jogo educacional de matemática em **mundo aberto** para alunos do **1º ao 9º ano**. 181 fases progressivas, do reconhecimento de números até Bhaskara, Pitágoras e trigonometria. Com **painel do professor** pra acompanhar o progresso de toda uma turma.

Demo: https://non-s.github.io/MathQuest-/  
Painel do professor: https://non-s.github.io/MathQuest-/teacher.html

Tecnologias: HTML + CSS + JavaScript (sem framework) · Supabase Auth (anônimo + e-mail/senha) + Postgres com RLS · GitHub Pages.

---

## O que é

181 fases divididas em 9 regiões. Cada região é um ano escolar. Cada fase tem 5–8 questões geradas algoritmicamente — o aluno nunca vê a mesma sequência duas vezes. Pontuação de 0 a 3 estrelas por fase, baseado em acertos; cada fase desbloqueia a próxima ao ganhar pelo menos 1 estrela.

| Região                        | Ano  | Fases | Habilidades-chave                                |
|-------------------------------|------|-------|--------------------------------------------------|
| 🏘️ Vila dos Números           | 1º   | 1–20  | Contar, comparar, sequenciar, formas             |
| 🌳 Bosque das Operações       | 2º   | 21–40 | Soma/sub até 100, par/ímpar, dobro/metade        |
| 🌾 Vale das Tabuadas          | 3º   | 41–60 | Mult/div, tabuadas 2–10, dinheiro                |
| 🕳️ Caverna das Frações        | 4º   | 61–80 | Frações iniciais, perímetro, unidades, tempo     |
| 🏞️ Lago dos Decimais          | 5º   | 81–100 | Decimais, %, área, volume, probabilidade        |
| ⛰️ Montanha dos Inteiros      | 6º   | 101–120 | Negativos, MMC/MDC, frações, equações 1 passo  |
| 🏜️ Deserto das Equações       | 7º   | 121–140 | Equações 2 lados, razão, regra de 3, %, áreas  |
| 🏛️ Templo das Potências       | 8º   | 141–160 | Potências, raízes, álgebra, produtos notáveis  |
| 🏰 Cidadela do Mestre         | 9º   | 161–181 | Funções, Bhaskara, Pitágoras, trigonometria    |

---

## Setup do Supabase (uma vez só)

### 1. Criar projeto

Em [supabase.com](https://supabase.com): novo projeto. Anote **URL do projeto** e **chave anon** em *Settings → API*.

### 2. Habilitar auth anônimo (aluno) + e-mail/senha (professor)

*Authentication → Providers*:

- **Anonymous Sign-ins** → ENABLE (o aluno entra só com apelido)
- **Email** → ENABLE com *Confirm email* DESABILITADO (assim o professor não precisa esperar e-mail pra criar conta no MVP — pode reativar depois se quiser)

### 3. Rodar o schema

No *SQL Editor*, cola este bloco único e dá *Run*:

```sql
-- Progresso do aluno (já existente)
CREATE TABLE IF NOT EXISTS mathquest_progress (
    user_id      UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    nickname     TEXT,
    xp           INT DEFAULT 0,
    stars        JSONB DEFAULT '{}'::jsonb,
    achievements TEXT[] DEFAULT '{}',
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_progress_updated ON mathquest_progress(updated_at DESC);

ALTER TABLE mathquest_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own progress"  ON mathquest_progress;
DROP POLICY IF EXISTS "write own progress" ON mathquest_progress;
DROP POLICY IF EXISTS "update own progress" ON mathquest_progress;
DROP POLICY IF EXISTS "teacher reads students progress" ON mathquest_progress;

CREATE POLICY "read own progress"  ON mathquest_progress
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "write own progress" ON mathquest_progress
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own progress" ON mathquest_progress
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Turmas: o professor cria, ganha um código curto pra passar pros alunos.
CREATE TABLE IF NOT EXISTS classes (
    code        TEXT PRIMARY KEY,
    teacher_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    grade       INT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    active      BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher manages own classes" ON classes;
DROP POLICY IF EXISTS "anyone reads active class by code" ON classes;

-- Professor gerencia só as turmas dele.
CREATE POLICY "teacher manages own classes" ON classes
    FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- Qualquer aluno autenticado lê uma turma ATIVA por código (pra entrar nela).
-- Não expomos o teacher_id, então não vaza identidade.
CREATE POLICY "anyone reads active class by code" ON classes
    FOR SELECT USING (active = true);

-- Vínculo aluno↔turma. Aluno pode estar em mais de uma turma.
CREATE TABLE IF NOT EXISTS class_members (
    class_code  TEXT REFERENCES classes(code) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (class_code, user_id)
);
CREATE INDEX IF NOT EXISTS idx_class_members_user ON class_members(user_id);

ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student joins own class" ON class_members;
DROP POLICY IF EXISTS "student reads own classes" ON class_members;
DROP POLICY IF EXISTS "student leaves own class" ON class_members;
DROP POLICY IF EXISTS "teacher reads class roster" ON class_members;

-- Aluno entra/sai só da própria associação.
CREATE POLICY "student joins own class" ON class_members
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "student reads own classes" ON class_members
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "student leaves own class" ON class_members
    FOR DELETE USING (user_id = auth.uid());

-- Professor lê o roster das próprias turmas.
CREATE POLICY "teacher reads class roster" ON class_members
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM classes
        WHERE classes.code = class_members.class_code
        AND classes.teacher_id = auth.uid()
    ));

-- Professor lê o progresso dos alunos das próprias turmas.
CREATE POLICY "teacher reads students progress" ON mathquest_progress
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM class_members cm
        JOIN classes c ON c.code = cm.class_code
        WHERE cm.user_id = mathquest_progress.user_id
        AND c.teacher_id = auth.uid()
    ));
```

Resultado esperado: *Success. No rows returned.* Confira em *Table Editor* que apareceram `mathquest_progress`, `classes` e `class_members`.

### 4. Colar credenciais nos arquivos

Dois arquivos têm URL + chave (idênticas em ambos):

- `script.js` (linhas 6–7) — jogo do aluno
- `teacher.html` (linhas com `SUPABASE_URL` e `SUPABASE_ANON_KEY` no script inline)

```js
const SUPABASE_URL      = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
```

A chave anon é pública por design — quem protege é o RLS.

---

## Como o professor usa

1. Abre **/teacher.html**, clica em **Criar conta**, põe e-mail + senha (≥6 chars).
2. Cria uma turma (botão "+ Nova turma"). Ganha um código curto tipo `B3F9A2`.
3. Passa o código pra turma pessoalmente (escreve no quadro, manda no grupo, etc.).
4. Quando os alunos digitam o código na tela inicial do jogo, aparecem no roster.
5. Clique num aluno abre o drill-down: quais regiões ele está, quais fases conquistou, quantas estrelas.

O professor só vê os próprios alunos. O RLS bloqueia qualquer tentativa de ler dados de outra turma.

---

## Como o aluno usa

1. Abre o jogo, digita o apelido (só isso é obrigatório).
2. Se o professor passou um código, digita no campo "Código da turma". Se não, deixa vazio — funciona igual.
3. Clica em "Começar a jornada".
4. Primeira visita: vê um tutorial de 4 cards. Depois disso, vai direto pro mapa.
5. Quando aparecer o botão 📲 no canto superior direito, pode tocar pra instalar como app (PWA).

---

## Arquitetura

### Geradores de questão, não banco de questões

Cada fase declara um *gerador*: uma função que produz N questões com parâmetros aleatórios mas controlados:

```js
const g_table = (n) => Q(5, () => {
    const k = rand(1, 10), c = n * k;
    return { stem: `${n} × ${k} = ?`, ...makeChoice(c, nearDistr(c, n + 2)) };
});
```

Vantagens:

- Fase 43 ("tabuada do 2") gera 5 questões novas a cada tentativa — o aluno aprende o conceito, não memoriza a posição da resposta.
- Distratores próximos do valor correto (`nearDistr`) forçam o aluno a calcular, não a chutar por extremos.
- 15 geradores que tinham pool fixo pequeno (4–7 itens) foram expandidos pra 12–19 — menos repetição pros 300+ alunos.

### Auth anônimo + localStorage como espelho

O fluxo do aluno:

1. `sb.auth.signInAnonymously()` na primeira visita — gera um `user_id` persistente no navegador.
2. Progresso é salvo no Supabase em todo final de fase, e também em `localStorage` como cache local.
3. Na inicialização, lê primeiro do remoto. Se offline, cai pra cópia local. PWA garante que dá pra jogar sem rede.

Resultado: o aluno não cria conta, mas seu progresso sobrevive a fechar o navegador. Trocar de dispositivo perde o progresso (limitação conhecida — a recuperação cross-device por PIN está no roadmap).

### RLS é a defesa real

A chave anon do Supabase está no JavaScript do navegador. Qualquer um pode vê-la. Quem protege os dados é o **Row-Level Security** do Postgres:

- Aluno só lê/escreve a própria linha em `mathquest_progress`.
- Aluno só entra/sai da própria associação em `class_members`.
- Professor só mexe nas próprias turmas em `classes`.
- Professor lê progresso só dos alunos vinculados às suas turmas (via JOIN nas políticas).

Mesmo que alguém altere o JS no navegador, o banco devolve 403 fora dessas regras.

### Mapa: CSS Grid + variáveis por região

Sem canvas, sem SVG complexo. Cada região é um `<section>` com `--rcolor` próprio, e cada fase é um `<button>` posicionado em zig-zag via `--side` aplicada inline.

Pra Chromebooks de escola com Chrome antigo (sem `color-mix()`), um bloco `@supports not` no fim do `style.css` aplica fallbacks com cor sólida — visual fica saturado mas tudo continua legível.

### Service Worker network-first

O `sw.js` usa **network-first pra HTML e script.js** e **cache-first pro resto** (CSS, fontes, ícones, SDK). Isso significa que qualquer fix de bug em `script.js` chega aos alunos na próxima visita, sem precisar bumpar a versão do cache manualmente. Quando offline, cai pro cache normalmente.

### Som via Web Audio, sem assets

`AudioContext` + osciladores curtos. Acerto = duas notas ascendentes, erro = onda quadrada grave, estrela = arpejo de 4 notas. Zero arquivo de áudio pra baixar.

### Prevenção de XSS

Toda string que vai pro `innerHTML` passa por `esc()` — escape de `& < > "`. Apelido do aluno, descrições de fases, opções de resposta: tudo escapado.

---

## Sistema de progressão

- **XP**: 10 por acerto + bônus de 25 por nova estrela ganha.
- **Estrelas**: 100% acerto → 3⭐, ≥80% → 2⭐, ≥50% → 1⭐, abaixo → 0⭐.
- **Vidas**: 3 corações por fase. Acabou? Reinicia a fase com 0⭐.
- **Desbloqueio**: fase N+1 só destrava ao ganhar ao menos 1⭐ na fase N. A fase 181 ("Desafio Mestre") exige completar todas as anteriores.
- **Conquistas**: 12 medalhas (primeiro passo, perfeccionista, 100 fases, coletor de estrelas etc.).

---

## Arquivos

```
MathQuest-/
├── index.html       — jogo do aluno (welcome, HUD, mapa, fase, resultado)
├── style.css        — tema escuro, mapa por região, animações, @supports fallback
├── script.js        — geradores, 181 fases, auth, Supabase sync, joinClass, PWA install
├── teacher.html     — painel do professor (login, turmas, roster, drill-down)
├── privacy.html     — política de privacidade / LGPD
├── manifest.json    — PWA (instalável no celular)
├── sw.js            — service worker (network-first pra HTML+JS, cache-first pro resto)
├── icon.svg         — ícone do app
├── 404.html         — fallback SPA do GitHub Pages
├── robots.txt
└── README.md
```

Sem etapa de build. Sem bundler. Sem framework. Sem dependência de runtime além do Supabase JS via CDN.

---

## Roadmap (Sprint 2+)

O que está fora do escopo atual mas vale a pena fazer:

- **Recuperação cross-device por PIN** — hoje o aluno perde progresso ao trocar de aparelho. Solução: PIN de 4 dígitos gerado no primeiro acesso, exibido no HUD; usado pra recuperar progresso noutro device.
- **Expandir os ~30 geradores que ainda têm pool pequeno** (`g_eqParen`, `g_funcAfim`, `g_bhaskaraRoots`, `g_factor`, etc.).
- **Telemetria leve** — quando um aluno trava muito numa fase, o professor ve isso direto no painel.
- **Acessibilidade total** — leitor de tela, navegação só com teclado, alto contraste opcional.
- **Domínio próprio** (`mathquest.com.br`) — mais credibilidade pra escola.
- **Export CSV do roster** — professor consegue lançar nota num sistema externo.

---

[Portfolio](https://github.com/non-s/Portfolio) · [TakStud](https://github.com/non-s/TakStud) · [Uplift](https://github.com/non-s/Uplift)
