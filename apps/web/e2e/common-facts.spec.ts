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

test.describe('spec 039 - one fact lifecycle for every type of study', () => {
  test('a usability study gives facts to decide, read by insights and decided like any fact', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Common facts ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Common facts study ${runId}`)
    await dialog.getByRole('radio', { name: 'Usability test' }).click()
    await dialog.getByRole('button', { name: 'Create study' }).click()
    const main = page.getByRole('main')

    // A protocol of two tasks.
    await main.getByRole('button', { name: 'Write it myself' }).click()
    const form = main.getByRole('form', { name: 'Edit the test protocol' })
    await form.getByLabel('Link', { exact: true }).fill('https://prototype.example.org/start')
    await form.getByLabel('Task 1: instruction read aloud').fill('Find the report of last week')
    await form.getByLabel('Success criterion (for the facilitator)').fill('The report is open')
    await form.getByRole('button', { name: 'Save the protocol' }).click()
    await expect(main.getByText(/Version 1 · edited by hand/)).toBeVisible()

    // Fieldwork: the demo folder's video with its length becomes a ready session.
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
    const sessions = main.getByRole('region', { name: 'Test sessions' })
    await expect(sessions.getByRole('row')).toHaveCount(3, { timeout: 30_000 })
    await sessions.getByRole('button', { name: /Review Interview Sam Example/ }).click()
    const one = page.getByRole('dialog', { name: /Test session/ })
    await one.getByLabel('Participant', { exact: true }).fill('Sam Example')
    await one.getByRole('button', { name: 'Save and propose the name' }).click()
    await expect(one.getByRole('button', { name: 'Save and propose the name' })).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(one).toBeHidden()
    // The list shows the session as it now is before it is validated (its version moved).
    await expect(
      sessions
        .getByRole('row', { name: /Interview Sam Example/ })
        .getByText('Sam Example', { exact: true }),
    ).toBeVisible()
    await sessions.getByRole('switch', { name: 'Validated: Interview Sam Example' }).click()
    await expect(
      sessions.getByRole('row', { name: /Interview Sam Example/ }).getByText('Ready for analysis'),
    ).toBeVisible()

    // US1: the estimate first, then the run in the worker.
    await page.getByRole('tab', { name: '3 · Analysis' }).click()
    await expect(main.getByRole('tab', { name: /^Sessions \(/ })).toBeVisible()
    await expectAccessible(page)
    await main.getByRole('button', { name: 'Analyse sessions' }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask.getByText(/will be analysed/)).toBeVisible()
    await ask
      .getByRole('button', { name: /analyse/i })
      .last()
      .click()
    const review = main.getByRole('button', { name: /Explore Interview Sam Example/ })
    await expect(review).toBeVisible({ timeout: 90_000 })

    const studyUrl = page.url()
    // US4: the project's insight dialog with facts to decide only: the study is chosen, they are read.
    await page
      .getByRole('link', { name: `Common facts ${runId}`, exact: true })
      .first()
      .click()
    await main.getByRole('tab', { name: 'Insights' }).click()
    await main.getByRole('button', { name: 'Find insights' }).click()
    const insights = page.getByRole('alertdialog', { name: 'Find insights?' })
    const study = insights.getByRole('checkbox', { name: /0 accepted facts, \d+ to decide/ })
    await expect(study).toBeEnabled()
    await expect(study).toBeChecked()
    await expect(
      insights.getByRole('checkbox', { name: /Also read the facts still to decide/ }),
    ).toBeChecked()
    await expect(insights.getByText(/None of these studies has accepted facts yet/)).toBeVisible()
    await expectAccessible(page)
    await insights.getByRole('button', { name: 'Cancel' }).click()

    // US1: the study's Facts list, the same decisions as every fact, reopen included.
    await page.goto(studyUrl)
    await page.getByRole('tab', { name: '3 · Analysis' }).click()
    await main.getByRole('tab', { name: /^Facts \(/ }).click()
    const facts = main.getByRole('tabpanel', { name: /^Facts/ })
    const first = facts.getByRole('article').first()
    await expect(first.getByText('To decide')).toBeVisible()
    await first.getByRole('button', { name: 'Accept' }).click()
    await facts.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: /^Accepted/ }).click()
    const accepted = facts.getByRole('article').first()
    await expect(accepted.getByRole('button', { name: 'Accepted', pressed: true })).toBeVisible()
    await accepted.getByRole('button', { name: 'Reopen' }).click()
    await expect(facts.getByText('No fact here.')).toBeVisible()
    await facts.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: /^To decide/ }).click()
    await facts.getByRole('button', { name: /Accept all shown/ }).click()
    await expect(facts.getByText('No fact to decide.')).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
  })
})
