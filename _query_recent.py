import sqlite3, json, sys
from datetime import datetime, timedelta

db_path = r'C:\Users\Suzihao\WorkBuddy\20260430232637\agent-web\prisma\dev.db'
out_path = r'C:\Users\Suzihao\WorkBuddy\20260430232637\agent-web\_query_recent.txt'

db = sqlite3.connect(db_path)
cur = db.cursor()

# Current timestamp in ms (approx May 3, 2026)
# 3 days ago in ms: use a rough calc - 3 days = 259200000 ms
now_ms = 1777804800000  # approx May 3 2026 16:00 GMT+8
three_days_ago_ms = now_ms - 259200000

output = f"Query: messages from last 3 days (createdAt > {three_days_ago_ms})\n"
output += f"Approx date range: Apr 30 - May 3, 2026\n\n"

# Get all messages with chat info and agent info from last 3 days
query = """
SELECT m.id, m.role, m.content, m.model, m.metadata, m.createdAt, c.title as chat_title, a.name as agent_name
FROM Message m
LEFT JOIN Chat c ON m.chatId = c.id
LEFT JOIN Agent a ON c.agentId = a.id
WHERE m.createdAt > ?
ORDER BY m.createdAt ASC
"""

cur.execute(query, (three_days_ago_ms,))
rows = cur.fetchall()
col_names = ['id', 'role', 'content', 'model', 'metadata', 'createdAt', 'chat_title', 'agent_name']

output += f"Total messages found: {len(rows)}\n\n"

# Group by chat
chats = {}
for row in rows:
    d = dict(zip(col_names, row))
    chat_id = d['chat_title'] or 'unknown'
    if chat_id not in chats:
        chats[chat_id] = {
            'agent': d['agent_name'],
            'messages': []
        }
    # Truncate content for readability, but keep user messages full
    content = d['content'] or ''
    if len(content) > 500:
        content = content[:500] + '...[truncated]'
    chats[chat_id]['messages'].append({
        'role': d['role'],
        'content': content,
        'model': d['model'],
        'metadata': d['metadata'],
        'created_at': d['createdAt']
    })

for chat_title, info in chats.items():
    output += f"\n{'='*60}\n"
    output += f"Chat: {chat_title}\n"
    output += f"Agent: {info['agent']}\n"
    output += f"Messages: {len(info['messages'])}\n"
    output += f"{'='*60}\n\n"
    for msg in info['messages']:
        ts = msg['created_at']
        # Convert ms to readable date
        try:
            dt = datetime.fromtimestamp(ts / 1000)
            time_str = dt.strftime('%Y-%m-%d %H:%M')
        except:
            time_str = str(ts)
        meta = msg['metadata'] or ''
        output += f"[{time_str}] {msg['role'].upper()} ({msg['model'] or 'N/A'}) meta={meta[:80] if meta else 'None'}\n"
        output += f"{msg['content']}\n\n"

# Also get agent list
output += "\n\n" + "="*60 + "\n"
output += "ALL AGENTS:\n"
output += "="*60 + "\n"
cur.execute("SELECT name, description, greeting, personality, isDefault, model FROM Agent")
for row in cur.fetchall():
    output += f"\n- {row[0]} (default: {row[4]}, model: {row[5]})\n"
    output += f"  desc: {row[1]}\n"
    output += f"  personality: {row[3]}\n"

# Model config summary
output += "\n\n" + "="*60 + "\n"
output += "MODEL CONFIG:\n"
output += "="*60 + "\n"
cur.execute("SELECT provider, name, enabled, isDefault FROM ModelConfig")
for row in cur.fetchall():
    output += f"- {row[1]} ({row[0]}) enabled={row[2]} default={row[3]}\n"

db.close()

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(output)

print(f"Done. {len(rows)} messages from {len(chats)} chats written to {out_path}")
