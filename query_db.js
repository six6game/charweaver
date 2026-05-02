const Database = require('better-sqlite3');
const db = new Database('C:/Users/Suzihao/WorkBuddy/20260430232637/agent-web/prisma/dev.db', { readonly: true });

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const fs = require('fs');
let output = 'Tables: ' + tables.map(t => t.name).join(', ') + '\n\n';

for (const table of tables) {
  if (table.name.startsWith('_')) continue;
  const info = db.prepare("PRAGMA table_info(" + table.name + ")").all();
  output += '--- ' + table.name + ' ---\n';
  output += info.map(i => i.name + ' (' + i.type + ')').join(', ') + '\n';
  output += '\n';
}

fs.writeFileSync('C:/Users/Suzihao/WorkBuddy/20260430232637/agent-web/db_schema.txt', output);
db.close();
