// Inlines dev.html + _gen/*.js into a single self-contained index.html
const fs = require('fs');
const path = require('path');
const dir = __dirname;

let html = fs.readFileSync(path.join(dir, 'dev.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = fs.readFileSync(path.join(dir, src), 'utf8');
  return '<script>\n/* ===== ' + src + ' ===== */\n' + code + '\n</script>';
});
fs.writeFileSync(path.join(dir, 'index.html'), html);
console.log('index.html written:', (html.length / 1024).toFixed(1) + ' KB');
