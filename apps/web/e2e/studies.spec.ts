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

test.describe('spec 002 — studies', () => {
  test('create an interview study, see its phases, rename and delete it', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Studies ${runId}`)

    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('radio', { name: /Survey/ })).toBeDisabled()
    await expect(dialog.getByRole('radio', { name: 'Interviews' })).toBeChecked()
    await dialog.getByLabel('Name').fill(`Interviews ${runId}`)
    await expectAccessible(page)
    await dialog.getByRole('button', { name: 'Create study' }).click()

    await expect(page.getByRole('heading', { name: '1. Preparation' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '2. Fieldwork' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '3. Analysis' })).toBeVisible()
    // The dev stack has no Google Drive client configured.
    await expect(page.getByText('Google Drive is not configured on this instance')).toBeVisible()
    await expectAccessible(page)

    await page.getByRole('button', { name: /Study name:/ }).click()
    await page.getByRole('textbox', { name: 'Study name' }).fill(`Interviews v2 ${runId}`)
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: new RegExp(`Interviews v2 ${runId}`) }),
    ).toBeVisible()

    await page.getByRole('link', { name: /Project:/ }).click()
    await expect(page.getByRole('link', { name: `Interviews v2 ${runId}` })).toBeVisible()
    await expect(page.getByText('No folder yet')).toBeVisible()

    await page.getByRole('link', { name: `Interviews v2 ${runId}` }).click()
    await page.getByRole('button', { name: 'Delete study' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: 'Studies', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: `Interviews v2 ${runId}` })).toHaveCount(0)
  })

  test('the return from the Drive consent is announced once and cleaned from the address', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Consent ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Consent study ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await expect(page.getByRole('heading', { name: '3. Analysis' })).toBeVisible()
    await page.goto(`${page.url()}?drive=connected`)
    await expect(page.getByText('Google Drive connected')).toHaveCount(1)
    await expect(page).not.toHaveURL(/drive=/)
    await page.waitForTimeout(1500)
    await expect(page.getByText('Google Drive connected')).toHaveCount(1)
  })

  test('connected sources page explains the state of Google Drive', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await page.getByRole('button', { name: 'admin', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Connected sources' }).click()
    await expect(page.getByRole('heading', { name: 'Connected sources' })).toBeVisible()
    await expect(page.getByText('Google Drive is not configured on this instance.')).toBeVisible()
    await expectAccessible(page)
  })
})
