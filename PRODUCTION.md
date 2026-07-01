# MathQuest Production Checklist

## Deploy targets

- GitHub Pages serves production from `main`: `https://non-s.github.io/MathQuest-/`.
- Firebase project: `non-s-firebase-20260621`.
- Firestore rules and indexes deploy from `.github/workflows/firebase-deploy.yml` when `.firebaserc`, `firebase.json`, `firestore.rules`, or `firestore.indexes.json` changes on `main`.

## Required GitHub secret

Configure this repository secret before merging Firestore changes to `main`:

- `SERVICE_ACCOUNT_JSON`: JSON for a Firebase service account from project `non-s-firebase-20260621`.

The deploy workflow intentionally skips Firebase deployment when the secret is missing or belongs to another project.

## Teacher provisioning

Public teacher signup is disabled. To add a teacher:

1. Create the teacher in Firebase Authentication with Email/Password.
2. Create or update `profiles/{uid}` in Firestore:

```json
{
  "user_id": "<uid>",
  "email": "teacher@example.com",
  "role": "teacher",
  "created_at": "2026-07-01T00:00:00.000Z",
  "updated_at": "2026-07-01T00:00:00.000Z"
}
```

## Pre-merge checks

Run locally:

```bash
node scripts/check-html-assets.js
node scripts/check-mathquest-production.js
node scripts/check-repo-contracts.js
node scripts/check-workflows.js
node scripts/test-question-bank.js
node scripts/validate-firebase-config.js
```

Then verify GitHub Actions on the PR:

- Quality / static checks
- CodeQL
- Firebase deploy after merge to `main`

## Live classroom MVP notes

- Teachers can start a live phase challenge from a class roster.
- Projector mode shows the class code, a `?class={code}` join URL, and a QR code so students can enter the room quickly.
- Live challenges start in a `lobby` state so students can join before the first timed question begins; the teacher view and projector show joined-student counts/names during that waiting phase.
- Students in the class see a live challenge banner and answer in-browser.
- Teachers choose a per-question timer, and teacher/student live views show the same countdown for the current question.
- Projector mode switches to the live question automatically while a challenge is active, showing options, countdown, and response counts without revealing the answer key.
- Teachers explicitly reveal each result, moving the live session from `question` to `review`; only then does the public session expose `revealed_answer_index`.
- Teacher dashboards recover the active live session and private answer key when reopening a class, so a page reload does not strand an in-progress challenge.
- The teacher sees answer counts and an accumulated live scoreboard.
- Live sessions and scoreboards use Firestore realtime listeners, with polling fallback if a browser cannot attach a listener.
- Live session documents contain only public question text/options. Answer keys live in `live_answer_keys/{sessionId}` and are readable only by the teacher who owns the session.
- Live responses are immutable after creation: the first submitted answer for each student/question is the one counted.
- Live response listeners/read fallbacks are bounded at 2,500 rows, enough for a 200-student class across 10 live questions with operational margin.
- Starting a new live challenge closes older open live sessions for the same class.
- Firestore rules reject live responses after `question_deadline_ms`; current scoring is still computed in the teacher client from private answer keys. For high-stakes anti-cheat, move authoritative scoring to a trusted backend such as Cloud Functions.
