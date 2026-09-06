const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== count requests in 45s (access log via strace-free method: PM2 http?) ===";
    # Next doesn't log requests; count established conns + new conns via ss snapshots
    for i in 1 2 3 4 5; do
      TS=$(date -u +%H:%M:%S);
      NC=$(ss -tn state established '( sport = :3000 )' | tail -n +2 | wc -l);
      # also count TIME_WAIT (recently closed) as request-rate proxy
      TW=$(ss -tn state time-wait '( sport = :3000 )' | tail -n +2 | wc -l);
      echo "[$TS] established=$NC time_wait=$TW";
      sleep 9;
    done;
    echo "=== recent out log for request burst patterns ===";
    tail -20 /root/.pm2/logs/dungclaude-out.log | grep -iE "GET|POST|api" | tail -10 || echo "no request lines";
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
