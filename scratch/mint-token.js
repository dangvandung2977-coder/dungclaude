const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cd /var/www/dungclaude && npx tsx --env-file=.env -e "
      import { getSupabase } from './src/lib/db/supabase';
      import { signSession } from './src/lib/auth/auth';
      import * as fs from 'fs';
      async function t() {
        const sb = getSupabase();
        const { data: conv } = await sb.from('conversations').select('user_id').eq('id', 'conv_mtp7f94tjig7w074').single();
        const { data: u } = await sb.from('users').select('id,email,role').eq('id', conv.user_id).single();
        console.log('owner:', u.email);
        const token = await signSession({ id: u.id, email: u.email, name: u.email, role: u.role } as any);
        fs.writeFileSync('/tmp/token.txt', token);
        console.log('token OK');
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
