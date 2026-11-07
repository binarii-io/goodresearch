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

test.describe('spec 037 - usability test fieldwork', () => {
  test('lists one session per video, with its length and protocol version, and tells which are ready', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Usability fieldwork ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Usability sessions ${runId}`)
    await dialog.getByRole('radio', { name: 'Usability test' }).click()
    await dialog.getByRole('button', { name: 'Create study' }).click()
    const main = page.getByRole('main')

    // A protocol first: the sessions are judged against one of its versions.
    await main.getByRole('button', { name: 'Write it myself' }).click()
    const form = main.getByRole('form', { name: 'Edit the test protocol' })
    await form.getByLabel('Link', { exact: true }).fill('https://prototype.example.org/start')
    await form.getByLabel('Task 1: instruction read aloud').fill('Find the report of last week')
    await form.getByLabel('Success criterion (for the facilitator)').fill('The report is open')
    await form.getByRole('button', { name: 'Save the protocol' }).click()
    await expect(main.getByText(/Version 1 · edited by hand/)).toBeVisible()

    // The simulated Drive (dev stack): connect if needed, then attach the demo folder.
    await page.getByRole('tab', { name: '2 · Fieldwork' }).click()
    const connect = page
      .getByRole('link', { name: 'Continue to Google' })
      .or(page.getByRole('button', { name: 'Continue to Google' }))
    const folderLink = page.getByLabel('Link of the Drive folder')
    await expect(connect.or(folderLink).first()).toBeVisible()
    if (await connect.isVisible()) {
      await connect.click()
      await page.getByRole('tab', { name: '2 · Fieldwork' }).click()
    }
    await folderLink.fill('https://drive.google.com/drive/folders/dev-study-folder')
    await page.getByRole('button', { name: 'Attach folder' }).click()

    // US1: the demo folder holds two videos: two sessions; transcripts without video are listed.
    const sessions = main.getByRole('region', { name: 'Test sessions' })
    await expect(sessions.getByRole('row')).toHaveCount(3, { timeout: 30_000 })
    const sam = sessions.getByRole('row', { name: /Interview Sam Example/ })
    await expect(sam.getByText(/31 min/)).toBeVisible()
    await expect(sam.getByText('Protocol v1')).toBeVisible()
    await expect(
      sessions.getByRole('row', { name: /Extra recording/ }).getByText(/length unknown/),
    ).toBeVisible()
    // No schedule on a usability test.
    await expect(sessions.getByRole('columnheader', { name: 'Planned interview' })).toHaveCount(0)
    await expectAccessible(page)

    await sessions.getByRole('tab', { name: /Transcripts without video/ }).click()
    await expect(sessions.getByText('Interview 2 - transcript.txt')).toBeVisible()
    await sessions.getByRole('tab', { name: /^Sessions/ }).click()

    // US2: the participant entered by hand, the protocol version chosen.
    await sam.getByRole('button', { name: /Review Interview Sam Example/ }).click()
    const session = page.getByRole('dialog', { name: /Test session/ })
    await session.getByRole('tab', { name: 'Session' }).click()
    await session.getByRole('button', { name: 'Add a person' }).click()
    await session.getByLabel('Name of person 1').fill('Sam Example')
    await expect(session.getByLabel('Role of person 1')).toContainText('Participant')
    await expectAccessible(page)
    await session.getByRole('button', { name: 'Save' }).click()
    await page.keyboard.press('Escape')
    await expect(session).toBeHidden()

    // Nobody found in the files: the participant typed on "To decide" gives the name at once,
    // from the app's rules (no transcript, no AI).
    await sessions.getByRole('button', { name: /Review Extra recording/ }).click()
    const extra = page.getByRole('dialog', { name: /Test session/ })
    await extra.getByLabel('Participant', { exact: true }).fill('Lee Sample')
    await extra.getByRole('button', { name: 'Save and propose the name' }).click()
    await expect(extra.getByText(/2026-10-28 – Lee Sample/).first()).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(extra).toBeHidden()

    // US3: validated with its participant, video length and protocol: ready for analysis.
    await sessions.getByRole('switch', { name: 'Validated: Interview Sam Example' }).click()
    await expect(sam.getByText('Ready for analysis')).toBeVisible()
    await expect(
      sessions.getByRole('row', { name: /Extra recording/ }).getByText('To validate'),
    ).toBeVisible()

    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
  })
})
