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
  outerPaddingClass: 'px-3 md:pr-4 lg:pr-6 lg:px-0',
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

function BrandLogo(props: { src: string; alt: string }) {
  return (
    <div className="relative h-20 w-32">
      <Image
        src={props.src}
        alt={props.alt}
        fill
        sizes="128px"
        className="object-contain"
        priority
        unoptimized
      />
    </div>
  );
}

function useIsLgUp() {
  const [isLgUp, setIsLgUp] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');

    const onChange = (ev?: MediaQueryListEvent) => {
      setIsLgUp(ev?.matches ?? mql.matches);
    };

    onChange();

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    const legacy = mql as unknown as {
      addListener: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
    };

    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  }, []);

  return isLgUp;
}

function isAnySelectOpen() {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector(
      '[data-state="open"][data-radix-select-trigger], [data-state="open"][data-radix-select-content]',
    ),
  );
}

function getNavButtonClass(active: boolean) {
  const base =
    'group mb-2 flex w-[96%] justify-start gap-3 rounded-xl px-3 py-2 text-sm 2xl:w-[88%] cursor-pointer';
  const variant = active ? 'bg-black text-white hover:bg-black' : 'text-gray-700 hover:bg-gray-100';
  return [base, variant].join(' ');
}

function RenderNavItems(props: {
  items: NavItem[];
  isActive: (href: string) => boolean;
  closeOnSelect?: boolean;
  onCloseSidebar?: () => void;
}) {
  const { items, isActive, closeOnSelect, onCloseSidebar } = props;

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        const onSelect = () => {
          if (item.onClick) item.onClick();
          if (closeOnSelect) onCloseSidebar?.();
        };

        const button = (
          <Button
            type="button"
            variant={active ? 'default' : 'ghost'}
            onClick={item.onClick ? onSelect : undefined}
            className={getNavButtonClass(active)}
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
              if (closeOnSelect) onCloseSidebar?.();
            }}
          >
            {button}
          </Link>
        );
      })}
    </>
  );
}

