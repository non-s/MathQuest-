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

## Dados

Colecoes usadas no Firestore:

- `profiles/{uid}`
- `mathquest_progress/{uid}`
- `classes/{classCode}`
- `class_members/{classCode_uid}`
- `teacher_unlocks/{classCode_uid_region}`
- `class_messages/{messageId}`
- `live_sessions/{sessionId}`
- `live_responses/{sessionId_uid_questionIndex}`

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
