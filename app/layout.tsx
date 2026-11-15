import "./globals.css";
import { Providers } from "./providers";
export const metadata = {
  title: "RepoRush — Debug real code",
  description:
    "Practice debugging unfamiliar repositories through realistic engineering challenges.",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: "/logo.svg",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
