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

test.describe('spec 038 - usability test analysis', () => {
  test('analyses a ready session, reviews its observations by task and shows the results', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Usability analysis ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Usability analysis ${runId}`)
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

    // US2: tasks with their outcome in words, observations with their checks.
    await review.click()
    await expect(main.getByRole('navigation', { name: 'Tasks of the session' })).toBeVisible()
    await expect(main.getByText('Looks for the export in the menu first.')).toBeVisible()
    await expect(main.getByText('Praises the product.')).toHaveCount(0)
    await expectAccessible(page)
    await main.getByRole('button', { name: 'Accept' }).first().click()
    await main.getByRole('button', { name: 'Confirm the outcome' }).first().click()
    await main.getByRole('tab', { name: 'Transcript' }).click()
    await expect(
      main.getByRole('tabpanel', { name: 'Transcript' }).getByText(/where's the export/),
    ).toBeVisible()

    // US3: the results count what was decided.
    await page.getByRole('link', { name: 'Back to the analysis' }).click()
    await main.getByRole('tab', { name: 'Results by task' }).click()
    await expect(main.getByText(/Counts what you decided/)).toBeVisible()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
  })
})
