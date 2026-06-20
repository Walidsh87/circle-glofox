// Hand-maintained OpenAPI 3.1 contract for the public REST API (#65). Served at
// /api/v1/openapi.json. Field lists mirror src/lib/api/serializers.ts (the
// source of truth) — keep them in sync when adding fields.

const listResponse = (ref: string) => ({
  '200': {
    description: 'A page of results.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } },
            next_cursor: { type: ['string', 'null'], description: 'Pass as ?cursor= for the next page; null when no more.' },
          },
          required: ['data', 'next_cursor'],
        },
      },
    },
  },
})
const itemResponse = (ref: string) => ({
  '200': { description: 'One resource.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: `#/components/schemas/${ref}` } }, required: ['data'] } } } },
  '404': { $ref: '#/components/responses/NotFound' },
})
const listParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Opaque pagination cursor from a prior next_cursor.' },
]

export const openApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Circle Fitness API', version: '1.0.0', description: 'Read access to a gym’s members, classes, bookings, memberships and packages. All requests are scoped to the gym that owns the API key.' },
  servers: [{ url: '/api/v1' }],
  security: [{ bearerApiKey: [] }],
  components: {
    securitySchemes: { bearerApiKey: { type: 'http', scheme: 'bearer', description: 'Send `Authorization: Bearer ck_live_…`. Keys are issued in the gym dashboard → Settings.' } },
    responses: {
      Unauthorized: { description: 'Missing/invalid/revoked key.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: 'Key lacks the required scope.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'No such resource in this gym.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      RateLimited: { description: 'Too many requests; see Retry-After.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] } }, required: ['error'] },
      Member: { type: 'object', properties: { id: { type: 'string' }, full_name: { type: ['string', 'null'] }, role: { type: 'string' }, created_at: { type: 'string' }, email: { type: ['string', 'null'], description: 'Only with the members:pii scope.' }, phone: { type: ['string', 'null'], description: 'Only with the members:pii scope.' } } },
      Class: { type: 'object', properties: { id: { type: 'string' }, starts_at: { type: 'string' }, duration_minutes: { type: 'integer' }, capacity: { type: 'integer' }, status: { type: 'string' }, template_id: { type: ['string', 'null'] }, coach_id: { type: ['string', 'null'] } } },
      Booking: { type: 'object', properties: { id: { type: 'string' }, class_instance_id: { type: 'string' }, athlete_id: { type: 'string' }, booked_at: { type: 'string' }, checked_in: { type: 'boolean' }, credit_id: { type: ['string', 'null'] } } },
      Membership: { type: 'object', properties: { id: { type: 'string' }, athlete_id: { type: 'string' }, plan_name: { type: 'string' }, monthly_price_aed: { type: ['number', 'null'] }, start_date: { type: 'string' }, end_date: { type: ['string', 'null'] }, payment_status: { type: 'string' } } },
      Package: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, credit_count: { type: 'integer' }, price_aed: { type: 'number' }, expiry_days: { type: ['integer', 'null'] }, active: { type: 'boolean' } } },
    },
  },
  paths: {
    '/members': { get: { summary: 'List members', security: [{ bearerApiKey: ['members:read'] }], parameters: listParams, responses: { ...listResponse('Member'), '401': { $ref: '#/components/responses/Unauthorized' }, '403': { $ref: '#/components/responses/Forbidden' }, '429': { $ref: '#/components/responses/RateLimited' } } } },
    '/members/{id}': { get: { summary: 'Get a member', security: [{ bearerApiKey: ['members:read'] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: itemResponse('Member') } },
    '/classes': { get: { summary: 'List class instances', security: [{ bearerApiKey: ['classes:read'] }], parameters: [...listParams, { name: 'from', in: 'query', schema: { type: 'string' } }, { name: 'to', in: 'query', schema: { type: 'string' } }], responses: listResponse('Class') } },
    '/classes/{id}': { get: { summary: 'Get a class instance', security: [{ bearerApiKey: ['classes:read'] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: itemResponse('Class') } },
    '/bookings': {
      get: { summary: 'List bookings', security: [{ bearerApiKey: ['bookings:read'] }], parameters: [...listParams, { name: 'class_id', in: 'query', schema: { type: 'string' } }, { name: 'member_id', in: 'query', schema: { type: 'string' } }], responses: listResponse('Booking') },
      post: {
        summary: 'Book a member into a class', security: [{ bearerApiKey: ['bookings:write'] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['class_instance_id', 'member_id'], properties: { class_instance_id: { type: 'string' }, member_id: { type: 'string' } } } } } },
        responses: { '201': { description: 'Booking created.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Booking' } } } } } }, '422': { description: 'Member needs an active membership/credits, or the class is full/closed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }, '409': { description: 'Already booked.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/leads': {
      post: {
        summary: 'Create a CRM lead', security: [{ bearerApiKey: ['leads:write'] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['full_name'], properties: { full_name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, source: { type: 'string' }, notes: { type: 'string' } } } } } },
        responses: { '201': { description: 'Lead created.' }, '400': { description: 'Validation error (name required; email or phone needed).', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/memberships': { get: { summary: 'List memberships', security: [{ bearerApiKey: ['memberships:read'] }], parameters: [...listParams, { name: 'member_id', in: 'query', schema: { type: 'string' } }], responses: listResponse('Membership') } },
    '/packages': { get: { summary: 'List packages', security: [{ bearerApiKey: ['packages:read'] }], parameters: listParams, responses: listResponse('Package') } },
  },
} as const
