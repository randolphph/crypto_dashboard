import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const load = createTsLoader();
const { compactAllocationHistory, normalizeAllocation, shouldRecordAllocation, allocationFromSnapshots } = load('lib/portfolio/allocationHistory.ts');
const { buildAllocationStream, streamGeometry } = load('lib/portfolio/allocationStream.ts');
const HOUR = 3600000, DAY = 24 * HOUR, now = Date.UTC(2026,9,30,12,30);
const allocation = (crypto = 100, cash = 200) => [{ id: 'crypto', label: '加密资产', value: crypto }, { id: 'cash', label: '现金', value: cash }];
const point = (timestamp, crypto, cash) => ({ timestamp, allocation: allocation(crypto, cash) });

test('distribution observations validate values and preserve signs; totals alone cannot invent historical allocations or cross wallets', () => {
  assert.deepEqual(normalizeAllocation(allocation(-100)), [{ id: 'cash', label: '现金', value: 200 }, { id: 'crypto', label: '加密资产', value: -100 }]);
  for (const invalid of [undefined, [{ id:'a', label:'A', value:NaN }], [{ id:'a',label:'A',value:1 },{ id:'a',label:'Again',value:2 }]]) assert.equal(normalizeAllocation(invalid), null);
  const recovered = allocationFromSnapshots('0xABC', [{ wallet:'0xabc', timestamp:now-1000, portfolio:{totalUsd:300}, assetAllocation:allocation() }, { wallet:'0xother',timestamp:now,assetAllocation:allocation(99999) }, { wallet:'0xabc', timestamp:now,portfolio:{totalUsd:100} },{ wallet:'0xabc', timestamp:now+1,assetAllocation:[] }]);
  assert.equal(recovered.length,2);assert.equal(recovered[0].allocation[0].value,200);assert.deepEqual(recovered[1].allocation,[]);
});

test('composition changes record even with an unchanged total; identical refreshes do not; pauses and resumptions are retained', () => {
  const previous=point(now-1000,100,200);
  assert.equal(shouldRecordAllocation(previous,point(now,150,150)),true);
  assert.equal(shouldRecordAllocation(previous,point(now,100,200)),false);
  assert.equal(shouldRecordAllocation(previous,{...point(now,100,200),quality:'estimated'}),true);
  assert.equal(shouldRecordAllocation(previous,{timestamp:now,paused:true}),true);
  assert.equal(shouldRecordAllocation({timestamp:now-1000,paused:true},{timestamp:now,paused:true}),false);
  assert.equal(shouldRecordAllocation({timestamp:now-1000,paused:true},point(now,100,200)),true);
  assert.equal(shouldRecordAllocation(point(now-HOUR,100,200),point(now,100,200)),true);
});

test('retention keeps real first/last hour observations and pause boundaries, compacts old days, and rejects malformed/future data without mutation', () => {
  const hour=Math.floor(now/HOUR)*HOUR;
  const recent=[point(hour+1,1,2),point(hour+2,2,2),{timestamp:hour+3,paused:true},point(hour+4,4,2)];
  const day=new Date(now-40*DAY),noon=new Date(day.getFullYear(),day.getMonth(),day.getDate(),12).getTime();
  const input=[...recent,point(noon-2*HOUR,1,1),point(noon+1000,2,2),point(now-4*365*DAY,1,1),point(now+HOUR,1,1),{timestamp:now-1,allocation:[{id:'bad',label:'Bad',value:Infinity}]}];
  const original=structuredClone(input),out=compactAllocationHistory(input,now);
  assert.deepEqual(out.map(p=>p.timestamp),[noon+1000,hour+1,hour+3,hour+4]);assert.deepEqual(input,original);
  const stress=Array.from({length:2000},(_,i)=>point(hour+i, i, 0));assert.equal(compactAllocationHistory(stress,now).length,2);
});

