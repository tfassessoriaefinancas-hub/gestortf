/** Next can use an internal hostname in request.url behind a reverse proxy. */
export function sameOrigin(request: Request) {
  const value=request.headers.get('origin');
  if(!value)return false;
  try {
    const origin=new URL(value);
    const host=request.headers.get('host') || new URL(request.url).host;
    return origin.origin===value && origin.host===host && ['http:','https:'].includes(origin.protocol)
      && (!process.env.VERCEL || origin.protocol==='https:');
  }catch{return false;}
}
