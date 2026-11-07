package com.tsinderhoz.tunearena;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;
public final class PhotoProvider extends ContentProvider {
    public boolean onCreate(){return true;}
    private File resolve(Uri uri) throws FileNotFoundException {
        String name=uri.getLastPathSegment();
        if(!uri.getPath().matches("/captures/[a-f0-9-]{36}\\.jpg")||name==null)throw new FileNotFoundException("Invalid capture URI");
        File dir=new File(getContext().getCacheDir(),"captures");dir.mkdirs();
        return new File(dir,name);
    }
    public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {return ParcelFileDescriptor.open(resolve(uri),ParcelFileDescriptor.parseMode(mode));}
    public String getType(Uri uri){return "image/jpeg";}
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){
        try{File f=resolve(uri);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{f.getName(),f.length()});return c;}catch(Exception e){return null;}
    }
    public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    public int update(Uri uri,ContentValues values,String where,String[] args){throw new UnsupportedOperationException();}
    public int delete(Uri uri,String where,String[] args){return 0;}
}
