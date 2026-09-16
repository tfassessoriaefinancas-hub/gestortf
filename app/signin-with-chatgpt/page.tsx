import { redirect } from 'next/navigation';
import { getChatGPTUser } from '../chatgpt-auth';
import LoginForm from './login-form';

export default async function SignIn() {
  if (await getChatGPTUser()) redirect('/');
  return <LoginForm />;
}
