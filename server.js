import './src/logger.js';
import express from 'express';
import {
  registerHealthRoute,
  registerRootRoute,
  registerTestRoute,
  registerWebhookRoutes,
  registerCacheRoutes,
  registerConfigRoutes,
  registerControlWebhookRoutes,
} from './src/webhooks.js';
import { registerDocs } from './src/docs.js';
import { registerControlAuthRoutes } from './src/control-auth.js';
import { registerVmixRoutes } from './src/vmix/server.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

registerRootRoute(app);
registerWebhookRoutes(app);
registerTestRoute(app);
registerHealthRoute(app);
registerCacheRoutes(app);
registerConfigRoutes(app);
registerControlWebhookRoutes(app);
registerDocs(app);
registerControlAuthRoutes(app);
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
  console.log('vMix routes are ready (/event/*, /control)');
});
