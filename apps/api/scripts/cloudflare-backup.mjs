import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const wrangler=resolve(dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
const config=JSON.parse(readFileSync(resolve(root,'wrangler.jsonc'),'utf8').replace(/^\uFEFF/,''));
const production=config.env.production;
const database=production.d1_databases.find(v=>v.binding==='DB');
const bucket=production.r2_buckets.find(v=>v.binding==='CAPTURES').bucket_name;
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const mode=args[0]??'backup';
function run(values,configFile=resolve(root,'wrangler.jsonc')){
  const child=spawnSync(process.execPath,[wrangler,...values,'--config',configFile,'--env','production'],{cwd:root,env:process.env,encoding:'utf8',maxBuffer:32*1024*1024});
  if(child.status!==0)throw new Error(child.stderr||child.stdout||'Wrangler command failed');
  return child.stdout;
}
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
async function maintenance(enabled){
  const base=process.env.API_BASE_URL,key=process.env.BACKUP_ADMIN_KEY;
  if(!base||!key){if(args.includes('--writes-stopped'))return;throw new Error('Set API_BASE_URL and BACKUP_ADMIN_KEY to pause writes, or stop the API and pass --writes-stopped.');}
  const response=await fetch(new URL('/admin/operations/maintenance',base),{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':key},body:JSON.stringify({enabled}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Maintenance request failed: ${response.status}`);
}
if(mode==='backup'){
  const destination=resolve(option('--output')??resolve(root,'../../backups/cloudflare',new Date().toISOString().replaceAll(':','-')));
  if(existsSync(resolve(destination,'manifest.json')))throw new Error('Choose a new output directory; completed snapshots are never overwritten.');
  mkdirSync(resolve(destination,'objects'),{recursive:true});
  await maintenance(true);
  const leaseDeadline=Date.now()+14*60000;
  try{
  // Let in-flight requests and existing SSE connections finish after write lock.
  await new Promise(resolve=>setTimeout(resolve,15000));
  run(['d1','export','DB','--remote','--output',resolve(destination,'database.sql')]);
  const output=run(['d1','execute','DB','--remote','--command','SELECT object_key AS key FROM captures UNION SELECT original_key AS key FROM captures WHERE original_key IS NOT NULL','--json']);
  const rows=JSON.parse(output).flatMap(r=>r.results??[]),objects=[];
  for(const [index,row] of rows.entries()){
    if(Date.now()>leaseDeadline)throw new Error('Backup exceeded the maintenance lease; retry during a longer offline maintenance window.');
    const file=`objects/${index}.bin`,path=resolve(destination,file);
    run(['r2','object','get',`${bucket}/${row.key}`,'--remote','--file',path]);
    objects.push({key:row.key,file,sha256:digest(path)});
  }
  if(Date.now()>leaseDeadline)throw new Error('Backup lease expired; no successful manifest will be written.');
  writeFileSync(resolve(destination,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),databaseName:database.database_name,databaseId:database.database_id,bucket,databaseSha256:digest(resolve(destination,'database.sql')),objects},null,2));
  console.log(`Backup complete: ${destination}`);
  }finally{await maintenance(false);}
}else if(mode==='restore'){
  const source=resolve(option('--input')??''),targetDb=option('--database'),targetBucket=option('--bucket');
  if(!option('--input')||!targetDb||!targetBucket)throw new Error('Usage: restore --input <snapshot> --database <NEW_EMPTY_DATABASE> --bucket <NEW_BUCKET>');
  const manifest=JSON.parse(readFileSync(resolve(source,'manifest.json'),'utf8'));
  if(manifest.version!==1||targetDb==='DB'||[manifest.databaseId,manifest.databaseName].includes(targetDb)||targetBucket===manifest.bucket)throw new Error('Restore requires a NEW empty database and a NEW bucket. Existing production is never overwritten.');
  if(digest(resolve(source,'database.sql'))!==manifest.databaseSha256)throw new Error('Database checksum mismatch');
  const databases=JSON.parse(run(['d1','list','--json']));
  const target=databases.find(v=>v.name===targetDb||v.uuid===targetDb);
  if(!target||target.uuid===manifest.databaseId)throw new Error('Create a new empty D1 database before restoring.');
  const restoreConfig=resolve(source,'.restore-wrangler.json');
  writeFileSync(restoreConfig,JSON.stringify({name:'nodobito-restore',env:{production:{account_id:production.account_id,d1_databases:[{binding:'DB',database_name:target.name,database_id:target.uuid}],r2_buckets:[{binding:'CAPTURES',bucket_name:targetBucket}]}}}));
  try{
  const tables=JSON.parse(run(['d1','execute','DB','--remote','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' AND name NOT LIKE 'sqlite_%'",'--json'],restoreConfig)).flatMap(v=>v.results??[]);
  if(tables.length)throw new Error('Restore target must be an empty D1 database.');
  for(const object of manifest.objects){
    const path=resolve(source,object.file);if(!path.startsWith(source+'\\')&&!path.startsWith(source+'/'))throw new Error('Invalid manifest path');
    if(digest(path)!==object.sha256)throw new Error(`Object checksum mismatch: ${object.file}`);
  }
  for(const object of manifest.objects)run(['r2','object','put',`${targetBucket}/${object.key}`,'--remote','--file',resolve(source,object.file)],restoreConfig);
  run(['d1','execute','DB','--remote','--file',resolve(source,'database.sql'),'--yes'],restoreConfig);
  run(['d1','execute','DB','--remote','--command',"DELETE FROM service_state WHERE key='maintenance_until'",'--yes'],restoreConfig);
  console.log('Restore complete. Verify the new resources, then update production bindings and deploy.');
  }finally{unlinkSync(restoreConfig);}
}else throw new Error('Choose backup or restore');
