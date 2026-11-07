import type { Text } from "./strings";
export async function api<T=Record<string,unknown>>(path:string,method="GET",body?:object|FormData):Promise<T> {
  const form=body instanceof FormData;
  const response=await fetch("/api/"+path,{
    method,cache:"no-store",body:form?body:body?JSON.stringify(body):undefined,
    headers:body&&!form?{"Content-Type":"application/json"}:undefined,
  });
  const result=await response.json().catch(()=>({})) as {error?:string};
  if (!response.ok) throw new Error(result.error??"server_error");
  return result as T;
}
export function errorLabel(error:unknown):Text {
  const messages:Record<string,Text>={
    closed:"finished",invalid_image:"imageError",entry_exists:"duplicate",provider_unavailable:"unconfigured",
    sign_in:"loginText",nickname_required:"nicknameMissing",nickname_taken:"nicknameTaken",
    invalid_nickname:"nicknameHint",rate_limited:"requestLimit",winner_not_ready:"notReady",premium_required:"framesLock",
  };
  return messages[error instanceof Error?error.message:""]??"error";
}
