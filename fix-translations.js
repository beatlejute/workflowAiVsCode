const fs = require('fs');

// Read English bundle
const enBundle = JSON.parse(fs.readFileSync('l10n/bundle.l10n.json', 'utf-8'));

// Fix language bundle files
const bundleFiles = [
  'l10n/bundle.l10n.de.json',
  'l10n/bundle.l10n.fr.json',
  'l10n/bundle.l10n.es.json',
  'l10n/bundle.l10n.it.json',
  'l10n/bundle.l10n.ja.json',
  'l10n/bundle.l10n.ko.json',
  'l10n/bundle.l10n.zh-cn.json',
  'l10n/bundle.l10n.zh-tw.json',
  'l10n/bundle.l10n.pt-br.json'
];

for (const f of bundleFiles) {
  const langBundle = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const missing = Object.keys(enBundle).filter(k => !(k in langBundle));
  if (missing.length === 0) { console.log(f + ': no missing keys'); continue; }
  for (const k of missing) {
    langBundle[k] = enBundle[k];
  }
  fs.writeFileSync(f, JSON.stringify(langBundle, null, 2) + '\n', 'utf-8');
  console.log(f + ': added ' + missing.length + ' keys');
}

// Read English NLS
const enNls = JSON.parse(fs.readFileSync('package.nls.json', 'utf-8'));

// Fix NLS files
const nlsFiles = [
  'package.nls.de.json',
  'package.nls.es.json',
  'package.nls.fr.json',
  'package.nls.it.json',
  'package.nls.ja.json',
  'package.nls.ko.json',
  'package.nls.pt-br.json',
  'package.nls.pt.json',
  'package.nls.zh-cn.json',
  'package.nls.zh-tw.json',
  'package.nls.zh.json',
  'package.nls.ru.json'
];

for (const f of nlsFiles) {
  if (!fs.existsSync(f)) { console.log(f + ': not found, skipping'); continue; }
  const langNls = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const missing = Object.keys(enNls).filter(k => !(k in langNls));
  if (missing.length === 0) { console.log(f + ': no missing keys'); continue; }
  for (const k of missing) {
    langNls[k] = enNls[k];
  }
  fs.writeFileSync(f, JSON.stringify(langNls, null, 2) + '\n', 'utf-8');
  console.log(f + ': added ' + missing.length + ' keys');
}

console.log('Done!');
