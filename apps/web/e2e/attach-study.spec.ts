import type { Page } from '@playwright/test'
import {
  ADMIN,
  createProject,
  ensureHome,
  expect,
  expectAccessible,
  runId,
  signedInPage,
  test,
} from './fixtures.ts'

const createStudy = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'New study' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(name)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Create/ })
    .click()
  await expect(page).toHaveURL(/\/studies\//)
}

test.describe('spec 019 — a study in several projects, or none', () => {
  test('attaches, shows the sharing, detaches down to no project, and attaches again', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const study = `Reusable ${runId}`
    await createProject(page, `First ${runId}`)
    await createStudy(page, study)
    // A copy of the project's goal, editable, on the study's page.
    await expect(page.getByRole('region', { name: 'About this study' })).toBeVisible()

    await page.goto('/')
    await createProject(page, `Second ${runId}`)
    await page.getByRole('button', { name: 'Attach an existing study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Search by name').fill(study)
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })
    await dialog.getByRole('button', { name: `Attach ${study}` }).click()
    await expect(dialog).toBeHidden()

    const studies = page.getByRole('list', { name: 'Studies', exact: true })
    await expect(studies.getByRole('link', { name: study })).toBeVisible()
    await expect(studies).toContainText(`Also in First ${runId}`)
    const second = page.url()

    // The page names the projects it feeds; back follows where it was opened from.
    await studies.getByRole('link', { name: study }).click()
    const about = page.getByRole('region', { name: 'About this study' })
    await expect(about.getByRole('link', { name: `First ${runId}` })).toBeVisible()
    await page.getByRole('tab', { name: '6 · Analysis' }).click()
    await expect(page.getByText(/decisions on its facts apply in all of them/)).toBeVisible()
    await page.goto(second)

    await studies.getByRole('button', { name: `Detach ${study}` }).click()
    await expect(page.getByRole('alertdialog')).toContainText(`It stays in First ${runId}`)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Detach' }).click()
    await expect(page.getByRole('main').getByRole('link', { name: study })).toHaveCount(0)

    // From the first project: now its only one.
    await page.goto('/')
    await page
      .getByRole('link', { name: `First ${runId}` })
      .first()
      .click()
    await studies.getByRole('button', { name: `Detach ${study}` }).click()
    await expect(page.getByRole('alertdialog')).toContainText("stays on the team's Studies page")
    await page.getByRole('alertdialog').getByRole('button', { name: 'Detach' }).click()
    await expect(page.getByRole('main').getByRole('link', { name: study })).toHaveCount(0)

    // The team's page keeps it, and it can go back into a project.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Studies' })
      .click()
    await expect(page.getByRole('heading', { name: 'Studies of the team' })).toBeVisible()
    await page.getByLabel('Search by name').fill(study)
    const row = page.getByRole('list', { name: 'Studies of the team' }).getByRole('listitem')
    await expect(row.getByRole('button', { name: /Attach to a project/ })).toBeVisible()
    await expectAccessible(page)
    await row.getByRole('button', { name: /Attach to a project/ }).click()
    await page.getByRole('button', { name: `Attach to Second ${runId}` }).click()
    await expect(row).toContainText('1 project')
    await expect(row.getByRole('button', { name: /Attach to a project/ })).toHaveCount(0)

    // A study without a project opens normally: checked before it went back above by its link.
    await row.getByRole('link', { name: study }).click()
    await expect(page.getByRole('tab', { name: '1 · Preparation' })).toBeVisible()
    // Opened from the team's page, "back" and the breadcrumb lead back there, not to a project.
    await page.getByRole('main').getByRole('link', { name: "Back to the team's studies" }).click()
    await expect(page.getByRole('heading', { name: 'Studies of the team' })).toBeVisible()
  })

  test('the assistant proposes reusing a study, and nothing changes before Apply', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const study = `Assistant study ${runId}`
    await createProject(page, `Older ${runId}`)
    await createStudy(page, study)
    await page.goto('/')
    await createProject(page, `Newer ${runId}`)
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    const toggle = page.getByRole('button', { name: 'Assistant', exact: true })
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
    await panel.getByRole('button', { name: 'New conversation' }).click()
    await expect(panel.getByText(`Looking at: project Newer ${runId}`)).toBeVisible()
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('attach the study')
    await page.keyboard.press('Enter')
    const card = panel.getByRole('region', { name: 'Reuse a study in this project' })
    await expect(card).toContainText('Decisions on them apply in every project')
    await expectAccessible(page)
    const main = page.getByRole('list', { name: 'Studies', exact: true })
    await expect(main.getByRole('listitem')).toHaveCount(0)
    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(card.getByRole('status')).toContainText('Applied')
    await expect(main.getByRole('listitem').first()).toBeVisible()
  })
})
