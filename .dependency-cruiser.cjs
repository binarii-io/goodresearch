// Module boundaries (docs/standards.md §2, ADR-0003). `$1` refers to the module captured in `from`.
const MODULE = '^apps/api/src/modules/([^/]+)/'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-pure',
      comment: 'The domain layer imports only its own domain and @goodresearch/shared.',
      severity: 'error',
      from: { path: `${MODULE}domain/` },
      to: { pathNot: ['^apps/api/src/modules/$1/domain/', '^packages/shared/'] },
    },
    {
      name: 'commands-no-infra',
      comment:
        'Commands and ports depend on the domain and ports, never on infrastructure or frameworks.',
      severity: 'error',
      from: { path: `${MODULE}application/(commands/|ports\\.ts)` },
      to: {
        path: [
          '^apps/api/src/modules/$1/infrastructure/',
          '^apps/api/src/platform/',
          'node_modules/(fastify|@fastify|drizzle-orm|pg-boss|pg|better-auth)/',
        ],
      },
    },
    {
      name: 'queries-read-only-sql',
      comment:
        'Queries read their own tables with SQL (light CQRS); no framework, job queue or auth library.',
      severity: 'error',
      from: { path: `${MODULE}application/queries/` },
      to: {
        path: [
          '^apps/api/src/modules/$1/infrastructure/(?!schema\\.ts$)',
          'node_modules/(fastify|@fastify|pg-boss|better-auth)/',
        ],
      },
    },
    {
      name: 'modules-via-index',
      comment: 'Other modules are reached only through their public index.ts.',
      severity: 'error',
      from: { path: MODULE },
      to: {
        path: '^apps/api/src/modules/[^/]+/.+',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: ['\\.gen\\.ts$', '/generated/', 'node_modules', '/dist/', 'storybook-static'],
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js'],
    },
  },
}
