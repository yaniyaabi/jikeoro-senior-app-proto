import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
async function scan(directory) {
  const files=[];
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const filename=path.join(directory,item.name);
    if(item.isDirectory())files.push(...await scan(filename));
    else if(/\.(ts|tsx|js|html)$/.test(item.name))files.push(filename);
  }
  return files;
}
test('runtime sources have no cloud SDK or fallback project URLs',async()=>{
  const directories=["src"];
  for(const directory of directories)for(const filename of await scan(path.join(root,directory))) {
    const text=await readFile(filename,'utf8');
    assert.doesNotMatch(text,/@supabase\/supabase-js|https?:\/\/[^\s"'`]+\.supabase\.co|functions\/v1\/(walking-reminders|map-report-preview|manage-staff)/i,filename);
  }
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.dependencies['@supabase/supabase-js'],undefined);
});
