import '../../styles/panel.css';

export const metadata = { title: 'Fila Local — Painel' };

/** @param {{ children: import('react').ReactNode }} props */
export default function PanelLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
