import { ADMIN, ensureHome, expect, expectAccessible, signedInPage, test } from './fixtures.ts'

test.describe('US5 — language and keyboard', () => {
  test('a French browser gets French, and the choice can be switched without reload', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'fr-FR' })
    const page = await context.newPage()
    await page.goto('/sign-in')
    await expect(
      page.getByRole('button', { name: 'Se connecter avec Test provider' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expectAccessible(page)
    await page.getByRole('combobox', { name: 'Langue' }).click()
    await page.getByRole('option', { name: 'English' }).click()
    await expect(page.getByRole('button', { name: 'Sign in with Test provider' })).toBeVisible()
  })

  test('the sign-in flow and project creation work with the keyboard only', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.getByRole('button', { name: 'New project' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New project' })).toBeFocused()
  })
})
