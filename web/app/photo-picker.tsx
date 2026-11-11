"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, FileImage, ImagePlus, X } from "lucide-react";
import { preparePhoto, PhotoPreparationError, type PhotoFailure } from "@/lib/photo";
import { photoText } from "@/lib/photo-strings";
import type { Locale } from "@/lib/locale";

export default function PhotoPicker({locale,onChange,onError,onBusy}:{locale:Locale;onChange:(file:File|null)=>void;onError:()=>void;onBusy:(value:boolean)=>void}) {
  const t=photoText(locale);
  const [preview,setPreview]=useState(""),[stream,setStream]=useState<MediaStream|null>(null);
  const [starting,setStarting]=useState(false),[working,setWorking]=useState(false),[ready,setReady]=useState(false),[cameraError,setCameraError]=useState(false);
  const [photoError,setPhotoError]=useState<PhotoFailure|null>(null),[cancelled,setCancelled]=useState(false);
  const video=useRef<HTMLVideoElement>(null),picker=useRef<HTMLDivElement>(null);
  const live=useRef<MediaStream|null>(null),attempt=useRef(0),selection=useRef(0);
  useEffect(()=>()=>{++attempt.current;++selection.current;live.current?.getTracks().forEach(track=>track.stop());onBusy(false);},[]);
  useEffect(()=>{
    const inputs=[...(picker.current?.querySelectorAll<HTMLInputElement>('input[type="file"]')??[])];
    const cancelled=()=>setCancelled(true);
    inputs.forEach(input=>input.addEventListener("cancel",cancelled));
    return()=>inputs.forEach(input=>input.removeEventListener("cancel",cancelled));
  },[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  useEffect(()=>{
    if (video.current&&stream) {video.current.srcObject=stream;void video.current.play().catch(()=>setCameraError(true));}
  },[stream]);
  function closeCamera() {++attempt.current;live.current?.getTracks().forEach(track=>track.stop());live.current=null;setStream(null);setReady(false);setStarting(false);}
  async function openCamera() {
    closeCamera();const id=++attempt.current;setStarting(true);setCameraError(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera_unavailable");
      const result=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      if (attempt.current!==id) {result.getTracks().forEach(track=>track.stop());return;}
      live.current=result;setStream(result);
    } catch {if(attempt.current===id)setCameraError(true);}
    finally {if(attempt.current===id)setStarting(false);}
  }
  async function choose(file?:File) {
    if (!file) {setCancelled(true);return;}
    const id=++selection.current;setWorking(true);onBusy(true);setPhotoError(null);setCancelled(false);onChange(null);setPreview("");
    try {
      const prepared=await preparePhoto(file);
      if (selection.current!==id)return;
      onChange(prepared);setPreview(URL.createObjectURL(prepared));setCameraError(false);closeCamera();
    } catch(error) {if(selection.current===id){setPhotoError(error instanceof PhotoPreparationError?error.reason:"read");onError();}}
    finally {if(selection.current===id){setWorking(false);onBusy(false);}}
  }
  async function capture() {
    const element=video.current;if(!element?.videoWidth||working)return;
    const canvas=document.createElement("canvas");
    const scale=Math.min(1,2048/Math.max(element.videoWidth,element.videoHeight));
    canvas.width=Math.round(element.videoWidth*scale);canvas.height=Math.round(element.videoHeight*scale);
    const ctx=canvas.getContext("2d");if(!ctx){onError();return;}
    ctx.drawImage(element,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
    if(blob)await choose(new File([blob],"camera.jpg",{type:"image/jpeg"}));else onError();
  }
  return <div className="photo-picker" ref={picker}>
    <div className="photo-actions">
      <label className="outline photo-source-action"><ImagePlus size={18}/><span>{t.gallery}</span><input type="file" accept="image/*" aria-label={t.gallery} disabled={working||starting} onClick={e=>{e.stopPropagation();e.currentTarget.value="";}} onChange={e=>{e.stopPropagation();void choose(e.currentTarget.files?.[0]);}}/></label>

      <button className="outline" type="button" disabled={working||starting} onClick={()=>void openCamera()}><Camera size={18}/>{t.camera}</button>
    </div>
      <label className="photo-file-fallback"><FileImage size={18}/><span>{t.files}</span><input type="file" aria-label={t.files} disabled={working||starting} onClick={e=>{e.stopPropagation();e.currentTarget.value="";}} onChange={e=>{e.stopPropagation();void choose(e.currentTarget.files?.[0]);}}/></label>
    {starting&&<p role="status">{t.starting}</p>}
    {stream&&<section className="camera-view" aria-label={t.camera}>
      <video ref={video} autoPlay playsInline muted onLoadedMetadata={()=>setReady(true)}/>
      <div className="photo-actions"><button className="primary" type="button" disabled={!ready||working} onClick={()=>void capture()}><Camera size={18}/>{t.shot}</button>
        <button className="outline" type="button" onClick={closeCamera}>{t.cancel}</button></div>
    </section>}
    {cameraError&&<p className="small-notice" role="status">{t.error}</p>}
    <label className="native-camera">{t.native}<input type="file" accept="image/*" capture="environment" disabled={working||starting} onClick={e=>{e.stopPropagation();e.currentTarget.value="";}} onChange={e=>{e.stopPropagation();void choose(e.currentTarget.files?.[0]);}}/></label>
    {cancelled&&<p className="small-notice" role="status">{t.cancelled}</p>}
    {photoError&&<p className="small-notice" role="alert">{t[photoError==="size"?"tooLarge":photoError==="heic"?"heicError":photoError==="format"?"formatError":"readError"]}</p>}
    {working&&<p role="status">{t.preparing}</p>}
    {preview&&<figure className="photo-preview"><img src={preview} alt={t.preview}/><button type="button" disabled={working} onClick={()=>{++selection.current;onChange(null);setPreview("");setPhotoError(null);}} aria-label={t.remove}><X size={18}/></button></figure>}
    <small>{t.note}</small>
  </div>;
}
