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

test.describe('spec 020 — delete a project', () => {
  test('asks for the exact name, then deletes the project and keeps its study', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const project = `To delete ${runId}`
    const study = `Kept study ${runId}`
    await createProject(page, project)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(study)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await expect(page).toHaveURL(/\/studies\//)
    await page.goBack()
    await page.getByRole('main').getByRole('link', { name: study }).waitFor()

    await page.getByText('Delete this project', { exact: true }).first().click()
    await page.getByRole('button', { name: 'Delete the project' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('1 will be in no project')
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })
    const confirm = dialog.getByRole('button', { name: 'Delete for good' })
    const field = dialog.getByLabel(/Type the project's name/)
    await field.fill(project.toUpperCase())
    await expect(confirm).toBeDisabled()
    await field.fill(project)
    await confirm.click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: project })).toHaveCount(0)
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Studies' })
      .click()
    await page.getByLabel('Search by name').fill(study)
    const row = page.getByRole('list', { name: 'Studies of the team' }).getByRole('listitem')
    await expect(row.getByRole('button', { name: /Attach to a project/ })).toBeVisible()
  })

  test('the assistant only shows a card, which needs the name', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const project = `Card delete ${runId}`
    await createProject(page, project)
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    const toggle = page.getByRole('button', { name: 'Assistant', exact: true })
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
    await panel.getByRole('button', { name: 'New conversation' }).click()
    await expect(panel.getByText(`Looking at: project ${project}`)).toBeVisible()
    await page
      .getByRole('textbox', { name: 'Message to the assistant' })
      .fill('delete this project')
    await page.keyboard.press('Enter')
    const card = panel.getByRole('region', { name: 'Delete this project' })
    const confirm = card.getByRole('button', { name: 'Delete for good' })
    await expect(confirm).toBeDisabled()
    await expectAccessible(page)
    await expect(page).toHaveURL(/\/projects\//)
    await card.getByLabel(/Type the project's name/).fill(project)
    await confirm.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('main').getByRole('link', { name: project })).toHaveCount(0)
    await expect(panel).toBeVisible()
  })
})
