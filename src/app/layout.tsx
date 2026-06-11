import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
import { themeInitScript } from '@/lib/theme'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz'],
})
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Circle',
  description: 'Gym management platform',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Circle' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // data-theme="dark" is the SSR/no-JS default (today's look); the inline
    // script corrects it pre-paint. suppressHydrationWarning covers the
    // intentional server/client attribute mismatch on <html> only.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${hanken.variable} antialiased`}>
        {/* Pre-paint theme init — build-time constant from src/lib/theme.ts, not user input */}
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  )
}
