import {
  ADMIN,
  ensureHome,
  expect,
  expectAccessible,
  runId,
  signedInPage,
  test,
} from './fixtures.ts'

test.describe('spec 011 — Cleaning the transcripts', () => {
  test('cleans with the lexicon and the AI, then a person reviews, validates and publishes', async ({
    browser,
  }) => {
    // Inventory, a lexicon reading, then a cleaning in the worker: a long flow.
    test.setTimeout(180_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    // A team of its own: its lexicon starts empty.
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Teams' }).click()
    await page.getByRole('textbox', { name: 'Team name' }).fill(`Cleaning ${runId}`)
    await page.getByRole('button', { name: 'Add team' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(`Cleaning ${runId}`) })).toBeVisible()
    await nav.getByRole('link', { name: 'Projects' }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    const project = page.getByRole('dialog')
    await project.getByLabel('Name').fill(`Cleaning ${runId}`)
    await project.getByRole('combobox', { name: 'Team' }).click()
    await page.getByRole('option', { name: `Cleaning ${runId}` }).click()
    await project.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('button', { name: /Project name:/ })).toBeVisible()
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Cleaning study ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    const main = page.getByRole('main')

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
    for (const name of ['Interview Sam Example', 'Interview 2 - transcript'])
      await interviews.getByRole('switch', { name: `Validated: ${name}` }).click()
    await expect(interviews.getByText(/2 validated/)).toBeVisible()
    // Publishing writes in Drive: the shared admin may have granted it in an earlier run.
    const sources = (await (await page.request.get('/api/me/sources')).json()) as {
      canWrite: boolean
    }[]
    if (!sources[0]?.canWrite) {
      const back = `${new URL(page.url()).pathname}?phase=enrichment`
      await page.goto(
        `/api/sources/google-drive/connect?access=write&returnTo=${encodeURIComponent(back)}`,
      )
      await expect(page).toHaveURL(/phase=enrichment/)
    }

    // The lexicon first: "Goodresearch" accepted, everywhere.
    await page.getByRole('tab', { name: '3 · Enrichment' }).click()
    await main.getByRole('button', { name: 'Find terms' }).click()
    await page
      .getByRole('alertdialog', { name: 'Find the terms of the interviews?' })
      .getByRole('button', { name: /find terms/i })
      .click()
    const lexicon = main.getByRole('tabpanel', { name: /Lexicon/ })
    const good = lexicon.getByRole('row', { name: /Goodresearch/ })
    await expect(good).toBeVisible({ timeout: 30_000 })
    await good.getByRole('button', { name: 'Accept: Goodresearch' }).click()
    await expect(good).toHaveCount(0)

    // US1: clean, with the AI, after its own consent (FR-017).
    await main.getByRole('tab', { name: /^Cleaning/ }).click()
    const cleaning = main.getByRole('tabpanel', { name: /Cleaning/ })
    await cleaning.getByRole('button', { name: 'Clean transcripts' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Clean the transcripts?' })
    await expect(dialog).toContainText('the full text of each transcript is sent')
    await expectAccessible(page)
    await dialog.getByRole('button', { name: 'Agree and clean' }).click()
    const toDecide = cleaning.getByRole('button', { name: /Corrections to decide/ }).first()
    await expect(toDecide).toBeVisible({ timeout: 60_000 })
    // The fake provider adds two corrections the app must drop.
    await expect(cleaning.getByText(/AI corrections were left out/)).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // US2: the review of the interview with "eating" in it.
    await cleaning
      .getByRole('row', { name: /Interview 2/ })
      .getByRole('button', { name: /Corrections to decide/ })
      .click()
    const turns = main.getByRole('list', { name: 'Turns of the transcript' })
    await expect(turns.getByRole('button', { name: 'Accept “eating” → “meeting”' })).toBeVisible()
    await main.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'All', exact: true }).click()
    // The lexicon's correction, accepted by default.
    await expect(turns.getByText('Gooresearch').first()).toBeVisible()
    await expectAccessible(page)
    await main.getByRole('button', { name: /Accept all shown/ }).click()
    await expect(page.getByText(/0 to decide/)).toBeVisible()
    await page.getByRole('button', { name: 'Validate the clean version' }).first().click()
    await expect(page.getByText('Clean version 1 validated.')).toBeVisible()

    // US4: publish to the study folder's subfolder.
    await page.getByRole('button', { name: 'Publish to Drive' }).click()
    await expect(page.getByText('Published in Drive (version 1).')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open in Drive' })).toBeVisible()
    await expectAccessible(page)

    await page.getByRole('button', { name: 'Back to the interviews' }).click()
    await expect(cleaning.getByRole('row', { name: /Interview 2/ })).toContainText('Published')
    // One interview can be cleaned again alone, like "Analyze again" in Fieldwork.
    await cleaning.getByRole('button', { name: /^Clean again: Interview 2/ }).click()
    await expect(page.getByRole('alertdialog', { name: /^Clean “Interview 2/ })).toContainText(
      '1 interviews',
    )
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  })
})
