const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cd /var/www/dungclaude && npx tsx --env-file=.env -e "
      import { getEndpointCredentials } from './src/lib/ai/custom-endpoints';
      import { getSupabase } from './src/lib/db/supabase';
      import { buildBaseSystem } from './src/lib/ai/system-prompt';
      async function t() {
        const sb = getSupabase();
        const cred = await getEndpointCredentials('ce_mtmbnc0i0500nkht');
        const { data: msgs } = await sb.from('messages').select('role,content').eq('conversation_id','conv_mtp7f94tjig7w074').order('created_at',{ascending:true});
        const sys = buildBaseSystem('glm-5.3-flash');
        const payload = [
          { role: 'system', content: sys },
          ...(msgs||[]).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
          { role: 'user', content: 'tiếp tục' },
        ];
        const chars = payload.reduce((s,m)=>s+m.content.length,0);
        console.log('payload msgs:', payload.length, 'chars:', chars);
        const t0 = Date.now();
        const resp = await fetch(cred.baseUrl.replace(/\\/\$/,'') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cred.key },
          body: JSON.stringify({ model: 'glm-5.3-flash', messages: payload, stream: true }),
        });
        console.log('status:', resp.status, 'ttft:', Date.now()-t0, 'ms');
        const reader = resp.body?.getReader();
        let chunks=0, bytes=0, lastRead=Date.now(), maxGap=0;
        const dec = new TextDecoder();
        const deadline = Date.now() + 45000;
        while (reader && Date.now() < deadline) {
          const { done, value } = await reader.read();
          const now = Date.now();
          maxGap = Math.max(maxGap, now - lastRead);
          lastRead = now;
          if (done) { console.log('DONE at', now-t0, 'ms'); break; }
          chunks++; bytes += value.length;
        }
        console.log('chunks:', chunks, 'bytes:', bytes, 'maxGap:', maxGap, 'ms', 'elapsed:', Date.now()-t0, 'ms');
        process.exit(0);
      }
      t().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
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
