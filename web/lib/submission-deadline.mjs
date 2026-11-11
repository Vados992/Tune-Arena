const format=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function parts(epoch){return Object.fromEntries(format.formatToParts(epoch*1000).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function wall(p){return Date.UTC(p.year,p.month-1,p.day,p.hour??0,p.minute??0,p.second??0)/1000;}
export function lisbonDeadline(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
 const [year,month,day,hour,minute]=value.split(/[-T:]/).map(Number);
 const target={year,month,day,hour,minute,second:0};let epoch=wall(target);
 for(let i=0;i<4;i++)epoch+=wall(target)-wall(parts(epoch));
 return Object.entries(target).every(([k,v])=>parts(epoch)[k]===v)?epoch:null;
}
export function defaultSubmissionDeadline(opens,closes,kind){
 if(kind==='test')return closes;
 const local=parts(opens),day=new Date(Date.UTC(local.year,local.month-1,local.day));
 let add=(5-day.getUTCDay()+7)%7;
 function candidate(days){return lisbonDeadline(new Date(day.getTime()+days*86400000).toISOString().slice(0,10)+'T20:00');}
 if(candidate(add)<=opens)add+=7;
 return Math.min(closes,candidate(add));
}
