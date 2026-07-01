const fs = require("fs");
const path = require("path");

const root = process.cwd();
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function mustMatch(relPath, pattern, message) {
  const text = read(relPath);
  if (!pattern.test(text)) failures.push(`${relPath}: ${message}`);
}

function mustNotMatch(relPath, pattern, message) {
  const text = read(relPath);
  if (pattern.test(text)) failures.push(`${relPath}: ${message}`);
}

mustMatch("config.js", /const MQ_LIMITS = Object\.freeze\(/, "must define central production read limits");
mustMatch("config.js", /function mqDefaultLimit\(/, "must enforce default Firestore query limits");
mustMatch("config.js", /Cadastro publico de professores desativado/, "teacher signup must stay disabled in the client adapter");
mustNotMatch("config.js", /createUserWithEmailAndPassword/, "client adapter must not create teacher accounts directly");
mustMatch("config.js", /live_sessions:\s*'live_sessions'/, "adapter must expose live session storage");
mustMatch("config.js", /live_answer_keys:\s*'live_answer_keys'/, "adapter must expose private live answer keys");
mustMatch("config.js", /live_responses:\s*'live_responses'/, "adapter must expose live response storage");
mustMatch("config.js", /liveSessions:\s*10/, "live session reads must be bounded");
mustMatch("config.js", /liveResponses:\s*1000/, "live response reads must be bounded");
mustMatch("config.js", /watchClassSessions\(classCode, onRows, onError\)/, "live sessions must use realtime class listeners");
mustMatch("config.js", /watchSessionResponses\(sessionId, onRows, onError\)/, "live responses must use realtime response listeners");
mustMatch("config.js", /\.onSnapshot\(/, "live classroom mode must use Firestore realtime listeners");
mustMatch("config.js", /\.create\(payload\)/, "deterministic inserts must use Firestore create to avoid overwrites");
mustMatch("config.js", /where\('class_code',\s*'==',\s*code\)/, "leaderboard must query progress by class_code");
mustMatch("config.js", /\.limit\(MQ_LIMITS\.leaderboard\)/, "leaderboard must be bounded");
mustMatch("config.js", /teacher_id:\s*cls\.teacher_id/, "class membership must persist teacher_id for scalable rules");

mustMatch("script.js", /class_code:\s*state\.classCode\s*\|\|\s*''/, "progress saves must include class_code");
mustMatch("script.js", /select\('nickname, xp, stars, achievements, class_code'\)/, "remote progress load must restore class_code");
mustMatch("script.js", /teacher_unlocks'\)\.select\('region'\)\.eq\('user_id', state\.userId\)\.limit\(500\)/, "teacher unlock reads must be bounded");
mustMatch("script.js", /localStorage\.setItem\('mq_class_code', codeRaw\);\s*await persistAwait\(\);/s, "joining a class must flush progress with class_code");
mustMatch("script.js", /function startLiveSessionWatch\(/, "students must attach a live session watcher");
mustMatch("script.js", /mqLive\.watchClassSessions/, "student live mode must subscribe to class sessions");
mustMatch("script.js", /function liveQuestionRemainingSeconds\(/, "student live mode must render question countdowns");
mustMatch("script.js", /mqLiveStudentCountdown/, "student live modal must show the question countdown");
mustMatch("script.js", /function submitLiveAnswer\([\s\S]*liveQuestionExpired\(session\)/, "student live answers must be blocked after the visible deadline");
mustMatch("script.js", /live_responses'\)\.insert\(/, "student live answers must be first-write-only inserts");

mustMatch("index.html", /class_members'\)\.select\('user_id, joined_at'\)\.eq\('class_code', code\)\.limit\(200\)/, "roster membership reads must be bounded");
mustMatch("index.html", /mathquest_progress'\)\.select\('user_id, nickname, xp, stars, achievements, updated_at'\)\.eq\('class_code', code\)\.limit\(200\)/, "teacher roster progress reads must be class-scoped and bounded");
mustNotMatch("index.html", /id="tabSignup"|Criar conta/, "teacher panel must not expose public signup");
mustMatch("index.html", /id="liveScoreboard"/, "live classroom mode must render a teacher scoreboard");
mustMatch("index.html", /function renderLiveScoreboard\(/, "live classroom mode must aggregate session scores");
mustMatch("index.html", /mqLive\.watchSessionResponses/, "teacher live scoreboard must subscribe to session responses");
mustMatch("index.html", /function closeExistingLiveSessions\(classCode\)/, "teacher live mode must close stale sessions before starting another");
mustMatch("index.html", /await closeExistingLiveSessions\(currentClassCode\);/, "starting a live session must enforce one active session per class");
mustMatch("index.html", /live_answer_keys'\)\.insert\(/, "teacher live mode must store answer keys outside public sessions");
mustMatch("index.html", /id="liveDurationSelect"/, "teacher live mode must allow a per-question timer");
mustMatch("index.html", /question_duration_sec:\s*questionDurationSec/, "live sessions must persist the per-question duration");
mustMatch("index.html", /question_deadline_at:\s*liveQuestionDeadlineAt/, "live sessions must persist question deadlines");
mustMatch("index.html", /function renderProjectorLive\(/, "projector mode must render live classroom questions");
mustMatch("index.html", /id="projLive"/, "projector overlay must include a live challenge region");
mustMatch("index.html", /currentLiveRows\.filter\(row => row\.question_index === qIndex\)/, "projector live view must aggregate current question responses");
mustNotMatch("index.html", /correctIndex:\s*Number/, "public live session payload must not include correct answers");
mustNotMatch("index.html", /score_delta/, "teacher scoreboard must compute scores from private answer keys, not persisted student scores");

mustMatch("firestore.rules", /function validMqProgress\(/, "rules must validate MathQuest progress schema");
mustMatch("firestore.rules", /match \/profiles\/\{userId\}[\s\S]*allow create: if false;/, "teacher profiles must not be publicly creatable");
mustMatch("firestore.rules", /function mqProgressClassBindingValid\(/, "rules must validate progress-to-class membership");
mustMatch("firestore.rules", /function mqProgressClassVisible\(/, "rules must allow class-scoped leaderboard reads");
mustMatch("firestore.rules", /function mqProgressVisibleToTeacher\(/, "teacher progress reads must be class-scoped");
mustMatch("firestore.rules", /function validMqClassMember\(/, "rules must validate class membership schema");
mustMatch("firestore.rules", /data\.teacher_id == get\(/, "class membership teacher_id must match the class owner");
mustMatch("firestore.rules", /function validMqClassMessage\(/, "rules must validate class message schema");
mustMatch("firestore.rules", /mqString\(data\.message, 1, 500\)/, "class messages must stay within the UI limit");
mustMatch("firestore.rules", /function validMqLiveSession\(/, "rules must validate live session schema");
mustMatch("firestore.rules", /function validMqLiveAnswerKey\(/, "rules must validate private live answer keys");
mustMatch("firestore.rules", /function validMqLiveResponse\(/, "rules must validate live response schema");
mustMatch("firestore.rules", /function mqOptionalLiveDuration\(/, "rules must validate live question timer bounds");
mustMatch("firestore.rules", /question_deadline_at/, "rules must allow validated live question deadlines");
mustMatch("firestore.rules", /match \/live_sessions\/\{sessionId\}/, "rules must protect live sessions");
mustMatch("firestore.rules", /match \/live_answer_keys\/\{sessionId\}[\s\S]*allow read: if mqLiveSessionOwnedByTeacher\(sessionId\);/, "live answer keys must be teacher-only");
mustMatch("firestore.rules", /match \/live_responses\/\{responseId\}/, "rules must protect live responses");
mustMatch("firestore.rules", /match \/live_responses\/\{responseId\}[\s\S]*allow update, delete: if false;/, "live responses must be immutable after creation");
mustNotMatch("firestore.rules", /'correct'|'score_delta'/, "live responses must not trust student-submitted scoring fields");
mustMatch("firestore.indexes.json", /"collectionGroup": "live_sessions"/, "indexes must support live session lookups");
mustMatch("firestore.indexes.json", /"collectionGroup": "live_responses"/, "indexes must support live response aggregation");

mustMatch(".github/workflows/quality.yml", /check-mathquest-production\.js/, "quality workflow must run MathQuest production checks");
mustMatch("scripts/check-repo-contracts.js", /check-mathquest-production\.js/, "repo contracts must require MathQuest production checks");

if (failures.length) {
  console.error("MATHQUEST_PRODUCTION_CHECK_FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MATHQUEST_PRODUCTION_CHECK_OK");
