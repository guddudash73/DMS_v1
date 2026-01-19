'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, type SubmitErrorHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  LoginRequest as LoginRequestSchema,
  type LoginRequest,
  type LoginResponse,
} from '@dcm/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLoginMutation } from '@/src/store/api';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/src/store';
import { setCredentials, setAuthError } from '@/src/store/authSlice';
import { toast } from 'react-toastify';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');

  const dispatch = useDispatch<AppDispatch>();
  const [login, { isLoading }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    mode: 'onBlur',
  });

  const defaultRouteByRole = (role: LoginResponse['role']) => {
    if (role === 'RECEPTION') return '/';
    if (role === 'DOCTOR') return '/doctor';
    if (role === 'ADMIN') return '/admin';
    return '/';
  };

  const isSafeInternalPath = (p: string) => p.startsWith('/') && !p.startsWith('//');

  const onSubmit = async (values: LoginRequest) => {
    dispatch(setAuthError(undefined));

    try {
      const response = (await login(values).unwrap()) as LoginResponse;

      dispatch(setCredentials(response));
      dispatch((await import('@/src/store/api')).apiSlice.util.resetApiState());
      toast.success('Logged in successfully.');

      const target = from && isSafeInternalPath(from) ? from : defaultRouteByRole(response.role);
      router.replace(target);
    } catch (err) {
      const msg = 'Invalid credentials.';
      console.error(err);
      dispatch(setAuthError(msg));
      toast.error(msg);
    }
  };

  const onSubmitError: SubmitErrorHandler<LoginRequest> = (formErrors) => {
    const messages = Object.values(formErrors)
      .map((e) => e?.message)
      .filter((m): m is string => Boolean(m));

    const msg = messages.length > 0 ? messages.join('\n') : 'Please check the highlighted fields.';
    toast.error(msg);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f8] px-3 py-8 md:px-4">
      <div className="relative flex w-full max-w-4xl md:max-h-140 flex-col overflow-hidden rounded-2xl bg-white shadow-sm md:flex-row">
        <Card className="border-0 w-full md:w-[45%] rounded-none flex-col">
          <CardHeader className="px-8 pt-8 md:px-12 md:pt-10">
            <div className="mb-2 flex items-center gap-3">
              <div className="relative h-15 w-40">
                <Image
                  src="/sarangi-logo.png"
                  alt="Sarangi Dentistry"
                  fill
                  sizes="160px"
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">
                Welcome Back
              </h1>
              <p className="text-sm text-gray-500">Login to your account</p>
              <p className="text-xs text-gray-400">
                Enter your email below to login to your account
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-8 pb-8 pt-0 md:px-12 md:pb-10">
            <form className="space-y-3" onSubmit={handleSubmit(onSubmit, onSubmitError)} noValidate>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-sm font-medium text-gray-800">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="e.g. john@tecnoglance.com"
                  className={`h-10 rounded-xl text-sm ${
                    errors.email
                      ? 'border-red-500 focus-visible:ring-red-500'
                      : 'border-gray-200 focus-visible:ring-gray-300'
                  }`}
                  {...register('email')}
                />
                <p className="h-2 text-xs text-red-600">&nbsp;</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-800">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Forgot your password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter Password"
                  className={`h-10 rounded-xl text-sm ${
                    errors.password
                      ? 'border-red-500 focus-visible:ring-red-500'
                      : 'border-gray-200 focus-visible:ring-gray-300'
                  }`}
                  {...register('password')}
                />
                <p className="h-2 text-xs text-red-600">&nbsp;</p>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="h-10 w-full rounded-xl bg-black text-sm font-medium text-white hover:bg-black/90 cursor-pointer"
              >
                {isSubmitting || isLoading ? 'Logging in…' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="relative hidden w-[55%] md:block">
          <Image
            src="/login-hero.jpg"
            alt="Sarangi Dentistry"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-3 right-4 hidden text-[10px] text-gray-400 md:block">
        Designed and Developed by @TCPL Group
      </p>
    </main>
  );
}
