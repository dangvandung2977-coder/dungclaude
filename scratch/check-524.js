const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    date -u;
    echo "=== WATCHDOG LOG (all) ==="; cat /root/watchdog.log 2>/dev/null || echo "empty";
    echo "=== PM2 RESTART COUNT ==="; pm2 ls | grep dungclaude;
    echo "=== CPU NOW ==="; ps -o %cpu=,time= -p $(pgrep -f "next-server" | head -1);
    echo "=== HEALTH ===";
    curl -s -o /dev/null -m 10 -w "local http=%{http_code} time=%{time_total}s\n" http://127.0.0.1:3000/;
    curl -s -o /dev/null -m 20 -w "public http=%{http_code} time=%{time_total}s\n" https://dungclaude.site/;
  `;
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
