const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cat > /root/watchdog-dungclaude.sh <<'WDEOF'
#!/bin/bash
# Self-healing guard + forensic stack capture on wedge.
if ! curl -s -o /dev/null -m 10 http://127.0.0.1:3000/; then
  echo "[$(date -u)] HEALTH FAIL -> capturing stack then restarting" >> /root/watchdog.log
  PID=$(pgrep -f "next-server" | head -1)
  if [ -n "$PID" ]; then
    kill -USR1 $PID 2>/dev/null
    sleep 1
    node /tmp/stackdump.js > /root/wedge-stack-$(date +%H%M%S).txt 2>&1
    cat /root/wedge-stack-*.txt | tail -20 >> /root/watchdog.log
  fi
  pm2 restart dungclaude --update-env >/dev/null 2>&1
fi
WDEOF
    chmod +x /root/watchdog-dungclaude.sh;
    echo "=== watchdog upgraded with stack capture ===";
    crontab -l | grep watchdog;
    echo "=== current health ===";
    curl -s -o /dev/null -m 10 -w "local http=%{http_code}\\n" http://127.0.0.1:3000/;
    curl -s -o /dev/null -m 20 -w "public http=%{http_code}\\n" https://dungclaude.site/;
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
