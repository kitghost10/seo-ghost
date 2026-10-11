(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GhostOptimization=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const core=new Set(['facts','context','status','eligibility','storefront','address','category']);
  const groups={storefront:'address',eligibility:'address',address:'address',reviews:'reviews','review-replies':'reviews',services:'services'};
  function nextActions(findings,focus=''){
    const active=findings.filter(f=>f.status!=='pass');
    const weight=f=>{const priority=Number(f.priority.slice(1));return priority*100+(core.has(f.id)?0:20)+(f.status==='unknown'?5:0)+(f.id==='services'&&focus&&f.evidence.toLowerCase().includes(focus.toLowerCase())?-10:0);};
    const sorted=active.slice().sort((a,b)=>weight(a)-weight(b));const chosen=[],seen=new Set();
    for(const f of sorted){const group=groups[f.id]||f.id;if(seen.has(group))continue;seen.add(group);chosen.push(f);if(chosen.length===3)break;}
    return chosen;
  }
  function observation(raw){
    const text=(k,max=200)=>{if(typeof raw[k]!=='string'||!raw[k].trim()||raw[k].trim().length>max)throw new Error('Enter a valid '+k+'.');return raw[k].trim();};
    const query=text('query'),point=text('point'),source=text('source');const date=text('date',10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Enter a valid observation date.');
    const depth=Number(raw.depth);if(!Number.isInteger(depth)||depth<3||depth>200)throw new Error('Scan depth must be between 3 and 200.');
    const rank=raw.rank===''||raw.rank==null?null:Number(raw.rank);if(rank!==null&&(!Number.isInteger(rank)||rank<1||rank>depth))throw new Error('Rank must be within the scan depth, or blank for not found.');
    return {query,point,source,date,depth,rank};
  }
  function summarize(rows){
    // Different providers, scan depths, and point labels are deliberately separate comparisons.
    const key=r=>JSON.stringify([r.query.toLowerCase(),r.point.toLowerCase(),r.source.toLowerCase(),r.depth]);
    const grouped=new Map();for(const r of rows){const k=key(r);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(r);}
    const latest=[],comparisons=[];
    for(const list of grouped.values()){
      list.sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||'').localeCompare(b.createdAt||''));const after=list.at(-1);latest.push(after);
      const before=list.find(r=>r.date<after.date);if(!before)continue;
      const result=before.rank==null&&after.rank!=null?'now found':before.rank!=null&&after.rank==null?'not found now':before.rank==null?'not found in either scan':after.rank<before.rank?'improved':after.rank>before.rank?'declined':'unchanged';
      comparisons.push({query:after.query,point:after.point,source:after.source,depth:after.depth,before,after,result,delta:before.rank!=null&&after.rank!=null?before.rank-after.rank:null});
    }
    const top3=latest.filter(r=>r.rank!==null&&r.rank<=3).length;
    return {latest,comparisons,top3,total:latest.length,top3Percent:latest.length?Math.round(top3/latest.length*100):null};
  }
  return {nextActions,observation,summarize};
});
