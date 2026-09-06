const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cd /var/www/dungclaude && npx tsx --env-file=.env -e "
      import { getOptimizationSettings } from './src/lib/ai/optimization/settings';
      async function t() {
        const s = await getOptimizationSettings();
        console.log('mode =', JSON.stringify(s.mode));
        console.log('keys =', Object.keys(s).join(','));
        console.log('full =', JSON.stringify(s).slice(0, 600));
        process.exit(0);
      }
      t();
    " 2>&1 | grep -viE "warning|trace-warn";
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
