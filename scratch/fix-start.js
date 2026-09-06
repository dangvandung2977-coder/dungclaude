const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== restart WITHOUT profiler (keep watchdog) ===";
    pm2 delete dungclaude >/dev/null 2>&1;
    cd /var/www/dungclaude && pm2 start npm --name dungclaude -- start -- -p 3000;
    pm2 save >/dev/null 2>&1;
    rm -rf /tmp/prof/*.cpuprofile 2>/dev/null;
    sleep 8;
    curl -s -o /dev/null -m 10 -w "local http=%{http_code}\\n" http://127.0.0.1:3000/;
    curl -s -o /dev/null -m 20 -w "public http=%{http_code}\\n" https://dungclaude.site/;
    pm2 ls | grep dungclaude;
    echo "=== crontab ==="; crontab -l | grep watchdog;
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
