const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    PID=$(pgrep -f "next-server" | head -1);
    kill -USR1 $PID; sleep 1;
    crontab -l | grep -v watchdog-dungclaude | crontab -; echo "[watchdog OFF]";
    TOKEN=$(cat /tmp/token.txt);
    (timeout 70 curl -s -N -X POST http://127.0.0.1:3000/api/chat/stream \\
      -H "Content-Type: application/json" \\
      -H "Cookie: lumen_session=$TOKEN" \\
      -d '{"conversationId":"conv_mtp7f94tjig7w074","content":"tiếp tục phần còn lại","modelId":"custom:ce_mtmbnc0i0500nkht:glm-5.3-flash"}' \\
      -o /tmp/chat3.txt > /tmp/chat3-status.txt 2>&1 &);
    echo "chat fired, polling health every 5s x 48 (4 min)...";
    WEDGED=0;
    for i in $(seq 1 48); do
      sleep 5;
      H=$(curl -s -o /dev/null -m 4 -w "%{http_code}" http://127.0.0.1:3000/ || echo 000);
      CPU=$(ps -o %cpu= -p $PID | tr -d ' ');
      if [ "$H" = "000" ]; then
        echo "[t+$((i*5))s] WEDGE! health=$H cpu=$CPU% — dumping stack";
        node /tmp/stackdump.js;
        WEDGED=1;
        break;
      fi
      if [ $((i % 6)) -eq 0 ]; then echo "[t+$((i*5))s] ok cpu=$CPU%"; fi
    done;
    cat /tmp/chat3-status.txt 2>/dev/null;
    if [ "$WEDGED" = "0" ]; then echo "NO WEDGE in 4 min"; fi;
    echo "[re-enabling watchdog]";
    (crontab -l 2>/dev/null; echo "* * * * * /root/watchdog-dungclaude.sh") | crontab -;
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
