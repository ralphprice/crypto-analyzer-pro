import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';

const inter = Inter({ subsets: ['latin'] });

const theme = createTheme({
  palette: {
    mode: 'dark',  // Default dark mode per spec
    primary: { main: '#4caf50' },  // Green for bullish
    secondary: { main: '#f44336' },  // Red for bearish
  },
  typography: { fontFamily: inter.style.fontFamily },
});

export const metadata: Metadata = {
  title: 'Crypto Analyzer Pro',
  description: 'Analyze cryptos for investment potential',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
