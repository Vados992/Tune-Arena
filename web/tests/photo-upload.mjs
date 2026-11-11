// Exercise the real picker and image preparation, without replacing PhotoPicker.
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url);
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://arena.example.invalid/'});
for(const name of ['window','document','HTMLElement','HTMLInputElement','Node','Event','MutationObserver'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'File',{value:File,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {render,screen,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const output=await build({entryPoints:['app/photo-picker.tsx','lib/photo.ts'],bundle:true,write:false,format:'esm',platform:'node',outdir:'node_modules/.cache/photo-test',outExtension:{'.js':'.mjs'},jsx:'automatic',mainFields:['module','main'],plugins:[{name:'one-react',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));}}]});
let Picker,preparePhoto;
for(const item of output.outputFiles){mkdirSync(dirname(item.path),{recursive:true});writeFileSync(item.path,item.text);const module=await import(pathToFileURL(item.path).href);if(item.path.endsWith('photo-picker.mjs'))Picker=module.default;else preparePhoto=module.preparePhoto;}
let serial=0,urls=new Set(),bitmapsClosed=0,draws=[],qualityCalls=[],sizes=[];
URL.createObjectURL=()=>{const url='blob:photo-'+(++serial);urls.add(url);return url;};URL.revokeObjectURL=url=>urls.delete(url);
dom.window.HTMLCanvasElement.prototype.getContext=function(){return {fillStyle:'',fillRect(){},drawImage(source,x,y,width,height){draws.push({width,height});}};};
dom.window.HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){qualityCalls.push(quality);const size=sizes.shift()??128;queueMicrotask(()=>callback(size===null?null:new Blob([new Uint8Array(size)],{type})));};
function bitmap(width=4000,height=3000){return {width,height,close(){bitmapsClosed++;}};}
let decode=async(file,options)=>options.resizeWidth?bitmap(2048,1536):bitmap();
globalThis.createImageBitmap=(file,options)=>decode(file,options);
let imageFails=false;
globalThis.Image=class {naturalWidth=3000;naturalHeight=4000;onload=null;onerror=null;set src(value){if(value)queueMicrotask(()=>imageFails?this.onerror?.(new Event('error')):this.onload?.(new Event('load')));}};
const bytes=new Uint8Array(100);bytes.set([137,80,78,71,13,10,26,10]);new DataView(bytes.buffer).setUint32(16,4000);new DataView(bytes.buffer).setUint32(20,3000);
const photo=new File([bytes],'camera.png',{type:'image/png'});
let optionsSeen;decode=async(file,options)=>{optionsSeen=options;return bitmap(2048,1536);};
const result=await preparePhoto(photo);assert.equal(result.type,'image/jpeg');assert.equal(result.name,'tune-arena-photo.jpg');assert.equal(optionsSeen.resizeWidth,2048);assert.deepEqual(draws.at(-1),{width:2048,height:1536});assert.equal(bitmapsClosed,1);assert.equal(urls.size,0);
qualityCalls=[];sizes=[4*1024*1024+1,128];assert((await preparePhoto(photo)).size<=4*1024*1024);assert.deepEqual(qualityCalls,[.88,.76]);
await assert.rejects(preparePhoto({size:31*1024*1024}),e=>e.reason==='size');
await assert.rejects(preparePhoto(new File(['pdf'],'document.pdf',{type:'application/pdf'})),e=>e.reason==='format');
decode=async()=>{throw new Error('bitmap unsupported');};
assert.equal((await preparePhoto(photo)).type,'image/jpeg');assert.deepEqual(draws.at(-1),{width:1536,height:2048});assert.equal(urls.size,0); // onload fallback works without Image.decode().
imageFails=true;await assert.rejects(preparePhoto(new File(['heic'],'phone.HEIC',{type:'image/heic'})),e=>e.reason==='heic');assert.equal(urls.size,0);imageFails=false;
console.log('PASS: real preparation preserves aspect ratio, produces bounded JPEG, retries compression, falls back without Image.decode(), reports unsupported/HEIC files, and releases decoder resources.');

let changed=[],busy=[],errors=0,submits=0;
function Scenario({kind}){const [file,setFile]=React.useState(null),[working,setWorking]=React.useState(false);return React.createElement('form',{onSubmit:e=>{e.preventDefault();submits++;}},React.createElement('h1',null,kind),React.createElement(Picker,{locale:'en',onChange:value=>{changed.push(value);setFile(value);},onBusy:value=>{busy.push(value);setWorking(value);},onError:()=>errors++}),React.createElement('button',{type:'submit',disabled:working||!file},'Save '+kind));}
for(const kind of ['avatar','tournament']){
 cleanup();changed=[];busy=[];errors=0;submits=0;
 render(React.createElement(Scenario,{kind}));
 const gallery=screen.getByLabelText('Choose from gallery'),files=screen.getByLabelText('Choose a file');assert.equal(gallery.type,'file');assert(gallery.closest('label'));assert.equal(gallery.getAttribute('capture'),null);assert.equal(files.getAttribute('accept'),null);
 Object.defineProperty(gallery,'value',{value:'C:\\fakepath\\camera.png',writable:true,configurable:true});
 let finish;decode=()=>new Promise(resolve=>{finish=resolve;});
 fireEvent.change(gallery,{target:{files:[photo]}});await waitFor(()=>assert(finish));
 assert.equal(gallery.value,'C:\\fakepath\\camera.png');assert.equal(gallery.files[0],photo);assert(screen.getByRole('button',{name:'Save '+kind}).disabled);assert.equal(submits,0);
 await act(async()=>finish(bitmap(2048,1536)));await waitFor(()=>assert(screen.getByRole('img',{name:'Photo preview'})));assert.equal(changed.at(-1).type,'image/jpeg');assert(!screen.getByRole('button',{name:'Save '+kind}).disabled);
 const selected=changed.at(-1);fireEvent(gallery,new Event('cancel',{bubbles:true}));assert(screen.getByText(/No photo selected/));assert.equal(changed.at(-1),selected);assert.equal(errors,0);
 fireEvent.change(files,{target:{files:[new File(['pdf'],'doc.pdf',{type:'application/pdf'})]}});await waitFor(()=>assert(screen.getByRole('alert').textContent.includes('Choose a JPEG')));assert(screen.getByRole('button',{name:'Save '+kind}).disabled);assert(!screen.queryByRole('img',{name:'Photo preview'}));assert.equal(changed.at(-1),null);assert.equal(busy.at(-1),false);
 decode=async()=>bitmap(2048,1536);fireEvent.change(files,{target:{files:[photo]}});await waitFor(()=>assert(!screen.getByRole('button',{name:'Save '+kind}).disabled));assert(!screen.queryByRole('alert'));fireEvent.click(screen.getByRole('button',{name:'Save '+kind}));assert.equal(submits,1);
 // Reselecting the same photo is allowed; the input is reset on the next gesture, not during reading.
 fireEvent.click(gallery);assert.equal(gallery.value,'');
 cleanup();assert.equal(busy.at(-1),false);
}
assert.equal(urls.size,0);
console.log('PASS: both avatar and tournament use real native inputs; selection survives asynchronous reading, cancellation retains the previous photo, invalid files cannot submit, Files fallback and retry work, and no form submits automatically.');
dom.window.close();
