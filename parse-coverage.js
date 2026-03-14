const fs = require('fs');
const path = require('path');

const coveragePath = path.join(__dirname, 'coverage/report/coverage-final.json');
const raw = fs.readFileSync(coveragePath, 'utf8');
const coverage = JSON.parse(raw);

const results = [];

for (const [filePath, data] of Object.entries(coverage)) {
    // Normalize path separators
    const normalized = filePath.replace(/\\/g, '/');
    if (!normalized.includes('/src/') || normalized.includes('/node_modules/') || normalized.includes('/.vscode-test/')) {
        continue;
    }
    const statements = data.s;
    const totalStatements = Object.keys(statements).length;
    const coveredStatements = Object.values(statements).filter(v => v > 0).length;
    const statementCoverage = totalStatements === 0 ? 100 : (coveredStatements / totalStatements) * 100;
    if (statementCoverage < 80) {
        results.push({
            filePath: normalized,
            statementCoverage: statementCoverage.toFixed(2),
            totalStatements,
            coveredStatements
        });
    }
}

results.sort((a, b) => a.statementCoverage - b.statementCoverage);

console.log(`Found ${results.length} files with coverage < 80%:`);
for (const r of results.slice(0, 30)) {
    console.log(`${r.filePath}: ${r.statementCoverage}% (${r.coveredStatements}/${r.totalStatements})`);
}
if (results.length > 30) {
    console.log(`... and ${results.length - 30} more`);
}