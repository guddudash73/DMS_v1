// apps/web/components/layout/AppShell.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import ProfileDialog from '@/components/profile/ProfileDialog';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  rightSlot?: React.ReactNode;
  onClick?: () => void;
};

export type PanelKey = 'RECEPTION' | 'DOCTOR' | 'ADMIN';
export type ShellVariant = 'clinic' | 'doctor' | 'admin';

export type ShellUser = {
  displayName: string;
  subLabel?: React.ReactNode;
  avatarFallback: string;
};

export type ShellBrand = {
  logoSrc: string;
  logoAlt: string;
};

export type ShellChromeProps = {
  variant: ShellVariant;

  brand?: ShellBrand;
  dateTimeSlot?: React.ReactNode;
  panelSwitcher?: {
    show: boolean;
    value: PanelKey;
    onChange: (next: PanelKey) => void;
    helperText?: string;
  };

  nav: {
    title?: string;
    items: NavItem[];
  };

  nav2?: {
    title?: string;
    items: NavItem[];
  };

  footerUser?: {
    user: ShellUser;
    rightSlot?: React.ReactNode;
    profileHref?: string;
  };

  header: {
    title: string;
    centerSlot?: React.ReactNode;
    rightSlot?: React.ReactNode;
    subtitleRight?: React.ReactNode;
  };

  layout?: {
    sidebarWidthClass?: string;
    contentMaxWidthClass?: string;
    outerPaddingClass?: string;
    contentBgClass?: string;
    contentCardHeightClass?: string;
  };

  children: React.ReactNode;
};

const DEFAULT_LAYOUT = {
  sidebarWidthClass: 'w-[230px] 2xl:w-[260px]',
  contentMaxWidthClass: 'max-w-[1500px] 2xl:max-w-[1650px]',
  outerPaddingClass: 'px-3 md:px-4 lg:px-6',
  contentCardHeightClass: 'h-full',
  contentBgClass: 'bg-[#f1f3f5]',
};

function HamburgerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AppShellChrome(props: ShellChromeProps) {
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const pathname = usePathname();
  const layout = { ...DEFAULT_LAYOUT, ...(props.layout ?? {}) };

  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/doctor') return pathname === '/doctor';
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  // Close drawer on navigation change
  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // ESC to close
  React.useEffect(() => {
    if (!sidebarOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  // Body scroll lock while drawer open
  React.useEffect(() => {
    if (!sidebarOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  // Focus close button when drawer opens
  React.useEffect(() => {
    if (!sidebarOpen) return;
    // next tick to ensure it's mounted
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [sidebarOpen]);

  const shellBg = 'bg-white';
  const panelBg = layout.contentBgClass;

  const navButtonClass =
    'group mb-2 flex w-[96%] justify-start gap-3 rounded-xl px-3 py-2 text-sm 2xl:w-[88%] cursor-pointer';

  const renderNavItems = (items: NavItem[], opts?: { closeOnSelect?: boolean }) =>
    items.map((item) => {
      const Icon = item.icon;
      const active = isActive(item.href);

      const onSelect = () => {
        if (item.onClick) item.onClick();
        if (opts?.closeOnSelect) setSidebarOpen(false);
      };

      const button = (
        <Button
          type="button"
          variant={active ? 'default' : 'ghost'}
          onClick={item.onClick ? onSelect : undefined}
          className={[
            navButtonClass,
            active ? 'bg-black text-white hover:bg-black' : 'text-gray-700 hover:bg-gray-100',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
          {item.rightSlot ? <span className="ml-auto">{item.rightSlot}</span> : null}
        </Button>
      );

      if (item.onClick) {
        return (
          <div key={item.href} className="w-full">
            {button}
          </div>
        );
      }

      return (
        <Link
          key={item.href}
          href={item.href}
          className="block w-full"
          onClick={() => {
            if (opts?.closeOnSelect) setSidebarOpen(false);
          }}
        >
          {button}
        </Link>
      );
    });

  const SidebarContent = (p: { closeOnSelect?: boolean }) => (
    <>
      <div className="flex w-full flex-col items-center justify-center px-6 pb-4 pt-6">
        {props.brand ? (
          <div className="relative h-18 w-32">
            <Image
              src={props.brand.logoSrc}
              alt={props.brand.logoAlt}
              width={128}
              height={48}
              className="object-contain"
              priority
              unoptimized
            />
          </div>
        ) : null}

        {props.dateTimeSlot ? (
          <div className="w-full pb-4 text-xs text-gray-500">
            <div className="flex justify-center">
              <div className="inline-flex flex-col items-start gap-1">{props.dateTimeSlot}</div>
            </div>
          </div>
        ) : null}

        {props.panelSwitcher?.show ? (
          <div className="flex w-full flex-col items-center px-2 pt-1">
            <Select
              value={props.panelSwitcher.value}
              onValueChange={(v) => {
                props.panelSwitcher?.onChange(v as PanelKey);
                if (p.closeOnSelect) setSidebarOpen(false);
              }}
            >
              <SelectTrigger className="h-9 cursor-pointer rounded-xl bg-gray-50 text-xs">
                <SelectValue placeholder="Select panel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN" className="cursor-pointer">
                  Admin
                </SelectItem>
                <SelectItem value="RECEPTION" className="cursor-pointer">
                  Reception
                </SelectItem>
                <SelectItem value="DOCTOR" className="cursor-pointer">
                  Doctor
                </SelectItem>
              </SelectContent>
            </Select>

            {props.panelSwitcher.helperText ? (
              <div className="mt-1 text-center text-[10px] text-gray-400">
                {props.panelSwitcher.helperText}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-4 px-3">
        <div>
          {props.nav.title ? (
            <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">
              {props.nav.title}
            </div>
          ) : null}

          <div className="space-y-2 pl-4">{renderNavItems(props.nav.items, p)}</div>
        </div>

        {props.nav2?.items?.length ? (
          <div>
            {props.nav2.title ? (
              <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">
                {props.nav2.title}
              </div>
            ) : null}

            <div className="space-y-2 pl-4">{renderNavItems(props.nav2.items, p)}</div>
          </div>
        ) : null}
      </nav>

      {props.footerUser ? (
        <div className="mt-auto px-4 pb-5.5">
          <Card className="flex flex-row items-center justify-between rounded-2xl border px-3 py-2 shadow-none">
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
              onClick={() => {
                setProfileOpen(true);
                if (p.closeOnSelect) setSidebarOpen(false);
              }}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{props.footerUser.user.avatarFallback}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-gray-900">
                  {props.footerUser.user.displayName}
                </div>
                {props.footerUser.user.subLabel ? (
                  <div className="text-[10px] text-gray-500">{props.footerUser.user.subLabel}</div>
                ) : null}
              </div>
            </button>

            {props.footerUser.rightSlot ? props.footerUser.rightSlot : null}
          </Card>
        </div>
      ) : null}
    </>
  );

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${shellBg}`}>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Desktop sidebar (lg+) */}
      <aside
        className={[
          'hidden lg:flex',
          'shrink-0 border-gray-100 bg-white',
          layout.sidebarWidthClass,
          'flex-col pb-5.5',
        ].join(' ')}
      >
        <SidebarContent closeOnSelect={false} />
      </aside>

      {/* Mobile/Tablet drawer (<lg) */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* backdrop */}
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 cursor-pointer bg-black/30"
            onClick={() => setSidebarOpen(false)}
          />
          {/* panel */}
          <div
            role="dialog"
            aria-modal="true"
            className={[
              'absolute left-0 top-0 h-full',
              'w-[82vw] max-w-[320px]',
              'border-r bg-white',
              'shadow-xl',
              'flex flex-col',
            ].join(' ')}
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <div className="text-sm font-semibold text-gray-900">Menu</div>
              <Button
                ref={closeBtnRef}
                type="button"
                size="icon-sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>

            <SidebarContent closeOnSelect />
          </div>
        </div>
      ) : null}

      {/* Content region */}
      <div className={['flex min-w-0 flex-1', layout.outerPaddingClass].join(' ')}>
        <div className="flex min-w-0 flex-1 justify-center py-3 md:py-4 lg:py-6">
          <div
            className={[
              'flex min-w-0 flex-1 flex-col',
              layout.contentMaxWidthClass,
              'rounded-2xl',
              layout.contentCardHeightClass,
              panelBg,
            ].join(' ')}
          >
            <header
              className={[
                'flex items-center gap-4 rounded-t-2xl border-b px-4 py-2 shadow-inner',
                panelBg,
                '2xl:px-12',
              ].join(' ')}
            >
              {/* Hamburger only on <lg */}
              <div className="lg:hidden">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="cursor-pointer"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open menu"
                  aria-expanded={sidebarOpen}
                >
                  <HamburgerIcon className="h-4 w-4" />
                </Button>
              </div>

              <h1 className="text-2xl font-semibold text-gray-900">{props.header.title}</h1>

              {props.header.centerSlot ? (
                <div className="flex flex-1 justify-center 2xl:px-12">
                  {props.header.centerSlot}
                </div>
              ) : (
                <div className="flex-1" />
              )}

              {props.header.rightSlot ? (
                <div className="flex items-center gap-3">{props.header.rightSlot}</div>
              ) : null}

              {props.header.subtitleRight ? (
                <div className="ml-auto text-[11px] text-gray-500">
                  {props.header.subtitleRight}
                </div>
              ) : null}
            </header>

            <main className="flex-1 overflow-y-scroll dms-scroll">
              <div className={['relative min-h-full rounded-b-2xl', panelBg].join(' ')}>
                {props.children}
              </div>
            </main>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-2 right-4 text-[10px] text-gray-400 md:bottom-3 md:right-6">
        Designed and Developed by @TCPL Group
      </div>
    </div>
  );
}
