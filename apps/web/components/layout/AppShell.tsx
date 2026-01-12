'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

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
    outerPaddingRightClass?: string;
    contentMinWidthLgClass?: string;
    contentCardHeightClass?: string;
    contentBgClass?: string;
  };

  children: React.ReactNode;
};

const DEFAULT_LAYOUT = {
  sidebarWidthClass: 'w-65',
  outerPaddingRightClass: 'pr-6',
  contentCardHeightClass: 'h-[94%]',
  contentBgClass: 'bg-[#f1f3f5]',
  contentMinWidthLgClass: '',
};

export function AppShellChrome(props: ShellChromeProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const layout = { ...DEFAULT_LAYOUT, ...(props.layout ?? {}) };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/doctor') return pathname === '/doctor';
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const shellBg = 'bg-white';
  const panelBg = layout.contentBgClass;

  const navButtonClass =
    'group mb-2 flex w-[96%] justify-start gap-3 rounded-xl px-3 py-2 text-sm 2xl:w-[88%] cursor-pointer';

  const renderNavItems = (items: NavItem[]) =>
    items.map((item) => {
      const Icon = item.icon;
      const active = isActive(item.href);

      const button = (
        <Button
          type="button"
          variant={active ? 'default' : 'ghost'}
          onClick={item.onClick}
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
        <Link key={item.href} href={item.href} className="block w-full">
          {button}
        </Link>
      );
    });

  return (
    <div className={`flex h-screen overflow-hidden ${shellBg}`}>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

      <aside className={`flex ${layout.sidebarWidthClass} flex-col bg-white pb-5.5`}>
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
            <div className="w-full px-2 pt-1 flex flex-col items-center">
              <Select
                value={props.panelSwitcher.value}
                onValueChange={(v) => props.panelSwitcher?.onChange(v as PanelKey)}
              >
                <SelectTrigger className="h-9 rounded-xl bg-gray-50 text-xs cursor-pointer">
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

        <nav className="w-full flex-1 space-y-4 px-3">
          <div>
            {props.nav.title ? (
              <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">
                {props.nav.title}
              </div>
            ) : null}

            <div className="space-y-2 pl-4">{renderNavItems(props.nav.items)}</div>
          </div>

          {props.nav2?.items?.length ? (
            <div>
              {props.nav2.title ? (
                <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">
                  {props.nav2.title}
                </div>
              ) : null}

              <div className="space-y-2 pl-4">{renderNavItems(props.nav2.items)}</div>
            </div>
          ) : null}
        </nav>

        {props.footerUser ? (
          <div className="mt-auto px-4">
            <Card className="flex flex-row items-center justify-between rounded-2xl border px-3 py-2 shadow-none">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                onClick={() => setProfileOpen(true)}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{props.footerUser.user.avatarFallback}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-gray-900">
                    {props.footerUser.user.displayName}
                  </div>
                  {props.footerUser.user.subLabel ? (
                    <div className="text-[10px] text-gray-500">
                      {props.footerUser.user.subLabel}
                    </div>
                  ) : null}
                </div>
              </button>

              {props.footerUser.rightSlot ? props.footerUser.rightSlot : null}
            </Card>
          </div>
        ) : null}
      </aside>

      <div
        className={[
          'flex h-full min-w-0 grow items-center justify-start',
          layout.outerPaddingRightClass,
          layout.contentMinWidthLgClass ? `lg:${layout.contentMinWidthLgClass}` : '',
        ].join(' ')}
      >
        <div
          className={[
            'flex flex-1 flex-col rounded-2xl',
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
            <h1 className="text-2xl font-semibold text-gray-900">{props.header.title}</h1>

            {props.header.centerSlot ? (
              <div className="flex flex-1 justify-center 2xl:px-12">{props.header.centerSlot}</div>
            ) : (
              <div className="flex-1" />
            )}

            {props.header.rightSlot ? (
              <div className="flex items-center gap-3 ">{props.header.rightSlot}</div>
            ) : null}

            {props.header.subtitleRight ? (
              <div className="ml-auto text-[11px] text-gray-500">{props.header.subtitleRight}</div>
            ) : null}
          </header>

          <main className="flex-1 overflow-y-auto dms-scroll">
            <div className={['relative min-h-full rounded-b-2xl', panelBg].join(' ')}>
              {props.children}
            </div>
          </main>
        </div>
      </div>

      <footer className="absolute bottom-0 right-0 px-8 pb-1 text-[10px] text-gray-400">
        Designed and Developed by @TCPL Group
      </footer>
    </div>
  );
}
