import { redirect } from 'next/navigation';
import { getChatGPTUser } from '../chatgpt-auth';
import LoginForm from './login-form';

type SignInProps={searchParams?:Promise<{return_to?:string|string[]}>};
const safeReturnTo=(value:string|undefined)=>value&&value.startsWith('/')&&!value.startsWith('//')?value:'/';

export default async function SignIn({searchParams}:SignInProps) {
  const params=await searchParams,raw=Array.isArray(params?.return_to)?params?.return_to[0]:params?.return_to,returnTo=safeReturnTo(raw);
  if (await getChatGPTUser()) redirect(returnTo);
  return <LoginForm returnTo={returnTo} />;
}
