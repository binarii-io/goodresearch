import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'

/** A real OpenID Connect provider for tests (same image as the `dev` compose profile). */
export const startMockOidc = async (): Promise<{
  issuer: string
  container: StartedTestContainer
}> => {
  const container = await new GenericContainer('ghcr.io/navikt/mock-oauth2-server:6.1.1')
    .withExposedPorts(8080)
    .withEnvironment({ JSON_CONFIG: JSON.stringify({ interactiveLogin: true }) })
    .withWaitStrategy(Wait.forHttp('/default/.well-known/openid-configuration', 8080))
    .start()
  return { issuer: `http://localhost:${container.getMappedPort(8080)}/default`, container }
}
