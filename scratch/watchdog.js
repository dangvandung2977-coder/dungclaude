const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== WATCHDOG SETUP: log CPU + active chat requests every 10s for 3 min ===";
    PID=$(pgrep -f "next-server" | head -1);
    for i in $(seq 1 18); do
      CPU=$(ps -o %cpu= -p $PID | tr -d ' ');
      TS=$(date -u +%H:%M:%S);
      # count established conns
      NC=$(ss -tn state established '( sport = :3000 )' | tail -n +2 | wc -l);
      echo "[$TS] cpu=$CPU% conns=$NC";
      if [ "$CPU" -gt 85 ] 2>/dev/null; then
        echo "!!! SPIKE DETECTED — capturing stack via /proc ===";
        cat /proc/$PID/stack 2>/dev/null | head -10;
        # capture what fds are busy
        timeout 2 strace -p $PID -f -e trace=read,write,epoll_wait 2>&1 | head -20;
        break;
      fi
      sleep 10;
    done;
    echo "=== FINAL HEALTH ===";
    curl -s -o /dev/null -m 10 -w "local http=%{http_code}\\n" http://127.0.0.1:3000/;
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
