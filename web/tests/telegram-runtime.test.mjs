import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),dom=new JSDOM('<html><body></body></html>',{url:'https://arena.example.invalid/'});
for(const key of ['window','document','HTMLElement','Event','MouseEvent','localStorage'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.location=dom.window.location;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {render,screen,waitFor,fireEvent,cleanup}=await import('@testing-library/react');
const output=await build({entryPoints:['app/telegram-runtime.tsx'],bundle:true,platform:'node',format:'esm',write:false,jsx:'automatic',plugins:[{name:'react-external',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));}}]});
let version=0;
async function Runtime(){return (await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64')+'#'+(++version))).default;}
function mount(C){return render(React.createElement(React.StrictMode,null,React.createElement(C,null,React.createElement('p',null,'Application ready'))));}
let calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({ok:true,changed:false});};
mount(await Runtime());await screen.findByText('Application ready');assert.equal(calls.length,0);cleanup();
let ready=0,expanded=0,back,off=0,hidden=0;
window.Telegram={WebApp:{initData:'signed-launch-fixture',ready:()=>ready++,expand:()=>expanded++,BackButton:{show(){},hide(){hidden++;},onClick(fn){back=fn;},offClick(fn){if(back===fn)off++;}}}};
let returned=0;window.addEventListener('tune-arena-back',()=>returned++);
mount(await Runtime());await screen.findByText('Application ready');
assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/auth/telegram/mini');assert.deepEqual(JSON.parse(calls[0].options.body),{initData:'signed-launch-fixture'});assert(ready>0&&expanded>0);back();assert.equal(returned,1);cleanup();assert(off>0&&hidden>0);
calls=[];let failing=true;globalThis.fetch=async(url,options)=>{calls.push({url,options});return failing?Response.json({error:'expired'},{status:401}):Response.json({ok:true,changed:false});};
mount(await Runtime());await screen.findByRole('alert');assert.equal(calls.length,1);failing=false;fireEvent.click(screen.getByRole('button',{name:'Попробовать снова'}));await screen.findByText('Application ready');assert.equal(calls.length,2);cleanup();
dom.window.history.replaceState(null,'','/?deleted=1');calls=[];mount(await Runtime());await screen.findByText('Application ready');assert.equal(calls.length,0);cleanup();
console.log('PASS: browser fallback, StrictMode single handshake, signed initData stays in request body, Telegram ready/expand/back cleanup, visible error/retry and no automatic re-registration after account deletion.');