test('stream model uses actual timestamps, splits pauses, and preserves positive category totals and negative metadata', () => {
  const history=[point(now-4*HOUR,100,200),point(now-3*HOUR,150,250),{timestamp:now-2*HOUR,paused:true},point(now-HOUR,200,300),point(now,300,-50)];
  const original=structuredClone(history),model=buildAllocationStream(history,[],now-DAY,'amount',now),geometry=streamGeometry(model,800);
  assert.equal(model.points.length,4);assert.deepEqual(model.segments.map(segment=>segment.length),[2,2]);assert.equal(model.points.at(-1).total,300);assert.equal(model.points.at(-1).allocation.find(row=>row.id==='cash').value,-50);
  assert.deepEqual(model.points.map(p=>p.timestamp),history.filter(p=>!p.paused).map(p=>p.timestamp));
  for(const band of geometry.bands){assert.equal(band.paths.length,2);assert.ok(band.paths.every(path=>!path.includes('NaN')&&!path.includes('Infinity')));}
  assert.equal(geometry.x(now-4*HOUR),8);assert.equal(geometry.x(now),792);assert.deepEqual(history,original);
  const shares=buildAllocationStream(history,[],now-DAY,'share',now);for(const p of shares.points)assert.ok(Math.abs(p.values.reduce((a,b)=>a+b,0)-100)<1e-9);
});

test('more than five categories combine a real Other series without dropping value; single/zero records never generate history', () => {
  const observations=[{timestamp:now-HOUR,allocation:Array.from({length:8},(_,i)=>({id:'c'+i,label:'类'+i,value:i+1}))},{timestamp:now,allocation:Array.from({length:8},(_,i)=>({id:'c'+i,label:'类'+i,value:i+2}))}];
  const model=buildAllocationStream(observations,[],now-DAY,'amount',now);assert.equal(model.series.length,5);assert.equal(model.series.at(-1).label,'其他');
  for(const p of model.points)assert.equal(p.values.reduce((sum,v)=>sum+v,0),p.total);
  const single=buildAllocationStream([point(now,100,200)],[],0,'amount',now);assert.equal(single.points.length,1);assert.ok(streamGeometry(single,300).bands.every(band=>band.paths.length===0));
  assert.equal(buildAllocationStream([point(now,0,0)],[],0,'amount',now).series.length,0);
  assert.equal(buildAllocationStream([point(now-2*DAY,1,1)],[],now-DAY,'amount',now).points.length,0);
});

test('shared ribbon boundaries follow the same quadratic curve in both directions', () => {
  const model=buildAllocationStream([point(now-3*HOUR,40,80),point(now-2*HOUR,200,10),point(now-HOUR,50,130),point(now,150,50)],[],0,'amount',now);
  const geometry=streamGeometry(model,800);
  // Sample each actual SVG path with a browser-independent quadratic evaluator.
  const commands=path=>[...path.matchAll(/([MLQ])([\d. -]+)/g)].map(([,type,numbers])=>({type,values:numbers.trim().split(/\s+/).map(Number)}));
  const curves=geometry.bands.map(band=>commands(band.paths[0]));
  const pointAt=(curve,x)=>{
    let last;
    for(const command of curve){
      const v=command.values;
      if(command.type==='M'){last=v;continue;}
      const end=command.type==='Q'?v.slice(2):v;
      if(x>Math.min(last[0],end[0])&&x<Math.max(last[0],end[0])){
        if(command.type==='L')return last[1]+(end[1]-last[1])*(x-last[0])/(end[0]-last[0]);
        let low=0,high=1;
        for(let i=0;i<40;i++){const t=(low+high)/2,px=(1-t)**2*last[0]+2*(1-t)*t*v[0]+t*t*end[0];if((px<x)===(end[0]>last[0]))low=t;else high=t;}
        const t=(low+high)/2;return (1-t)**2*last[1]+2*(1-t)*t*v[1]+t*t*end[1];
      }
      last=end;
    }
  };
  const first=curves[0],second=curves[1];
  // Forward boundary of band 2 equals the reversed lower boundary of band 1.
  const boundary=curve=>{const split=curve.findIndex((c,i)=>i>0&&c.type==='L'&&c.values[0]===792);return [curve.slice(0,split+1),[{type:'M',values:curve[split+1].values},...curve.slice(split+2)]];};
  const bottom=boundary(first)[1],top=boundary(second)[0];
  for(const x of [30,120,270,390,520,670,770])assert.ok(Math.abs(pointAt(bottom,x)-pointAt(top,x))<1e-7);
});
