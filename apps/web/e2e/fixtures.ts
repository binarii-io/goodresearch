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

/** A signed-in page in its own browser context. */
export const signedInPage = async (browser: Browser, email: string, locale = 'en-US') => {
  const context = await browser.newContext({ locale })
  const page = await context.newPage()
  await signIn(page, email)
  await expect(page.getByRole('navigation', { name: /Main|Principale/ })).toBeVisible()
  return page
}

/** Creates the first team when the instance is fresh, so the admin lands on the home page. */
export const ensureHome = async (page: Page) => {
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
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((animation) => animation.finished)),
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
