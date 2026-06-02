# MathQuest

Jogo educacional de matemática em mundo aberto com **201 fases** em **10 regiões**, do 1º ano ao vestibular. Inclui painel do professor, turmas, ranking, mensagens, desbloqueio pedagógico, PWA e persistência com Supabase.

## Publicação

1. Crie um projeto Supabase.
2. Habilite `Authentication > Providers > Anonymous Sign-ins`.
3. Habilite autenticação por e-mail e senha para professores.
4. Execute [`schema.sql`](schema.sql) no SQL Editor.
5. Preencha [`config.js`](config.js) com a URL e a chave anon do projeto.
6. Publique todos os arquivos deste diretório no GitHub Pages.

Não publique enquanto `config.js` contiver `YOUR_PROJECT` ou `YOUR_SUPABASE_ANON_KEY`. Nesse estado o jogo funciona somente como modo local e o painel exibe um aviso explícito.

## Aprovar professores

Criar uma conta no painel não concede permissão automaticamente. Após conferir a identidade do professor, execute:

```sql
insert into public.profiles(user_id, role)
select id, 'teacher' from auth.users where email = 'teacher@example.com'
on conflict (user_id) do update set role = excluded.role;
```

Alunos usam autenticação anônima e não conseguem criar turmas.

## Rotas

- Jogo: `./`
- Painel do professor: `./?view=teacher`
- Atalho compatível: `./teacher.html`
- Política de privacidade: `./privacy.html`

## Segurança

- RLS habilitado em todas as tabelas.
- Entrada em turma feita pela RPC `join_class`, sem expor a listagem de turmas.
- Ranking feito pela RPC `class_leaderboard`, disponível somente a membros da turma.
- Professores precisam do papel `teacher` em `profiles`.
- Desbloqueios pedagógicos ficam em `teacher_unlocks`; professores não alteram diretamente o progresso dos alunos.
- Mensagens têm limite de 500 caracteres e são escapadas antes de renderizar.
- Consentimento é solicitado antes da autenticação anônima.

## Estrutura

```text
index.html       interface do aluno e painel do professor
script.js        jogo, geradores e integração Supabase
style.css        estilos
config.js        configuração pública do Supabase
schema.sql       schema, RLS e RPCs
privacy.html     política de privacidade
manifest.json    manifesto PWA
sw.js            service worker
icon.svg         ícone PWA
teacher.html     redirecionamento compatível
404.html         fallback do GitHub Pages
```

## Validação antes de liberar

1. Teste cadastro e aprovação de professor.
2. Crie uma turma e entre nela com dois navegadores de aluno.
3. Conclua uma fase e confira roster, ranking e sincronização.
4. Envie uma mensagem e aplique um desbloqueio pedagógico.
5. Teste offline após a primeira carga.
6. Execute ensaio de carga antes de liberar para 300 alunos.
