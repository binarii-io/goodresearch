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

test.describe('spec 007 — publishing the preparation to Drive', () => {
  test('publishes, brings a Drive edit back for review, and updates the Drive copy', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Publishing ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Drive study ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await expect(page.getByRole('tab', { name: '2 · Fieldwork' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // The simulated Drive (dev stack): consent comes straight back, then the demo folder.
    const connect = page
      .getByRole('link', { name: 'Continue to Google' })
      .or(page.getByRole('button', { name: 'Continue to Google' }))
    const folderLink = page.getByLabel('Link of the Drive folder')
    // Not connected yet (fresh stack) or connected in an earlier run: wait for either.
    await expect(connect.or(folderLink).first()).toBeVisible()
    if (await connect.isVisible()) await connect.click()
    await folderLink.fill('https://drive.google.com/drive/folders/dev-study-folder')
    await page.getByRole('button', { name: 'Attach folder' }).click()
    await expect(
      page.getByRole('button', { name: 'Study folder: Demo study folder. Change it' }),
    ).toBeVisible()

    // A guide written by hand and one planned interview.
    await page.getByRole('tab', { name: '1 · Preparation' }).click()
    const main = page.getByRole('main')
    await main.getByRole('button', { name: 'Write it myself' }).click()
    const form = main.getByRole('form', { name: 'Edit the interview guide' })
    await form.getByRole('button', { name: 'Add a question' }).nth(2).click()
    await form.getByLabel('Question 1', { exact: true }).fill('Tell me about last week.')
    await form.getByRole('button', { name: 'Save the guide' }).click()
    await expect(main.getByText('Tell me about last week.')).toBeVisible()
    await main.getByRole('button', { name: 'Plan an interview' }).click()
    await page.getByRole('dialog').getByLabel('Person to interview').fill('Sam Example')
    await page.getByRole('dialog').getByRole('button', { name: 'Add to the schedule' }).click()
    await expect(main.getByRole('cell', { name: 'Sam Example', exact: true })).toBeVisible()

    // US1: each element has its Drive button among its actions; the first publication asks for
    // the editing consent. Once published, its state shows under it.
    const guideRow = main.getByRole('region', { name: /^Interview guide/ })
    const practicesRow = main.getByRole('region', { name: 'Interview best practices' })
    const scheduleRow = main.getByRole('region', { name: /^Interview schedule/ })
    const guide = main.getByRole('group', { name: 'Interview guide in Drive' })
    const practices = main.getByRole('group', { name: 'Interview best practices in Drive' })
    const schedule = main.getByRole('group', { name: 'Interview schedule in Drive' })
    // The shared admin may have granted it in an earlier run: then it publishes at once.
    const sources = (await (await page.request.get('/api/me/sources')).json()) as {
      canWrite: boolean
    }[]
    await guideRow.getByRole('button', { name: 'Publish to Drive' }).click()
    if (!sources[0]?.canWrite) {
      await expect(page).toHaveURL(/drive=connected|phase=preparation/)
      await guideRow.getByRole('button', { name: 'Publish to Drive' }).click()
    }
    await expect(guide.getByText('In sync')).toBeVisible()
    await expect(
      guideRow.getByRole('link', { name: 'Open in Drive: Interview guide' }),
    ).toBeVisible()
    await practicesRow.getByRole('button', { name: 'Publish to Drive' }).click()
    await expect(practices.getByText('In sync')).toBeVisible()
    await scheduleRow.getByRole('button', { name: 'Publish to Drive' }).click()
    await expect(schedule.getByText('In sync')).toBeVisible()
    await expectAccessible(page)

    // Someone edits the guide in Drive.
    const link = await guideRow
      .getByRole('link', { name: 'Open in Drive: Interview guide' })
      .getAttribute('href')
    const fileId = link?.split('/').at(-1) ?? ''
    const edited = await page.request.post(`/api/dev/drive-documents/${fileId}/edit`, {
      data: { replace: [{ from: 'Tell me about last week.', to: 'Walk me through last week.' }] },
    })
    expect(edited.status()).toBe(204)

    // US2 + US3: checked, reviewed, accepted into the app.
    await guide.getByRole('button', { name: 'Check now' }).click()
    await expect(guide.getByText('Changed in Drive: to review')).toBeVisible()
    await guide.getByRole('button', { name: 'Review the changes from Drive' }).click()
    const review = page.getByRole('dialog', { name: 'Review the changes from Drive' })
    await expect(review.getByText('Walk me through last week.')).toBeVisible()
    await expectAccessible(page)
    await review.getByRole('radio', { name: 'Accept' }).click()
    await review.getByRole('button', { name: 'Apply the decisions' }).click()
    await expect(review).toBeHidden()
    await expect(main.getByText(/changes from Drive accepted/)).toBeVisible()
    await expect(main.getByText('Walk me through last week.').first()).toBeVisible()
    await expect(guide.getByText('In sync')).toBeVisible()

    // US4: a change in the app makes the schedule out of date; updating puts it in sync.
    await main.getByRole('button', { name: 'Plan an interview' }).click()
    await page.getByRole('dialog').getByLabel('Person to interview').fill('Lee Example')
    await page.getByRole('dialog').getByRole('button', { name: 'Add to the schedule' }).click()
    await schedule.getByRole('button', { name: 'Check now' }).click()
    await expect(schedule.getByText('Out of date: changed in the app')).toBeVisible()
    await schedule.getByRole('button', { name: 'Update in Drive' }).click()
    await expect(schedule.getByText('In sync')).toBeVisible()
  })
})
