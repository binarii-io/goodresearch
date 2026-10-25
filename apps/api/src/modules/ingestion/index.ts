// Public API of the ingestion module.
/** Published files in memory: tests of other modules use it as their Drive (spec 007). */

export { registerIngestionRoutes } from './infrastructure/http.routes.ts'
export { InMemoryDriveDocuments } from './infrastructure/in-memory.drive-documents.ts'
export { createIngestionModule } from './infrastructure/module.ts'
