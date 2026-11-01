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

test.describe('spec 023 — publish the preparation', () => {
  test('offers it after the guide, says the next step, and creates the documents on Apply', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Publish ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`To publish ${runId}`)
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

    await say('what is the next step?')
    await expect(panel.getByText('Next: write its interview guide.')).toBeVisible()

    await say('design the interview guide')
    await expect(panel.getByText('What are the main research themes?')).toBeVisible()
    await say('write the guide')
    const guide = panel.getByRole('region', { name: 'Interview guide' })
    await guide.getByRole('button', { name: 'Apply' }).click()
    // The assistant goes on by itself: the folder is not there yet, the fake only offers.
    await expect(panel.getByText('The guide is saved.')).toBeVisible({ timeout: 15_000 })
    await expect(panel.getByRole('region', { name: 'What comes next?' })).toBeVisible()
    const finished = panel.getByRole('status').filter({ hasText: 'Interview guide finished' })
    await expect(finished).toBeVisible()
    await panel.getByRole('button', { name: 'Close this message' }).click()
    await expect(finished).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)

    await say('what is the next step?')
    await expect(panel.getByText('Next: add the folder holding its interviews.')).toBeVisible()

    // No folder: refused, no card.
    await say('publish them')
    await expect(panel.getByRole('region', { name: 'Publish to Drive' })).toHaveCount(0)

    await say('attach the folder')
    const connect = panel.getByRole('region', { name: 'Connect your Google Drive' })
    if (await connect.count()) {
      await connect.getByRole('link', { name: 'Continue to Google' }).click()
      await expect(page).toHaveURL(/\/studies\//)
    }
    const folder = panel.getByRole('region', { name: "Add the study's folder" })
    await folder.getByRole('button', { name: 'Apply' }).click({ timeout: 20_000 })
    await expect(panel.getByText(/The folder is attached/)).toBeVisible({ timeout: 70_000 })
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)

    await say('publish them')
    const card = panel.getByRole('region', { name: 'Publish to Drive' })
    await expect(
      card.or(panel.getByRole('region', { name: 'Connect your Google Drive' })).first(),
    ).toBeVisible()
    const editing = panel.getByRole('region', { name: 'Connect your Google Drive' }).last()
    if ((await card.count()) === 0) {
      await editing.getByRole('link', { name: 'Continue to Google' }).click()
      await expect(card).toBeVisible({ timeout: 20_000 })
    }
    await expect(card).toContainText('Interview best practices')
    await expectAccessible(page)
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(panel.getByText('The documents are in the folder.')).toBeVisible({
      timeout: 15_000,
    })
    await expect(card.getByRole('link', { name: 'Interview guide' })).toBeVisible()
    await expect(panel.getByRole('button', { name: /Cost of this conversation: \$/ })).toBeVisible()

    await say('what is the next step?')
    await expect(panel.getByText('Next: plan the interviews.')).toBeVisible()
  })
})
