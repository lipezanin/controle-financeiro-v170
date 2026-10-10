import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AuthProvider } from "@/lib/auth/provider";
import appCss from "../styles.css?url";
import appCssInline from "../styles.css?inline";

const APP_NAME = "Controle Financeiro";

const CSS_CRITICO = `
html,body,#app{margin:0;min-height:100%;background:#0f172a;color:#f1f5f9;font-family:"Segoe UI",system-ui,sans-serif;}
a{color:inherit;text-decoration:none;}
*,*::before,*::after{box-sizing:border-box;}
input,select,textarea{background:#1e3a5f;color:#f1f5f9;border:1px solid #3b82f680;border-radius:8px;padding:6px 10px;font:inherit;}
input[type=file]{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip:rect(0,0,0,0);}
button{font:inherit;cursor:pointer;background:#1e293b;color:#f1f5f9;border:1px solid #334155;border-radius:8px;padding:6px 12px;}
.cf-shell{min-height:100dvh;background:#0f172a;color:#f1f5f9;}
.cf-aside{display:none;position:fixed;inset:0 auto 0 0;z-index:30;width:280px;flex-direction:column;border-right:1px solid #334155;background:#0f172a;padding:16px 12px;overflow:auto;}
.cf-mobile-header{display:flex;position:sticky;top:0;z-index:20;align-items:center;gap:12px;border-bottom:1px solid #334155;background:#0f172ae6;padding:12px;}
.cf-main{padding:24px 16px;}
.cf-badge{display:flex;width:36px;height:36px;align-items:center;justify-content:center;border-radius:10px;background:#3b82f6;color:#eff6ff;font-size:12px;font-weight:600;}
@media(min-width:768px){.cf-aside{display:flex!important}.cf-mobile-header{display:none!important}.cf-main{padding-left:304px}}
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Controle financeiro pessoal local — carteira, IRPFM, caixa e fluxo.",
      },
      { name: "theme-color", content: "#0f172a" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      ...(import.meta.env.PROD ? [{ rel: "stylesheet" as const, href: "/assets/app.css" }] : []),
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: `${CSS_CRITICO}\n${appCssInline}` }} />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <AppShell>
            <Outlet />
          </AppShell>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