function SidebarContent(props: {
  mode: 'mobile' | 'desktop';
  closeOnSelect?: boolean;

  brand?: ShellBrand;
  dateTimeSlot?: React.ReactNode;
  panelSwitcher?: ShellChromeProps['panelSwitcher'];

  nav: ShellChromeProps['nav'];
  nav2?: ShellChromeProps['nav2'];

  footerUser?: ShellChromeProps['footerUser'];

  isActive: (href: string) => boolean;

  onOpenProfile: () => void;
  onCloseSidebar?: () => void;
}) {
  const {
    mode,
    closeOnSelect,
    brand,
    dateTimeSlot,
    panelSwitcher,
    nav,
    nav2,
    footerUser,
    isActive,
    onOpenProfile,
    onCloseSidebar,
  } = props;

  const [panelValue, setPanelValue] = React.useState<PanelKey | undefined>(panelSwitcher?.value);

  React.useEffect(() => {
    setPanelValue(panelSwitcher?.value);
  }, [panelSwitcher?.value]);

  return (
    <>
      <div className="flex w-full flex-col items-center justify-center px-6 pb-4 pt-6">
        {brand ? <BrandLogo src={brand.logoSrc} alt={brand.logoAlt} /> : null}

        {dateTimeSlot ? (
          <div className="w-full pb-4 text-xs text-gray-500">
            <div className="flex justify-center">
              <div className="inline-flex flex-col items-start gap-1">{dateTimeSlot}</div>
            </div>
          </div>
        ) : null}

        {panelSwitcher?.show ? (
          <div className="flex w-full flex-col items-center px-2 pt-1">
            <Select
              value={panelValue}
              onValueChange={(v) => {
                const next = v as PanelKey;
                setPanelValue(next);
                panelSwitcher.onChange(next);

                if (closeOnSelect && mode === 'mobile') onCloseSidebar?.();
              }}
            >
              <SelectTrigger className="h-9 cursor-pointer rounded-xl bg-gray-50 text-xs">
                <SelectValue placeholder="Select panel" />
              </SelectTrigger>

              <SelectContent className="z-9999">
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

            {panelSwitcher.helperText ? (
              <div className="mt-1 text-center text-[10px] text-gray-400">
                {panelSwitcher.helperText}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-4 px-3">
        <div>
          {nav.title ? (
            <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">
              {nav.title}
            </div>
          ) : null}

          <div className="space-y-2 pl-4">
            <RenderNavItems
              items={nav.items}
              isActive={isActive}
              closeOnSelect={closeOnSelect}
              onCloseSidebar={onCloseSidebar}
            />
          </div>
        </div>

        {nav2?.items?.length ? (
          <div>
            {nav2.title ? (
              <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">
                {nav2.title}
              </div>
            ) : null}

            <div className="space-y-2 pl-4">
              <RenderNavItems
                items={nav2.items}
                isActive={isActive}
                closeOnSelect={closeOnSelect}
                onCloseSidebar={onCloseSidebar}
              />
            </div>
          </div>
        ) : null}
      </nav>

      {footerUser ? (
        <div className="mt-auto px-4 pb-5.5 lg:pb-1 ">
          <Card className="flex flex-row items-center justify-between rounded-2xl border px-3 py-2 shadow-none">
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
              onClick={() => {
                onOpenProfile();
                if (closeOnSelect && mode === 'mobile') onCloseSidebar?.();
              }}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{footerUser.user.avatarFallback}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-gray-900">
                  {footerUser.user.displayName}
                </div>
                {footerUser.user.subLabel ? (
                  <div className="text-[10px] text-gray-500">{footerUser.user.subLabel}</div>
                ) : null}
              </div>
            </button>

            {footerUser.rightSlot ? footerUser.rightSlot : null}
          </Card>
        </div>
      ) : null}
    </>
  );
}

export function AppShellChrome(props: ShellChromeProps) {
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const isLgUp = useIsLgUp();
  const pathname = usePathname();

  const layout = { ...DEFAULT_LAYOUT, ...(props.layout ?? {}) };
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const drawerRef = React.useRef<HTMLDivElement | null>(null);

  const isActive = React.useCallback(
    (href: string) => {
      if (href === '/') return pathname === '/';
      if (href === '/doctor') return pathname === '/doctor';
      if (href === '/admin') return pathname === '/admin';
      return pathname.startsWith(href);
    },
    [pathname],
  );

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!sidebarOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  React.useEffect(() => {
    if (!sidebarOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  React.useEffect(() => {
    if (!sidebarOpen) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [sidebarOpen]);

  const shellBg = 'bg-white';
  const panelBg = layout.contentBgClass;

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${shellBg}`}>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

      {isLgUp ? (
        <aside
          className={[
            'shrink-0 border-gray-100 bg-white',
            layout.sidebarWidthClass,
            'flex flex-col pb-5.5',
          ].join(' ')}
        >
          <SidebarContent
            mode="desktop"
            closeOnSelect={false}
            brand={props.brand}
            dateTimeSlot={props.dateTimeSlot}
            panelSwitcher={props.panelSwitcher}
            nav={props.nav}
            nav2={props.nav2}
            footerUser={props.footerUser}
            isActive={isActive}
            onOpenProfile={() => setProfileOpen(true)}
          />
        </aside>
      ) : null}

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 z-40 cursor-pointer bg-black/30"
            onPointerDown={(e) => {
              if (isAnySelectOpen()) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }

              const target = e.target as Node | null;
              if (target && drawerRef.current?.contains(target)) {
                e.preventDefault();
                return;
              }

              setSidebarOpen(false);
            }}
          />

          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            className={[
              'absolute left-0 top-0 z-50 h-full',
              'w-[82vw] max-w-[320px]',
              'border-r bg-white',
              'shadow-xl',
              'flex flex-col',
            ].join(' ')}
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <div className="text-sm font-semibold text-gray-900">Menu</div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
                ref={closeBtnRef}
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>

            <SidebarContent
              mode="mobile"
              closeOnSelect
              brand={props.brand}
              dateTimeSlot={props.dateTimeSlot}
              panelSwitcher={props.panelSwitcher}
              nav={props.nav}
              nav2={props.nav2}
              footerUser={props.footerUser}
              isActive={isActive}
              onOpenProfile={() => setProfileOpen(true)}
              onCloseSidebar={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

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
