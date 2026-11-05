import '../../styles/overlay.css';

export const metadata = { title: 'Fila Local — Overlay' };

/** @param {{ children: import('react').ReactNode }} props */
export default function OverlayLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><meta name="referrer" content="no-referrer" /></head>
      <body>{children}</body>
    </html>
  );
}
