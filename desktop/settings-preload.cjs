const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("tuneSettings",{get:()=>ipcRenderer.invoke("settings:get"),save:value=>ipcRenderer.invoke("settings:save",value),loginLink:value=>ipcRenderer.invoke("settings:login-link",value)});
