import type { Page } from '@playwright/test'
import { ADMIN, ensureHome, expect, expectAccessible, signedInPage, test } from './fixtures.ts'

const openPanel = async (page: Page, toggleName: string, newName: string) => {
  const toggle = page.getByRole('button', { name: toggleName, exact: true })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await page.getByRole('button', { name: newName }).click()
}

test.describe('spec 018 — create a project with the assistant', () => {
  test('frames the project, refuses an early proposal, then opens it and goes on', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    await openPanel(page, 'Assistant', 'New conversation')
    const field = page.getByRole('textbox', { name: 'Message to the assistant' })
    const say = async (text: string) => {
      await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
      await field.fill(text)
      await page.keyboard.press('Enter')
      await expect(panel.getByRole('log').getByText(text, { exact: true }).last()).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    }
    const card = panel.getByRole('region', { name: 'Create a project' })

    await say('help me create a project')
    await expect(panel.getByText('What do you want to understand, and about whom?')).toBeVisible()
    await expect(panel.getByText('Project framing', { exact: true })).toBeVisible()
    await expect(card).toHaveCount(0)
    // The progress is the bar at the top, never a card of its own.
    await expect(panel.getByText('Using the skill: Project framing')).toBeVisible()
    await expect(panel.getByText('Applied', { exact: true })).toHaveCount(0)

    // Too early: the app refuses, the person sees no card.
    await say('propose the project')
    await expect(panel.getByText('Here is the project.')).toBeVisible()
    await expect(card).toHaveCount(0)

    await say('framing answered')
    await expect(panel.getByText('May I propose the project?')).toBeVisible()
    await say('propose the project')
    await expect(card).toContainText('Research question')
    await expect(card).toContainText('None yet')
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/\/projects\//)
    await expect(page.getByRole('main').getByText('Why do new users drop off')).toBeVisible()
    // The assistant goes on by itself; the framing is over.
    await expect(panel.getByText('Shall we prepare a first study?')).toBeVisible({
      timeout: 15_000,
    })
    await expect(panel.getByText('Project framing', { exact: true })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /Cost of this conversation: \$/ })).toBeVisible()
  })

  test('composes the goal in French', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    // The language of the account wins over the browser's: set it, then give it back.
    await page.getByRole('button', { name: /Français/ }).click()
    try {
      const panel = page.getByRole('complementary', { name: 'Assistant' })
      await openPanel(page, 'Assistant', 'Nouvelle conversation')
      const field = page.getByRole('textbox', { name: "Message à l'assistant" })
      await field.fill('framing answered')
      await page.keyboard.press('Enter')
      await expect(panel.getByText('Cadrage du projet', { exact: true })).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Arrêter' })).toHaveCount(0)
      await field.fill('propose the project')
      await page.keyboard.press('Enter')
      const card = panel.getByRole('region', { name: 'Créer un projet' })
      await expect(card).toContainText('Question de recherche')
      await expect(card).toContainText('Aucune pour l’instant')
      await expectAccessible(page)
    } finally {
      // Wait for it to be saved: the next test signs in with this account.
      await Promise.all([
        page.waitForResponse((r) => r.request().method() !== 'GET' && /language/.test(r.url())),
        page.getByRole('button', { name: /English/ }).click(),
      ])
    }
  })
})
