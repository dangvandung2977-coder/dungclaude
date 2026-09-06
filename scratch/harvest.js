const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    date -u;
    echo "=== WATCHDOG LOG (tail 10) ==="; tail -10 /root/watchdog.log;
    echo "=== WEDGE STACK FILES ==="; ls -la /root/wedge-stack-*.txt 2>/dev/null && cat /root/wedge-stack-*.txt | tail -30;
    echo "=== CPU PROFILES ==="; ls -la /tmp/prof/ 2>/dev/null;
    echo "=== HEALTH NOW ===";
    curl -s -o /dev/null -m 8 -w "local http=%{http_code} time=%{time_total}s\\n" http://127.0.0.1:3000/;
    ps -o %cpu=,time= -p $(pgrep -f "next-server" | head -1) 2>/dev/null;
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
