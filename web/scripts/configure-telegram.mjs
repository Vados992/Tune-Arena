// Run on a trusted computer; never put the bot token in arguments or Git.
const token=process.env.TELEGRAM_BOT_TOKEN,raw=process.env.TUNE_APP_ORIGIN;
if(!token||!raw)throw new Error('Set TELEGRAM_BOT_TOKEN and TUNE_APP_ORIGIN securely in the environment.');
const url=new URL(raw);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('TUNE_APP_ORIGIN must be an HTTPS origin.');
async function telegram(method,body){
 let result;
 try{
  const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  result=await r.json();if(!r.ok||!result.ok)throw new Error('failed');
 }catch{throw new Error('Telegram '+method+' failed. Verify the bot token and connectivity; no credentials were logged.');}
 return result.result;
}
const me=await telegram('getMe',{});
if(!me.is_bot)throw new Error('Expected a bot account.');
await telegram('setChatMenuButton',{menu_button:{type:'web_app',text:'Открыть Tune Arena',web_app:{url:url.origin}}});
console.log('Configured Open Tune Arena menu for @'+me.username+' at '+url.origin);
console.log('Enable the Main Mini App in BotFather separately if a profile launch button is required.');
