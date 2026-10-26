import {
  ADMIN,
  ensureHome,
  expect,
  expectAccessible,
  runId,
  signedInPage,
  test,
} from './fixtures.ts'

test.describe('spec 010 — the Enrichment phase and the team lexicon', () => {
  test('finds the terms of the validated interviews, then a person decides them', async ({
    browser,
  }) => {
    // Inventory, reading in the worker, then the decisions: a longer flow than most.
    test.setTimeout(120_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    // The lexicon belongs to a team: a team of its own keeps this run apart from earlier ones.
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Teams' }).click()
    await page.getByRole('textbox', { name: 'Team name' }).fill(`Lexicon ${runId}`)
    await page.getByRole('button', { name: 'Add team' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(`Lexicon ${runId}`) })).toBeVisible()
    await nav.getByRole('link', { name: 'Projects' }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    const project = page.getByRole('dialog')
    await project.getByLabel('Name').fill(`Lexicon ${runId}`)
    await project.getByRole('combobox', { name: 'Team' }).click()
    await page.getByRole('option', { name: `Lexicon ${runId}` }).click()
    await project.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('button', { name: /Project name:/ })).toBeVisible()
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Lexicon study ${runId}`)
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

    // FR-001: four phases. Nothing validated yet: Enrichment points to Fieldwork.
    await page.getByRole('tab', { name: '3 · Enrichment' }).click()
    await expect(main.getByText('No validated interview yet.')).toBeVisible()
    await page.getByRole('tab', { name: '2 · Fieldwork' }).click()
    for (const name of ['Interview Sam Example', 'Interview 2 - transcript'])
      await interviews.getByRole('switch', { name: `Validated: ${name}` }).click()
    await expect(interviews.getByText(/2 validated/)).toBeVisible()

    // US1: find the terms, after the consent for the AI provider (FR-016).
    await page.getByRole('tab', { name: '3 · Enrichment' }).click()
    await main.getByRole('button', { name: 'Find terms' }).click()
    const run = page.getByRole('alertdialog', { name: 'Find the terms of the interviews?' })
    await expect(run).toContainText('2 interviews will be read')
    await expect(run).toContainText('No transcript is sent in full')
    await expectAccessible(page)
    await run.getByRole('button', { name: 'Agree and find terms' }).click()

    const lexicon = main.getByRole('tabpanel', { name: /Lexicon/ })
    const good = lexicon.getByRole('row', { name: /Goodresearch/ })
    await expect(good).toBeVisible({ timeout: 30_000 })
    await expect(good.getByText('Gooresearch')).toBeVisible()
    await expect(lexicon.getByRole('row', { name: /NPS/ })).toContainText('Acronym')
    // The fake provider also proposes a term with an invented quote: never shown.
    await expect(lexicon.getByText('Invented')).toHaveCount(0)
    await expect(main.getByText(/Cost of the readings/)).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // US2: accept one, change the other.
    await good.getByRole('button', { name: 'Accept: Goodresearch' }).click()
    await expect(good).toHaveCount(0)
    await lexicon
      .getByRole('row', { name: /NPS/ })
      .getByRole('button', { name: 'Change: NPS' })
      .click()
    const term = page.getByRole('dialog', { name: 'Term: NPS' })
    // A verdict in context on one excerpt (the prototype's yes / no), kept at once.
    const yes = term.getByRole('button', { name: /^This is the term:/ }).first()
    await yes.click()
    await expect(yes).toHaveAttribute('aria-pressed', 'true')
    await expect(term.getByText(/1 confirmed · 0 not this term/)).toBeVisible()
    await term.getByLabel('Definition').fill('Net Promoter Score')
    // On a short screen only the fields scroll: the actions stay in view.
    await page.setViewportSize({ width: 1280, height: 420 })
    await expect(term.getByRole('button', { name: 'Save' })).toBeInViewport()
    await page.setViewportSize({ width: 1280, height: 720 })
    await expectAccessible(page)
    await term.getByRole('button', { name: 'Save' }).click()
    // Decided: neither is left to decide (other terms of the team may be).
    await expect(lexicon.getByRole('row', { name: /NPS/ })).toHaveCount(0)

    // The accepted terms, with their definition.
    await lexicon.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Accepted' }).click()
    await expect(lexicon.getByRole('row', { name: /Goodresearch/ })).toBeVisible()
    await expect(lexicon.getByText('Net Promoter Score')).toBeVisible()

    // US4: each interview read; a new reading has nothing to read.
    await main.getByRole('tab', { name: /^Interviews/ }).click()
    await expect(
      main.getByRole('tabpanel', { name: /Interviews/ }).getByText('Read', { exact: true }),
    ).toHaveCount(2)
    await main.getByRole('button', { name: 'Find terms' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('Every interview is already read')
  })
})
