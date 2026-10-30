import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const load = createTsLoader();
const { privacyFlags, restorePrivacy, nextPrivacyMode } = load('lib/privacy.ts');
const { formatUsd, formatCurrency, formatCrypto } = load('lib/format.ts');

test('privacy cycles visible → amounts masked / percentages visible → all masked', () => {
  let mode='visible';
  for(const expected of ['amounts','hidden','visible']){mode=nextPrivacyMode(mode);assert.equal(mode,expected);}
  assert.deepEqual(privacyFlags('amounts'),{mode:'amounts',hidden:true,percentHidden:false});
  assert.deepEqual(privacyFlags('hidden'),{mode:'hidden',hidden:true,percentHidden:true});
  assert.deepEqual(privacyFlags('visible'),{mode:'visible',hidden:false,percentHidden:false});
});

test('old privacy preferences migrate without revealing hidden amounts; new modes restore consistent flags', () => {
  assert.equal(restorePrivacy({hidden:true}).mode,'hidden');assert.equal(restorePrivacy({hidden:false}).mode,'visible');
  assert.equal(restorePrivacy({mode:'amounts',hidden:false}).hidden,true);
  assert.equal(restorePrivacy({mode:'amounts',percentHidden:true}).percentHidden,false);
  for(const invalid of [null,undefined,5,{mode:'invalid'}])assert.equal(restorePrivacy(invalid).mode,'visible');
});

test('store keeps three modes across reloads and migrates both legacy visible/hidden preferences', () => {
  const oldWindow=globalThis.window,oldStorage=globalThis.localStorage,map=new Map();
  const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
  globalThis.window={localStorage:storage};globalThis.localStorage=storage;
  const open=()=>createTsLoader()('stores/privacyStore.ts').usePrivacyStore;
  try{
    for(const hidden of [true,false]){
      storage.setItem('crypto-dashboard-privacy',JSON.stringify({version:1,state:{hidden}}));
      const store=open();assert.equal(store.getState().mode,hidden?'hidden':'visible');assert.equal(store.getState().percentHidden,hidden);
    }
    let store=open();store.getState().toggle();assert.equal(store.getState().mode,'amounts');
    store=open();assert.equal(store.getState().hidden,true);assert.equal(store.getState().percentHidden,false);
    store.getState().toggle();store=open();assert.equal(store.getState().percentHidden,true);
    store.getState().toggle();assert.equal(store.getState().hidden,false);
    store.getState().setHidden(true);assert.equal(store.getState().mode,'hidden');
    store.getState().setHidden(false);assert.equal(store.getState().mode,'visible');
  }finally{globalThis.window=oldWindow;globalThis.localStorage=oldStorage;}
});

test('currency display rounds to whole units across currencies without negative zero or changing source precision', () => {
  assert.equal(formatUsd(1234.6),'$1,235');assert.equal(formatUsd(-.49),'$0');assert.equal(formatUsd(-1234.6),'-$1,235');
  assert.match(formatCurrency(1234.6,'CNY'),/1,235$/);assert.match(formatCurrency(1234.6,'HKD'),/1,235$/);
  assert.equal(formatCrypto(.00001234),'0.00001234');
});
