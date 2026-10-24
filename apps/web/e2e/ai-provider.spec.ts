import { expect, expectAccessible, member, signIn, test } from './fixtures.ts'

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
})
