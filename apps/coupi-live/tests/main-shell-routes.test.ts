import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMainView,mainHref,mainLocation} from '../components/main-shell-routes';

test('fresh, partial and returning visitors have different default routes while explicit Explore stays open',()=>{
  const home=mainLocation('/');assert.equal(initialMainView(home),'hatch');
  assert.equal(initialMainView(home,{hatched:true}),'call');
  assert.equal(initialMainView(home,{hatched:true,interviewComplete:true}),'home');
  assert.equal(initialMainView(home,{hatched:true,interviewPaused:true}),'home');
  assert.equal(initialMainView(home,undefined,true),'home');
  assert.equal(initialMainView(mainLocation('/explore')),'world');
  assert.equal(initialMainView(mainLocation('/call?ignored')),'hatch');
  assert.equal(initialMainView(mainLocation('/call')),'call');
  assert.equal(initialMainView(mainLocation('/home')),'home','an explicit Home visit must not bounce a fresh user back to hatch');
  assert.equal(initialMainView(mainLocation('/home'),{hatched:true}),'home','a partial interview does not trap the Home tab');
  assert.equal(initialMainView(mainLocation('/search')),'search');
  assert.equal(mainHref('search'),'/search');
  assert.equal(initialMainView(mainLocation('/hatch'),{hatched:true,interviewComplete:true}),'hatch');
});

test('districts, saved moments and suggested worlds survive route refresh and browser back parsing',()=>{
  const views=[{view:'district' as const,districtId:'district-123',momentId:'moment-456'},{view:'preview' as const,templateId:'date-night'},{view:'archive' as const,archiveId:'archive-1',momentId:'moment-2'}];
  for(const location of views){const href=mainHref(location.view,location),url=new URL(href,'https://coupi.test');assert.equal(url.pathname,'/explore');assert.deepEqual(mainLocation(url.pathname,url.search),location);}
  assert.equal(mainHref('world'),'/explore');assert.equal(mainHref('call'),'/call');assert.equal(mainHref('hatch'),'/hatch');assert.equal(mainHref('home'),'/home');
  assert.deepEqual(mainLocation('/explore','?world=%3Cscript%3E'),{view:'world'});
  assert.deepEqual(mainLocation('/explore','?district=https%3A%2F%2Foutside.invalid'),{view:'world'});
});

test('legacy presentation links resolve in the direct app without nesting another phone frame',()=>{
  assert.equal(mainLocation('/experience','?utility=call').view,'call');
  assert.equal(mainLocation('/','?utility=world').view,'world');
  assert.equal(mainLocation('/experience','?utility=hatch').view,'hatch');
  assert.equal(mainLocation('/experience','', 'world').view,'world');
});
