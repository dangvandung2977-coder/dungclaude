const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cd /var/www/dungclaude && npx tsx --env-file=.env -e "
      import { getSupabase } from './src/lib/db/supabase';
      async function t() {
        const sb = getSupabase();
        const { data: msgs } = await sb.from('messages')
          .select('id,role,created_at,length(content)')
          .eq('conversation_id', 'conv_mtp7f94tjig7w074')
          .order('created_at', { ascending: false })
          .limit(8);
        console.log(JSON.stringify(msgs, null, 1));
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
