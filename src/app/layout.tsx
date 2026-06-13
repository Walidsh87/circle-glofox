import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Fraunces, Hanken_Grotesk, IBM_Plex_Sans_Arabic } from 'next/font/google'
import { themeInitScript } from '@/lib/theme'
import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { LocaleProvider } from '@/components/i18n/locale-provider'
import './globals.css'

const geistSans = localFont({ src: './fonts/GeistVF.woff', variable: '--font-geist-sans', weight: '100 900' })
const geistMono = localFont({ src: './fonts/GeistMonoVF.woff', variable: '--font-geist-mono', weight: '100 900' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz'] })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', weight: ['300', '400', '500', '600', '700'] })
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], variable: '--font-plex-arabic', weight: ['400', '500', '600', '700'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Circle',
  description: 'Gym management platform',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Circle' },
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale()
  return (
    // data-theme="dark" is the SSR/no-JS default; the inline script corrects it
    // pre-paint. lang/dir are server-authoritative from the locale (no client
    // correction). suppressHydrationWarning covers the data-theme mismatch only.
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${hanken.variable} ${plexArabic.variable} antialiased`}>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <LocaleProvider locale={locale} messages={getDictionary(locale)}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  )
}
