import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Velour",
  description: "Self-hosted deployment platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
