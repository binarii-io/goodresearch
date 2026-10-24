# @goodresearch/contracts

Zod schemas shared by the API and, through the generated client, the web app: request and response DTOs, error codes and their HTTP statuses. Route schemas in the API come from here; the OpenAPI document is generated from them. Give every named schema `.meta({ id })`; keep query-string and params schemas anonymous.
