"use strict";
const {app,BrowserWindow,Menu,dialog,ipcMain,shell,session,systemPreferences}=require("electron");
const path=require("node:path"),fs=require("node:fs");
const {pathToFileURL}=require("node:url");
const {normalizeOrigin,sameOrigin,externalAllowed,cameraAllowed}=require("./policy.cjs");
const defaults=require("./server.json");
let mainWindow,settingsWindow,appOrigin;
function configPath(){return path.join(app.getPath("userData"),"server.json");}
function readOrigin(){try{return normalizeOrigin(JSON.parse(fs.readFileSync(configPath(),"utf8")).appUrl);}catch{return normalizeOrigin(defaults.appUrl);}}
function home(){void mainWindow.loadURL(appOrigin);}
function settings(){
 if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.focus();return;}
 settingsWindow=new BrowserWindow({width:590,height:510,resizable:false,parent:mainWindow,modal:true,backgroundColor:"#11151c",webPreferences:{preload:path.join(__dirname,"settings-preload.cjs"),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 settingsWindow.removeMenu();void settingsWindow.loadFile("settings.html");
}
function settingsSender(event){return settingsWindow&&!settingsWindow.isDestroyed()&&event.sender===settingsWindow.webContents&&event.senderFrame===settingsWindow.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(path.join(__dirname,"settings.html")).href;}
ipcMain.handle("settings:get",event=>{if(!settingsSender(event))throw new Error("Forbidden");return {appUrl:appOrigin};});
ipcMain.handle("settings:save",(event,value)=>{
 if(!settingsSender(event))throw new Error("Forbidden");
 const origin=normalizeOrigin(value);fs.writeFileSync(configPath(),JSON.stringify({appUrl:origin}),{mode:0o600});
 appOrigin=origin;home();settingsWindow.close();return true;
});
ipcMain.handle("settings:login-link",(event,value)=>{
 if(!settingsSender(event))throw new Error("Forbidden");
 const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||!sameOrigin(url.href,appOrigin))throw new Error("The sign-in link must belong to the selected server.");
 void mainWindow.loadURL(url.href);settingsWindow.close();return true;
});
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on("second-instance",()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
 app.whenReady().then(()=>{
  appOrigin=readOrigin();
  const partition=session.fromPartition("persist:tune-arena");
  partition.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>{
   if(contents!==mainWindow?.webContents||!sameOrigin(requestingOrigin,appOrigin))return false;
   return permission==="media"&&details?.mediaType==="video"||permission==="clipboard-sanitized-write";
  });
  partition.setPermissionRequestHandler(async(contents,permission,callback,details)=>{
   if(contents!==mainWindow?.webContents||!sameOrigin(details.requestingUrl??contents.getURL(),appOrigin)){callback(false);return;}
   if(permission==="clipboard-sanitized-write"){callback(true);return;}
   if(permission!=="media"||!cameraAllowed(details.requestingUrl??contents.getURL(),appOrigin,details?.mediaTypes)){callback(false);return;}
   const result=await dialog.showMessageBox(mainWindow,{type:"question",buttons:["Разрешить камеру","Отмена"],defaultId:1,cancelId:1,title:"Tune Arena · Камера",message:"Разрешить сайту "+appOrigin+" использовать камеру для снимка?",detail:"Микрофон не используется."});
   if(result.response!==0||!sameOrigin(contents.getURL(),appOrigin)||!sameOrigin(details.requestingUrl??contents.getURL(),appOrigin)){callback(false);return;}
   if(process.platform==="darwin"){callback(await systemPreferences.askForMediaAccess("camera"));return;}
   callback(true);
  });
  mainWindow=new BrowserWindow({width:1380,height:920,minWidth:390,minHeight:600,title:"Tune Arena",backgroundColor:"#0d0f13",webPreferences:{partition:"persist:tune-arena",nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(externalAllowed(url))void shell.openExternal(url);return {action:"deny"};});
  mainWindow.webContents.on("will-navigate",(event,url)=>{try{const u=new URL(url);if(u.protocol!=="https:"||u.username||u.password)event.preventDefault();}catch{event.preventDefault();}});
  mainWindow.webContents.on("will-attach-webview",event=>event.preventDefault());
  mainWindow.webContents.on("did-fail-load",(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)void mainWindow.loadFile("offline.html");});
  mainWindow.on("closed",()=>{mainWindow=null;});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   ...(process.platform==="darwin"?[{label:"Tune Arena",submenu:[{role:"about"},{type:"separator"},{role:"quit"}]}]:[]),
   {label:"Приложение",submenu:[{label:"Главная",accelerator:"CmdOrCtrl+H",click:home},{label:"Сервер и ссылка для входа…",accelerator:"CmdOrCtrl+L",click:settings},{label:"Открыть в браузере",click:()=>shell.openExternal(appOrigin)},{type:"separator"},{label:"Выйти из аккаунтов на этом устройстве",click:async()=>{const q=await dialog.showMessageBox(mainWindow,{buttons:["Отмена","Выйти"],defaultId:0,cancelId:0,message:"Завершить локальные сеансы Tune Arena?"});if(q.response===1){await partition.clearStorageData();home();}}},{role:"quit"}]},
   {label:"Правка",submenu:[{role:"undo"},{role:"redo"},{type:"separator"},{role:"cut"},{role:"copy"},{role:"paste"},{role:"selectAll"}]},
   {label:"Вид",submenu:[{role:"reload"},{role:"resetZoom"},{role:"zoomIn"},{role:"zoomOut"},{role:"togglefullscreen"}]}
  ]));
  home();
 });
 app.on("activate",()=>{if(mainWindow)mainWindow.show();});
 app.on("window-all-closed",()=>app.quit());
}
