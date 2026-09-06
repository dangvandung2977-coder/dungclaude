const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    PID=$(pgrep -f "next-server" | head -1);
    kill -USR1 $PID; sleep 1;
    crontab -l | grep -v watchdog-dungclaude | crontab -; echo "[watchdog OFF]";
    (node /tmp/profile.js > /tmp/profile-out.txt 2>&1 &);
    sleep 2;
    TOKEN=$(cat /tmp/token.txt);
    echo "=== SEND CHAT with minted cookie (87k-char conv) ===";
    timeout 50 curl -s -N -X POST http://127.0.0.1:3000/api/chat/stream \
      -H "Content-Type: application/json" \
      -H "Cookie: lumen_session=$TOKEN" \
      -d '{"conversationId":"conv_mtp7f94tjig7w074","content":"ê thử phát xem có wedge không","modelId":"custom:ce_mtmbnc0i0500nkht:glm-5.3-flash"}' \
      -o /tmp/chat-repro.txt -w "chat http=%{http_code} time=%{time_total}s\n" || echo "CHAT TIMED OUT";
    head -c 400 /tmp/chat-repro.txt; echo;
    echo "=== CPU NOW (after chat) ==="; ps -o %cpu= -p $PID;
    sleep 30;
    echo "=== CPU AGAIN ==="; ps -o %cpu= -p $PID;
    echo "=== PROFILE RESULT ==="; cat /tmp/profile-out.txt;
    echo "[re-enabling watchdog]";
    (crontab -l 2>/dev/null; echo "* * * * * /root/watchdog-dungclaude.sh") | crontab -;
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
