export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Eiðfaxi Live Competition API',
    version: '1.0.0',
    description: `Real-time competition data API for Icelandic horse shows. Provides live scores, leaderboards, and event information for vMix graphics integration.

## Features
- **Real-time Updates**: Webhook-driven data refresh for instant score updates
- **Event Filtering**: Get data for specific events and competitions
- **Gait-Specific Results**: Detailed scores for each gait type (tölt, trot, pace, etc.)
- **vMix Integration**: JSON format optimized for live graphics
- **Caching**: Smart caching for starting lists with automatic invalidation

## Data Flow
1. Competition management system sends webhooks when scores/starting lists change
2. Eiðfaxi fetches and caches data from competition API
3. vMix polls endpoints for real-time graphics updates

## Authentication
Webhook endpoints require \`x-webhook-secret\` header for security.`,
    contact: {
      name: 'Eiðfaxi Support',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'https://eidfaxi.ngrok.app',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  tags: [
    {
      name: 'Competition Data',
      description: 'Real-time competition scores and leaderboards',
    },
    {
      name: 'Event Information',
      description: 'Event metadata, participants, and competition schedules',
    },
    {
      name: 'Webhooks',
      description: 'Webhook endpoints for receiving updates from Sportfengur',
    },
    {
      name: 'System',
      description: 'Health checks and system status',
    },
  ],
  paths: {
    '/event_einkunn_saeti': {
      post: {
        tags: ['Webhooks'],
        summary: 'Score Update Webhook',
        description:
          'Receives notifications when rider scores are updated. Triggers automatic fetch of latest results. E1-E5 represent individual judge scores, E6 is the average score.',
        security: [{ webhookSecret: [] }],
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
        tags: ['Webhooks'],
        summary: 'Event Registration Webhook',
        description:
          'Receives notifications when event registration data changes.',
        security: [{ webhookSecret: [] }],
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
        tags: ['Webhooks'],
        summary: 'Participant List Update Webhook',
        description:
          'Receives notifications when the participant list (riders and horses) is modified.',
        security: [{ webhookSecret: [] }],
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
        tags: ['Webhooks'],
        summary: 'Event Schedule Update Webhook',
        description:
          'Receives notifications when the event schedule or program changes.',
        security: [{ webhookSecret: [] }],
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
        tags: ['Webhooks'],
        summary: 'Starting List Published Webhook',
        description:
          'Receives notifications when a starting list is published. Triggers fetch and cache of starting list data. Cache is invalidated on subsequent updates.',
        security: [{ webhookSecret: [] }],
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
        tags: ['Webhooks'],
        summary: 'Next Heat Webhook',
        description:
          'Receives notifications when the next heat/round is ready. Triggers starting list fetch with cache refresh.',
        security: [{ webhookSecret: [] }],
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
        tags: ['Webhooks'],
        summary: 'Competition Disciplines Webhook',
        description:
          'Receives notifications when competition disciplines or classes are updated.',
        security: [{ webhookSecret: [] }],
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
        tags: ['System'],
        summary: 'Health Check',
        description:
          'Returns server health status and last webhook activity timestamps.',
        responses: {
          200: {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    lastWebhookAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true,
                    },
                    lastWebhookProcessedAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true,
                    },
                    lastError: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/current': {
      get: {
        tags: ['Competition Data'],
        summary: 'Get Current Competition Data',
        description:
          'Returns complete leaderboard for the currently active competition. Includes all riders with main scores (E1-E6) and gait-specific scores (tölt, trot, pace, etc.). Data is updated in real-time via webhooks. Use this endpoint when you want all data regardless of event.',
        responses: {
          200: {
            description: 'Current competition data',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      Nr: { type: 'string', example: '3' },
                      Saeti: { type: 'string', example: '1' },
                      Knapi: { type: 'string', example: 'Jón Ársæll Bergmann' },
                      Hestur: {
                        type: 'string',
                        example: 'Díana frá Bakkakoti',
                      },
                      E1: { type: 'string', example: '8.6' },
                      E2: { type: 'string', example: '8.8' },
                      E3: { type: 'string', example: '8.6' },
                      E4: { type: 'string', example: '8.3' },
                      E5: { type: 'string', example: '8.9' },
                      E6: { type: 'string', example: '8.64' },
                      adal: {
                        type: 'object',
                        properties: {
                          _title: { type: 'string', example: 'Aðaleinkunn' },
                          E1: { type: 'string', example: '8.6' },
                          E2: { type: 'string', example: '8.8' },
                          E3: { type: 'string', example: '8.6' },
                          E4: { type: 'string', example: '8.3' },
                          E5: { type: 'string', example: '8.9' },
                          E6: { type: 'string', example: '8.64' },
                        },
                      },
                      tolt_frjals_hradi: {
                        type: 'object',
                        properties: {
                          _title: {
                            type: 'string',
                            example: 'Tölt frjáls hraði',
                          },
                          E1: { type: 'string', example: '9' },
                          E2: { type: 'string', example: '8.5' },
                          E3: { type: 'string', example: '8.5' },
                          E4: { type: 'string', example: '8.5' },
                          E5: { type: 'string', example: '8.5' },
                          E6: { type: 'string', example: '8.6' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/current/{eventId}': {
      get: {
        tags: ['Competition Data'],
        summary: 'Get Competition Data for Specific Event',
        description:
          'Returns complete leaderboard data only if the currently active competition matches the requested event ID. Returns 404 if event does not match.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 70617,
          },
        ],
        responses: {
          200: { description: 'Current competition data for event' },
          404: { description: 'No data available for this event' },
        },
      },
    },
    '/current/{eventId}/results/a': {
      get: {
        tags: ['Competition Data'],
        summary: 'Get A-Finals Gait Results',
        description:
          'Returns gait-specific results grouped by gait type for A-finals (competitionId 2). Each gait includes all riders with their individual judge scores (E1-E5) and average (E6). Perfect for displaying gait-specific graphics in vMix.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 70617,
          },
        ],
        responses: {
          200: {
            description: 'Gangtegund results for A-úrslit',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      gangtegundKey: {
                        type: 'string',
                        example: 'tolt_frjals_hradi',
                      },
                      title: { type: 'string', example: 'Tölt frjáls hraði' },
                      einkunnir: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            nafn: {
                              type: 'string',
                              example: 'Jón Ársæll Bergmann',
                            },
                            saeti: { type: 'string', example: '1' },
                            E1: { type: 'string', example: '9' },
                            E2: { type: 'string', example: '8.5' },
                            E3: { type: 'string', example: '8.5' },
                            E4: { type: 'string', example: '8.5' },
                            E5: { type: 'string', example: '8.5' },
                            E6: { type: 'string', example: '8.6' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'No A-úrslit data available' },
        },
      },
    },
    '/current/{eventId}/results/b': {
      get: {
        tags: ['Competition Data'],
        summary: 'Get B-Finals Gait Results',
        description:
          'Returns gait-specific results grouped by gait type for B-finals (competitionId 3). Each gait includes all riders with their individual judge scores (E1-E5) and average (E6). Perfect for displaying gait-specific graphics in vMix.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 70617,
          },
        ],
        responses: {
          200: { description: 'Gangtegund results for B-úrslit' },
          404: { description: 'No B-úrslit data available' },
        },
      },
    },
    '/leaderboard.csv': {
      get: {
        tags: ['Competition Data'],
        summary: 'Get Leaderboard (CSV Format)',
        description:
          'Returns complete leaderboard in CSV format for compatibility with legacy systems or spreadsheet imports.',
        responses: {
          200: {
            description: 'Leaderboard CSV',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/event/{eventId}/participants': {
      get: {
        tags: ['Event Information'],
        summary: 'Get Event Participants',
        description:
          'Returns complete list of all participants (riders and horses) registered for the event. Includes rider names, horse names, breeding numbers, clubs, colors, and competition disciplines.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 70617,
          },
        ],
        responses: {
          200: {
            description: 'Participants data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    res: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          keppandi_numer: { type: 'integer' },
                          knapi_nafn: { type: 'string' },
                          hross_nafn: { type: 'string' },
                          hross_fulltnafn: { type: 'string' },
                          faedingarnumer: { type: 'string' },
                          knapi_adildarfelag: { type: 'string' },
                          eigandi_adildarfelag: { type: 'string' },
                          litur: { type: 'string' },
                          varaknapi_nafn: { type: 'string' },
                          varapar: { type: 'string' },
                          keppnisgreinar: { type: 'array' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid event ID' },
        },
      },
    },
    '/event/{eventId}/tests': {
      get: {
        tags: ['Event Information'],
        summary: 'Get Event Competitions',
        description:
          'Returns all competitions/tests scheduled for the event. Includes competition names, class names, competition IDs (1=Preliminary, 2=A-Finals, 3=B-Finals, etc.), and starting list publication status.',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 70617,
          },
        ],
        responses: {
          200: { description: 'Event tests data' },
          400: { description: 'Invalid event ID' },
        },
      },
    },
    '/events/search': {
      get: {
        tags: ['Event Information'],
        summary: 'Search Events',
        description:
          'Search for events by year, location, name, country code, or other criteria. Returns list of matching events with basic information.',
        parameters: [
          {
            name: 'ar',
            in: 'query',
            schema: { type: 'integer' },
            example: 2026,
          },
          {
            name: 'land_kodi',
            in: 'query',
            schema: { type: 'string' },
            example: 'IS',
          },
          {
            name: 'motsheiti',
            in: 'query',
            schema: { type: 'string' },
            example: 'Landsmót',
          },
        ],
        responses: {
          200: { description: 'Search results' },
        },
      },
    },
  },
};
