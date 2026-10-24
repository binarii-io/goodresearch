import { ADMIN, ensureHome, expect, expectAccessible, member, signIn, test } from './fixtures.ts'

test.describe('US1 — sign in as admin', () => {
  test('sign-in screen offers only the configured provider and is accessible', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('button', { name: 'Sign in with Test provider' })).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expectAccessible(page)
  })

  test('the initial admin signs in, gets a first team, and signs out', async ({ page }) => {
    await signIn(page, ADMIN)
    await ensureHome(page)
    await expectAccessible(page)
    await page.getByRole('button', { name: /^admin / }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await page.goto('/teams')
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('a non-allowed email gets a generic refusal', async ({ page }) => {
    await signIn(page, `kim-${Date.now()}@not-allowed.example`)
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.getByRole('alert')).toHaveText(/Sign-in did not work/)
  })

  test('protected pages redirect to sign-in, then back', async ({ page }) => {
    await page.goto('/teams')
    await expect(page).toHaveURL(/\/sign-in\?redirect=/)
    await page.getByRole('button', { name: /Test provider/ }).click()
    await page.locator('input[name=username]').fill(member('back'))
    await page.locator('textarea[name=claims]').fill(JSON.stringify({ email: member('back') }))
    await page.locator('input[type=submit]').click()
    await expect(page).toHaveURL(/\/teams$/)
  })
})
