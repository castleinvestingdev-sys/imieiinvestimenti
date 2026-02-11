import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import "./legacy.css"
import Header from "@/components/Header"
import Footer from "@/components/Footer"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://www.imieiinvestimenti.it"),
  title: "iMieiInvestimenti.it - I tuoi investimenti rendono davvero?",
  description: "Scopri se i tuoi investimenti rendono davvero. Analisi gratuita e indipendente dei costi bancari nascosti.",
  keywords: "investimenti, rendimenti, commissioni bancarie, consulenza finanziaria, analisi portafoglio",
  openGraph: {
    type: "website",
    url: "https://www.imieiinvestimenti.it/",
    title: "iMieiInvestimenti.it - I tuoi investimenti rendono davvero?",
    description: "Scopri se i tuoi investimenti rendono davvero. Analisi gratuita e indipendente dei costi bancari nascosti.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "iMieiInvestimenti.it - Analisi Investimenti",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "iMieiInvestimenti.it - I tuoi investimenti rendono davvero?",
    description: "Scopri se i tuoi investimenti rendono davvero. Analisi gratuita e indipendente dei costi bancari nascosti.",
    images: ["/og-image.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="it" data-scroll-behavior="smooth">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </body>
    </html>
  )
}
