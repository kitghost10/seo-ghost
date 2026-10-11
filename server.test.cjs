'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {createApp,checkChanges}=require('./server.cjs');
const {parseResponse,validateInput}=require('./ai.cjs');
test('AI advice cannot cite invented evidence and incomplete responses are rejected',()=>{
  const input=validateInput({business:{name:'Real Plumbing'},findings:[{id:'hours',evidence:'No hours captured.',action:'Check hours.',status:'issue'}]});
  const result={summary:'Check hours.',recommendations:[{title:'Set accurate hours',priority:'P1',evidenceIds:['hours'],reason:'Hours are missing.',action:'Confirm actual hours.',confidence:'medium'}],questions:[]};
  const response={status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
  assert.equal(parseResponse(response,input).recommendations.length,1);result.recommendations[0].evidenceIds=['invented'];response.output[0].content[0].text=JSON.stringify(result);assert.throws(()=>parseResponse(response,input),/not in your audit/);assert.throws(()=>parseResponse({...response,status:'incomplete'},input),/did not finish/);
});
test('outgoing updates reject unsupported fields and unsafe URLs',()=>{
  assert.throws(()=>checkChanges({title:'Keyword stuffing'}));assert.throws(()=>checkChanges({websiteUri:'javascript:alert(1)'}));assert.throws(()=>checkChanges({websiteUri:'https://user:password@example.com'}));assert.throws(()=>checkChanges({profile:{description:'x'.repeat(751)}}));assert.throws(()=>checkChanges({profile:{description:'Visit https://example.com'}}));assert.throws(()=>checkChanges({regularHours:{periods:[]}}));assert.throws(()=>checkChanges({phoneNumbers:{primaryPhone:'123',extra:'unknown'}}));
  assert.deepEqual(checkChanges({websiteUri:'https://example.com',profile:{description:'Real plumbing services.'}}),{websiteUri:'https://example.com/',profile:{description:'Real plumbing services.'}});
  assert.deepEqual(checkChanges({categories:{primaryCategory:{name:'gcid:plumber'},additionalCategories:[]}}),{categories:{primaryCategory:{name:'gcid:plumber'},additionalCategories:[]}});
  assert.throws(()=>checkChanges({categories:{primaryCategory:{name:'gcid:plumber',displayName:'Output only'},additionalCategories:[]}}));
  assert.throws(()=>checkChanges({categories:{primaryCategory:{name:'gcid:plumber'},additionalCategories:[{name:'gcid:plumber'}]}}));
});
test('live changes require preview, explicit approval, and fresh field values',async()=>{
  let listing={name:'locations/1',title:'Real Plumbing',websiteUri:'https://old.example/',profile:{description:'Original description'}};const writes=[];
  const transport=async(url,method,body)=>{
    if(url.includes('validateOnly=true'))return {...listing,...body};
    if(method==='PATCH'){writes.push(body);listing={...listing,...body};return listing;}
    if(url.includes('/locations/1'))return JSON.parse(JSON.stringify(listing));
    throw new Error('Unexpected fake transport request');
  };
  const server=createApp({transport});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function request(route,body,extra={}){const r=await fetch(base+route,{headers:{Host:'127.0.0.1:8765',...(body?{Origin:'http://127.0.0.1:8765','Content-Type':'application/json','X-SEO-Ghost-Token':csrf}:{}),...extra},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
  let csrf;
  try{
    csrf=(await request('/api/config')).data.csrf;
    assert.equal((await request('/api/config',undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await request('/.env')).status,404);
    assert.equal((await request('/api/changes/apply',{id:'bad',approved:true},{'X-SEO-Ghost-Token':'wrong'})).status,403);
    assert.equal((await request('/api/changes/preview',{name:'locations/1',changes:{websiteUri:'https://new.example/'},expected:{websiteUri:'https://stale.example/'}})).status,409);
    const first=await request('/api/changes/preview',{name:'locations/1',changes:{websiteUri:'https://new.example/'},expected:{websiteUri:listing.websiteUri}});assert.equal(first.status,200);assert.equal(writes.length,0);
    assert.equal((await request('/api/changes/apply',{id:first.data.id})).status,400);
    listing.websiteUri='https://someone-else.example/';assert.equal((await request('/api/changes/apply',{id:first.data.id,approved:true})).status,409);assert.equal(writes.length,0);
    const fresh=await request('/api/changes/preview',{name:'locations/1',changes:{websiteUri:'https://new.example/'},expected:{websiteUri:listing.websiteUri}});
    const applied=await request('/api/changes/apply',{id:fresh.data.id,approved:true});assert.equal(applied.status,200);assert.equal(applied.data.verified,true);assert.equal(writes.length,1);assert.equal(listing.profile.description,'Original description');
    assert.equal((await request('/api/changes/apply',{id:fresh.data.id,approved:true})).status,409);assert.equal(writes.length,1);
    listing.categories={primaryCategory:{name:'gcid:contractor',displayName:'Contractor'},additionalCategories:[]};
    const category=await request('/api/changes/preview',{name:'locations/1',changes:{categories:{primaryCategory:{name:'gcid:plumber'},additionalCategories:[]}},expected:{categories:listing.categories}});
    assert.equal(category.status,200);assert.equal((await request('/api/changes/apply',{id:category.data.id,approved:true})).data.verified,true);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('review reply checks current reply before publishing and reads it back',async()=>{
  const name='accounts/1/locations/1/reviews/abc';let review={name,reviewReply:{comment:'Old reply'}};let writes=0;
  const server=createApp({transport:async(url,method,body)=>{if(method==='PUT'){writes++;review.reviewReply=body;return body;}return JSON.parse(JSON.stringify(review));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  let csrf;async function req(route,body){const r=await fetch(base+route,{headers:{Host:'127.0.0.1:8765',...(body?{Origin:'http://127.0.0.1:8765','Content-Type':'application/json','X-SEO-Ghost-Token':csrf}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
  try{csrf=(await req('/api/config')).data.csrf;assert.equal((await req('/api/replies/preview',{name,comment:'Thanks',expected:'Incorrect'})).status,409);const p=await req('/api/replies/preview',{name,comment:'Thanks for your feedback.',expected:'Old reply'});assert.equal(writes,0);const applied=await req('/api/changes/apply',{id:p.data.id,approved:true});assert.equal(applied.status,200);assert.equal(applied.data.verified,true);assert.equal(writes,1);}finally{await new Promise(resolve=>server.close(resolve));}
});

test('service additions preserve original items and prices, require actual Google types, and track category dependencies',async()=>{
  const original={freeFormServiceItem:{category:'gcid:plumber',label:{displayName:'Legacy repair'}},price:{currencyCode:'USD',units:'100'}};
  let listing={name:'locations/1',languageCode:'en',categories:{primaryCategory:{name:'gcid:plumber',displayName:'Plumber'},additionalCategories:[]},serviceItems:[original]};let writes=0;
  const catalog={categories:[{name:'gcid:plumber',displayName:'Plumber',serviceTypes:[{serviceTypeId:'job:drain',displayName:'Drain cleaning'}]}]};
  const server=createApp({transport:async(url,method,body)=>{if(url.includes('categories:batchGet'))return catalog;if(method==='PATCH'){if(!url.includes('validateOnly=true')){writes++;listing={...listing,...body};}return {...listing,...body};}return JSON.parse(JSON.stringify(listing));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;let csrf;
  async function req(route,body){const r=await fetch(base+route,{headers:{...(body?{Origin:'http://127.0.0.1:8765','Content-Type':'application/json','X-SEO-Ghost-Token':csrf}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
  const preview=items=>req('/api/changes/preview',{name:'locations/1',changes:{serviceItems:items},expected:{serviceItems:listing.serviceItems}});
  try{
    csrf=(await req('/api/config')).data.csrf;
    assert.equal((await preview([{structuredServiceItem:{serviceTypeId:'job:drain'}}])).status,400);
    assert.equal((await preview([original,{structuredServiceItem:{serviceTypeId:'invented'}}])).status,400);
    assert.equal((await preview([original,{freeFormServiceItem:{category:'gcid:plumber',label:{displayName:'Drain cleaning'}}}])).status,400);
    const proposed=[original,{structuredServiceItem:{serviceTypeId:'job:drain',description:'Actual drain cleaning service.'}}];
    const first=await preview(proposed);assert.equal(first.status,200);assert.equal(writes,0);
    listing.categories.primaryCategory={name:'gcid:contractor',displayName:'Contractor'};assert.equal((await req('/api/changes/apply',{id:first.data.id,approved:true})).status,409);assert.equal(writes,0);
    listing.categories.primaryCategory={name:'gcid:plumber',displayName:'Plumber'};const second=await preview(proposed);const applied=await req('/api/changes/apply',{id:second.data.id,approved:true});assert.equal(applied.status,200);assert.equal(applied.data.verified,true);assert.deepEqual(listing.serviceItems[0],original);assert.equal(writes,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
