import "./globals.css";
export const metadata = { title: "RepoRush — Debug real code", description: "Practice debugging unfamiliar repositories through realistic engineering challenges." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
