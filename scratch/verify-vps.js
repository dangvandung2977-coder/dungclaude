const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec("curl -I http://localhost:3000 && pm2 list", (err, stream) => {
    stream.on('close', () => {
      conn.end();
    }).on('data', d => process.stdout.write(d)).stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: '103.249.117.202',
  port: 24534,
  username: 'root',
  password: 'Vinhphuc373@'
});
