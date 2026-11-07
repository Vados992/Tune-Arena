// Prepare camera/gallery files locally. Nothing is sent until the form submits.
export async function preparePhoto(file:File):Promise<File> {
  if (!file.size || file.size>30*1024*1024) throw new Error("invalid_image");
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("invalid_image");
    const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext("2d");
    if (!ctx) throw new Error("invalid_image");
    ctx.fillStyle="#14171d";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("invalid_image")),"image/jpeg",.88));
    if (blob.size>4*1024*1024) throw new Error("invalid_image");
    return new File([blob],"tune-arena-photo.jpg",{type:"image/jpeg",lastModified:Date.now()});
  } finally {URL.revokeObjectURL(url);}
}
