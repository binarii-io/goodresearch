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

test.describe('spec 008 — the interviews found in the study folder', () => {
  test('proposes interviews, suggests the planned one, validates and excludes', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Fieldwork ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Fieldwork study ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await expect(page.getByRole('tab', { name: '2 · Fieldwork' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const main = page.getByRole('main')

    // The planned interview first, so the app can suggest it.
    await page.getByRole('tab', { name: '1 · Preparation' }).click()
    await main.getByRole('button', { name: 'Plan an interview' }).click()
    await page.getByRole('dialog').getByLabel('Person to interview').fill('Sam Example')
    await page.getByRole('dialog').getByLabel('Interviewer(s)').fill('Ana')
    await page.getByRole('dialog').getByRole('button', { name: 'Add to the schedule' }).click()
    await expect(main.getByRole('cell', { name: 'Sam Example', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '2 · Fieldwork' }).click()

    // The simulated Drive (dev stack): connect if needed, then attach the demo folder.
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

    // US1: one interview per transcript, with its recordings; a recording alone gets its own row
    // with a warning; meeting notes without a transcript tab are not interviews.
    const interviews = main.getByRole('region', { name: 'Interviews' })
    // The inventory runs in the worker: slower on CI.
    await expect(interviews.getByRole('row')).toHaveCount(6, { timeout: 30_000 })
    await expect(interviews.getByText('4 validated · 1 to review')).toBeVisible()
    await expect(
      interviews.getByRole('row', { name: /Extra recording/ }).getByText('No transcript'),
    ).toBeVisible()
    await expect(interviews.getByText('Team sync - Notes')).toHaveCount(0)
    await expectAccessible(page)

    // US2: the planned interview is suggested by name; confirming links it.
    await interviews
      .getByRole('button', { name: 'Confirm Sam Example for Interview Sam Example' })
      .click()
    const sam = interviews.getByRole('row', { name: /Sam Example/ })
    await expect(sam.getByRole('button', { name: 'Review Sam Example' })).toBeVisible()

    // Interviews with their transcript are validated by the app; the switch undoes and redoes it.
    const two = interviews.getByRole('switch', { name: 'Validated: Interview 2 - transcript' })
    await expect(two).toBeChecked()
    await two.click()
    await expect(interviews.getByText('3 validated · 2 to review')).toBeVisible()
    await two.click()
    await expect(interviews.getByText('4 validated · 1 to review')).toBeVisible()

    // US3: validate it, and mark the planned interview done.
    await sam.getByRole('button', { name: 'Review Sam Example' }).click()
    const dialog = page.getByRole('dialog', { name: 'Interview: Sam Example' })
    await expect(dialog.getByLabel('Name of person 1')).toHaveValue('Sam Example')
    await expect(dialog.getByRole('checkbox', { name: /Interview Sam Example\.mp4/ })).toBeChecked()
    await expectAccessible(page)
    await dialog.getByRole('button', { name: 'Validate' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Mark done' }).click()
    await expect(page.getByText('Marked done in the schedule')).toBeVisible()
    await expect(interviews.getByText('4 validated · 1 to review')).toBeVisible()

    // Exclude another one, then bring it back to review.
    await interviews.getByRole('button', { name: 'Review Camille' }).click()
    const camille = page.getByRole('dialog', { name: 'Interview: Camille' })
    await camille.getByRole('button', { name: 'Exclude' }).click()
    await camille.getByLabel('Why exclude it? (optional)').fill('A test call')
    await camille.getByRole('button', { name: 'Exclude the interview' }).click()
    await expect(interviews.getByText('3 validated · 1 to review · 1 excluded')).toBeVisible()
    await interviews.getByRole('button', { name: 'Open Camille' }).click()
    await page
      .getByRole('dialog', { name: 'Interview: Camille' })
      .getByRole('button', { name: 'Back to review' })
      .click()
    await page.keyboard.press('Escape')
    await expect(interviews.getByText('3 validated · 2 to review')).toBeVisible()

    // The schedule shows the transcript was found.
    await page.getByRole('tab', { name: '1 · Preparation' }).click()
    const row = main.getByRole('row', { name: /Sam Example/ })
    await expect(row.getByText('Transcript found')).toBeVisible()
    await expect(row.getByText('Done')).toBeVisible()
  })
})
