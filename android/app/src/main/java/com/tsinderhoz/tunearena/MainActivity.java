package com.tsinderhoz.tunearena;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.util.UUID;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private WebView web; private TextView host; private String server;
    private ValueCallback<Uri[]> fileCallback; private Uri captureUri;
    private PermissionRequest mediaRequest;
    private android.window.OnBackInvokedCallback backCallback;
    private boolean backCallbackRegistered;
    private static final int PICK=10,CAPTURE=11,FILE_CAMERA=12,WEB_CAMERA=13;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        try{StringBuilder content=new StringBuilder();try(java.io.BufferedReader reader=new java.io.BufferedReader(new java.io.InputStreamReader(getAssets().open("server.json"),java.nio.charset.StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null)content.append(line);}String bundled=content.toString();server=OriginPolicy.server(getPreferences(0).getString("server",new JSONObject(bundled).getString("appUrl")));}catch(Exception e){throw new IllegalStateException("Invalid server configuration",e);}
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(13,15,19));
        LinearLayout bar=new LinearLayout(this);bar.setPadding(8,2,8,2);
        Button home=new Button(this);home.setText("⌂");home.setContentDescription("Главная");home.setOnClickListener(v->web.loadUrl(server));bar.addView(home,new LinearLayout.LayoutParams(dp(50),dp(50)));
        host=new TextView(this);host.setTextColor(Color.LTGRAY);host.setTextSize(11);bar.addView(host,new LinearLayout.LayoutParams(0,dp(50),1));
        Button menu=new Button(this);menu.setText("⋮");menu.setContentDescription("Настройки");menu.setOnClickListener(v->settings());bar.addView(menu,new LinearLayout.LayoutParams(dp(50),dp(50)));root.addView(bar);
        root.setOnApplyWindowInsetsListener((v,insets)->{if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);}else v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSafeBrowsingEnabled(true);s.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient(){
            public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if("https".equals(u.getScheme()))return false;
                if(req.isForMainFrame()&&"mailto".equals(u.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}}return true;
            }
            public void onPageFinished(WebView view,String url){try{host.setText(Uri.parse(url).getHost());}catch(Exception ignored){}CookieManager.getInstance().flush();updateBackCallback();}
            public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError err){if(req.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setTitle("Нет соединения").setMessage("Проверьте интернет и адрес сервера.").setPositiveButton("Повторить",(d,w)->web.loadUrl(server)).setNegativeButton("Настройки",(d,w)->settings()).show();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{
                if(mediaRequest!=null)mediaRequest.deny();
                String[] resources=request.getResources();
                if(!OriginPolicy.same(request.getOrigin().toString(),server)||!OriginPolicy.same(web.getUrl(),server)||resources.length!=1||!resources[0].equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)){request.deny();return;}
                mediaRequest=request;
                if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)grantWebCamera();else requestPermissions(new String[]{Manifest.permission.CAMERA},WEB_CAMERA);
            });}
            public void onPermissionRequestCanceled(PermissionRequest request){if(mediaRequest==request)mediaRequest=null;}
            public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                clearFile(null);
                if(!OriginPolicy.same(view.getUrl(),server)){callback.onReceiveValue(null);return true;}
                fileCallback=callback;
                if(params.isCaptureEnabled()){cameraFile();return true;}
                new AlertDialog.Builder(MainActivity.this).setTitle("Фотография").setItems(new String[]{"Снять фото","Выбрать из галереи"},(d,which)->{if(which==0)cameraFile();else gallery();}).setOnCancelListener(d->clearFile(null)).show();return true;
            }
        });
        File cache=new File(getCacheDir(),"captures");File[] files=cache.listFiles();if(files!=null)for(File f:files)if(System.currentTimeMillis()-f.lastModified()>86400000L)f.delete();
        if(Build.VERSION.SDK_INT>=33)backCallback=()->{web.goBack();updateBackCallback();};
        if(state!=null)web.restoreState(state);else web.loadUrl(server);
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void grantWebCamera(){PermissionRequest p=mediaRequest;mediaRequest=null;if(p!=null){if(OriginPolicy.same(p.getOrigin().toString(),server)&&OriginPolicy.same(web.getUrl(),server))p.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else p.deny();}}
    private void clearFile(Uri[] result){ValueCallback<Uri[]> callback=fileCallback;fileCallback=null;if(callback!=null)callback.onReceiveValue(result);}
    private void gallery(){try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("image/*");startActivityForResult(i,PICK);}catch(Exception e){clearFile(null);}}
    private void cameraFile(){if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},FILE_CAMERA);return;}launchCamera();}
    private void launchCamera(){
        if(fileCallback==null||!OriginPolicy.same(web.getUrl(),server)){clearFile(null);return;}
        captureUri=Uri.parse("content://"+getPackageName()+".photos/captures/"+UUID.randomUUID()+".jpg");
        Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);i.putExtra(MediaStore.EXTRA_OUTPUT,captureUri);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);i.setClipData(ClipData.newRawUri("Tune Arena photo",captureUri));
        try{startActivityForResult(i,CAPTURE);}catch(Exception e){clearFile(null);}
    }
    @Override public void onRequestPermissionsResult(int code,String[] names,int[] grants){super.onRequestPermissionsResult(code,names,grants);boolean granted=grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED;if(code==WEB_CAMERA){if(granted)grantWebCamera();else{if(mediaRequest!=null)mediaRequest.deny();mediaRequest=null;}}else if(code==FILE_CAMERA){if(granted)launchCamera();else clearFile(null);}}
    @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==PICK||code==CAPTURE){Uri uri=result==RESULT_OK?(code==CAPTURE?captureUri:data==null?null:data.getData()):null;clearFile(uri==null?null:new Uri[]{uri});captureUri=null;}}
    private void settings(){new AlertDialog.Builder(this).setTitle("Tune Arena").setItems(new String[]{"Изменить сервер","Открыть ссылку для входа","Открыть в браузере","Обновить"},(d,which)->{if(which==0)input(false);else if(which==1)input(true);else if(which==2)startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(server)));else web.reload();}).show();}
    private void input(boolean login){EditText value=new EditText(this);value.setSingleLine(true);value.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);if(!login)value.setText(server);new AlertDialog.Builder(this).setTitle(login?"Ссылка из письма":"HTTPS-адрес сервера").setView(value).setPositiveButton("Открыть",(d,w)->{try{String url=value.getText().toString().trim();if(login){if(!OriginPolicy.same(url,server))throw new IllegalArgumentException();web.loadUrl(url);}else{server=OriginPolicy.server(url);getPreferences(0).edit().putString("server",server).apply();clearFile(null);if(mediaRequest!=null){mediaRequest.deny();mediaRequest=null;}web.loadUrl(server);}}catch(Exception e){Toast.makeText(this,"Нужен корректный HTTPS-адрес выбранного сервера",Toast.LENGTH_LONG).show();}}).setNegativeButton("Отмена",null).show();}
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);web.saveState(out);}
    private void updateBackCallback(){
        if(Build.VERSION.SDK_INT<33||backCallback==null)return;
        boolean shouldRegister=web.canGoBack();
        if(shouldRegister&&!backCallbackRegistered)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,backCallback);
        else if(!shouldRegister&&backCallbackRegistered)getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        backCallbackRegistered=shouldRegister;
    }
    // Android 8–12 fallback only. Android 13+ uses OnBackInvokedDispatcher above.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){if(Build.VERSION.SDK_INT<33&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(Build.VERSION.SDK_INT>=33&&backCallbackRegistered)getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);clearFile(null);if(mediaRequest!=null)mediaRequest.deny();web.stopLoading();web.destroy();super.onDestroy();}
}
