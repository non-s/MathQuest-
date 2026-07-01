# MathQuest

Jogo educacional de matematica com painel do professor.

Tecnologias: GitHub Pages + Firebase Authentication + Cloud Firestore.

## Firebase

O app ja esta configurado para o projeto Firebase `non-s-firebase-20260621`.

Arquivos principais:

- `config.js`: inicializa Firebase e fornece um adapter de dados para o jogo e o painel.
- `script.js`: jogo, progresso, turma, ranking e mensagens.
- `index.html`: jogo e painel do professor (`?view=teacher`).
- `teacher.html`: redireciona para o painel.

## Auth

- Alunos usam Firebase Anonymous Auth.
- Professores usam Email/Password.
- Cadastro publico de professor fica desativado no cliente. Crie/libere contas de professor pela administracao do Firebase, com `profiles/{uid}.role = "teacher"`.

## Dados

Colecoes usadas no Firestore:

- `profiles/{uid}`
- `mathquest_progress/{uid}`
- `classes/{classCode}`
- `class_members/{classCode_uid}`
- `teacher_unlocks/{classCode_uid_region}`
- `class_messages/{messageId}`
- `live_sessions/{sessionId}`
- `live_answer_keys/{sessionId}`
- `live_responses/{sessionId_uid_questionIndex}`

O modo ao vivo armazena apenas perguntas/opcoes publicas em `live_sessions`, mantem gabaritos em `live_answer_keys`, usa um temporizador por pergunta e pode ser exibido no modo Projetor. O gabarito so entra no documento publico como `revealed_answer_index` quando o professor escolhe mostrar o resultado. Ao reabrir uma turma, o painel do professor recupera a sessao ao vivo ativa e o gabarito privado. As regras do Firestore recusam respostas apos `question_deadline_ms`, e leituras de respostas ao vivo sao limitadas a 2.500 linhas para cobrir uma turma de 200 alunos em 10 perguntas.

Links de entrada aceitam `?class=CODIGO`, `?turma=CODIGO` ou `?code=CODIGO`; o modo Projetor exibe esse link com QR Code para entrada rapida em sala.

Desafios ao vivo comecam em `lobby`, permitindo que os alunos entrem antes de o professor iniciar a primeira pergunta cronometrada. O painel do professor e o Projetor mostram a contagem/lista de alunos que ja entraram, ajudando a turma a confirmar quem esta pronto antes da largada.

Durante o desafio, o professor revela o resultado antes de avancar; o controle de proxima pergunta fica travado enquanto a pergunta ainda esta ativa.

Durante cada pergunta, o painel e o Projetor exibem o progresso de respostas contra o roster carregado da turma, incluindo o aviso quando todos responderam.

## Desenvolvimento local

Sirva por HTTP:

```bash
python -m http.server 5177
```

Abra:

```text
http://127.0.0.1:5177/MathQuest-/
http://127.0.0.1:5177/MathQuest-/?view=teacher
```
