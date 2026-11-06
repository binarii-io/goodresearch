import { expect, expectAccessible, member, passAiProviderStep, signIn, test } from './fixtures.ts'

test.describe('spec 004 — AI provider', () => {
  test('a new account chooses a provider before anything else, then manages it', async ({
    page,
  }) => {
    await signIn(page, member('provider'))
    await expect(page).toHaveURL(/\/setup\/ai-provider/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Choose your AI provider' }),
    ).toBeVisible()
    await expectAccessible(page)

    // The step cannot be skipped.
    await page.goto('/teams')
    await expect(page).toHaveURL(/\/setup\/ai-provider/)

    await page.getByRole('radio', { name: /Test provider/ }).click()
    await page.getByLabel('Test provider API key').fill('test-invalid-key')
    await page.getByRole('button', { name: 'Check and save' }).click()
    await expect(page.getByRole('alert')).toContainText('The key or the Google access was refused.')
    await expectAccessible(page)

    await page.getByLabel('Test provider API key').fill('test-ok-e2e-key')
    await page.getByRole('button', { name: 'Check and save' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

    await page.getByRole('button', { name: /^provider-/ }).click()
    await page.getByRole('menuitem', { name: 'AI provider' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'AI provider' })).toBeVisible()
    await expect(page.getByText('Test provider', { exact: true })).toBeVisible()
    await expect(page.getByText('-key')).toBeVisible()
    await page.getByRole('button', { name: 'Test again' }).click()
    await expect(page.getByRole('status')).toContainText('The provider answered.')
    await expectAccessible(page)

    await page.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page).toHaveURL(/\/setup\/ai-provider/)
  })

  test('spec 035: with the instance provider only, nothing to connect and an old connection removable', async ({
    page,
  }) => {
    await signIn(page, member('shared-only'))
    await passAiProviderStep(page)
    await expect(page.locator('[data-slot=app-shell]')).toBeVisible()
    // The instance as a deployer sets it with AI_PROVIDERS empty and a shared provider; the saved
    // test connection is then no longer offered.
    await page.route(/\/api\/ai-provider$/, async (route) => {
      const real = await (await route.fetch()).json()
      await route.fulfill({
        json: {
          ...real,
          offered: [],
          shared: { provider: 'vertex', model: 'shared-model', open: true },
          serving: 'shared',
        },
      })
    })
    await page.goto('/ai-provider')
    await expect(page.getByText('Provider of this instance', { exact: true })).toBeVisible()
    await expect(page.getByText('shared-model', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Connect your own provider' })).toHaveCount(0)
    await expect(
      page.getByText(/is no longer offered on this instance and is not used/),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove it' })).toBeVisible()
    await expectAccessible(page)

    await page.goto('/setup/ai-provider')
    await expect(page.getByRole('heading', { level: 1, name: 'AI provider' })).toBeVisible()
    await expect(page.getByText(/connecting your own provider is not offered/)).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.getByText('Your AI provider needs your attention.')).toHaveCount(0)
    await expectAccessible(page)
  })
})
