const fs = require('fs');
const path = require('path');

const coveragePath = path.join(__dirname, 'coverage/report/coverage-final.json');
const raw = fs.readFileSync(coveragePath, 'utf8');
const coverage = JSON.parse(raw);

const excludePatterns = [
    /node_modules/,
    /\.vscode-test/,
    /src\/test\/e2e/,
    /src\/test\/suite/,
    /src\/interfaces/,
    /src\/types/,
    /src\/schemas\/index\.ts/,
    /src\/commands\/move-ticket\.ts/,
    /src\/commands\/show-dependencies\.ts/,
];

const files = [];

for (const [filePath, data] of Object.entries(coverage)) {
    const normalized = filePath.replace(/\\/g, '/');
    if (!normalized.includes('/src/')) {
        continue;
    }
    if (excludePatterns.some(p => p.test(normalized))) {
        continue;
    }
    const statements = data.s;
    const totalStatements = Object.keys(statements).length;
    const coveredStatements = Object.values(statements).filter(v => v > 0).length;
    const statementCoverage = totalStatements === 0 ? 100 : (coveredStatements / totalStatements) * 100;
    
    let lineCoverage = 100;
    if (data.l) {
        const lines = data.l;
        const totalLines = Object.keys(lines).length;
        const coveredLines = Object.values(lines).filter(v => v > 0).length;
        lineCoverage = totalLines === 0 ? 100 : (coveredLines / totalLines) * 100;
    }
    
    files.push({
        filePath: normalized,
        statementCoverage,
        lineCoverage,
        totalStatements,
        coveredStatements,
    });
}

console.log(`Total files analyzed: ${files.length}`);
console.log('\nFiles with coverage < 100%:');
const lowFiles = files.filter(f => f.statementCoverage < 100);
lowFiles.sort((a, b) => a.statementCoverage - b.statementCoverage);
for (const f of lowFiles.slice(0, 30)) {
    console.log(`${f.filePath}: statements ${f.statementCoverage.toFixed(2)}% (${f.coveredStatements}/${f.totalStatements})`);
}
if (lowFiles.length > 30) {
    console.log(`... and ${lowFiles.length - 30} more`);
}

const totalStatements = files.reduce((sum, f) => sum + f.totalStatements, 0);
const coveredStatements = files.reduce((sum, f) => sum + f.coveredStatements, 0);
const overallStatementCoverage = totalStatements === 0 ? 0 : (coveredStatements / totalStatements) * 100;
console.log(`\nOverall statement coverage (excluding excluded files): ${overallStatementCoverage.toFixed(2)}% (${coveredStatements}/${totalStatements})`);

console.log('\nFiles with coverage < 80%:');
const veryLow = lowFiles.filter(f => f.statementCoverage < 80);
for (const f of veryLow) {
    console.log(`${f.filePath}: ${f.statementCoverage.toFixed(2)}%`);
}