import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "PRUEBAS CCG (Puerto 3600)",
  description: "Entorno de Pruebas Regulares - Plataforma de Ensayos SIMCE Colegio Cerro Grande",
};

import { SchoolYearProvider } from "@/context/SchoolYearContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <SchoolYearProvider>
          {children}
        </SchoolYearProvider>
      </body>
    </html>
  );
}
