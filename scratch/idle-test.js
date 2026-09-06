const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    pm2 restart dungclaude >/dev/null 2>&1;
    sleep 8;
    echo "=== T0 (after start + 1 page load) ===";
    curl -s -o /dev/null -m 10 http://127.0.0.1:3000/;
    PID=$(pgrep -f "next-server" | head -1);
    ps -o %cpu= -p $PID;
    sleep 45;
    echo "=== T+45s idle ===";
    ps -o %cpu= -p $PID;
    sleep 60;
    echo "=== T+105s idle ===";
    ps -o %cpu= -p $PID;
    uptime;
    echo "=== WARM SOME PAGES (GET only, no chat) ===";
    for p in /login /signup /app; do curl -s -o /dev/null -m 10 -w "$p http=%{http_code}\\n" http://127.0.0.1:3000$p; done;
    sleep 20;
    echo "=== T after page loads ===";
    ps -o %cpu= -p $PID;
    echo "=== DUMP RECENT CONV SIZES (find the giant one) ===";
    cd /var/www/dungclaude && npx tsx --env-file=.env -e "
      import { getSupabase } from './src/lib/db/supabase';
      async function t() {
        const sb = getSupabase();
        const { data: convs } = await sb.from('conversations').select('id,title,created_at').order('created_at', { ascending: false }).limit(6);
        for (const c of convs) {
          const { data: msgs } = await sb.from('messages').select('role,content').eq('conversation_id', c.id);
          const total = (msgs||[]).reduce((s,m)=>s+(m.content?.length||0),0);
          console.log(c.id, '| msgs:', msgs?.length, '| total chars:', total, '| title:', c.title?.slice(0,40));
        }
      }
      t();
    " 2>/dev/null;
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '103.249.117.202',
  port: 24534,
  username: 'root',
  password: 'Vinhphuc373@'
});
