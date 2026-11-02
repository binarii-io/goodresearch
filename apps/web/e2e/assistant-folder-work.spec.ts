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

test.describe('spec 024 — work in the study folder', () => {
  test('asks for consent, sees and reads, then applies only the ticked lines', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Tidy ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`To tidy ${runId}`)
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

    // A folder first, whatever the state of this account's Drive connection.
    await say('attach the folder')
    const connect = panel.getByRole('region', { name: 'Connect your Google Drive' })
    if (await connect.count()) {
      await connect.getByRole('link', { name: 'Continue to Google' }).click()
      await expect(page).toHaveURL(/\/studies\//)
    }
    const folder = panel.getByRole('region', { name: "Add the study's folder" })
    await folder.getByRole('button', { name: 'Apply' }).click({ timeout: 20_000 })
    await expect(panel.getByText(/The folder is attached/)).toBeVisible({ timeout: 70_000 })

    await say('what is in the folder?')
    const consent = panel.getByRole('region', { name: 'Let the assistant see the folder' })
    await expect(consent).toContainText('names of the people interviewed')
    await expect(panel.getByText(/The folder holds/)).toHaveCount(0)
    await consent.getByRole('button', { name: 'Apply' }).click()
    await expect(panel.getByText(/The folder holds: .*Week 1/)).toBeVisible({ timeout: 15_000 })
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)

    await say('read the transcript')
    await expect(panel.getByText('Read an extract of: Interview Sam Example.txt')).toBeVisible()
    // In the order things happen: the tools used, then the answer.
    const tools = await panel
      .getByText('Read an extract of: Interview Sam Example.txt')
      .boundingBox()
    const answer = await panel.getByText('I read the transcript.').boundingBox()
    expect(tools?.y ?? Infinity).toBeLessThan(answer?.y ?? 0)

    await say('tidy the folder')
    const editing = panel.getByRole('region', { name: 'Connect your Google Drive' }).last()
    const card = panel.getByRole('region', { name: 'Changes in the folder' })
    await expect(card.or(editing).first()).toBeVisible()
    if ((await card.count()) === 0) {
      await editing.getByRole('link', { name: 'Continue to Google' }).click()
      await expect(card).toBeVisible({ timeout: 20_000 })
    }
    await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0)
    await expect(card).toContainText('To sort / Extra recording.mp4')
    await expect(card).toContainText('Team sync notes')
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // Unticking the new folder takes the move with it.
    const boxes = card.getByRole('checkbox')
    await boxes.first().click()
    await expect(boxes.nth(1)).toBeDisabled()
    await boxes.first().click()
    await boxes.nth(2).click()
    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(card.getByText('Left out')).toBeVisible()
    await expect(card.getByText('Done')).toHaveCount(2)
    await expect(panel.getByText('The folder is tidied.')).toBeVisible({ timeout: 70_000 })
    await expect(panel.getByRole('button', { name: /Cost of this conversation: \$/ })).toBeVisible()
  })
})
