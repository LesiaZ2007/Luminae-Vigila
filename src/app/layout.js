import { Plus_Jakarta_Sans } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { getSession } from "@/lib/session";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "luminaeVigila",
  description: "Your personal schedule, calendar, and task manager",
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'luminaeVigila',
  },
  icons: {
    apple: '/icon.svg',
  },
};

// Allow env(safe-area-inset-*) to work on iOS (notch / home-indicator)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#243b55',
};

export default async function RootLayout({ children }) {
  const session = await getSession().catch(() => null)
  const isSignedIn = !!session?.userId

  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/*
          Inline script: read the saved accent from localStorage before the first
          paint so there is never a flash of the default blue on a different accent.
          Runs synchronously in <head> — must be tiny and have no imports.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a=localStorage.getItem('lv-accent');if(a&&a!=='blue')document.documentElement.setAttribute('data-accent',a)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="h-full overflow-hidden">
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegistration isSignedIn={isSignedIn} />
      </body>
    </html>
  );
}
