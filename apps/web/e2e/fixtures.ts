import AxeBuilder from '@axe-core/playwright'
import { type Browser, test as base, expect, type Page } from '@playwright/test'

/** Unique per run: the dev stack keeps its data between runs. */
export const runId = Date.now().toString(36)
export const ADMIN = 'admin@example.org'
export const member = (name: string) => `${name}-${runId}@example.com`

/** Signs in through the test identity provider's login form (email typed as claims). */
export const signIn = async (page: Page, email: string, claims: Record<string, unknown> = {}) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: /Test provider/ }).click()
  await page.locator('input[name=username]').fill(email)
  await page.locator('textarea[name=claims]').fill(JSON.stringify({ email, ...claims }))
  await page.locator('input[type=submit]').click()
}

/** Spec 004: a new account first chooses an AI provider; the dev stack's test provider is used. */
export const passAiProviderStep = async (page: Page) => {
  const step = page.getByRole('heading', {
    level: 1,
    name: /Choose your AI provider|Choisissez votre fournisseur IA/,
  })
  // The shell, visible at any width (on a phone the navigation sits in the drawer).
  const app = page.locator('[data-slot=app-shell]')
  await expect(step.or(app)).toBeVisible()
  if (!(await step.isVisible())) return
  await page.getByRole('radio', { name: /Test provider/ }).click()
  await page.getByRole('textbox', { name: /API key|Clé d'API/ }).fill('test-ok-e2e-key')
  await page.getByRole('button', { name: /Check and save|Vérifier et enregistrer/ }).click()
}

/** A signed-in page in its own browser context. */
export const signedInPage = async (browser: Browser, email: string, locale = 'en-US') => {
  const context = await browser.newContext({ locale })
  const page = await context.newPage()
  await signIn(page, email)
  await passAiProviderStep(page)
  await expect(page.getByRole('navigation', { name: /Main|Principale/ })).toBeVisible()
  return page
}

/** Creates the first team when the instance is fresh, so the admin lands on the home page. */
export const ensureHome = async (page: Page) => {
  await passAiProviderStep(page)
  const welcome = page.getByRole('heading', { level: 1, name: 'Welcome to goodresearch' })
  const home = page.getByRole('heading', { level: 1, name: 'Projects' })
  await expect(welcome.or(home)).toBeVisible()
  if (await welcome.isVisible()) {
    await page.getByRole('textbox', { name: 'Team name' }).fill(`Research ${runId}`)
    await page.getByRole('button', { name: 'Create team' }).click()
  }
  await expect(home).toBeVisible()
}

/** Creates a project from the home page, choosing the first team when none is preselected. */
export const createProject = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  const team = dialog.getByRole('combobox', { name: 'Team' })
  if ((await team.textContent())?.includes('Choose a team')) {
    await team.click()
    await page.getByRole('option').first().click()
  }
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('button', { name: /Project name:/ })).toBeVisible()
}

/** WCAG 2.2 AA: no serious or critical violation (SC-007). */
export const expectAccessible = async (page: Page) => {
  // Mid-animation colours are not what people read: let transitions (dialogs, toasts) finish first.
  // A theme switch can leave transitions that never settle: wait at most a second for them.
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(document.getAnimations().map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

export const test = base
export { expect }

/**
 * "Accept all" on the open interview, then closes it: the window stays open until the files are
 * renamed, or until it asks for the editing consent (without that access yet).
 */
export const acceptAllAndClose = async (page: Page) => {
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('region', { name: 'Analysis' })
    .getByRole('button', { name: 'Accept all' })
    .click()
  const renaming = page.getByRole('dialog', { name: 'Rename the files in Drive' })
  const named = dialog.getByText('Files named in Drive')
  await expect(renaming.or(named).first()).toBeVisible({ timeout: 30_000 })
  if (await renaming.isVisible()) await renaming.getByRole('button', { name: 'Cancel' }).click()
  await expect(async () => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 500 })
  }).toPass({ timeout: 15_000 })
}
