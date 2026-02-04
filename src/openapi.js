export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SportFengur Webhooks',
    version: '1.0.0',
    description: 'Webhook endpoints for SportFengur updates.',
  },
  servers: [{ url: 'http://localhost:3000' }],
  paths: {
    '/event_einkunn_saeti': {
      post: {
        summary: 'Einkunn saeti webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId', 'classId', 'competitionId'],
                properties: {
                  eventId: { type: 'integer' },
                  classId: { type: 'integer' },
                  competitionId: { type: 'integer' },
                },
              },
              example: { eventId: 999, classId: 789, competitionId: 1 },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti motttekid' },
          400: { description: 'Missing required fields' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/event_mot_skra': {
      post: {
        summary: 'Mot skra webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId'],
                properties: { eventId: { type: 'integer' } },
              },
              example: { eventId: 999 },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti motttekid' },
          400: { description: 'Missing required fields' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/event_keppendalisti_breyta': {
      post: {
        summary: 'Keppendalisti breyta webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId'],
                properties: { eventId: { type: 'integer' } },
              },
              example: { eventId: 999 },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti motttekid' },
          400: { description: 'Missing required fields' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/event_motadagskra_breytist': {
      post: {
        summary: 'Motadagskra breytist webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId'],
                properties: { eventId: { type: 'integer' } },
              },
              example: { eventId: 999 },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti motttekid' },
          400: { description: 'Missing required fields' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/event_raslisti_birtur': {
      post: {
        summary: 'Raslisti birtur webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId', 'classId', 'published'],
                properties: {
                  eventId: { type: 'integer' },
                  classId: { type: 'integer' },
                  published: { type: 'integer' },
                  competitionId: { type: 'integer' },
                },
              },
              example: {
                eventId: 999,
                classId: 789,
                published: 1,
                competitionId: 1,
              },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti motttekid' },
          400: { description: 'Missing required fields' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/event_naesti_sprettur': {
      post: {
        summary: 'Naesti sprettur webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId', 'classId', 'competitionId'],
                properties: {
                  eventId: { type: 'integer' },
                  classId: { type: 'integer' },
                  competitionId: { type: 'integer' },
                },
              },
              example: { eventId: 999, classId: 789, competitionId: 1 },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti motttekid' },
          400: { description: 'Missing required fields' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/event_keppnisgreinar': {
      post: {
        summary: 'Keppnisgreinar webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId'],
                properties: { eventId: { type: 'integer' } },
              },
              example: { eventId: 999 },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti motttekid' },
          400: { description: 'Missing required fields' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health status',
        responses: { 200: { description: 'OK' } },
      },
    },
  },
};
