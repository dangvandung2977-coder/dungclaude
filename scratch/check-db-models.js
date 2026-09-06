const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `cd /var/www/dungclaude && npx tsx --env-file=.env -e "
    import { getSupabase } from './src/lib/db/supabase';
    async function test() {
      const sb = getSupabase();
      const { data: convs } = await sb.from('conversations').select('id,title,model_id,created_at').order('created_at', { ascending: false }).limit(5);
      console.log('Recent Convs:', convs);
      const { data: msgs } = await sb.from('messages').select('id,role,model_id,content,created_at').order('created_at', { ascending: false }).limit(4);
      console.log('Recent Messages:', msgs?.map(m => ({ role: m.role, model: m.model_id, text: m.content?.slice(0, 150) })));
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
