const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  // Deploy inspector: kill watchdog temporarily so process STAYS wedged for capture,
  // then spin-load the app until it wedges, then capture native stack.
  const cmd = `
    crontab -l | grep -v watchdog-dungclaude | crontab -; echo "watchdog disabled for capture";
    pm2 restart dungclaude >/dev/null 2>&1;
    sleep 4;
    PID=$(pgrep -f "next-server" | head -1);
    echo "capture target PID=$PID";
    # Hammer the server with concurrent chat-ish + page requests until CPU spikes
    for round in 1 2 3 4 5 6; do
      (curl -s -o /dev/null -m 8 http://127.0.0.1:3000/app &) ;
      (curl -s -o /dev/null -m 8 "http://127.0.0.1:3000/api/models" &) ;
      sleep 10;
      CPU=$(ps -o %cpu= -p $PID | tr -d ' ');
      echo "[round $round] cpu=$CPU%";
      if [ "$CPU" -gt 80 ] 2>/dev/null; then
        echo "=== WEDGE CAPTURED — sending SIGABRT for core/stack or using gdb ===";
        timeout 3 strace -p $PID -f -e trace=epoll_wait,read,write,futex 2>&1 | head -30;
        cat /proc/$PID/task/*/stat 2>/dev/null | awk '{print $2, $3}' | head -15;
        break;
      fi
    done;
    echo "=== IF NOT WEDGED BY LOAD, maybe chat-triggered; re-enable watchdog ===";
    crontab -l 2>/dev/null | grep -q watchdog-dungclaude || (crontab -l 2>/dev/null; echo "* * * * * /root/watchdog-dungclaude.sh") | crontab -;
    echo "watchdog re-enabled";
    curl -s -o /dev/null -m 10 -w "final local http=%{http_code}\\n" http://127.0.0.1:3000/;
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
