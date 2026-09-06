const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `cd /var/www/dungclaude && npx tsx --env-file=.env -e "
    import { getSupabase } from './src/lib/db/supabase';
    async function test() {
      const sb = getSupabase();
      const { data: models } = await sb.from('custom_models').select('*');
      console.log('Custom Models:', models?.map(m => ({ id: m.id, name: m.display_name, api: m.api_name, caps: m.capabilities })));
    }
    test();
  "`;
  conn.exec(cmd, (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '103.249.117.202',
  port: 24534,
  username: 'root',
  password: 'Vinhphuc373@'
});
