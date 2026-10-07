import { redirect } from 'next/navigation';
import { getChatGPTUser, getTfAccess } from '../chatgpt-auth';
import { getSessionUser, PARTNER_SESSION_COOKIE } from '../../lib/auth-session';
import LoginForm from './login-form';

type SignInProps={searchParams?:Promise<{return_to?:string|string[]}>};
const safeReturnTo=(value:string|undefined)=>value&&value.startsWith('/')&&!value.startsWith('//')?value:'/';

export default async function SignIn({searchParams}:SignInProps) {
  const params=await searchParams,raw=Array.isArray(params?.return_to)?params?.return_to[0]:params?.return_to,returnTo=safeReturnTo(raw);
  const target=new URL(returnTo,'https://app.local'),partnerAccess=target.pathname==='/germano',partnerId=Number(target.searchParams.get('partner')||0);
  if(partnerAccess){
    const session=await getSessionUser(PARTNER_SESSION_COOKIE),access=session?await getTfAccess(session):null;
    if(access?.partnerId&&(!partnerId||access.partnerId===partnerId))redirect(returnTo);
  }else if(await getChatGPTUser())redirect(returnTo);
  return <LoginForm returnTo={returnTo} partnerAccess={partnerAccess} partnerId={partnerId} />;
}
