const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.modelConfig.findMany({where:{enabled:true}}).then(rows => {
  rows.forEach(r => console.log(JSON.stringify({provider:r.provider, name:r.name, key:(r.apiKey||'').slice(0,25)+'...'})));
  p.$disconnect();
});
