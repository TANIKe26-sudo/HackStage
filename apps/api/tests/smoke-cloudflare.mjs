import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encode as encodePng} from 'fast-png';

const base=process.env.TEST_API_URL??'http://127.0.0.1:8787';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('This smoke test only targets a local API.');
const accounts=[];
async function request(path,{method='GET',token,body}={}){
  const response=await fetch(new URL(path,base),{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${data.error}`);return data;
}
try{
  assert.equal((await request('/health/ready')).ok,true);
  for(let n=0;n<2;n++){
    const password=randomBytes(20).toString('base64'),email=`smoke-${randomBytes(8).toString('hex')}@example.test`;
    const signup=await request('/auth/signup',{method:'POST',body:{email,password}});
    const account={...signup,email,password};accounts.push(account);
    const login=await request('/auth/login',{method:'POST',body:{email,password}});account.token=login.token;
    await request('/api/captures',{method:'POST',token:account.token,body:{dataUrl:`data:image/png;base64,${Buffer.from(encodePng({width:100,height:200,data:new Uint8Array(100*200*4).fill(180)})).toString('base64')}`}});
    await request('/api/profile',{method:'PATCH',token:account.token,body:{display_name:`Smoke ${n}`,birth_year:1995,area:'テスト',throat_class:'present',purpose:'serious',conversation_pace:'balanced'}});
  }
  const [a,b]=accounts,png={width:100,height:200,data:new Uint8Array(100*200*4).fill(180)};
  const capture=await request('/api/captures',{method:'POST',token:a.token,body:{dataUrl:`data:image/png;base64,${Buffer.from(encodePng(png)).toString('base64')}`}});assert.equal(capture.captures.length,5);
  await request('/api/likes',{method:'POST',token:a.token,body:{toUserId:b.user.id}});
  const match=await request('/api/likes',{method:'POST',token:b.token,body:{toUserId:a.user.id}});assert.equal(match.matched,true);
  await request(`/api/matches/${match.matchId}/messages`,{method:'POST',token:a.token,body:{body:'ローカルWorkersの動作確認'}});
  const messages=await request(`/api/matches/${match.matchId}/messages`,{token:b.token});assert.equal(messages.results.length,1);
  const plan=await request(`/api/matches/${match.matchId}/date-plans`,{method:'POST',token:a.token,body:{startsAt:new Date(Date.now()+86400000).toISOString(),placeLabel:'テスト場所',exactLocation:'テスト位置',shareConsent:true}});
  await request(`/api/date-plans/${plan.id}/confirm`,{method:'POST',token:a.token,body:{consentToLocation:true}});
  await request(`/api/date-plans/${plan.id}/confirm`,{method:'POST',token:b.token,body:{consentToLocation:true}});
  assert.equal((await request(`/api/date-plans/${plan.id}`,{token:b.token})).exactLocation,'テスト位置');
  console.log('Workers smoke passed: ready, signup, login, profile, image crops, mutual match, messages, encrypted date location.');
}finally{
  for(const account of accounts)await request('/api/account/delete',{method:'POST',token:account.token,body:{password:account.password}});
  console.log(`Removed ${accounts.length} temporary smoke-test accounts.`);
}
