export const imageType = (b: Uint8Array) => {
  const at=(n:number)=>String.fromCharCode(...b.slice(n,n+4));
  if (b.length>32 && b[0]===255 && b[1]===216 && b[2]===255) return "image/jpeg";
  if (b.length>32 && b[0]===137 && at(1)==="PNG\r" && b[5]===10 && b[6]===26 && b[7]===10) return "image/png";
  if (b.length>32 && at(0)==="RIFF" && at(8)==="WEBP") return "image/webp";
  return null;
};
export const maxUpload = 4*1024*1024;
export async function boundedForm(req: Request) {
  const reader=req.body?.getReader();
  if (!reader) return null;
  const parts:Uint8Array<ArrayBuffer>[]=[];
  let total=0;
  try {
    for (;;) {
      const item=await reader.read();
      if (item.done) break;
      total+=item.value.byteLength;
      if (total>maxUpload+16000) {await reader.cancel();return null;}
      parts.push(Uint8Array.from(item.value));
    }
  } finally {reader.releaseLock();}
  return new Response(new Blob(parts),{headers:{"Content-Type":req.headers.get("content-type")??""}}).formData().catch(()=>null);
}

