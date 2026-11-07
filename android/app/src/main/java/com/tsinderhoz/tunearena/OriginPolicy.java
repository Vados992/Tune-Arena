package com.tsinderhoz.tunearena;
import java.net.URI;
final class OriginPolicy {
    static String origin(String value) {
        try {
            URI u=new URI(value);
            if(!"https".equalsIgnoreCase(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null)throw new IllegalArgumentException("HTTPS required");
            return "https://"+u.getHost().toLowerCase(java.util.Locale.ROOT)+(u.getPort()==-1||u.getPort()==443?"":":"+u.getPort());
        } catch(Exception e){throw new IllegalArgumentException("Invalid HTTPS URL",e);}
    }
    static String server(String value) {
        URI u=URI.create(value);
        if(u.getRawQuery()!=null||u.getFragment()!=null||!(u.getPath()==null||u.getPath().isEmpty()||u.getPath().equals("/")))throw new IllegalArgumentException("Use the server origin only");
        return origin(value);
    }
    static boolean same(String value,String server){try{return origin(value).equals(origin(server));}catch(Exception e){return false;}}
}
