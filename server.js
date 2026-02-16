import './src/logger.js';
import express from 'express';
import { spawn } from 'child_process';
import {
  registerHealthRoute,
  registerRootRoute,
  registerTestRoute,
  registerWebhookRoutes,
  registerCurrentRoutes,
  registerCacheRoutes,
} from './src/webhooks.js';
import { registerDocs } from './src/docs.js';
import { registerVmixRoutes } from './src/vmix/server.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

registerRootRoute(app);
registerWebhookRoutes(app);
registerTestRoute(app);
registerHealthRoute(app);
registerCurrentRoutes(app);
registerCacheRoutes(app);
registerDocs(app);
registerVmixRoutes(app);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`███████╗██╗██████╗ ███████╗ █████╗ ██╗  ██╗██╗████████╗██╗   ██╗
██╔════╝██║██╔══██╗██╔════╝██╔══██╗╚██╗██╔╝██║╚══██╔══╝██║   ██║
█████╗  ██║██║  ██║█████╗  ███████║ ╚███╔╝ ██║   ██║   ██║   ██║
██╔══╝  ██║██║  ██║██╔══╝  ██╔══██║ ██╔██╗ ██║   ██║   ╚██╗ ██╔╝
███████╗██║██████╔╝██║     ██║  ██║██╔╝ ██╗██║   ██║    ╚████╔╝ 
╚══════╝╚═╝╚═════╝ ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝   ╚═╝     ╚═══╝  
                                                                `);
  console.log('SportFengur Webhooks er ræst');
  console.log(`Vefþjónn keyrir á porti ${port}`);

  if (process.env.NGROK_AUTOSTART === 'true') {
    const cmd =
      process.env.NGROK_COMMAND || `ngrok http --url=eidfaxi.ngrok.app ${port}`;
    console.log(`Ræsi ngrok: ${cmd}`);
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', cmd], {
        stdio: 'ignore',
        windowsHide: true,
        detached: true,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', cmd], {
        stdio: 'ignore',
        detached: true,
      }).unref();
    } else {
      spawn('x-terminal-emulator', ['-e', cmd], {
        stdio: 'ignore',
        detached: true,
      }).unref();
    }
  }
});
