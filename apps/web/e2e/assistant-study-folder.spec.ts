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

test.describe('spec 022 — the folder of a study', () => {
  test('connects first, goes on by itself, then attaches and says what was found', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await page.request.delete('/api/me/sources/google-drive')
    await createProject(page, `Folder ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`With folder ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await expect(page).toHaveURL(/\/studies\//)

    const panel = page.getByRole('complementary', { name: 'Assistant' })
    const toggle = page.getByRole('button', { name: 'Assistant', exact: true })
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
    await page.getByRole('button', { name: 'New conversation' }).click()
    const field = page.getByRole('textbox', { name: 'Message to the assistant' })
    await field.fill('attach the folder')
    await page.keyboard.press('Enter')

    const connect = panel.getByRole('region', { name: 'Connect your Google Drive' })
    await expect(connect).toContainText('read-only')
    await expect(connect.getByRole('button', { name: 'Apply' })).toHaveCount(0)
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })
    await connect.getByRole('link', { name: 'Continue to Google' }).click()

    // Back on the study, the assistant goes on without a new message.
    const card = panel.getByRole('region', { name: "Add the study's folder" })
    await expect(card).toContainText('Folder', { timeout: 20_000 })
    await expect(page).toHaveURL(/\/studies\//)
    await expect(panel.getByRole('region', { name: 'Connect your Google Drive' })).toContainText(
      'Connected',
    )
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(panel.getByText(/The folder is attached: \d+ transcripts/)).toBeVisible({
      timeout: 70_000,
    })
    // No guide yet: Preparation stays open, and the assistant offers what is left.
    await expect(page).toHaveURL(/phase=preparation/)
    const list = panel.getByRole('region', { name: 'What is left to prepare?' })
    await expectAccessible(page)
    const send = list.getByRole('button', { name: 'Send my choices' })
    await expect(send).toBeDisabled()
    await list.getByRole('checkbox', { name: 'Write the guide' }).click()
    await list.getByRole('checkbox', { name: 'Plan the interviews' }).click()
    await send.click()
    await expect(
      panel.getByRole('log').getByText('Write the guide; Plan the interviews', { exact: true }),
    ).toBeVisible()
    await expect(list.getByRole('button', { name: 'Send my choices' })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /Cost of this conversation: \$/ })).toBeVisible()
  })
})
