import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var ls=window.localStorage;var p=ls.getItem('@nonsense_theme_preference');var s=p==='light'||p==='dark'?p:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');d.dataset.theme=s;d.style.colorScheme=s;d.dataset.themePending='1';setTimeout(function(){delete d.dataset.themePending;},3000);if(ls.getItem('@nonsense_signed_in')==='1'){d.dataset.authPending='1';}}catch(e){}})();`;

const BASE_STYLE = `html,body{background-color:#f1f5f9}
@media (prefers-color-scheme: dark){html:not([data-theme='light']),html:not([data-theme='light']) body{background-color:#0f1115}}
html[data-theme='dark'],html[data-theme='dark'] body{background-color:#0f1115}
html[data-auth-pending] #root,html[data-theme-pending] #root{visibility:hidden}`;

const SITE_URL = 'https://nonsense.adamchok.com';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f1f5f9" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f1115" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Nonsense" />
        <meta property="og:title" content="Nonsense · Home poker tracker" />
        <meta property="og:description" content="Deal the cards. Skip the math. Track every buy-in live, then settle the table in the fewest payments." />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={`${SITE_URL}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Nonsense: Deal the cards. Skip the math." />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${SITE_URL}/og.png`} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <ScrollViewStyleReset />
        <style id="nonsense-base" dangerouslySetInnerHTML={{ __html: BASE_STYLE }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
