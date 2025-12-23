'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { useLogoutMutation } from '@/src/store/api';

type LogoutButtonProps = {
  className?: string;
  variant?: 'default' | 'ghost' | 'outline' | 'secondary' | 'destructive' | null;
  size?: 'default' | 'sm' | 'lg' | 'icon' | null;
  iconOnly?: boolean;
};

export default function LogoutButton({
  className,
  variant = 'ghost',
  size = 'icon',
  iconOnly = true,
}: LogoutButtonProps) {
  const router = useRouter();
  const [logout, { isLoading }] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logout().unwrap();
      toast.success('Logged out successfully.');
    } catch {
      toast.info('Logged out.');
    } finally {
      router.replace('/login');
    }
  };

  return (
    <Button
      onClick={handleLogout}
      variant={variant}
      size={size}
      className={className}
      disabled={isLoading}
      aria-label="Logout"
    >
      <LogOut className="h-3 w-3" />
      {!iconOnly && <span className="ml-2">Logout</span>}
    </Button>
  );
}
