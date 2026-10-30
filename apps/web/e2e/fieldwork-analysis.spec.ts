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

test.describe('spec 009 — analyze the interviews', () => {
  test('analyzes one interview, accepts its proposals, then analyzes the others', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Analysis ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Analysis study ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    const main = page.getByRole('main')

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
    const interviews = main.getByRole('region', { name: 'Interviews' })
    await expect(interviews.getByRole('row')).toHaveCount(6, { timeout: 30_000 })

    // US1: one row, after the consent for the AI provider (FR-011).
    await interviews.getByRole('button', { name: 'Analyze Interview Sam Example' }).click()
    const consent = page.getByRole('alertdialog')
    await expect(consent).toContainText('may contain names of people')
    await expectAccessible(page)
    await consent.getByRole('button', { name: 'Agree and analyze' }).click()
    const sam = interviews.getByRole('row', { name: /Interview Sam Example/ })
    await expect(sam.getByText(/Analyzed · \$/)).toBeVisible()

    // Editing in Drive is allowed, so an accepted name renames the files with no window (FR-027).
    const { pathname, search } = new URL(page.url())
    await page.goto(
      `/api/sources/google-drive/connect?access=write&returnTo=${encodeURIComponent(pathname + search)}`,
    )

    // The proposals, each with where it comes from; "Accept all" fills the interview.
    await sam.getByRole('button', { name: 'Review Interview Sam Example' }).click()
    const dialog = page.getByRole('dialog', { name: 'Interview: Interview Sam Example' })
    const analysis = dialog.getByRole('region', { name: 'Analysis' })
    await expect(analysis.getByText('from the header of the transcript')).toBeVisible()
    await expect(analysis.getByText('found by the AI').first()).toBeVisible()
    // The fake provider also answers with a quote that is not in the text: never shown.
    await expect(analysis.getByText('Nobody Here')).toHaveCount(0)
    await expectAccessible(page)
    await analysis.getByRole('button', { name: 'Accept all' }).click()
    const renamed = page.getByRole('dialog', {
      name: 'Interview: 2026-10-20 – Sam Example – Lee Example',
    })
    await expect(renamed).toBeVisible()
    await expect(renamed.getByText('Files named in Drive')).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Rename the files in Drive' })).toHaveCount(0)
    await renamed.getByRole('tab', { name: 'Interview' }).click()
    await expect(renamed.getByLabel('Name of person 1')).toHaveValue('Sam Example')
    await page.keyboard.press('Escape')

    // US2: the others, in the background, with the count and the most it can cost.
    await interviews.getByRole('button', { name: 'Analyze interviews' }).click()
    const run = page.getByRole('alertdialog', { name: 'Analyze the interviews?' })
    await expect(run).toContainText(/interviews will be analyzed/)
    await expect(run).toContainText(/At most \$/)
    await run.getByRole('button', { name: 'Analyze' }).click()
    // Every row analyzed (the run goes on in the worker).
    await expect(interviews.getByText(/Analyzed ·|Analysis incomplete ·/)).toHaveCount(5, {
      timeout: 30_000,
    })
    await expect(interviews.getByRole('button', { name: 'Analyze interviews' })).toBeVisible()
    await expect(main.getByText(/Cost of the analyses: \$/)).toBeVisible()

    // FR-026: everything analyzed; the box offers to analyze them again.
    await interviews.getByRole('button', { name: 'Analyze interviews' }).click()
    const again = page.getByRole('alertdialog', { name: 'Analyze the interviews?' })
    await expect(again).toContainText('Every interview is already analyzed')
    await again.getByRole('checkbox', { name: /Also analyze again/ }).click()
    await expect(again).toContainText(/interviews will be analyzed/)
    await again.getByRole('button', { name: 'Cancel' }).click()

    // FR-017: no planned interview matches the person found: the interview joins the schedule.
    const two = interviews.getByRole('row', { name: /Interview 2 - transcript/ })
    await two.getByRole('button', { name: 'Add Casey Test to the schedule' }).click()
    await expect(two.getByText('Casey Test').first()).toBeVisible()
    // FR-019, FR-020: "To decide (N)" opens the interview.
    await two.getByRole('button', { name: /To decide \(\d+\)/ }).click()
    await expect(page.getByRole('dialog', { name: /Interview:/ })).toBeVisible()
    await page.keyboard.press('Escape')

    // US4: anonymisation in the study settings.
    await page.getByRole('button', { name: 'Study settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Study settings' })
    await settings.getByRole('switch', { name: 'Anonymisation' }).click()
    await expect(page.getByText('Anonymisation on')).toBeVisible()
    await expectAccessible(page)
  })
})
