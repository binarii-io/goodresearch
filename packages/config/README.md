# @goodresearch/config

Loads and validates the environment at start (`loadConfig(process.env)`). Every variable is documented in [the configuration contract](../../specs/001-walking-skeleton/contracts/configuration.md) and `.env.example`; `<NAME>_FILE` variants read secrets from files. An invalid environment throws a `ConfigError` naming each faulty variable.
