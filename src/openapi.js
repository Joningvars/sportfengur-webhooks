const webhookSecretSecurity = [{ webhookSecret: [] }];

const eventIdPathParameter = {
  name: 'eventId',
  in: 'path',
  required: true,
  schema: { type: 'integer' },
  example: 70617,
};

function webhookRequest(required, example, properties = {}) {
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
            ...properties,
          },
        },
        example,
      },
    },
  };
}

function webhookPostOperation(summary, description, requestBody) {
  return {
    tags: ['Webhooks'],
    summary,
    description,
    security: webhookSecretSecurity,
    requestBody,
    responses: {
      200: { description: 'Skeyti mottekid' },
      400: { description: 'Missing required fields' },
      401: { description: 'Unauthorized' },
    },
  };
}

function eventFilteredLeaderboardOperation(summary, description) {
  return {
    tags: ['Event-Scoped'],
    summary,
    description,
    parameters: [eventIdPathParameter],
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
  };
}

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Eidfaxi Live Competition API',
    version: '1.0.0',
    description:
      'Real-time competition data API for Icelandic horse shows and vMix integrations.',
    contact: {
      name: 'Eidfaxi Support',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  tags: [
    {
      name: 'Competition Data',
      description: 'Live leaderboard and result endpoints',
    },
    {
      name: 'Event-Scoped',
      description: 'All endpoints gated by an eventId path parameter',
    },
    {
      name: 'Event Information',
      description: 'Participants, tests, and event search endpoints',
    },
    {
      name: 'Webhooks',
      description: 'Sportfengur webhook ingestion endpoints',
    },
    {
      name: 'System',
      description: 'Health and API schema endpoints',
    },
  ],
  paths: {
    '/': {
      get: {
        tags: ['System'],
        summary: 'Root Redirect',
        description: 'Redirects to /docs.',
        responses: {
          302: { description: 'Redirect response' },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['System'],
        summary: 'OpenAPI Document',
        description: 'Returns this API specification as JSON.',
        responses: {
          200: {
            description: 'OpenAPI document',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true,
                },
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
            description: 'Server health status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },

    '/event_einkunn_saeti': {
      post: webhookPostOperation(
        'Score Update Webhook',
        'Receives score updates and refreshes results for a class/competition.',
        webhookRequest(
          ['eventId', 'classId', 'competitionId'],
          { eventId: 999, classId: 789, competitionId: 1 },
        ),
      ),
    },
    '/event_mot_skra': {
      post: webhookPostOperation(
        'Event Registration Webhook',
        'Receives event registration updates.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/event_keppendalisti_breyta': {
      post: webhookPostOperation(
        'Participant List Update Webhook',
        'Receives participant list updates.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/event_motadagskra_breytist': {
      post: webhookPostOperation(
        'Event Schedule Update Webhook',
        'Receives event schedule updates.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/event_raslisti_birtur': {
      post: webhookPostOperation(
        'Starting List Published Webhook',
        'Receives starting list publication updates.',
        webhookRequest(
          ['eventId', 'classId', 'published'],
          { eventId: 999, classId: 789, published: 1, competitionId: 1 },
        ),
      ),
    },
    '/event_naesti_sprettur': {
      post: webhookPostOperation(
        'Next Heat Webhook',
        'Receives next heat updates and refreshes starting list data.',
        webhookRequest(
          ['eventId', 'classId', 'competitionId'],
          { eventId: 999, classId: 789, competitionId: 1 },
        ),
      ),
    },
    '/event_keppnisgreinar': {
      post: webhookPostOperation(
        'Competition Disciplines Webhook',
        'Receives updates about tests/competitions for an event.',
        webhookRequest(['eventId'], { eventId: 999 }),
      ),
    },
    '/webhooks/test': {
      post: {
        tags: ['Webhooks'],
        summary: 'Webhook Test Endpoint',
        description: 'Accepts any payload and returns a confirmation string.',
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
    '/cache/raslisti/clear': {
      post: {
        tags: ['System'],
        summary: 'Clear Starting List Cache',
        description: 'Clears in-memory starting list cache.',
        responses: {
          200: { description: 'Cache hreinsad' },
        },
      },
    },

    '/current': {
      get: {
        tags: ['Competition Data'],
        summary: 'Current Leaderboard',
        description:
          'Returns leaderboard for the currently active competition context.',
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
        },
      },
    },
    '/forkeppni': {
      get: {
        tags: ['Competition Data'],
        summary: 'Forkeppni (Starting Order)',
        responses: {
          200: {
            description: 'Forkeppni entries sorted by Nr',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
        },
      },
    },
    '/forkeppni/sorted': {
      get: {
        tags: ['Competition Data'],
        summary: 'Forkeppni (Ranked)',
        responses: {
          200: {
            description: 'Forkeppni entries sorted by Saeti',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
        },
      },
    },
    '/a': {
      get: {
        tags: ['Competition Data'],
        summary: 'A-urslit (Starting Order)',
        responses: {
          200: {
            description: 'A-urslit entries sorted by Nr',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
        },
      },
    },
    '/a/sorted': {
      get: {
        tags: ['Competition Data'],
        summary: 'A-urslit (Ranked)',
        responses: {
          200: {
            description: 'A-urslit entries sorted by Saeti',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
        },
      },
    },
    '/b': {
      get: {
        tags: ['Competition Data'],
        summary: 'B-urslit (Starting Order)',
        responses: {
          200: {
            description: 'B-urslit entries sorted by Nr',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
        },
      },
    },
    '/b/sorted': {
      get: {
        tags: ['Competition Data'],
        summary: 'B-urslit (Ranked)',
        responses: {
          200: {
            description: 'B-urslit entries sorted by Saeti',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/LeaderboardEntry' },
                },
              },
            },
          },
        },
      },
    },
    '/current/{eventId}': {
      get: eventFilteredLeaderboardOperation(
        'Current Leaderboard for Event',
        'Returns current leaderboard only when current context matches the requested event ID.',
      ),
    },
    '/{eventId}/forkeppni': {
      get: eventFilteredLeaderboardOperation(
        'Forkeppni for Event (Starting Order)',
        'Returns Forkeppni data for a specific event sorted by starting order.',
      ),
    },
    '/{eventId}/a': {
      get: eventFilteredLeaderboardOperation(
        'A-urslit for Event (Starting Order)',
        'Returns A-urslit data for a specific event sorted by starting order.',
      ),
    },
    '/{eventId}/b': {
      get: eventFilteredLeaderboardOperation(
        'B-urslit for Event (Starting Order)',
        'Returns B-urslit data for a specific event sorted by starting order.',
      ),
    },
    '/{eventId}/forkeppni/sorted': {
      get: eventFilteredLeaderboardOperation(
        'Forkeppni for Event (Ranked)',
        'Returns Forkeppni data for a specific event sorted by rank.',
      ),
    },
    '/{eventId}/a/sorted': {
      get: eventFilteredLeaderboardOperation(
        'A-urslit for Event (Ranked)',
        'Returns A-urslit data for a specific event sorted by rank.',
      ),
    },
    '/{eventId}/b/sorted': {
      get: eventFilteredLeaderboardOperation(
        'B-urslit for Event (Ranked)',
        'Returns B-urslit data for a specific event sorted by rank.',
      ),
    },
    '/{eventId}/results/a': {
      get: {
        tags: ['Event-Scoped'],
        summary: 'A-urslit Gait Results for Event',
        parameters: [eventIdPathParameter],
        responses: {
          200: {
            description: 'Gangtegund results for A-urslit',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GangtegundResult' },
                },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          404: { description: 'No A-urslit data available for this event' },
        },
      },
    },
    '/{eventId}/results/b': {
      get: {
        tags: ['Event-Scoped'],
        summary: 'B-urslit Gait Results for Event',
        parameters: [eventIdPathParameter],
        responses: {
          200: {
            description: 'Gangtegund results for B-urslit',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GangtegundResult' },
                },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          404: { description: 'No B-urslit data available for this event' },
        },
      },
    },
    '/event/{eventId}/participants': {
      get: {
        tags: ['Event-Scoped'],
        summary: 'Event Participants',
        parameters: [eventIdPathParameter],
        responses: {
          200: {
            description: 'Participants payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true,
                },
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
        tags: ['Event-Scoped'],
        summary: 'Event Tests/Competitions',
        parameters: [eventIdPathParameter],
        responses: {
          200: {
            description: 'Tests payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          500: { description: 'Failed to fetch event tests' },
        },
      },
    },

    '/leaderboard.csv': {
      get: {
        tags: ['Competition Data'],
        summary: 'Leaderboard (CSV)',
        responses: {
          200: {
            description: 'Leaderboard as CSV text',
            content: {
              'text/csv': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/events/search': {
      get: {
        tags: ['Event Information'],
        summary: 'Search Events',
        description:
          'Pass through supported Sportfengur search query parameters.',
        parameters: [
          { name: 'numer', in: 'query', schema: { type: 'string' } },
          { name: 'motsheiti', in: 'query', schema: { type: 'string' } },
          { name: 'motsnumer', in: 'query', schema: { type: 'string' } },
          { name: 'stadsetning', in: 'query', schema: { type: 'string' } },
          { name: 'felag_audkenni', in: 'query', schema: { type: 'string' } },
          {
            name: 'adildarfelag_numer',
            in: 'query',
            schema: { type: 'string' },
          },
          { name: 'land_kodi', in: 'query', schema: { type: 'string' } },
          { name: 'ar', in: 'query', schema: { type: 'integer' } },
          {
            name: 'dagsetning_byrjar',
            in: 'query',
            schema: { type: 'string' },
          },
          { name: 'innanhusmot', in: 'query', schema: { type: 'string' } },
          {
            name: 'motstegund_numer',
            in: 'query',
            schema: { type: 'string' },
          },
          { name: 'stormot', in: 'query', schema: { type: 'string' } },
          { name: 'world_ranking', in: 'query', schema: { type: 'string' } },
          { name: 'skraning_stada', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Event search payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
            },
          },
          500: { description: 'Failed to search events' },
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
        description: 'Required for webhook endpoints.',
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
        description:
          'Leaderboard row with fixed fields and optional gait-specific score objects.',
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
      GangtegundScore: {
        type: 'object',
        properties: {
          nafn: { type: 'string' },
          saeti: { type: 'string' },
          E1: { type: 'string' },
          E2: { type: 'string' },
          E3: { type: 'string' },
          E4: { type: 'string' },
          E5: { type: 'string' },
          E6: { type: 'string' },
        },
        additionalProperties: true,
      },
      GangtegundResult: {
        type: 'object',
        properties: {
          gangtegundKey: { type: 'string' },
          title: { type: 'string' },
          einkunnir: {
            type: 'array',
            items: { $ref: '#/components/schemas/GangtegundScore' },
          },
        },
      },
    },
  },
};
