export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SportFengur Webhooks',
    version: '1.0.0',
    description: 'Webhook endpoints for SportFengur updates.',
  },
  servers: [{ url: 'https://eidfaxi.ngrok.app' }],
  paths: {
    '/event_einkunn_saeti': {
      post: {
        summary: 'Einkunn saeti webhook',
        description:
          'Triggers results fetch. E1-E5 are judge totals, E6 is keppandi_medaleinkunn.',
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
        description:
          'Triggers starting list fetch (cached per class/competition).',
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
        description:
          'Triggers starting list fetch (cached per class/competition).',
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
    '/current': {
      get: {
        summary: 'Get current JSON payload (wMix)',
        responses: { 200: { description: 'OK' } },
      },
      post: {
        summary: 'Set current JSON payload (wMix)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: { 200: { description: 'Skeyti motttekid' } },
      },
    },
    '/data/current.json': {
      get: {
        summary: 'Get all players data for vMix',
        description:
          'Returns all players with complete competition data in JSON array format. Designed for vMix polling-based data sources.',
        responses: {
          200: {
            description: 'Current rider data',
            headers: {
              'Cache-Control': {
                schema: { type: 'string', example: 'no-store' },
                description: 'Prevents caching to ensure fresh data',
              },
              'Content-Type': {
                schema: { type: 'string', example: 'application/json' },
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    Nr: {
                      type: 'string',
                      description: 'Track number',
                      example: '12',
                    },
                    Saeti: {
                      type: 'string',
                      description: 'Current rank/position',
                      example: '3',
                    },
                    Holl: {
                      type: 'string',
                      description: 'Holl number',
                      example: '1',
                    },
                    Hond: {
                      type: 'string',
                      description: 'Hand (V/H)',
                      example: 'V',
                    },
                    Knapi: {
                      type: 'string',
                      description: 'Rider full name',
                      example: 'Jón Jónsson',
                    },
                    LiturRas: {
                      type: 'string',
                      description: 'Track color number and name',
                      example: '3 - Grænn',
                    },
                    FelagKnapa: {
                      type: 'string',
                      description: 'Rider club/association',
                      example: 'Fákur',
                    },
                    Hestur: {
                      type: 'string',
                      description: 'Horse full name',
                      example: 'Fákur frá Stóra-Ármóti',
                    },
                    Litur: {
                      type: 'string',
                      description: 'Horse color',
                      example: 'Brúnn/milli-einlitt',
                    },
                    Aldur: {
                      type: 'string',
                      description: 'Horse age',
                      example: '9',
                    },
                    FelagEiganda: {
                      type: 'string',
                      description: 'Owner club/association',
                      example: 'Fákur',
                    },
                    Lid: {
                      type: 'string',
                      description: 'Team',
                      example: '',
                    },
                    NafnBIG: {
                      type: 'string',
                      description: 'Rider name in uppercase',
                      example: 'JÓN JÓNSSON',
                    },
                    E1: {
                      type: 'string',
                      description: 'Judge 1 score',
                      example: '6.85',
                    },
                    E2: {
                      type: 'string',
                      description: 'Judge 2 score',
                      example: '6.90',
                    },
                    E3: {
                      type: 'string',
                      description: 'Judge 3 score',
                      example: '6.80',
                    },
                    E4: {
                      type: 'string',
                      description: 'Judge 4 score',
                      example: '6.88',
                    },
                    E5: {
                      type: 'string',
                      description: 'Judge 5 score',
                      example: '6.82',
                    },
                    E6: {
                      type: 'string',
                      description: 'Final average score',
                      example: '6.85',
                    },
                    timestamp: {
                      type: 'string',
                      format: 'date-time',
                      description: 'ISO 8601 timestamp of last update',
                      example: '2024-01-15T14:30:00Z',
                    },
                  },
                },
                example: {
                  Nr: '12',
                  Saeti: '3',
                  Holl: '1',
                  Hond: 'V',
                  Knapi: 'Jón Jónsson',
                  LiturRas: '3 - Grænn',
                  FelagKnapa: 'Fákur',
                  Hestur: 'Fákur frá Stóra-Ármóti',
                  Litur: 'Brúnn/milli-einlitt',
                  Aldur: '9',
                  FelagEiganda: 'Fákur',
                  Lid: '',
                  NafnBIG: 'JÓN JÓNSSON',
                  E1: '6.85',
                  E2: '6.90',
                  E3: '6.80',
                  E4: '6.88',
                  E5: '6.82',
                  E6: '6.85',
                  timestamp: '2024-01-15T14:30:00Z',
                },
              },
            },
          },
        },
      },
    },
    '/data/leaderboard.csv': {
      get: {
        summary: 'Get leaderboard data for vMix',
        description:
          'Returns complete leaderboard in CSV format with all competition fields. Designed for vMix polling-based data sources.',
        responses: {
          200: {
            description: 'Leaderboard data in CSV format',
            headers: {
              'Cache-Control': {
                schema: { type: 'string', example: 'no-store' },
                description: 'Prevents caching to ensure fresh data',
              },
              'Content-Type': {
                schema: { type: 'string', example: 'text/csv' },
              },
            },
            content: {
              'text/csv': {
                schema: {
                  type: 'string',
                  description:
                    'CSV with headers: Nr,Saeti,Holl,Hond,Knapi,LiturRas,FelagKnapa,Hestur,Litur,Aldur,FelagEiganda,Lid,NafnBIG,E1,E2,E3,E4,E5,E6',
                  example:
                    'Nr,Saeti,Holl,Hond,Knapi,LiturRas,FelagKnapa,Hestur,Litur,Aldur,FelagEiganda,Lid,NafnBIG,E1,E2,E3,E4,E5,E6\n12,3,1,V,Jón Jónsson,3 - Grænn,Fákur,Fákur frá Stóra-Ármóti,Brúnn/milli-einlitt,9,Fákur,,JÓN JÓNSSON,6.85,6.90,6.80,6.88,6.82,6.85',
                },
              },
            },
          },
        },
      },
    },
  },
};
