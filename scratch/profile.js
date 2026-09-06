const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    PID=$(pgrep -f "next-server" | head -1);
    kill -USR1 $PID; sleep 1;
    echo "inspector re-armed on PID $PID";
    crontab -l | grep -v watchdog-dungclaude | crontab -; echo "[watchdog OFF]";
    node /tmp/profile.js;
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
