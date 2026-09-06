const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    date -u;
    echo "=== PM2 (uptime / restarts) ==="; pm2 ls | grep -E "dungclaude|cf-tunnel";
    echo "=== next-server start time ==="; ps -o pid,lstart,time,cmd -p $(pgrep -f "next-server" | head -1);
    echo "=== OUT LOG around image gen (last 30) ==="; tail -30 /root/.pm2/logs/dungclaude-out.log;
    echo "=== ERROR LOG (last 15) ==="; tail -15 /root/.pm2/logs/dungclaude-error.log;
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
