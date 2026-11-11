// Decode locally and re-encode: original metadata is not uploaded.
export type PhotoFailure = "size" | "format" | "read" | "heic";
export class PhotoPreparationError extends Error {
  constructor(public reason: PhotoFailure) { super(reason); }
}
const maxInput=30*1024*1024,maxOutput=4*1024*1024,maxEdge=2048;
const supported=/\.(jpe?g|png|webp|heic|heif|avif)$/i;

async function resizeOptions(file:File):Promise<ImageBitmapOptions> {
  try {
    const bytes=new Uint8Array(await file.slice(0,512*1024).arrayBuffer());
    const view=new DataView(bytes.buffer);let width=0,height=0;
    if(bytes[0]===137&&bytes[1]===80&&bytes.length>=24){width=view.getUint32(16);height=view.getUint32(20);}
    if(bytes[0]===255&&bytes[1]===216){
      let at=2;
      while(at+4<bytes.length){
        if(bytes[at++]!==255)break;
        while(bytes[at]===255)at++;
        const marker=bytes[at++];
        if(marker===217||marker===218)break;
        const length=view.getUint16(at);
        if(length<2||at+length>bytes.length)break;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
          height=view.getUint16(at+3);width=view.getUint16(at+5);break;
        }
        at+=length;
      }
    }
    // A single resize dimension preserves aspect ratio, including EXIF rotation.
    if(Math.max(width,height)>maxEdge)return width>=height?{resizeWidth:maxEdge,resizeQuality:"high"}:{resizeHeight:maxEdge,resizeQuality:"high"};
    if(!width&&file.size>2*1024*1024)return {resizeWidth:maxEdge,resizeQuality:"high"};
  } catch { /* Some mobile file providers expose the content only to the decoder. */ }
  return {};
}

function loadImage(url:string):Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{
    const image=new Image();
    const timeout=setTimeout(()=>{image.onload=null;image.onerror=null;image.src="";reject(new PhotoPreparationError("read"));},15000);
    image.onload=()=>{clearTimeout(timeout);image.onload=null;image.onerror=null;resolve(image);};
    image.onerror=()=>{clearTimeout(timeout);image.onload=null;image.onerror=null;reject(new PhotoPreparationError("read"));};
    image.src=url;
  });
}

export async function preparePhoto(file:File):Promise<File> {
  if(!file.size)throw new PhotoPreparationError("read");
  if(file.size>maxInput)throw new PhotoPreparationError("size");
  if(!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type)&&!supported.test(file.name))throw new PhotoPreparationError("format");
  let bitmap:ImageBitmap|undefined,image:HTMLImageElement|undefined,url="",canvas:HTMLCanvasElement|undefined;
  try {
    if(typeof createImageBitmap==="function"){
      try {bitmap=await createImageBitmap(file,await resizeOptions(file));}catch { /* Fall back for Safari/native formats. */ }
    }
    if(!bitmap){url=URL.createObjectURL(file);image=await loadImage(url);}
    const width=bitmap?.width??image!.naturalWidth,height=bitmap?.height??image!.naturalHeight;
    if(!width||!height)throw new PhotoPreparationError("read");
    const scale=Math.min(1,maxEdge/Math.max(width,height));
    canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext("2d");if(!ctx)throw new PhotoPreparationError("read");
    ctx.fillStyle="#14171d";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap??image!,0,0,canvas.width,canvas.height);
    for(const quality of [.88,.76,.64,.5]){
      const blob=await new Promise<Blob|null>(resolve=>canvas!.toBlob(resolve,"image/jpeg",quality));
      if(!blob)throw new PhotoPreparationError("read");
      if(blob.size<=maxOutput)return new File([blob],"tune-arena-photo.jpg",{type:"image/jpeg",lastModified:Date.now()});
    }
    throw new PhotoPreparationError("size");
  } catch(error) {
    if(error instanceof PhotoPreparationError&&error.reason==="size")throw error;
    if(/hei[cf]/i.test(file.type+file.name))throw new PhotoPreparationError("heic");
    throw new PhotoPreparationError("read");
  } finally {
    bitmap?.close();if(image)image.src="";if(url)URL.revokeObjectURL(url);if(canvas){canvas.width=1;canvas.height=1;}
  }
}
