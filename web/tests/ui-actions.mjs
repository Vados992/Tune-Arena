let podiumFixture=[];let garageTrophies=[];
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://arena.example.invalid/'});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLSelectElement','HTMLTextAreaElement','Node','Event','MutationObserver','FormData','File','localStorage','history','location'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
window.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));};
window.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async v=>{copied=v;}},configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.IntersectionObserver=class {observe(){}disconnect(){}};
const React=await import('react');const {render,screen,within,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const modules=await build({entryPoints:['app/welcome.tsx','app/arena.tsx','app/admin-panel.tsx','app/business/business-panel.tsx','app/shop/page.tsx','app/install/install-client.tsx','app/winners/winners-panel.tsx'],bundle:true,format:'esm',platform:'node',write:false,outdir:'node_modules/.cache/tune-ui',outExtension:{'.js':'.mjs'},mainFields:['module','main'],jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'ui-fixtures',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));b.onResolve({filter:/photo-picker$/},()=>({path:'picker',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import {createElement} from 'react';export default function Picker(p){return createElement('button',{type:'button',onClick:()=>p.onChange(new File(['photo'],'photo.png',{type:'image/png'}))},'Select fixture photo');}`}));}}]});
const components={};for(const file of modules.outputFiles){const key=file.path.includes('welcome.mjs')?'welcome':file.path.includes('admin-panel.mjs')?'admin':file.path.includes('arena.mjs')?'arena':file.path.includes('business')?'business':file.path.includes('partners')?'partners':file.path.includes('shop')?'shop':file.path.includes('install-client')?'install':'winners';mkdirSync(dirname(file.path),{recursive:true});writeFileSync(file.path,file.text);components[key]=(await import(pathToFileURL(file.path).href)).default;}
const clock=Math.floor(Date.now()/1000);let calls=[],model,commerce,sponsors,roundDetail,staffMembers,assignedStaff,staffAccessFixture;
const profile=()=>({nickname:'Driver',premium:true,premiumUntil:clock+86400,trialUsed:true,frame:'plain',gift:false});
function reset(){garageTrophies=[];cleanup();localStorage.clear();history.replaceState(null,'','/');calls=[];copied='';staffMembers=[];assignedStaff=[];staffAccessFixture={role:'owner',canCreate:true};model={signedIn:true,admin:true,role:'owner',providers:{email:false,telegram:false},profile:profile(),club:{url:'https://arena.example.invalid/?ref=fixture',invited:0,active:0,progress:0,goal:3,earnedMonths:0,pendingRewardDays:0,welcomePending:false},round:{id:'round-ui',kind:'weekly',opens:clock-10,closes:clock+3600,serverTime:clock,submissionsClose:clock+1800,submissionsClosed:false,closed:false,title:'UI round',notice:'',prize:'',announced:0},motor:{enabled:true,available:true,spentEntry:null},entries:[{id:'foreign-entry',name:'Foreign Build',description:'Fixture tuning',image:'/fixture.png',likes:0,liked:false,dislikes:0,disliked:false,mine:false,sample:false,frame:'plain',gift:0,nickname:'Other',created:clock-2,premium:false,motors:0,score:0,entryOrder:1}],myEntry:null};commerce={products:[],orders:[],audit:[],ready:false,seller:null,entitlements:[],paymentsReady:false,signedIn:true};sponsors={sponsors:[],campaigns:[],posts:[],leads:[]};roundDetail={round:{id:'round-ui',title:'UI round',kind:'weekly',closed:0,submission_closes:clock+1800,closes:clock+3600,opens:clock-100,notice:'',prize:''},entries:[{id:'pending',name:'Pending Build',withdrawn:0,hidden:1,moderation_state:'pending',moderation_reason:'',photo:'/fixture.png',votes:0}],events:[],voteActivity:[],next:{entries:null,votes:null}};}
function body(options){if(!options?.body)return{};if(options.body instanceof FormData)return Object.fromEntries(options.body.entries());return JSON.parse(options.body);}
globalThis.fetch=async(url,options={})=>{const path=String(url).replace('/api/',''),method=options.method??'GET',data=body(options);calls.push({path,method,data});let result={ok:true},status=200;
 if(path==='auth/options')result={telegram:false,google:false,apple:false,phone:false};
 else if(path.startsWith('state'))result=structuredClone(model);
 else if(path==='sponsors')result={campaigns:[],posts:[]};else if(path.startsWith('promotions'))result={entries:[]};
 else if(path==='trophies')result={trophies:structuredClone(garageTrophies),signedIn:model.signedIn};
 else if(path==='admin/commerce'||path==='commerce/catalog')result=structuredClone(commerce);
 else if(path==='admin/sponsors')result=structuredClone(sponsors);
 else if(path==='admin/access'&&method==='GET')result={members:structuredClone(staffMembers),events:[]};
 else if(path==='admin/access'&&method==='POST'){const nickname=data.nickname.replace(/^@/,'');let member=staffMembers.find(m=>m.nickname===nickname);if(!member){member={id:'team-id',nickname,canCreate:0,rounds:0};staffMembers.push(member);}member.canCreate=Number(data.canCreate);}
 else if(path==='admin/access/revoke'){staffMembers=staffMembers.filter(m=>m.id!==data.userId);assignedStaff=assignedStaff.filter(id=>id!==data.userId);}
 else if(path==='admin/access/rounds/round-ui'&&method==='GET')result={members:staffMembers.map(m=>({...m,assigned:Number(assignedStaff.includes(m.id))}))};
 else if(path==='admin/access/rounds/round-ui'&&method==='PUT'){assignedStaff=data.assigned?[...new Set([...assignedStaff,data.userId])]:assignedStaff.filter(id=>id!==data.userId);}
 else if(path==='admin/overview'){if(staffAccessFixture.role==='participant'){status=403;result={error:'forbidden'};}else result={access:staffAccessFixture,summary:{rounds:1,active:1,entries:1,votes:0,...(staffAccessFixture.role==='owner'?{profiles:5,premium:2}:{})},activity:[]};}
 else if(path==='admin/rounds'||path.startsWith('admin/rounds?'))result={rounds:[roundDetail.round],next:null};else if(path==='admin/rounds/round-ui')result=structuredClone(roundDetail);
 else if(path==='rounds/round-ui/votes/foreign-entry'){model.entries[0].liked=method==='PUT';model.entries[0].likes=method==='PUT'?1:0;}
 else if(path==='profile/avatar'){model.profile.avatar=method==='PUT'?'/api/avatars/fixture-avatar':null;}
 else if(path==='rounds/round-ui/motors/foreign-entry'){model.motor.available=false;model.motor.spentEntry='foreign-entry';}
 else if(path==='profile/frame')model.profile.frame=data.frame;
 else if(path==='gift'){model.profile.gift=true;model.profile.frame='flame';}
 else if(path==='premium'){model.profile.premium=true;model.profile.trialUsed=true;model.profile.frame='neon';}
 else if(path==='profile/nickname')model.profile.nickname=data.nickname;
 else if(path.startsWith('rounds?offset='))result={rounds:[{id:'public-round',title:'Public tour',opens:clock-100,closes:clock+100,prize:'100 USDT'}],next:null,serverTime:clock};
 else if(path==='rounds'&&method==='POST')result={id:'round-ui'};
 else if(path==='rounds/round-ui/entries'&&method==='POST'){result={id:'my-entry'};model.myEntry={id:'my-entry',name:data.name,description:data.description,withdrawn:0,moderation_state:'approved'};}
 else if(path==='rounds/round-ui/entries/my-entry'&&method==='PUT'){model.myEntry.name=data.name;result={id:'replacement'};}
 else if(path==='rounds/round-ui/entries/my-entry'&&method==='DELETE')model.myEntry.withdrawn=1;
 else if(path==='account'&&method==='DELETE'){status=503;result={error:'server_error'};}
 else if(path==='auth/email'){status=503;result={error:'provider_unavailable'};}
 else if(path==='winners?offset=0'||path.startsWith('winners'))result={rounds:podiumFixture,next:null};
 else if(path==='admin/commerce/settings')commerce.seller=data.seller;
 else if(path.startsWith('admin/commerce/products')){const id='sku-fixture';commerce.products=[{...data,id,shipping_minor:data.shippingMinor}];result={id};}
 else if(path==='admin/sponsors/brands'){sponsors.sponsors.push({...data,id:'brand-ui'});result={id:'brand-ui'};}
 else if(path==='admin/sponsors/campaigns'){sponsors.campaigns.push({...data,id:'campaign-ui',sponsor_id:data.sponsorId,prize_state:data.prizeState,prize_reference:data.prizeReference,fee_minor:data.feeMinor,brand:'Brand UI',impressions:0,clicks:0,promos:0});result={id:'campaign-ui'};}
 else if(path==='admin/sponsors/posts'){sponsors.posts.push(data);}
 else if(path==='admin/moderation/pending'){roundDetail.entries[0].moderation_state=data.decision;roundDetail.entries[0].moderation_reason=data.reason;}
 else if(path==='partners/leads')result={id:'lead-ui'};
 else if(path==='admin/commerce/orders/merch-ui')result={shipping:{address:'Fixture address'}};
 else if(path.startsWith('admin/commerce/orders/')){const id=path.split('/')[3],o=commerce.orders.find(x=>x.id===id);const action=path.split('/')[4];o.state=action==='confirm'?'paid':action==='ship'?'shipped':'refunded';}
 else throw new Error('Unmapped UI action: '+method+' '+path);
 return Response.json(result,{status});};
const click=element=>fireEvent.click(element);
const button=(name,scope=screen)=>scope.getByRole('button',{name,exact:true});
const fill=(form,name,value)=>fireEvent.change(form.elements.namedItem(name),{target:{value}});
async function expectCall(path,method='POST'){await waitFor(()=>assert(calls.some(c=>c.path===path&&c.method===method),'Missing '+method+' '+path));}
async function mount(which,props={}){render(React.createElement(components[which],props));await waitFor(()=>assert(!document.body.textContent.includes('Loading round…')));}
// Returning visitors get a compact login view; a device hint never authenticates them.
reset();await mount('welcome',{locale:'ru'});await waitFor(()=>assert(screen.getByRole('heading',{name:'Разный тюнинг. Одна арена.'})));assert(document.querySelector('.welcome-expo'));assert(screen.getByRole('heading',{name:'Зарегистрироваться',exact:true}));click(button('У меня уже есть аккаунт'));await waitFor(()=>assert(screen.getByRole('heading',{name:'Войти в аккаунт'})));assert(!document.querySelector('.welcome-expo'));assert.equal(localStorage.getItem('ta_known_account'),'1');assert(!calls.some(c=>c.method!=='GET'));click(button('Создать аккаунт'));assert(document.querySelector('.welcome-expo'));
reset();localStorage.setItem('ta_known_account','1');await mount('welcome',{locale:'ru'});await waitFor(()=>assert(screen.getByRole('heading',{name:'Войти в аккаунт'})));assert(!document.querySelector('.welcome-expo'));assert(screen.getByRole('heading',{name:/С возвращением/}));assert(!calls.some(c=>c.method!=='GET'));
console.log('PASS: new-visitor registration, returning-device login, account-mode switch and no authentication from device memory.');
// Arena: navigation, new ad link, both reactions, Motor spend, profile tools and forms.
reset();model.entries.push({...model.entries[0],id:'sample-entry',name:'Demo Build',image:'/garage/86.webp',sample:true});await mount('arena',{initialLanguage:'en'});
await waitFor(()=>assert(screen.getByText('Foreign Build')));
assert(!screen.queryByText('Demo Build'));
const feed=document.querySelector('.participant-feed');
assert.equal(feed.querySelector('article').firstElementChild.querySelector('img').alt,'Foreign Build');
assert.equal(document.querySelector('main').querySelector(':scope > section'),feed);
assert(!document.querySelector('main .hero, main .social-composer, main .feed-filters, main .strip, main .section-title'));
assert(!document.querySelector('.ad-vacancy, .sponsor-placements, .social-side, .rail-club'));
assert(!document.querySelector('a[href="/partners"]'));
assert(!calls.some(c=>c.path.startsWith('sponsors')||c.path.startsWith('promotions')));
click(screen.getByRole('button',{name:'Vote',exact:true}));await expectCall('rounds/round-ui/votes/foreign-entry','PUT');
assert(!screen.queryByRole('button',{name:'Dislike',exact:true}));
click(screen.getByRole('button',{name:'Turbo +5',exact:true}));await expectCall('rounds/round-ui/motors/foreign-entry','PUT');await waitFor(()=>assert(button('Turbo +5').disabled));const spentCalls=calls.filter(c=>c.path.includes('/motors/')).length;click(button('Turbo +5'));assert.equal(calls.filter(c=>c.path.includes('/motors/')).length,spentCalls);
assert(!screen.queryByRole('button',{name:'Rules',exact:true}));
click(screen.getAllByRole('button',{name:'Round',exact:true})[0]);assert.equal(document.querySelectorAll('.tour-banner').length,1);assert(!screen.queryByText('Demo Build'));assert(!document.querySelector('.strip'));assert(screen.getByRole('heading',{name:'UI round',exact:true}));assert(document.querySelector('.tour-prize').textContent.includes('Prize not announced'));
click(screen.getByRole('button',{name:'Rules',exact:true}));assert(screen.getByRole('dialog'));fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});assert(!screen.queryByRole('dialog'));
click(screen.getAllByRole('button',{name:'Community feed',exact:true})[0]);
click(screen.getAllByRole('button',{name:'Round',exact:true})[0]);assert(!document.querySelector('.rank'));assert(!screen.queryByText('The winner appears after voting closes.'));assert(document.querySelector('.tour-banner .tour-share'));click(screen.getByRole('button',{name:'Share round',exact:true}));await waitFor(()=>assert(copied.includes('round=round-ui')));
const search=screen.getByRole('searchbox');fireEvent.change(search,{target:{value:'missing-build'}});await waitFor(()=>assert(!screen.queryByRole('heading',{name:'Foreign Build'})));fireEvent.change(search,{target:{value:''}});
commerce.products=[{id:'premium-fixture',name:'Garage Premium',kind:'premium',amount:1200,currency:'eur',duration:2592000,stock:-1}];garageTrophies=[{code:'TA-test-overall',category:'overall',title:'Won round',name:'My old build',issued:clock-86400,revoked:0},{code:'TA-revoked',category:'popular',title:'Revoked trophy',name:'Old build',issued:clock-86400,revoked:1}];
click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);
await waitFor(()=>assert(screen.getByText('€12.00')));
await waitFor(()=>assert(document.querySelector('.garage-trophies')));
assert.deepEqual([...document.querySelector('.garage-stack').children].map(e=>e.dataset.garageSection),['profile','car','premium','referrals','trophies','account']);assert(!screen.queryByText('Revoked trophy'));assert(screen.getByText('0 of 3 friends'));assert(document.querySelector('.garage-premium-badge'));assert.equal(document.querySelector('.garage-premium-card .primary').textContent,'Renew');assert.equal(document.querySelector('.garage-premium-expiry time').getAttribute('datetime'),new Date(model.profile.premiumUntil*1000).toISOString());
const openAppearance=()=>click(within(document.querySelector('.garage-profile')).getByRole('button',{name:'Avatar appearance',exact:true}));
assert.equal(screen.getByRole('link',{name:'Upload avatar',exact:true}).getAttribute('href'),'/upload/avatar');
openAppearance();assert(screen.getByRole('dialog').classList.contains('avatar-sheet'));assert.equal(within(screen.getByRole('dialog')).getByRole('button',{name:'Default',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(within(screen.getByRole('dialog')).getByRole('link',{name:'Change photo',exact:true}).getAttribute('href'),'/upload/avatar');fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
openAppearance();click(button('Flame Spec'));await expectCall('gift');await waitFor(()=>assert(model.profile.frame==='flame'));await waitFor(()=>assert(!button('Carbon Weave').disabled));click(button('Carbon Weave'));await waitFor(()=>assert(model.profile.frame==='carbon'));fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});assert(!screen.queryByRole('dialog'));
click(screen.getByRole('button',{name:/Copy link/}));await waitFor(()=>assert(copied.includes('ref=fixture')));
click(button('Nickname'));let dialog=screen.getByRole('dialog');let form=dialog.querySelector('form');fill(form,'nickname','Renamed_Driver');fireEvent.submit(form);await expectCall('profile/nickname','PUT');await waitFor(()=>assert(!screen.queryByRole('dialog')));
assert.equal(screen.getByRole('link',{name:'Post a car',exact:true}).getAttribute('href'),'/upload/entry?round=round-ui');
assert.equal(document.querySelector('.mobile-create').tagName,'A');assert.equal(document.querySelector('.mobile-create').getAttribute('href'),'/upload/entry?round=round-ui');assert.equal(document.querySelector('.mobile-create').getAttribute('target'),'_top');
reset();model.myEntry={id:'my-entry',name:'My UI build',description:'Fixture',withdrawn:0,moderation_state:'approved'};await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);assert.equal(screen.getByRole('link',{name:'Replace',exact:true}).getAttribute('href'),'/upload/entry?round=round-ui');click(button('Delete'));dialog=screen.getByRole('dialog');click(within(dialog).getByRole('button',{name:'Withdraw build'}));await expectCall('rounds/round-ui/entries/my-entry','DELETE');
console.log('PASS: arena buttons map to correct reaction/Motor/profile/referral/upload/replace/withdraw handlers; consumed Motor disabled; no advertising or partner links.');
// Deadline and ordinary-account locks; guest controls must open sign-in.
reset();model.profile.premium=false;model.myEntry={id:'my-entry',name:'Fixed build',description:'Fixture',withdrawn:0};await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);assert(screen.getByText('Fixed build'));assert(!screen.queryByRole('button',{name:'Replace',exact:true}));assert.equal(document.querySelector('.mobile-create').getAttribute('href'),'/upload/entry?round=round-ui');
reset();model.round.submissionsClosed=true;model.round.submissionsClose=clock-1;model.myEntry={id:'my-entry',name:'Fixed build',description:'Fixture',withdrawn:0};await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);assert(screen.getByText('Fixed build'));assert.equal(screen.getByRole('link',{name:'Replace',exact:true}).getAttribute('href'),'/upload/entry?round=round-ui');assert(button('Delete').disabled);assert.equal(document.querySelector('.mobile-create').getAttribute('aria-disabled'),null);
reset();model.signedIn=false;model.profile=null;model.club=null;await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(button('Vote'));dialog=screen.getByRole('dialog');assert(within(dialog).getByRole('link',{name:/Telegram/}));assert(!within(dialog).queryByRole('button',{name:'Telegram'}));assert(!within(dialog).queryByRole('textbox',{name:'Email'}));click(within(dialog).getByRole('button',{name:'Close'}));
// Turbo opens sign-in or the Premium offer instead of silently doing nothing.
reset();model.signedIn=false;model.profile=null;model.motor.available=false;await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));assert(!button('Turbo +5').disabled);click(button('Turbo +5'));assert(within(screen.getByRole('dialog')).getByRole('link',{name:/Telegram/}));assert(!calls.some(c=>c.path.includes('/motors/')));
reset();model.profile.premium=false;model.motor.available=false;await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(button('Turbo +5'));await waitFor(()=>assert(within(screen.getByRole('dialog')).getByRole('link',{name:'Renew',exact:true})));assert(!calls.some(c=>c.path.includes('/motors/')));
console.log('PASS: guest sign-in gating, fixed ordinary submission and entry-deadline locks.');
// Garage: ordinary-account locks open Premium; the default frame stays free.
reset();model.profile.premium=false;model.profile.premiumUntil=0;model.myEntry={id:'mine-current',name:'My current car',description:'My car description',withdrawn:0,image:'/my-car.png',likes:7,rank:2,score:12,moderation_state:'approved'};commerce.products=[{id:'premium-fixture',name:'Garage Premium',kind:'premium',amount:1200,currency:'eur',duration:2592000,stock:-1}];await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);await waitFor(()=>assert(screen.getByText('€12.00')));assert(document.querySelector('.garage-car img[src="/my-car.png"]'));assert(document.querySelector('.garage-car-stats').textContent.includes('7'));assert(screen.getByText('#2'));assert(!document.querySelector('.garage-premium-badge'));assert(!document.querySelector('.garage-trophies'));assert(!screen.queryByRole('button',{name:'Replace',exact:true}));assert.equal(document.querySelector('.garage-premium-card .primary').textContent,'Buy');
click(within(document.querySelector('.garage-profile')).getByRole('button',{name:'Avatar appearance'}));const locked=within(screen.getByRole('dialog')).getByRole('button',{name:'Gold Edition · Requires Premium',exact:true});assert(!locked.disabled);click(locked);assert(screen.getByRole('dialog').textContent.includes('Premium frames'));const buyPremium=within(screen.getByRole('dialog')).getByRole('link',{name:'Buy',exact:true});assert.equal(buyPremium.getAttribute('href'),'/shop?premium=1&product=premium-fixture');assert(!calls.some(c=>c.path==='profile/frame'));fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});assert(screen.getByRole('dialog').classList.contains('avatar-sheet'));click(button('Default'));await expectCall('profile/frame','PUT');fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
reset();await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);assert.equal(screen.getByRole('link',{name:'Post a car',exact:true}).getAttribute('href'),'/upload/entry?round=round-ui');assert(!screen.queryByRole('dialog'));await waitFor(()=>assert(screen.getByText('Price is not configured yet')));
console.log('PASS: Garage order, current photo/likes/rank, actual price and expiry, referral progress, active trophies, locked-frame Premium offer, free default frame and empty-car submission.');

reset();model.round=null;model.entries=[];await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('No tournament photos have been uploaded yet.')));assert(!document.querySelector('main article'));assert(!document.querySelector('main img[src^="/garage/"]'));
console.log('PASS: participant photos appear first; sample builds and promotional headers are excluded; empty feed does not show demo photos.');
// Empty/default round uses the requested compact card.
reset();model.round.title='';await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Round',exact:true})[0]);assert(screen.getByRole('heading',{name:'Night Neon',exact:true}));assert(screen.getByRole('button',{name:'Rules',exact:true}));
console.log('PASS: compact round banner, Rules, Turbo action, participant-only feed, and removal of advertising/partner navigation.');

// The upcoming round is always visible; the public catalogue loads on expansion.
reset();model.nextRound={id:'next',title:'Turbo Night',opens:clock+86400,prize:'100 USDT'};await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Round',exact:true})[0]);assert(document.querySelector('.next-tour').textContent.includes('Turbo Night'));assert(document.querySelector('.next-tour').textContent.includes('100 USDT'));const allTours=document.querySelector('.all-tours');assert(!allTours.open);assert(!allTours.contains(document.querySelector('.next-tour')));assert(!document.querySelector('a[href="/tour-demo"]'));assert(!calls.some(c=>c.path.startsWith('rounds?offset=')));allTours.open=true;fireEvent(allTours,new Event('toggle'));await waitFor(()=>assert(screen.getByText('Public tour')));assert(document.querySelector('.all-tours a').getAttribute('href').endsWith('&tour=1'));
console.log('PASS: upcoming tour remains outside the collapsed All rounds list; catalogue loads on expansion; demo link removed.');

// Account deletion is at the bottom and never starts without explicit confirmation.
reset();await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);assert.equal(document.querySelector('.garage-stack').lastElementChild.dataset.garageSection,'account');click(button('Delete account'));let deleteDialog=screen.getByRole('dialog');assert(within(deleteDialog).getByText(/Anonymous round results/));assert(within(deleteDialog).getByRole('button',{name:'Delete permanently',exact:true}).disabled);assert(!calls.some(c=>c.path==='account'));click(within(deleteDialog).getByRole('button',{name:'Keep account',exact:true}));assert(!screen.queryByRole('dialog'));assert(!calls.some(c=>c.path==='account'));click(button('Delete account'));deleteDialog=screen.getByRole('dialog');assert(!within(deleteDialog).getByRole('checkbox').checked);click(within(deleteDialog).getByRole('checkbox'));assert(!within(deleteDialog).getByRole('button',{name:'Delete permanently',exact:true}).disabled);fireEvent.submit(deleteDialog.querySelector('form'));await expectCall('account','DELETE');assert.deepEqual(calls.find(c=>c.path==='account').data,{confirmation:'DELETE'});await waitFor(()=>assert(within(deleteDialog).getByRole('status')));assert(model.signedIn);assert.equal(localStorage.getItem('ta_known_account'),'1');
reset();model.signedIn=false;model.profile=null;model.club=null;await mount('arena',{initialLanguage:'en'});await waitFor(()=>assert(screen.getByText('Foreign Build')));click(screen.getAllByRole('button',{name:'Garage',exact:true})[0]);assert(!screen.queryByRole('button',{name:'Delete account',exact:true}));
console.log('PASS: deletion appears last only for authenticated accounts; confirmation, cancel, consent reset and failure recovery preserve the account.');

// Commercial admin forms: click handlers, field conversions and order commands.
reset();commerce.orders=[{id:'invoice-ui',name:'UI invoice',amount:1000,currency:'eur',state:'pending',kind:'premium',payment_method:'invoice'},{id:'merch-ui',name:'UI merch',amount:2000,currency:'eur',state:'paid',kind:'merch',payment_method:'invoice'}];
await mount('business');await waitFor(()=>assert(screen.getByRole('heading',{name:'Добавить товар / VIP-опцию',exact:true})));assert(!screen.queryByRole('button',{name:'Партнёры',exact:true}));
const formFor=title=>screen.getByRole('heading',{name:title,exact:true}).closest('section').querySelector('form');
form=formFor('Добавить товар / VIP-опцию');fill(form,'name','UI product');fill(form,'amount','12.50');fill(form,'stock','3');fill(form,'terms','Fixture sale terms');fireEvent.click(form.elements.namedItem('active'));fireEvent.submit(form);await expectCall('admin/commerce/products');assert.equal(calls.find(c=>c.path==='admin/commerce/products').data.amount,1250);await waitFor(()=>assert(screen.getByText('UI product')));
const productRow=screen.getByText('UI product').closest('.order-row');click(within(productRow).getByRole('button',{name:'Изменить'}));form=formFor('Изменить товар');assert.equal(form.elements.namedItem('amount').value,'12.5');
click(button('Настройки'));form=formFor('Продавец и внешние подключения');fill(form,'seller','Fixture UI merchant');fireEvent.submit(form);await expectCall('admin/commerce/settings');
click(button('Заказы'));let row=screen.getByText(/UI invoice/).closest('.order-row');form=row.querySelector('form');fill(form,'reference','Fixture invoice receipt');fireEvent.submit(form);await expectCall('admin/commerce/orders/invoice-ui/confirm');
await waitFor(()=>assert(commerce.orders[0].state==='paid'));row=screen.getByText(/UI merch/).closest('.order-row');click(within(row).getByRole('button',{name:'Адрес для доставки'}));await expectCall('admin/commerce/orders/merch-ui','GET');await waitFor(()=>assert(screen.getByText('Адрес доставки: Fixture address')));form=row.querySelector('form');fill(form,'reference','Fixture tracking');fireEvent.submit(form);await expectCall('admin/commerce/orders/merch-ui/ship');
click(button('Модерация'));let section=screen.getByRole('heading',{name:'Очередь модерации'}).closest('section');await waitFor(()=>assert(within(section).getByRole('option',{name:'UI round'})));fireEvent.change(section.querySelector('select'),{target:{value:'round-ui'}});await waitFor(()=>assert(screen.getByText('Pending Build')));form=screen.getByText('Pending Build').closest('.order-row').querySelector('form');fill(form,'decision','rejected');fill(form,'reason','Fixture UI rejection');fireEvent.submit(form);await expectCall('admin/moderation/pending');assert.equal(calls.find(c=>c.path==='admin/moderation/pending').data.decision,'rejected');
click(button('Трофеи / NFT'));click(button('Подготовить и отправить через мой кошелёк'));await waitFor(()=>assert(screen.getByRole('status').textContent.includes('кошельком')));
console.log('PASS: catalogue price conversion and edit, seller settings, invoice confirmation, shipping/address controls, moderation decisions and missing-wallet feedback.');
reset();await mount('shop');await waitFor(()=>assert(screen.getByText('Каталог готовится')));assert(screen.getByText(/Продавец ещё не настроен/));
reset();podiumFixture=[{id:'finished',title:'Community Final',kind:'weekly',closedAt:clock-60,prize:'',announced:0,winner:null,charged:true,rewardGranted:false,overallWinner:null,podium:{popular:[1,2,3].map(place=>({id:'p'+place,name:'Build '+place,nickname:'Driver'+place,place,points:4-place})),overall:[1,2,3].map(place=>({id:'o'+place,name:'Build '+place,nickname:'Champion'+place,place,points:9-place}))}}];await mount('winners',{initialLanguage:'en'});await waitFor(()=>assert(document.querySelectorAll('.winner-prize-place').length===3));for(const nick of ['@Champion1','@Champion2','@Champion3'])assert(screen.getByText(nick));assert(!screen.queryByRole('table'));assert(!screen.queryByRole('button',{name:'Refresh',exact:true}));assert(!document.querySelector('.section-nav'));assert(!document.querySelector('a[href="/trophies"],a[href="/shop"]'));assert(screen.getAllByText('Prize not announced').length===3);
console.log('PASS: unconfigured shop status, podium nicknames/dates, and winners refresh.');
reset();history.replaceState(null,'','/shop?premium=1&product=premium-fixture');commerce.seller='Fixture merchant';commerce.products=[{id:'premium-fixture',name:'Garage Premium',kind:'premium',amount:1200,currency:'eur',duration:2592000,stock:-1,terms:'Fixture terms'}];await mount('shop');await waitFor(()=>assert(screen.getByRole('button',{name:'Оформить',exact:true})));assert(!calls.some(c=>c.path==='commerce/orders'));click(button('Закрыть'));assert(!screen.queryByRole('button',{name:'Оформить',exact:true}));
console.log('PASS: Premium purchase link selects the configured product without creating an order; checkout closes normally.');

reset();const archived={kind:'weekly',closedAt:clock-300,prize:'',announced:0,winner:null,charged:false,rewardGranted:false,overallWinner:null,podium:{popular:[],overall:[{id:'winner',name:'Build',nickname:'Winner',place:1,points:1}]}};podiumFixture=[{...archived,id:'old',title:'Older round'},{...archived,id:'future',title:'Active round',closedAt:clock+3600},{...archived,id:'new',title:'Newest round',closedAt:clock-60},{...archived,id:'test-only',title:'Private test',kind:'test'}];await mount('winners',{initialLanguage:'en'});await waitFor(()=>assert(document.querySelectorAll('.past-round').length===2));assert.deepEqual([...document.querySelectorAll('.past-round-heading h2')].map(e=>e.textContent),['Newest round','Older round']);assert(!screen.queryByText('Active round'));assert(!screen.queryByText('Private test'));assert(!document.querySelector('a[href="/partners"]'));
console.log('PASS: winners show completed public rounds only, newest first; active and private test rounds are excluded.');


reset();await mount('install',{initialLanguage:'en'});
for(const device of ['iPhone / iPad','Android','Windows / Mac']){click(button('Show steps: '+device));const d=screen.getByRole('dialog');assert(d.textContent.includes(device==='iPhone / iPad'?'Safari':device==='Android'?'Chrome':'Chrome or Edge'));if(device==='iPhone / iPad'){click(within(d).getByRole('button',{name:'Copy installation link'}));await waitFor(()=>assert(copied.endsWith('/install')));}click(within(d).getByRole('button',{name:'Close instructions'}));assert(!screen.queryByRole('dialog'));}
console.log('PASS: installation instructions open and close for iPhone/iPad, Android and Windows/Mac; installation-link copy works. Native OS installation is not simulated.');

// Staff controls: participants have no management links; organizers only see their work.
reset();model.admin=false;model.role='participant';await mount('arena',{initialLanguage:'ru'});
await waitFor(()=>assert(screen.getByText('Foreign Build')));
assert(!document.querySelector('a[href="/admin"]'));assert(!document.querySelector('a[href="/business"]'));
reset();model.admin=true;model.role='organizer';await mount('arena',{initialLanguage:'ru'});
await waitFor(()=>assert(document.querySelector('a[href="/admin"]')));assert(!document.querySelector('a[href="/business"]'));
reset();localStorage.setItem('ta_language','ru');await mount('admin',{initialLanguage:'ru',initialAccess:{role:'owner',canCreate:true}});
await waitFor(()=>assert(document.querySelector('.staff-access button:not(:disabled)')));
assert(screen.getByText('Доступ организаторов'));assert(document.querySelector('a[href="/business"]'));
form=document.querySelector('.staff-access form');fill(form,'nickname','TeamDriver');fireEvent.submit(form);
await waitFor(()=>assert(staffMembers.length===1));assert.equal(calls.find(c=>c.path==='admin/access'&&c.method==='POST').data.canCreate,false);
await waitFor(()=>assert(screen.getByRole('checkbox',{name:'@TeamDriver'})));await waitFor(()=>assert(!screen.getByRole('checkbox',{name:'@TeamDriver'}).disabled));
click(screen.getByRole('checkbox',{name:'@TeamDriver'}));await expectCall('admin/access/rounds/round-ui','PUT');assert.deepEqual(assignedStaff,['team-id']);
await waitFor(()=>assert(screen.getByRole('checkbox',{name:'@TeamDriver'}).checked&&!screen.getByRole('checkbox',{name:'@TeamDriver'}).disabled));
let memberRow=document.querySelector('.staff-members li');click(within(memberRow).getByRole('checkbox',{name:'Разрешить создавать новые конкурсы'}));
await waitFor(()=>assert(staffMembers[0].canCreate===1));await waitFor(()=>assert(!button('Отозвать доступ · @TeamDriver').disabled));
click(button('Отозвать доступ · @TeamDriver'));await expectCall('admin/access/revoke');await waitFor(()=>assert(screen.getByText('Организаторов пока нет.')));
reset();staffAccessFixture={role:'organizer',canCreate:false};await mount('admin',{initialLanguage:'ru',initialAccess:staffAccessFixture});
await waitFor(()=>assert(screen.getByText('Назначенные конкурсы')));
assert(!document.querySelector('.staff-access'));assert(!document.querySelector('a[href="/business"]'));
assert(!screen.queryByText('Объявить конкурс'));assert(!screen.queryByText('Профили с никнеймом'));
await waitFor(()=>assert(document.querySelector('.staff-moderation form')));
form=document.querySelector('.staff-moderation form');fill(form,'decision','rejected');fill(form,'reason','Team moderation');fireEvent.submit(form);await expectCall('admin/moderation/pending');
reset();staffAccessFixture={role:'organizer',canCreate:true};await mount('admin',{initialLanguage:'ru',initialAccess:staffAccessFixture});
await waitFor(()=>assert(screen.getByText('Назначенные конкурсы')));assert(screen.getByRole('button',{name:'Объявить конкурс'}));
reset();staffAccessFixture={role:'participant',canCreate:false};await mount('admin',{initialLanguage:'ru',initialAccess:{role:'organizer',canCreate:false}});
await waitFor(()=>assert(screen.getByRole('alert').textContent.includes('отозван')));assert(!document.querySelector('a[href="/admin"]'));
console.log('PASS: participant/organizer navigation separation; owner grant, per-contest assignment, creation toggle and revoke controls; organizer moderation, restricted statistics and creation form; revoked panel cleared.');

cleanup();dom.window.close();
