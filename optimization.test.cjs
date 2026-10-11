const {test}=require('node:test');const assert=require('node:assert/strict');const {nextActions,observation,summarize}=require('./optimization.js');
test('priorities put blockers before content and avoid duplicate address actions',()=>{
 const f=(id,priority,status='issue',evidence='Recorded evidence')=>({id,priority,status,evidence});
 const result=nextActions([f('description','P2'),f('reviews','P1'),f('address','P0'),f('storefront','P0'),f('category','P1','unknown'),f('phone','P3','pass')]);
 assert.deepEqual(result.map(x=>x.id),['address','category','reviews']);
 assert.equal(nextActions([f('phone','P3','pass')]).length,0);
});
test('unknown service naming and baseline gaps remain checks instead of passed items',()=>{
 assert.equal(nextActions([{id:'services',priority:'P1',status:'unknown',evidence:'Water heater repair not matched'}],'Water heater repair')[0].status,'unknown');
});
test('rank observations reject invalid dates, positions and scan depth',()=>{
 const base={query:'plumber Austin',point:'30.2,-97.7',source:'Tracker mobile English',date:'2026-10-01',depth:20,rank:''};assert.equal(observation(base).rank,null);
 assert.throws(()=>observation({...base,rank:0}));assert.throws(()=>observation({...base,rank:21}));assert.throws(()=>observation({...base,date:'2026-02-31'}));assert.throws(()=>observation({...base,depth:2}));
});
test('measurement comparison keeps sources and depth separate; not-found positions are censored',()=>{
 const r=(date,rank,source='Tracker A',depth=20)=>({query:'plumber',point:'point 1',date,rank,source,depth});
 const summary=summarize([r('2026-09-01',null),r('2026-10-01',3),r('2026-09-01',1,'Tracker B'),r('2026-10-01',6,'Tracker B'),r('2026-10-01',2,'Tracker A',50)]);
 assert.equal(summary.total,3);assert.equal(summary.top3,2);assert.equal(summary.comparisons.length,2);assert.equal(summary.comparisons[0].result,'now found');assert.equal(summary.comparisons[0].delta,null);assert.equal(summary.comparisons[1].delta,-5);
 assert.equal(summarize([]).top3Percent,null);
});
