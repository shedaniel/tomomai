import { resolveBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN = "https://lng-tgk-aime-gw.am-all.net";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "86400",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export async function GET() {
  const baseUrl = resolveBaseUrl();
  const script = `!function(d){const BASE_URL=${JSON.stringify(baseUrl)};if(d.location.host!=='lng-tgk-aime-gw.am-all.net'){alert('Please run this on the maimai Aime gateway page.');return;}function post(path,params){const form=d.createElement('form');form.method='POST';form.action=path;for(const key in params){if(Object.prototype.hasOwnProperty.call(params,key)){const hiddenField=d.createElement('input');hiddenField.type='hidden';hiddenField.name=key;hiddenField.value=params[key];form.appendChild(hiddenField);}}d.body.appendChild(form);form.submit();}const params=new URLSearchParams(d.location.hash.substring(1));const otp=params.get('otp');const user=params.get('user');const region=params.get('region')||'intl';if(!otp||!/^\\d{6}$/.test(otp)){alert('Missing or invalid OTP. Please restart the login flow.');return;}if(!user){alert('Missing user identifier. Please restart the login flow.');return;}const cookieMap=Object.fromEntries(d.cookie.split(';').map(function(c){const idx=c.indexOf('=');const name=idx===-1?c.trim():c.slice(0,idx).trim();const value=idx===-1?'':c.slice(idx+1);return [name,value];}));const clal=cookieMap.clal;if(!clal||clal.trim().length!==64){alert("Couldn't retrieve login data. Please logout and login, then try again.");return;}post(BASE_URL+'/api/login',{otp,user,token:clal.trim(),region});}(document);`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders,
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders,
    },
  });
}
