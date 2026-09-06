const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    pm2 restart dungclaude;
    sleep 5;
    curl -s -o /dev/null -m 15 -w "local http=%{http_code} time=%{time_total}s\\n" http://127.0.0.1:3000/;
    curl -s -o /dev/null -m 20 -w "public http=%{http_code} time=%{time_total}s\\n" https://dungclaude.site/;
    echo "=== WHO CALLED 100% CPU BEFORE KILL (js stack via SIGUSR1 not avail; take top) ===";
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '103.249.117.202',
  port: 24534,
  username: 'root',
  password: 'Vinhphuc373@'
});
