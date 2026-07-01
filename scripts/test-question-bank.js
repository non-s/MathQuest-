/**
 * test-question-bank.js
 * Validates all logic reasoning questions in script.js:
 *   - Each question has stem, options (4), correctIndex (0-3), explain
 *   - correctIndex is in range [0,3]
 *   - options has exactly 4 items
 *   - 201 phases defined, covering regions 1-10
 *   - REGIONS array has 10 entries covering [1,201]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'script.js');
const src = fs.readFileSync(scriptPath, 'utf8');

// ── helpers ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function ok(condition, msg) {
    if (condition) { passed++; }
    else { failed++; console.error('  FAIL:', msg); }
}

// ── extract BANK arrays ───────────────────────────────────────────────────────
// Eval the bank arrays in a minimal sandbox
const sandbox = { shuffle: (a) => a, rand: () => 0, state: {}, console };
const bankMatch = src.match(/const BANK_R(\d+) = \[([\s\S]*?)\];/g);
ok(bankMatch && bankMatch.length === 10, `Found 10 BANK arrays (found ${bankMatch ? bankMatch.length : 0})`);

// Parse each bank by evaluating in a safe scope
const banks = {};
if (bankMatch) {
    bankMatch.forEach(block => {
        const idMatch = block.match(/BANK_R(\d+)/);
        const rid = idMatch ? parseInt(idMatch[1]) : null;
        if (!rid) return;
        try {
            const fn = new Function('return ' + block.replace(/^const BANK_R\d+ = /, '').replace(/;$/, ''));
            banks[rid] = fn();
        } catch (e) {
            ok(false, `BANK_R${rid} parse error: ${e.message}`);
            banks[rid] = [];
        }
    });
}

// ── validate each question in each bank ──────────────────────────────────────
Object.entries(banks).forEach(([rid, bank]) => {
    ok(bank.length >= 20, `BANK_R${rid} has >= 20 questions (has ${bank.length})`);
    bank.forEach((q, qi) => {
        const prefix = `R${rid}[${qi}]`;
        ok(typeof q.stem === 'string' && q.stem.length > 5,
            `${prefix} stem missing or too short`);
        ok(Array.isArray(q.options) && q.options.length === 4,
            `${prefix} options must be array of 4 (has ${q.options ? q.options.length : 'none'})`);
        ok(typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3,
            `${prefix} correctIndex must be 0-3 (is ${q.correctIndex})`);
        ok(typeof q.options[q.correctIndex] === 'string' && q.options[q.correctIndex].length > 0,
            `${prefix} correct option must be non-empty string`);
    });
});

// ── validate PHASES section ───────────────────────────────────────────────────
// Extract PHASES array definition (simple approach: count id: entries)
const phaseMatches = src.match(/\{ id:\s*\d+, region: \d+/g);
ok(phaseMatches && phaseMatches.length === 201,
    `201 phases defined (found ${phaseMatches ? phaseMatches.length : 0})`);

// Check phase IDs 1-201 are all present
if (phaseMatches) {
    const ids = phaseMatches.map(m => parseInt(m.match(/id:\s*(\d+)/)[1]));
    for (let i = 1; i <= 201; i++) {
        ok(ids.includes(i), `Phase id ${i} missing`);
    }
}

// ── validate REGIONS ─────────────────────────────────────────────────────────
const regionMatch = src.match(/const REGIONS = \[([\s\S]*?)\];/);
ok(regionMatch !== null, 'REGIONS array found');
if (regionMatch) {
    const regionCount = (regionMatch[0].match(/id: \d+/g) || []).length;
    ok(regionCount === 10, `REGIONS has 10 entries (found ${regionCount})`);
}

// ── check timer functions present ────────────────────────────────────────────
ok(src.includes('function startTimer()'), 'startTimer() function present');
ok(src.includes('function stopTimer()'), 'stopTimer() function present');
ok(src.includes('startTimer()') && src.match(/startTimer\(\)/g).length >= 2,
    'startTimer() called at least twice (definition + renderQuestion)');
ok(src.includes('stopTimer()') && src.match(/stopTimer\(\)/g).length >= 2,
    'stopTimer() called at least twice (definition + answer)');

// ── check "Painel do Aluno" button in index.html ──────────────────────────────
const htmlPath = path.join(__dirname, '..', 'index.html');
if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    ok(html.includes('Painel do Aluno'), '"Painel do Aluno" button present in index.html');
    ok(html.includes('qTimer'), 'Timer HTML (#qTimer) present in index.html');
}

// ── check timer CSS ───────────────────────────────────────────────────────────
const cssPath = path.join(__dirname, '..', 'style.css');
if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    ok(css.includes('.q-timer'), '.q-timer CSS present in style.css');
    ok(css.includes('.urgent'), '.urgent CSS present for timer warning');
}

// ── summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error('Some checks failed!'); process.exit(1); }
else { console.log('All checks passed!'); }
