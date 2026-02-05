import localFont from 'next/font/local';

export const footlight = localFont({
  src: [
    {
      path: '../public/fonts/FootlightMTProLight.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../public/fonts/FootlightMTProRegular.otf',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-footlight',
  display: 'swap',
});
