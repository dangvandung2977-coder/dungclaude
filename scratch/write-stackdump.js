const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `cat > /tmp/stackdump.js <<'SDEOF'
const WebSocket = require('/var/www/dungclaude/node_modules/ws');
async function main() {
  const list = await fetch('http://127.0.0.1:9229/json/list').then(r => r.json());
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise(res => ws.on('open', res));
  let id = 0; const pending = new Map(); const events = [];
  const send = (method, params) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } if (m.method) events.push(m); });
  await send('Debugger.enable');
  await send('Debugger.pause');
  await new Promise(r => setTimeout(r, 5000));
  const ev = events.find(e => e.method === 'Debugger.paused');
  if (!ev) { console.log('NO PAUSE EVENT (blocked in native code)'); process.exit(0); }
  console.log('PAUSE REASON:', ev.params.reason);
  for (const f of ev.params.callFrames.slice(0, 14)) {
    const loc = f.location;
    console.log('  at', f.functionName || '(anon)', '->', (f.url || '').split('/').slice(-1)[0] + ':' + loc.lineNumber + ':' + loc.columnNumber);
  }
  process.exit(0);
}
main().catch(e => { console.error('STACK FAIL:', e.message); process.exit(1); });
SDEOF
echo "stackdump.js written: $(wc -l < /tmp/stackdump.js) lines";`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => { out += d.toString(); });
    stream.stderr.on('data', d => { out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).connect({
  host: '103.249.117.202',
  port: 24534,
  username: 'root',
  password: 'Vinhphuc373@'
});
