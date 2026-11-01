import type { Page } from '@playwright/test'
import { ADMIN, ensureHome, expect, expectAccessible, signedInPage, test } from './fixtures.ts'

const openPanel = async (page: Page) => {
  const toggle = page.getByRole('button', { name: 'Assistant', exact: true })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await page.getByRole('button', { name: 'New conversation' }).click()
}

test.describe('spec 021 — create a study', () => {
  test('frames the study, refuses an early proposal, then opens it and offers the guide', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    await openPanel(page)
    const field = page.getByRole('textbox', { name: 'Message to the assistant' })
    const say = async (text: string) => {
      await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
      await field.fill(text)
      await page.keyboard.press('Enter')
      await expect(panel.getByRole('log').getByText(text, { exact: true }).last()).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    }
    const card = panel.getByRole('region', { name: 'Create an interview study' })

    await say('help me create a study')
    await expect(panel.getByText('What must this study learn?')).toBeVisible()
    await expect(panel.getByText('Study framing', { exact: true }).first()).toBeVisible()

    // Too early: the app refuses, the person sees no card.
    await say('propose the study')
    await expect(panel.getByText('Here is the study.')).toBeVisible()
    await expect(card).toHaveCount(0)

    await say('study framing answered')
    await say('propose the study')
    await expect(card).toContainText('Learn why new users drop off.')
    await expect(card).toContainText('No project')
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/\/studies\//)
    await expect(panel.getByText('Shall we prepare its guide?')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/phase=preparation/)
    const next = panel.getByRole('region', { name: 'What next?' })
    await next.getByRole('button', { name: 'Prepare the guide' }).click()
    await expect(next.getByRole('button', { name: 'Prepare the guide' })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /Cost of this conversation: \$/ })).toBeVisible()
  })

  test("creates a study in no project from the team's Studies page", async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await page.getByRole('link', { name: 'Studies', exact: true }).first().click()
    await expect(page).toHaveURL(/\/team-studies\//)
    await page.getByRole('button', { name: 'New study' }).click()
    const name = `Team study ${Date.now()}`
    await page.getByRole('textbox', { name: 'Name' }).fill(name)
    await page.getByRole('textbox', { name: 'Research goal' }).fill('Learn why people leave.')
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Create study' }).click()
    await expect(page).toHaveURL(/\/studies\/.*from=team/)
    await page.goBack()
    await expect(page.getByRole('link', { name })).toBeVisible()
  })
})
