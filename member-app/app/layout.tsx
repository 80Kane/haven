import type { Metadata } from "next";
import localFont from "next/font/local";
import "./styles.css";
const bodyFont = localFont({
  src: [
    {
      path: "./fonts/atkinson-hyperlegible-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/atkinson-hyperlegible-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-body",
  display: "swap",
});
const headingFont = localFont({
  src: "./fonts/fraunces-latin-wght-normal.woff2",
  variable: "--font-display",
  display: "swap",
});
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "HavenForward · Private member pilot",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header>
          <a className="brand" href="/">
            Haven<span>Forward</span>
          </a>
          <span className="badge">Private pilot</span>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer>
          <p>
            Need support now? In the U.S., call or text{" "}
            <a href="tel:988">988</a>. In immediate danger, call{" "}
            <a href="tel:911">911</a>.
          </p>
          <a href="https://havenforward.com/resources.html">
            Public support resources
          </a>
        </footer>
      </body>
    </html>
  );
}
