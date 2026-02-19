import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi.js';

export function registerDocs(app) {
  app.get('/openapi.json', (req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'Eidfaxi API Docs',
      customCss: `
        .swagger-ui .topbar {
          display: flex;
          align-items: center;
        }
        .eidfaxi-control-login {
          margin-left: auto;
          margin-right: 16px;
          background: #0f172a;
          border: 1px solid #334155;
          color: #fff !important;
          border-radius: 4px;
          padding: 4px 10px;
          text-decoration: none;
          font-size: 16px !important;
          font-weight: 600;
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          align-self: center;
          text-align: center;
          line-height: 1 !important;
          height: 28px !important;
          max-height: 28px !important;
          width: fit-content !important;
          min-width: 0 !important;
          flex: 0 0 auto !important;
        }
        .eidfaxi-control-login:hover {
          background: #1b1b1b;
          border-color: #475569;
        }
      `,
      customJsStr: `
        (function () {
          function injectButton() {
            var topbar = document.querySelector('.swagger-ui .topbar');
            if (!topbar) return;
            if (document.querySelector('.eidfaxi-control-login')) return;

            var link = document.createElement('a');
            link.className = 'eidfaxi-control-login';
            link.href = '/control/login';
            link.textContent = 'Innskrá';
            topbar.appendChild(link);
          }

          injectButton();
          var observer = new MutationObserver(injectButton);
          observer.observe(document.body, { childList: true, subtree: true });
        })();
      `,
    }),
  );
}
