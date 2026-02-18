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
    '/event/{eventId}/{competitionType}/groups': {
      get: {
        tags: ['Competition Data'],
        summary: 'Competition Leaderboard Groups',
        description:
          'Returns leaderboard entries grouped into chunks (default 7) for start-screen display.',
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
          {
            name: 'groupSize',
            in: 'query',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 7,
            },
          },
        ],
        responses: {
          200: {
            description: 'Grouped leaderboard entries',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/GroupedContestant' },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid event ID, sort value, or groupSize' },
          404: {
            description: 'Unknown competition type or no data available for this event',
          },
        },
      },
    },
    '/event/{eventId}/{competitionType}/group': {
      get: {
        tags: ['Competition Data'],
        summary: 'Competition Leaderboard Group (Flat for vMix)',
        description:
          'Returns a single contestant group as a flat array (default group=1, groupSize=7), useful for vMix data sources.',
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
          {
            name: 'groupSize',
            in: 'query',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 7,
            },
          },
          {
            name: 'group',
            in: 'query',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              default: 1,
            },
          },
        ],
        responses: {
          200: {
            description: 'Single group rows as flat array',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GroupedContestant' },
                },
              },
            },
          },
          400: { description: 'Invalid event ID, sort value, groupSize, or group' },
          404: {
            description: 'Unknown competition type or no data available for this event',
          },
        },
      },
    },
    '/event/{eventId}/{competitionType}/groups/flat': {
      get: {
        tags: ['Competition Data'],
        summary: 'Competition Leaderboard Groups (Flat Rows)',
        description:
          'Returns one row per group with indexed contestant fields (name1..nameN, horse1..horseN, Lid1..LidN, Nr1..NrN, saeti1..saetiN, einkunn1..einkunnN).',
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
          {
            name: 'groupSize',
            in: 'query',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 7,
            },
          },
        ],
        responses: {
          200: {
            description: 'Flat contestant rows with group number',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GroupedContestantFlatRow' },
                },
              },
            },
          },
          400: { description: 'Invalid event ID, sort value, or groupSize' },
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
    '/event/{eventId}/{competitionType}/results': {
      get: {
        tags: ['Competition Data'],
        summary: 'Competition Gait Results',
        description:
          'Returns flat gait-result rows grouped by gangtegund. sort=start (default) orders each gangtegund by start number (Nr). sort=rank orders each gangtegund by highest E6 first; pos is assigned per gangtegund.',
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
            description: 'Flat gait result rows',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GangtegundResultRow' },
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
    '/event/{eventId}/leaderboards.zip': {
      get: {
        tags: ['Competition Data'],
        summary: 'All Leaderboards ZIP',
        description:
          'Returns a ZIP file with current and per-competition CSV exports (start and rank).',
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
            description: 'ZIP archive',
            content: {
              'application/zip': {
                schema: {
                  type: 'string',
                  format: 'binary',
                },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          404: { description: 'No data available for this event' },
        },
      },
    },
    '/event/{eventId}/csv.zip': {
      get: {
        tags: ['Competition Data'],
        summary: 'All Leaderboards CSV ZIP',
        description:
          'Alias for /event/{eventId}/leaderboards.zip. Returns a ZIP file with current and per-competition CSV exports (start and rank).',
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
            description: 'ZIP archive',
            content: {
              'application/zip': {
                schema: {
                  type: 'string',
                  format: 'binary',
                },
              },
            },
          },
          400: { description: 'Invalid event ID' },
          404: { description: 'No data available for this event' },
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
    '/person/find/{kennitala}': {
      get: {
        tags: ['Event Information'],
        summary: 'Find Person By Kennitala',
        description:
          'Returns Sportfengur person_id for a given kennitala (national ID/SSN).',
        parameters: [
          {
            name: 'kennitala',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Found person id or -1 if not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PersonFindResponse' },
              },
            },
          },
          400: { description: 'Invalid kennitala' },
          500: { description: 'Failed to find person' },
        },
      },
    },
    '/person/{personId}/events': {
      get: {
        tags: ['Event Information'],
        summary: 'Person Event History',
        description:
          'Returns all events/tests the person has participated in. Locale defaults to configured SPORTFENGUR_LOCALE.',
        parameters: [
          {
            name: 'personId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
          {
            name: 'locale',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['is', 'en', 'fo', 'nb', 'sv'],
              default: 'is',
            },
          },
        ],
        responses: {
          200: {
            description: 'Person event history payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PersonEventsResponse' },
              },
            },
          },
          400: { description: 'Invalid person ID or locale' },
          500: { description: 'Failed to fetch person events' },
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
          colorHex: { type: 'string', example: '#FF0000' },
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
      GangtegundResultRow: {
        type: 'object',
        properties: {
          gangtegundKey: { type: 'string' },
          title: { type: 'string' },
          name: { type: 'string' },
          horse: { type: 'string' },
          color: { type: 'string' },
          colorHex: { type: 'string', example: '#FF0000' },
          pos: { type: 'string' },
          E1: { type: 'string' },
          E2: { type: 'string' },
          E3: { type: 'string' },
          E4: { type: 'string' },
          E5: { type: 'string' },
          E6: { type: 'string' },
        },
        additionalProperties: true,
      },
      GroupedLeaderboardResponse: {
        type: 'object',
        properties: {
          eventId: { type: 'integer' },
          competitionType: { type: 'string' },
          sort: { type: 'string', enum: ['start', 'rank'] },
          groupSize: { type: 'integer', example: 7 },
          total: { type: 'integer', example: 21 },
          groups: {
            type: 'array',
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/GroupedContestant' },
            },
          },
        },
      },
      GroupedContestant: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Jón Ársæll Bergmann' },
          horse: { type: 'string', example: 'Díana frá Bakkakoti' },
          Lid: { type: 'string', example: '' },
          Nr: { type: 'string', example: '5' },
          saeti: { type: 'string', example: '1' },
          einkunn: { type: 'string', example: '8.50' },
        },
      },
      GroupedContestantFlatRow: {
        type: 'object',
        properties: {
          group: { type: 'integer', example: 1 },
          name1: { type: 'string', example: 'Jón Ársæll Bergmann' },
          horse1: { type: 'string', example: 'Díana frá Bakkakoti' },
          Lid1: { type: 'string', example: '' },
          Nr1: { type: 'string', example: '5' },
          saeti1: { type: 'string', example: '1' },
          einkunn1: { type: 'string', example: '8.50' },
        },
      },
      PersonFindResponse: {
        type: 'object',
        properties: {
          person_id: { type: 'integer', example: 123 },
        },
      },
      PersonEventHistoryRow: {
        type: 'object',
        properties: {
          mot_numer: { type: 'integer', example: 999 },
          mot_heiti: { type: 'string', example: 'Event name' },
          mot_byrjar: { type: 'string', example: '2023-06-10' },
          mot_endar: { type: 'string', example: '2023-06-11' },
          keppnisgrein: { type: 'string', example: 'Tolt T1' },
          flokkur: { type: 'string', example: 'Fullordinsflokkur' },
          keppni: { type: 'string', example: 'Forkeppni' },
          einkunn: { type: 'number', example: 7.7 },
          saeti: { type: 'integer', example: 2 },
        },
        additionalProperties: true,
      },
      PersonEventsResponse: {
        type: 'object',
        properties: {
          success: { type: 'integer', example: 1 },
          history: {
            type: 'array',
            items: { $ref: '#/components/schemas/PersonEventHistoryRow' },
          },
        },
      },
    },
  },
};
