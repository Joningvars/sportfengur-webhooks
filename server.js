import express from 'express';
import {
  registerHealthRoute,
  registerRootRoute,
  registerTestRoute,
  registerWebhookRoutes,
  registerCurrentRoutes,
} from './src/webhooks.js';
import { registerDocs } from './src/docs.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

registerRootRoute(app);
registerWebhookRoutes(app);
registerTestRoute(app);
registerHealthRoute(app);
registerCurrentRoutes(app);
registerDocs(app);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
