import type { Metadata } from "next";
import "./styles.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "HavenForward · Private member pilot",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
        <main id="main">{children}</main>
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
