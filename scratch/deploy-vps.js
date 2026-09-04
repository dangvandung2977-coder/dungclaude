const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log("SSH connection established. Running deploy commands...");
  const cmd = `cd /var/www/dungclaude && git pull origin main && npm run build && pm2 restart dungclaude && pm2 save`;
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error("Exec error:", err);
      conn.end();
      return;
    }
    stream.on('close', (code) => {
      console.log(`\nDeploy process exited with code ${code}`);
      conn.end();
    }).on('data', (d) => {
      process.stdout.write(d);
    }).stderr.on('data', (d) => {
      process.stderr.write(d);
    });
  });
}).connect({
  host: '103.249.117.202',
  port: 24534,
  username: 'root',
  password: 'Vinhphuc373@'
});
