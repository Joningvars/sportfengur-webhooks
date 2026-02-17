const webhookSecurity = [{ webhookSecret: [] }];

function webhookRequest(required, example) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required,
          properties: {
            eventId: { type: 'integer' },
            classId: { type: 'integer' },
            competitionId: { type: 'integer' },
            published: { type: 'integer' },
          },
        },
        example,
      },
    },
  };
}

function webhookPost(summary, description, requestBody) {
  return {
    tags: ['Webhooks'],
    summary,
    description,
    security: webhookSecurity,
    requestBody,
    responses: {
      200: { description: 'Skeyti mottekid' },
      400: { description: 'Missing required fields' },
      401: { description: 'Unauthorized' },
    },
  };
}

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Eidfaxi Live Competition API',
    version: '1.0.0',
    description:
      'REST webhook server for live competition data used by vMix graphics.',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  tags: [
    { name: 'Competition Data' },
    { name: 'Event Information' },
    { name: 'Webhooks' },
    { name: 'System' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['System'],
        summary: 'Root Redirect',
        responses: {
          302: { description: 'Redirect to /docs' },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['System'],
        summary: 'OpenAPI Document',
        responses: {
          200: {
            description: 'OpenAPI JSON',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health Check',
        responses: {
          200: {
            description: 'Health status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/cache/raslisti/clear': {
      post: {
        tags: ['System'],
        summary: 'Clear Starting List Cache',
        responses: {
          200: { description: 'Cache hreinsad' },
        },
      },
    },
    '/current': {
      get: {
        tags: ['System'],
        summary: 'Current Payload (Debug)',
        description:
          'Returns the last payload stored through POST /current.',
        responses: {
          200: {
            description: 'Current payload',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      post: {
        tags: ['System'],
        summary: 'Set Current Payload (Debug)',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti mottekid' },
        },
      },
    },
    '/event/{eventId}/current': {
      get: {
        tags: ['Competition Data'],
        summary: 'Current Leaderboard',
        description:
          'Returns current leaderboard only when requested eventId matches current state.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: {
            description: 'Leaderboard entries',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          404: { description: 'No data available for this event' },
        },
      },
    },
    '/event/{eventId}/{competitionType}': {
      get: {
        tags: ['Competition Data'],
        summary: 'Competition Leaderboard',
        description:
          'Returns leaderboard for a competition type. Use sort=start or sort=rank.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
          {
            name: 'competitionType',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['forkeppni', 'a-urslit', 'b-urslit'],
            },
          },
          {
            name: 'sort',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['start', 'rank'],
              default: 'start',
            },
          },
        ],
        responses: {
          200: {
            description: 'Leaderboard entries',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
          400: { description: 'Invalid event ID or sort value' },
          404: {
            description: 'Unknown competition type or no data available for this event',
          },
        },
      },
    },
    '/event/{eventId}/{competitionType}/csv': {
      get: {
        tags: ['Competition Data'],
        summary: 'Competition Leaderboard CSV',
        description:
          'Returns leaderboard CSV for a competition type. Use sort=start or sort=rank.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
          {
            name: 'competitionType',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['forkeppni', 'a-urslit', 'b-urslit'],
            },
          },
          {
            name: 'sort',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['start', 'rank'],
              default: 'start',
            },
          },
        ],
        responses: {
          200: {
            description: 'CSV output',
            content: {
              'text/csv': {
                schema: { type: 'string' },
              },
            },
          },
          400: { description: 'Invalid event ID or sort value' },
          404: {
            description: 'Unknown competition type or no data available for this event',
          },
        },
      },
    },
    '/leaderboard.csv': {
      get: {
        tags: ['Competition Data'],
        summary: 'Current Leaderboard CSV',
        responses: {
          200: {
            description: 'CSV output',
            content: {
              'text/csv': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/event/{eventId}/participants': {
      get: {
        tags: ['Event Information'],
        summary: 'Event Participants',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: {
            description: 'Participants payload',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          500: { description: 'Failed to fetch participants' },
        },
      },
    },
    '/event/{eventId}/tests': {
      get: {
        tags: ['Event Information'],
        summary: 'Event Tests',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: {
            description: 'Event tests payload',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          500: { description: 'Failed to fetch event tests' },
        },
      },
    },
    '/events/search': {
      get: {
        tags: ['Event Information'],
        summary: 'Search Events',
        responses: {
          200: {
            description: 'Search payload',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
          500: { description: 'Failed to search events' },
        },
      },
    },
    '/event_einkunn_saeti': {
      post: webhookPost(
        'Score Update Webhook',
        'Receives score updates for a class and competition.',
        webhookRequest(
          ['eventId', 'classId', 'competitionId'],
          { eventId: 999, classId: 789, competitionId: 1 },
        ),
      ),
    },
    '/event_mot_skra': {
      post: webhookPost(
        'Event Registration Webhook',
        'Receives event registration updates.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/event_keppendalisti_breyta': {
      post: webhookPost(
        'Participant List Update Webhook',
        'Receives participant updates.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/event_motadagskra_breytist': {
      post: webhookPost(
        'Event Schedule Update Webhook',
        'Receives event schedule updates.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/event_raslisti_birtur': {
      post: webhookPost(
        'Starting List Published Webhook',
        'Receives starting list publication updates.',
        webhookRequest(
          ['eventId', 'classId', 'published'],
          { eventId: 999, classId: 789, published: 1, competitionId: 1 },
        ),
      ),
    },
    '/event_naesti_sprettur': {
      post: webhookPost(
        'Next Heat Webhook',
        'Receives next-heat updates.',
        webhookRequest(
          ['eventId', 'classId', 'competitionId'],
          { eventId: 999, classId: 789, competitionId: 1 },
        ),
      ),
    },
    '/event_keppnisgreinar': {
      post: webhookPost(
        'Competition Disciplines Webhook',
        'Receives test/competition updates for an event.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/webhooks/test': {
      post: {
        tags: ['Webhooks'],
        summary: 'Webhook Test Endpoint',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          200: { description: 'Skeyti mottekid' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      webhookSecret: {
        type: 'apiKey',
        in: 'header',
        name: 'x-webhook-secret',
      },
    },
    schemas: {
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          lastWebhookAt: { type: 'string', format: 'date-time', nullable: true },
          lastWebhookProcessedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          lastError: { type: 'string', nullable: true },
        },
      },
      LeaderboardEntry: {
        type: 'object',
        properties: {
          Nr: { type: 'string' },
          Saeti: { type: 'string' },
          Holl: { type: 'string' },
          Hond: { type: 'string' },
          Knapi: { type: 'string' },
          Hestur: { type: 'string' },
          E1: { type: 'string' },
          E2: { type: 'string' },
          E3: { type: 'string' },
          E4: { type: 'string' },
          E5: { type: 'string' },
          E6: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        additionalProperties: true,
      },
    },
  },
};
