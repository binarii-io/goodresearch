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

    // Spec 003: the phases are tabs; the study opens on Fieldwork (spec 008).
    await expect(page.getByRole('tab', { name: '1 · Preparation' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '2 · Fieldwork' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '2 · Fieldwork' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // The dev stack simulates Google Drive (DRIVE_FAKE): connect it, or attach a folder once connected.
    await expect(
      page
        .getByRole('heading', { name: 'Connect your Google Drive' })
        .or(page.getByLabel('Link of the Drive folder')),
    ).toBeVisible()
    await expectAccessible(page)

    await page.getByRole('button', { name: /Study name:/ }).click()
    await page.getByRole('textbox', { name: 'Study name' }).fill(`Interviews v2 ${runId}`)
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: new RegExp(`Interviews v2 ${runId}`) }),
    ).toBeVisible()

    await page.getByRole('link', { name: `Studies ${runId}` }).click()
    await expect(page.getByRole('link', { name: `Interviews v2 ${runId}` })).toBeVisible()
    await expect(page.getByText('No folder yet')).toBeVisible()

    await page.getByRole('link', { name: `Interviews v2 ${runId}` }).click()
    // Spec 003: page-level deletion sits in a disclosure at the bottom, as in the prototype.
    await page.locator('summary', { hasText: 'Delete this study' }).click()
    await page.getByRole('button', { name: 'Delete study' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: /^Studies/ })).toBeVisible()
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
    await expect(page.getByRole('tab', { name: '6 · Analysis' })).toBeVisible()
    const consent = new URL(page.url())
    consent.searchParams.set('drive', 'connected')
    await page.goto(consent.toString())
    await expect(page.getByText('Google Drive connected')).toHaveCount(1)
    await expect(page).not.toHaveURL(/drive=/)
    await page.waitForTimeout(1500)
    await expect(page.getByText('Google Drive connected')).toHaveCount(1)
  })

  test('the chosen phase is kept in the address and the tabs work with the keyboard', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Phases ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Phases study ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await page.getByRole('tab', { name: '1 · Preparation' }).click()
    await expect(page).toHaveURL(/phase=preparation/)
    await page.reload()
    await expect(page.getByRole('tab', { name: '1 · Preparation' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.getByRole('tab', { name: '1 · Preparation' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: '2 · Fieldwork' })).toBeFocused()
    await expectAccessible(page)
  })

  test('connected sources page explains the state of Google Drive', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await page.getByRole('button', { name: /^admin / }).click()
    await page.getByRole('menuitem', { name: 'Connected sources' }).click()
    await expect(page.getByRole('heading', { name: 'Connected sources' })).toBeVisible()
    // The shared admin account may be connected, not yet, or hold a permission from an earlier run.
    await expect(
      page.getByText(/^Not connected|^Connected as|^The permission no longer works/),
    ).toBeVisible()
    await expectAccessible(page)
  })
})
