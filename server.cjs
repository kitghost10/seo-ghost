'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {analyze}=require('./ai.cjs');
const ORIGIN='http://127.0.0.1:8765';
const DATA_DIR=path.resolve(__dirname,'../../work/seo-ghost-private');
const INFO='https://mybusinessbusinessinformation.googleapis.com/v1/';
const ACCOUNTS='https://mybusinessaccountmanagement.googleapis.com/v1/';
const REVIEWS='https://mybusiness.googleapis.com/v4/';
const MASK='name,title,languageCode,phoneNumbers,websiteUri,regularHours,specialHours,profile,categories,storefrontAddress,serviceArea,serviceItems,metadata';
function loadEnv(){
  const file=path.join(__dirname,'.env'); if(!fs.existsSync(file))return;
  for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z_]+)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}
}
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function locationName(value){if(typeof value!=='string'||!/^locations\/[a-zA-Z0-9_-]+$/.test(value))fail('Select a valid Google location.');return value;}
function reviewName(value){if(typeof value!=='string'||!/^accounts\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+\/reviews\/[a-zA-Z0-9_-]+$/.test(value))fail('Select a valid Google review.');return value;}
function checkChanges(changes){
  if(!changes||typeof changes!=='object'||Array.isArray(changes))fail('No valid changes supplied.');
  const keys=Object.keys(changes);if(!keys.length||keys.some(k=>!['websiteUri','phoneNumbers','profile','regularHours','categories','serviceItems'].includes(k)))fail('This change type is not supported for publishing.');
  if(keys.includes('serviceItems')&&keys.includes('categories'))fail('Apply category changes and recapture before adding services for those categories.');
  const out={};
  for(const k of keys){const v=changes[k];
    if(k==='serviceItems'){if(!Array.isArray(v)||!v.length||v.length>500||v.some(x=>!x||typeof x!=='object'||Array.isArray(x)))fail('Provide a valid service list.');out[k]=v;}
    if(k==='websiteUri'){let u;try{u=new URL(v)}catch{fail('Enter a valid website URL.')}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||String(v).length>500)fail('Enter an http or https website URL without credentials.');out[k]=u.href;}
    if(k==='phoneNumbers'){if(!v||Object.keys(v).some(x=>!['primaryPhone','additionalPhones'].includes(x))||typeof v.primaryPhone!=='string'||!v.primaryPhone.trim()||v.primaryPhone.length>60)fail('Enter a valid primary phone number.');if(v.additionalPhones!=null&&(!Array.isArray(v.additionalPhones)||v.additionalPhones.length>2||v.additionalPhones.some(x=>typeof x!=='string'||x.length>60)))fail('Invalid additional phone numbers.');out[k]={primaryPhone:v.primaryPhone,...(v.additionalPhones?{additionalPhones:v.additionalPhones}:{})};}
    if(k==='profile'){if(!v||Object.keys(v).some(x=>x!=='description')||typeof v.description!=='string'||v.description.length>750)fail('Descriptions must be 750 characters or fewer.');if(/https?:\/\/|www\./i.test(v.description))fail('Remove links from the business description.');out[k]={description:v.description.trim()};}
    if(k==='categories'){
      if(!v||Object.keys(v).some(x=>!['primaryCategory','additionalCategories'].includes(x))||!Array.isArray(v.additionalCategories)||v.additionalCategories.length>9)fail('Choose a primary category and up to nine additional categories.');
      const clean=c=>{if(!c||typeof c.name!=='string'||!c.name||c.name.length>150||Object.keys(c).some(x=>x!=='name'))fail('Use categories returned by Google’s category lookup.');return {name:c.name};};
      out[k]={primaryCategory:clean(v.primaryCategory),additionalCategories:v.additionalCategories.map(clean)};
      const all=[out[k].primaryCategory,...out[k].additionalCategories].map(c=>c.name);if(new Set(all).size!==all.length)fail('Do not repeat the same category.');
    }
    if(k==='regularHours'){
      if(!v||Object.keys(v).some(x=>x!=='periods')||!Array.isArray(v.periods)||!v.periods.length||v.periods.length>28)fail('Provide valid opening periods.');
      const days=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
      out[k]={periods:v.periods.map(p=>{if(!p||Object.keys(p).some(x=>!['openDay','openTime','closeDay','closeTime'].includes(x))||!days.includes(p.openDay)||!days.includes(p.closeDay))fail('Invalid opening day.');for(const t of [p.openTime,p.closeTime])if(!t||!Number.isInteger(t.hours)||t.hours<0||t.hours>24||!Number.isInteger(t.minutes)||t.minutes<0||t.minutes>59||(t.hours===24&&t.minutes!==0)||Object.keys(t).some(x=>!['hours','minutes'].includes(x)))fail('Invalid opening time.');return p;})};
    }
  }return out;
}
function equal(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null);}
function fieldEqual(key,a,b){if(key!=='categories')return equal(a,b);const clean=c=>c?{primaryCategory:c.primaryCategory?.name,additionalCategories:(c.additionalCategories||[]).map(x=>x.name).sort()}:null;return equal(clean(a),clean(b));}
function createApp(options={}){
  loadEnv();const transport=options.transport;
  const csrf=crypto.randomBytes(32).toString('hex');const pending=new Map();const oauthStates=new Map();
  let tokens=null;const tokenFile=path.join(DATA_DIR,'google-token.json');
  if(!transport){try{tokens=JSON.parse(fs.readFileSync(tokenFile,'utf8'));}catch{}}
  const configured=()=>!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
  const connected=()=>!!transport||!!tokens?.refresh_token||!!(tokens?.access_token&&tokens.expires_at>Date.now());
  function persistTokens(next){fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});fs.writeFileSync(tokenFile,JSON.stringify(next),{mode:0o600});tokens=next;}
  async function tokenRequest(params){
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});const data=await r.json();
    if(!r.ok)fail('Google authorization failed. Reconnect your Google account.',401);return data;
  }
  async function accessToken(){
    if(!tokens)fail('Connect your Google account first.',401);
    if(tokens.expires_at>Date.now()+60000)return tokens.access_token;
    if(!tokens.refresh_token)fail('Reconnect Google to renew access.',401);
    const next=await tokenRequest({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:tokens.refresh_token,grant_type:'refresh_token'});
    persistTokens({...tokens,...next,expires_at:Date.now()+next.expires_in*1000});return next.access_token;
  }
  async function google(url,method='GET',body){
    if(transport)return transport(url,method,body);
    const token=await accessToken();const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
    let data;try{data=await r.json()}catch{data={}}
    if(!r.ok){const reason=data.error?.message||'The request was rejected.';fail(`Google (${r.status}): ${reason}`,r.status===403?403:502);}return data;
  }
  async function getLocation(name){return google(INFO+locationName(name)+'?readMask='+MASK);}
  async function serviceCatalog(current){
    const names=[current.categories?.primaryCategory,...(current.categories?.additionalCategories||[])].map(c=>c?.name).filter(Boolean);if(!names.length)fail('The listing needs a category before services can be added.');
    const u=new URL(INFO+'categories:batchGet');names.forEach(n=>u.searchParams.append('names',n));u.searchParams.set('languageCode',current.languageCode||'en');u.searchParams.set('view','FULL');return google(u.href);
  }
  async function validateServiceAdditions(current,next){
    const existing=current.serviceItems||[];if(next.length<=existing.length||existing.some((x,i)=>!equal(x,next[i])))fail('Service updates must preserve all captured services and add at least one new service.');
    const catalog=await serviceCatalog(current);const categories=new Set((catalog.categories||[]).map(c=>c.name));const types=new Set((catalog.categories||[]).flatMap(c=>(c.serviceTypes||[]).map(t=>t.serviceTypeId)));
    const labels=new Map((catalog.categories||[]).flatMap(c=>(c.serviceTypes||[]).map(t=>[t.serviceTypeId,t.displayName])));
    const key=x=>x.structuredServiceItem?(labels.has(x.structuredServiceItem.serviceTypeId)?'name:'+labels.get(x.structuredServiceItem.serviceTypeId).toLowerCase():'id:'+x.structuredServiceItem.serviceTypeId):'name:'+(x.freeFormServiceItem?.label?.displayName||'').trim().toLowerCase();const seen=new Set(existing.map(key));
    for(const item of next.slice(existing.length)){
      if(Object.keys(item).some(k=>!['structuredServiceItem','freeFormServiceItem'].includes(k))||!!item.structuredServiceItem===!!item.freeFormServiceItem)fail('Add one supported service type per entry. Prices are not added automatically.');
      if(item.structuredServiceItem){const s=item.structuredServiceItem;if(Object.keys(s).some(k=>!['serviceTypeId','description'].includes(k))||!types.has(s.serviceTypeId)||s.description!=null&&(typeof s.description!=='string'||s.description.length>300))fail('Choose a service offered by Google for the listing’s current categories.');}
      else{const s=item.freeFormServiceItem,l=s.label;if(Object.keys(s).some(k=>!['category','label'].includes(k))||!categories.has(s.category)||!l||Object.keys(l).some(k=>!['displayName','description','languageCode'].includes(k))||typeof l.displayName!=='string'||!l.displayName.trim()||l.displayName.length>140||l.description!=null&&(typeof l.description!=='string'||l.description.length>250)||l.languageCode!=null&&(typeof l.languageCode!=='string'||l.languageCode.length>35))fail('Custom services need a valid current category, a short name, and an accurate description.');if([...labels.values()].some(name=>name.toLowerCase()===l.displayName.trim().toLowerCase()))fail('Choose the matching Google-standard service instead of a custom duplicate.');}
      const id=key(item);if(seen.has(id))fail('This service already exists in the captured or proposed service list.');seen.add(id);
    }
  }
  async function collect(url,key,max=1000){const items=[];let next='';do{const u=new URL(url);if(next)u.searchParams.set('pageToken',next);const data=await google(u.href);items.push(...(data[key]||[]));next=data.nextPageToken||'';if(items.length>=max&&next)fail('Too many listings for this single-business workspace. Use an account with fewer locations.');}while(next);return items;}
  async function jsonBody(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>100000)fail('Request too large.',413);}try{return JSON.parse(data||'{}')}catch{fail('Invalid request JSON.');}}
  function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  function record(entry){if(transport)return;fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});fs.appendFileSync(path.join(DATA_DIR,'changes.jsonl'),JSON.stringify({...entry,time:new Date().toISOString()})+'\n',{mode:0o600});}
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.headers.host!==`127.0.0.1:${server.address()?.port||8765}`)fail('Use the local workspace address.',403);
      const url=new URL(req.url,ORIGIN);const route=url.pathname;
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
      if(route.startsWith('/api/')){
        if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==ORIGIN)fail('Open this request from your SEO Ghost workspace.',403);
        if(req.method!=='GET'&&(req.headers['x-seo-ghost-token']!==csrf||req.headers.origin!==ORIGIN))fail('Reload your workspace before making changes.',403);
        const body=req.method==='POST'?await jsonBody(req):{};
        if(route==='/api/config'&&req.method==='GET')return send(res,200,{configured:configured(),connected:connected(),aiConfigured:!!(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL),csrf,redirectUri:ORIGIN+'/auth/callback'});
        if(route==='/api/ai/analyze'&&req.method==='POST'){
          try{return send(res,200,await analyze(body));}catch(error){fail(error.name==='TimeoutError'?'AI analysis timed out. Try again.':error.message,502);}
        }
        if(route==='/api/disconnect'&&req.method==='POST'){
          if(tokens?.refresh_token){try{await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:tokens.refresh_token}),signal:AbortSignal.timeout(10000)});}catch{}}
          tokens=null;pending.clear();if(fs.existsSync(tokenFile))fs.unlinkSync(tokenFile);return send(res,200,{disconnected:true});
        }
        if(!connected())fail('Google is not connected. Use manual capture until API access is approved.',401);
        if(route==='/api/service-types'&&req.method==='GET')return send(res,200,await serviceCatalog(await getLocation(url.searchParams.get('name'))));
        if(route==='/api/categories'&&req.method==='GET'){
          const region=url.searchParams.get('region'),query=url.searchParams.get('q');if(!/^[A-Z]{2}$/.test(region||'')||!query||query.length>100||/[=\"\n\r]/.test(query))fail('Enter a two-letter country code and a category-name prefix.');
          const u=new URL(INFO+'categories');u.searchParams.set('regionCode',region);u.searchParams.set('languageCode','en');u.searchParams.set('view','BASIC');u.searchParams.set('pageSize','100');u.searchParams.set('filter','displayName='+query);const data=await google(u.href);return send(res,200,data);
        }
        if(route==='/api/locations'&&req.method==='GET'){
          const accounts=await collect(ACCOUNTS+'accounts?pageSize=20','accounts');const locations=[];
          for(const a of accounts){if(!/^accounts\/[a-zA-Z0-9_-]+$/.test(a.name))continue;const found=await collect(INFO+a.name+'/locations?readMask='+MASK+'&pageSize=100','locations');for(const l of found)locations.push({...l,accountName:a.name});}
          return send(res,200,{locations});
        }
        if(route==='/api/location'&&req.method==='GET')return send(res,200,await getLocation(url.searchParams.get('name')));
        if(route==='/api/reviews'&&req.method==='GET'){
          const name=locationName(url.searchParams.get('name'));const account=url.searchParams.get('account');if(!/^accounts\/[a-zA-Z0-9_-]+$/.test(account||''))fail('Invalid account.');
          const data=await google(REVIEWS+account+'/'+name+'/reviews?pageSize=50&orderBy=updateTime%20desc');return send(res,200,{...data,scope:data.nextPageToken?'Latest 50 reviews; additional reviews exist.':'All available reviews.'});
        }
        if(route==='/api/metrics'&&req.method==='GET'){
          const name=locationName(url.searchParams.get('name'));const end=new Date();end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
          const u=new URL('https://businessprofileperformance.googleapis.com/v1/'+name+':fetchMultiDailyMetricsTimeSeries');
          for(const metric of ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS','BUSINESS_IMPRESSIONS_MOBILE_MAPS','BUSINESS_IMPRESSIONS_DESKTOP_SEARCH','BUSINESS_IMPRESSIONS_MOBILE_SEARCH','CALL_CLICKS','WEBSITE_CLICKS','BUSINESS_DIRECTION_REQUESTS'])u.searchParams.append('dailyMetrics',metric);
          for(const [prefix,date] of [['dailyRange.startDate',start],['dailyRange.endDate',end]]){u.searchParams.set(prefix+'.year',date.getUTCFullYear());u.searchParams.set(prefix+'.month',date.getUTCMonth()+1);u.searchParams.set(prefix+'.day',date.getUTCDate());}
          return send(res,200,{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),data:await google(u.href)});
        }
        if(route==='/api/changes/preview'&&req.method==='POST'){
          const name=locationName(body.name);const changes=checkChanges(body.changes);const current=await getLocation(name);const before={};for(const k of Object.keys(changes))before[k]=current[k]??null;
          if(!body.expected||Object.keys(changes).some(k=>!equal(before[k],body.expected[k])))fail('The listing changed since capture. Refresh it and prepare a new change.',409);
          if(changes.serviceItems)await validateServiceAdditions(current,changes.serviceItems);
          await google(INFO+name+'?updateMask='+Object.keys(changes).join(',')+'&validateOnly=true','PATCH',{name,...changes});
          const id=crypto.randomUUID();pending.set(id,{kind:'location',name,before,changes,dependencies:changes.serviceItems?{categories:current.categories??null}:{},expires:Date.now()+900000});return send(res,200,{id,before,changes,expiresInMinutes:15});
        }
        if(route==='/api/replies/preview'&&req.method==='POST'){
          const name=reviewName(body.name);if(typeof body.comment!=='string'||!body.comment.trim()||Buffer.byteLength(body.comment,'utf8')>4096)fail('Enter a reply of 1–4096 UTF-8 bytes.');
          const current=await google(REVIEWS+name);const before=current.reviewReply?.comment||'';if(before!==(body.expected||''))fail('The review reply changed. Refresh reviews first.',409);
          const id=crypto.randomUUID();pending.set(id,{kind:'reply',name,before,changes:{comment:body.comment.trim()},expires:Date.now()+900000});return send(res,200,{id,before,changes:{comment:body.comment.trim()},expiresInMinutes:15});
        }
        if(route==='/api/changes/apply'&&req.method==='POST'){
          if(body.approved!==true)fail('Explicit approval is required.');const item=pending.get(body.id);if(!item||item.expires<Date.now())fail('Preview expired. Prepare a new preview.',409);
          if(item.busy)fail('This change is already being applied.',409);item.busy=true;
          try{
            let result,verified;
            if(item.kind==='location'){
              const current=await getLocation(item.name);if(Object.keys(item.changes).some(k=>!equal(current[k],item.before[k])))fail('The listing changed after preview. Refresh and create a new change.',409);
              if(Object.keys(item.dependencies||{}).some(k=>!equal(current[k],item.dependencies[k])))fail('The service categories changed after preview. Recapture the listing and prepare services again.',409);
              // Record intent before the external write, so a network timeout never silently erases its history.
              record({status:'attempted',kind:item.kind,name:item.name,before:item.before,changes:item.changes});
              result=await google(INFO+item.name+'?updateMask='+Object.keys(item.changes).join(','),'PATCH',{name:item.name,...item.changes});
              const after=await getLocation(item.name);verified=Object.keys(item.changes).every(k=>fieldEqual(k,after[k],item.changes[k]));result=after;
            }else{
              const current=await google(REVIEWS+item.name);if((current.reviewReply?.comment||'')!==item.before)fail('The reply changed after preview. Refresh reviews.',409);
              record({status:'attempted',kind:item.kind,name:item.name,before:item.before,changes:item.changes});
              await google(REVIEWS+item.name+'/reply','PUT',item.changes);result=await google(REVIEWS+item.name);verified=result.reviewReply?.comment===item.changes.comment;
            }
            pending.delete(body.id);record({status:verified?'readback-confirmed':'accepted-readback-differs',kind:item.kind,name:item.name,before:item.before,changes:item.changes});
            return send(res,200,{result,verified,message:verified?'Google accepted the change and API readback matches. Public display may still be pending.':'Google accepted the change, but readback differs. Refresh and check the listing before retrying.'});
          }catch(error){pending.delete(body.id);record({status:'failed-or-uncertain',kind:item.kind,name:item.name,before:item.before,changes:item.changes});throw error;}
        }
        fail('Unknown API route.',404);
      }
      if(route==='/auth/start'){
        if(req.headers['sec-fetch-site']==='cross-site')fail('Start Google authorization from SEO Ghost.',403);
        if(!configured())fail('Configure Google OAuth credentials in .env first.');
        const state=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(32).toString('base64url');oauthStates.set(state,{verifier,expires:Date.now()+600000});
        const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [k,v]of Object.entries({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:ORIGIN+'/auth/callback',response_type:'code',scope:'https://www.googleapis.com/auth/business.manage',access_type:'offline',prompt:'consent',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))u.searchParams.set(k,v);
        res.writeHead(302,{Location:u.href,'Cache-Control':'no-store','Set-Cookie':`seo_ghost_oauth=${state}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600`});return res.end();
      }
      if(route==='/auth/callback'){
        const stateKey=url.searchParams.get('state');const state=oauthStates.get(stateKey);oauthStates.delete(stateKey);const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('seo_ghost_oauth='))?.slice('seo_ghost_oauth='.length);if(!state||state.expires<Date.now()||cookie!==stateKey||!url.searchParams.get('code'))fail('Authorization expired or was declined. Return to SEO Ghost and reconnect.');
        const next=await tokenRequest({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:ORIGIN+'/auth/callback',grant_type:'authorization_code',code_verifier:state.verifier});
        persistTokens({...next,expires_at:Date.now()+next.expires_in*1000});res.writeHead(302,{Location:'/?google=connected#gbp','Cache-Control':'no-store','Set-Cookie':'seo_ghost_oauth=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0'});return res.end();
      }
      if(req.method!=='GET'&&req.method!=='HEAD')fail('Method not allowed.',405);
      const filename=route==='/'?'index.html':route.slice(1);const files={'index.html':'text/html','styles.css':'text/css','app.js':'text/javascript','gbp.js':'text/javascript','optimization.js':'text/javascript'};if(!files[filename])fail('File not found.',404);
      res.writeHead(200,{'Content-Type':files[filename]+'; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:fs.readFileSync(path.join(__dirname,filename)));
    }catch(error){send(res,error.status||500,{error:error.status?error.message:'The request could not be completed. Check the connection and try again.'});}
  });
  return server;
}
if(require.main===module){createApp().listen(8765,'127.0.0.1',()=>console.log('SEO Ghost is ready at '+ORIGIN));}
module.exports={createApp,checkChanges,equal};
