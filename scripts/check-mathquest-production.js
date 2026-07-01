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

mustMatch("config.js", /const MQ_LIMITS = Object\.freeze\(/, "must define central production read limits");
mustMatch("config.js", /function mqDefaultLimit\(/, "must enforce default Firestore query limits");
mustMatch("config.js", /live_sessions:\s*'live_sessions'/, "adapter must expose live session storage");
mustMatch("config.js", /live_responses:\s*'live_responses'/, "adapter must expose live response storage");
mustMatch("config.js", /liveSessions:\s*10/, "live session reads must be bounded");
mustMatch("config.js", /liveResponses:\s*1000/, "live response reads must be bounded");
mustMatch("config.js", /where\('class_code',\s*'==',\s*code\)/, "leaderboard must query progress by class_code");
mustMatch("config.js", /\.limit\(MQ_LIMITS\.leaderboard\)/, "leaderboard must be bounded");
mustMatch("config.js", /teacher_id:\s*cls\.teacher_id/, "class membership must persist teacher_id for scalable rules");

mustMatch("script.js", /class_code:\s*state\.classCode\s*\|\|\s*''/, "progress saves must include class_code");
mustMatch("script.js", /select\('nickname, xp, stars, achievements, class_code'\)/, "remote progress load must restore class_code");
mustMatch("script.js", /teacher_unlocks'\)\.select\('region'\)\.eq\('user_id', state\.userId\)\.limit\(500\)/, "teacher unlock reads must be bounded");
mustMatch("script.js", /localStorage\.setItem\('mq_class_code', codeRaw\);\s*await persistAwait\(\);/s, "joining a class must flush progress with class_code");

mustMatch("index.html", /class_members'\)\.select\('user_id, joined_at'\)\.eq\('class_code', code\)\.limit\(200\)/, "roster membership reads must be bounded");
mustMatch("index.html", /mathquest_progress'\)\.select\('user_id, nickname, xp, stars, achievements, updated_at'\)\.eq\('class_code', code\)\.limit\(200\)/, "teacher roster progress reads must be class-scoped and bounded");

mustMatch("firestore.rules", /function validMqProgress\(/, "rules must validate MathQuest progress schema");
mustMatch("firestore.rules", /function mqProgressClassBindingValid\(/, "rules must validate progress-to-class membership");
mustMatch("firestore.rules", /function mqProgressClassVisible\(/, "rules must allow class-scoped leaderboard reads");
mustMatch("firestore.rules", /function mqProgressVisibleToTeacher\(/, "teacher progress reads must be class-scoped");
mustMatch("firestore.rules", /function validMqClassMember\(/, "rules must validate class membership schema");
mustMatch("firestore.rules", /data\.teacher_id == get\(/, "class membership teacher_id must match the class owner");
mustMatch("firestore.rules", /function validMqClassMessage\(/, "rules must validate class message schema");
mustMatch("firestore.rules", /mqString\(data\.message, 1, 500\)/, "class messages must stay within the UI limit");
mustMatch("firestore.rules", /function validMqLiveSession\(/, "rules must validate live session schema");
mustMatch("firestore.rules", /function validMqLiveResponse\(/, "rules must validate live response schema");
mustMatch("firestore.rules", /match \/live_sessions\/\{sessionId\}/, "rules must protect live sessions");
mustMatch("firestore.rules", /match \/live_responses\/\{responseId\}/, "rules must protect live responses");
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
