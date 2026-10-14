// Load named top-level functions and constants out of server-full.js without starting the server,
// so matching and file-picking logic can be tested on real data. Usage:
//   const fns = require('./extract')(['pickEpisodeFile', ...], ['MEDIA_EXT', ...]);
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function extract(names, consts = [], file = path.join(__dirname, '..', 'server-full.js')) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    const pieces = [];
    const grab = (startRe) => {
        const i = lines.findIndex(l => startRe.test(l));
        if (i < 0) return false;
        // a one-line definition ends on its own line; otherwise at the first "}" / "};" in column 0
        if (/;\s*(\/\/.*)?$/.test(lines[i]) && !/[{(\[]\s*(\/\/.*)?$/.test(lines[i])) { pieces.push(lines[i]); return true; }
        let j = i;
        while (j < lines.length && !/^(}|};|\]\);|\);)\s*$/.test(lines[j])) j++;
        pieces.push(lines.slice(i, j + 1).join('\n'));
        return true;
    };
    for (const c of consts) if (!grab(new RegExp(`^const ${c}\\b`))) throw new Error('const not found: ' + c);
    const missing = [];
    for (const n of names) {
        if (!grab(new RegExp(`^(async )?function ${n}\\(`)) && !grab(new RegExp(`^const ${n} = `))) missing.push(n);
    }
    if (missing.length) throw new Error('not found: ' + missing.join(', '));
    const ctx = { console: { log() {}, error() {} }, module: {} };
    vm.createContext(ctx);
    vm.runInContext(pieces.join('\n') + `\nmodule.exports = { ${[...names, ...consts].join(', ')} };`, ctx);
    return ctx.module.exports;
};
