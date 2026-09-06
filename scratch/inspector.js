const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    pm2 restart dungclaude --update-env >/dev/null 2>&1;
    sleep 6;
    PID=$(pgrep -f "next-server" | head -1);
    echo "PID=$PID — sending SIGUSR1 to enable inspector on :9229";
    kill -USR1 $PID;
    sleep 2;
    # Capture JS stack via inspector protocol
    curl -s http://127.0.0.1:9229/json/list | head -30;
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
