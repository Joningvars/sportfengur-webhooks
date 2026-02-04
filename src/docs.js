import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi.js';

export function registerDocs(app) {
  app.get('/openapi.json', (req, res) => {
    res.json(openApiSpec);
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
}
