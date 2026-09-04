const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const remoteCmd = `node -e '
    const fs = require("fs");
    let content = fs.readFileSync("/var/www/dungclaude/.env", "utf8");
    const urlMatch = content.match(/^SUPABASE_URL=(.*)$/m);
    const keyMatch = content.match(/^SUPABASE_PUBLISHABLE_KEY=(.*)$/m);
    if (urlMatch && keyMatch) {
      const url = urlMatch[1].trim();
      const key = keyMatch[1].trim();
      let updated = content;
      if (!content.includes("NEXT_PUBLIC_SUPABASE_URL=")) {
        updated += "\\nNEXT_PUBLIC_SUPABASE_URL=" + url;
      }
      if (!content.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
        updated += "\\nNEXT_PUBLIC_SUPABASE_ANON_KEY=" + key;
      }
      fs.writeFileSync("/var/www/dungclaude/.env", updated);
      console.log("SUCCESS: Synced NEXT_PUBLIC_SUPABASE variables!");
    } else {
      console.log("Could not find SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
    }
  '`;

  conn.exec("cd /var/www/dungclaude && " + remoteCmd, (err, stream) => {
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
