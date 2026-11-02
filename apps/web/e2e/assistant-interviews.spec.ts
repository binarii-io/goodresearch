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

test.describe('spec 025 — interviews with the assistant', () => {
  test('counts, lists with a filter after consent, and starts the analysis from a card', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Interviews ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`To analyse ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await expect(page).toHaveURL(/\/studies\//)

    const panel = page.getByRole('complementary', { name: 'Assistant' })
    const toggle = page.getByRole('button', { name: 'Assistant', exact: true })
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
    await page.getByRole('button', { name: 'New conversation' }).click()
    const field = page.getByRole('textbox', { name: 'Message to the assistant' })
    const say = async (text: string) => {
      await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
      await field.fill(text)
      await page.keyboard.press('Enter')
      await expect(panel.getByRole('log').getByText(text, { exact: true }).last()).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    }

    await say('attach the folder')
    const connect = panel.getByRole('region', { name: 'Connect your Google Drive' })
    if (await connect.count()) {
      await connect.getByRole('link', { name: 'Continue to Google' }).click()
      await expect(page).toHaveURL(/\/studies\//)
    }
    const folder = panel.getByRole('region', { name: "Add the study's folder" })
    await folder.getByRole('button', { name: 'Apply' }).click({ timeout: 20_000 })
    await expect(panel.getByText(/The folder is attached/)).toBeVisible({ timeout: 70_000 })

    await say('what is left to do?')
    await expect(panel.getByText('Counted the interviews')).toBeVisible()
    await expect(panel.getByText(/Where they stand: .*"not-analysed":/)).toBeVisible()

    await say('which ones have no video?')
    const consent = panel.getByRole('region', { name: 'Let the assistant see the folder' })
    await consent.getByRole('button', { name: 'Apply' }).click()
    await expect(panel.getByText(/\d+ interviews match\./)).toBeVisible({ timeout: 15_000 })
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)

    await say('analyse the rest')
    const card = panel.getByRole('region', { name: 'Analyse the interviews' })
    await expect(card).toContainText('interviews to analyse')
    await expectAccessible(page)
    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(panel.getByText('The analysis is over.')).toBeVisible({ timeout: 90_000 })
    await expect(panel.getByRole('button', { name: /Cost of this conversation: \$/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)

    // Only what is ticked is accepted, and doubtful lines start unticked.
    await say('accept the suggestions')
    const accepting = panel.getByRole('region', { name: 'Accept suggestions' })
    await expect(accepting).toContainText('stays to decide')
    await expectAccessible(page)
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    await accepting.getByRole('button', { name: 'Apply' }).click()
    await expect(panel.getByText('The card is applied.')).toBeVisible({ timeout: 20_000 })
    await expect(accepting.getByText('Done').first()).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)

    await say('validate them')
    const validating = panel.getByRole('region', { name: 'Validate interviews' })
    await expect(validating.getByRole('checkbox').first()).toBeVisible()
    await validating.getByRole('button', { name: 'Apply' }).click()
    await expect(validating.getByRole('status')).toContainText('Applied')

    // The tab says what is missing, in its own way.
    await expect(
      page
        .getByRole('main')
        .getByRole('img', { name: /No (transcript|recording)/ })
        .first(),
    ).toBeVisible()
  })
})
