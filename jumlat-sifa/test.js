let data;
if (typeof require === 'function') {
  const ctx = { window: {} };
  require('vm').runInNewContext(require('fs').readFileSync(__dirname + '/data.js', 'utf8'), ctx);
  data = ctx.window.JUMLAT_SIFA;
} else {
  data = window.JUMLAT_SIFA;
}
const { items } = data;
let fails = 0;
const ids = new Set();
function check(cond, id, msg) { if (!cond) { fails++; console.log('FAIL', id, msg); } }
for (const it of items) {
  const n = it.tokens.length;
  check(!ids.has(it.id), it.id, 'duplicate id');
  ids.add(it.id);
  check(it.level === 1 || it.level === 2, it.id, 'bad level');
  check(0 <= it.mawsuf_index && it.mawsuf_index < it.clause_start && it.clause_start <= it.clause_end && it.clause_end < n, it.id, 'index order');
  if (it.level === 1) {
    check(it.rabit.type === 'hidden', it.id, 'rabit type');
    check(it.rabit.index === it.clause_start, it.id, 'rabit index');
  } else {
    check(it.rabit.type === 'suffix', it.id, 'rabit type');
    check(it.clause_start <= it.rabit.index && it.rabit.index <= it.clause_end, it.id, 'rabit index range');
    check(it.tokens[it.rabit.index].slice(it.rabit.suffix_offset).startsWith(it.rabit.suffix), it.id, 'suffix mismatch');
  }
}
console.log(items.length + ' items checked, ' + fails + ' failures');
if (typeof process !== 'undefined') process.exit(fails ? 1 : 0);
