import {
  ADMIN,
  acceptAllAndClose,
  createProject,
  ensureHome,
  expect,
  expectAccessible,
  runId,
  signedInPage,
  test,
} from './fixtures.ts'

test.describe('spec 014 — Recommendations and key takeaways', () => {
  test('finds recommendations in the insights, a person decides them, then the key takeaways', async ({
    browser,
  }) => {
    // Inventory, a Fieldwork analysis, a facts reading, then an insights run: a long flow.
    test.setTimeout(300_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const projectName = `Recommendations ${runId}`
    await createProject(page, projectName)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Recommendations study ${runId}`)
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
    await interviews.getByRole('button', { name: 'Analyze Interview Sam Example' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Agree and analyze' }).click()
    const sam = interviews.getByRole('row', { name: /Interview Sam Example/ })
    await expect(sam.getByText(/Analyzed · \$/)).toBeVisible({ timeout: 30_000 })
    await sam.getByRole('button', { name: 'Review Interview Sam Example' }).click()
    await acceptAllAndClose(page)
    const validated = interviews.getByRole('switch', {
      name: 'Validated: 2026-10-20 – Sam Example – Lee Example',
    })
    await validated.click()
    await expect(validated).toBeChecked()

    // Facts found and accepted in the study (spec 012): what insights read.
    await page.getByRole('tab', { name: '6 · Analysis' }).click()
    await main.getByRole('button', { name: 'Find facts' }).first().click()
    await page
      .getByRole('alertdialog', { name: 'Find the facts?' })
      .getByRole('button', { name: /find the facts/i })
      .click()
    const toDecide = main.getByRole('button', { name: /Facts to decide \(/ })
    await expect(toDecide).toBeVisible({ timeout: 60_000 })
    await toDecide.click()
    await main.getByRole('button', { name: /Accept all shown/ }).click()
    // A decided fact stays shown, its choice highlighted.
    await expect(
      main
        .getByRole('region', { name: 'Facts' })
        .getByRole('button', { name: 'Accepted', pressed: true }),
    ).toBeVisible()

    // Insights found and validated (spec 013): what recommendations read.
    await page.getByRole('link', { name: projectName }).first().click()
    await main.getByRole('tab', { name: 'Insights' }).click()
    await main.getByRole('button', { name: 'Find insights' }).click()
    await page
      .getByRole('alertdialog', { name: 'Find insights?' })
      .getByRole('button', { name: /find insights/i })
      .click()
    const insightsPane = main.getByRole('region', { name: 'Insight selected' })
    await expect(insightsPane).toBeVisible({ timeout: 60_000 })
    await insightsPane.getByRole('button', { name: 'Validate' }).click()
    await expect(
      insightsPane.getByRole('button', { name: 'Validated', pressed: true }),
    ).toBeVisible()

    // US1: the Recommendations tab, then a run (the consent was given for the insights).
    await main.getByRole('tab', { name: 'Recommendations' }).click()
    await expect(page).toHaveURL(/tab=recommendations/)
    const tab = main.getByRole('tabpanel', { name: 'Recommendations' })
    await tab.getByRole('button', { name: 'Find recommendations' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Find recommendations?' })
    await expect(dialog.getByText(/1 insights, one call to the AI/)).toBeVisible()
    await expectAccessible(page)
    await dialog.getByRole('button', { name: /find recommendations/i }).click()
    const pane = tab.getByRole('region', { name: 'Recommendation selected' })
    await expect(pane).toBeVisible({ timeout: 60_000 })
    await expect(tab.getByText(/were left out/)).toBeVisible()
    await expect(pane.getByText('impact × 2 − effort')).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // US2: edited in place, then validated.
    await pane.getByRole('button', { name: /Owner/ }).click()
    await pane.getByRole('textbox', { name: 'Owner' }).fill('Data team')
    await page.keyboard.press('Enter')
    await expect(tab.getByRole('article').first()).toContainText('Data team')
    await pane.getByRole('button', { name: 'Validate' }).click()
    await expect(pane.getByRole('button', { name: 'Validated', pressed: true })).toBeVisible()

    // FR-016: the prioritisation matrix; a recommendation dragged to another cell takes its
    // impact and effort, and the arrow keys do the same.
    await tab.getByRole('button', { name: 'Matrix' }).click()
    const matrix = tab.getByRole('region', { name: 'Prioritisation matrix' })
    const chip = matrix.getByRole('button', { name: /Act on:/ })
    await expect(
      matrix.getByRole('list', { name: 'Impact High, effort Medium' }).getByRole('button'),
    ).toHaveCount(1)
    await expectAccessible(page)
    await chip.dragTo(matrix.getByRole('list', { name: 'Impact High, effort Low' }))
    await expect(
      matrix.getByRole('list', { name: 'Impact High, effort Low' }).getByRole('button'),
    ).toHaveCount(1)
    await expect(pane.getByText('5', { exact: true })).toBeVisible()
    await matrix.getByRole('button', { name: /Act on:/ }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(
      matrix.getByRole('list', { name: 'Impact Medium, effort Low' }).getByRole('button'),
    ).toHaveCount(1)
    await expect(matrix.getByRole('button', { name: /Act on:/ })).toBeFocused()
    await tab.getByRole('button', { name: 'List' }).click()

    // US3: a draft of the key takeaways, saved only on request.
    const takeaways = tab.getByRole('region', { name: 'Key takeaways' })
    await takeaways.getByRole('button', { name: 'Draft with the AI' }).click()
    // The estimate first, in its own dialog (FR-012).
    const drafting = page.getByRole('alertdialog', { name: 'Draft the key takeaways with the AI?' })
    await expect(drafting.getByText(/one call to the AI: about/)).toBeVisible()
    await expectAccessible(page)
    await drafting.getByRole('button', { name: 'Draft', exact: true }).click()
    const draft = takeaways.getByRole('region', { name: 'AI draft' })
    await expect(draft).toBeVisible({ timeout: 30_000 })
    await expect(draft).not.toContainText('40%')
    await draft.getByRole('button', { name: 'Use this draft' }).click()
    await expect(takeaways.getByText(/Saved by/)).toBeVisible()
    await expect(takeaways.getByText(/AI drafts so far \$/)).toBeVisible()
    await expectAccessible(page)

    // Spec 015: the debrief deck, built from what was decided, presented, then in Google Slides.
    await main.getByRole('tab', { name: 'Debrief' }).click()
    await expect(page).toHaveURL(/tab=debrief/)
    const debrief = main.getByRole('tabpanel', { name: 'Debrief' })
    const slides = debrief.getByRole('list', { name: 'Slides' })
    for (const title of [
      'What to remember',
      'The research question',
      'What we recommend',
      'Impact × effort',
      'Who does what',
    ])
      await expect(slides.getByRole('article', { name: title, exact: true })).toBeVisible()
    await expect(slides).not.toContainText('Sam Example')
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // FR-006: the next steps say who does what, from the recommendations.
    await expect(slides.getByRole('article', { name: 'Who does what', exact: true })).toContainText(
      'Data team',
    )

    // FR-005: one slide at a time in the page, moved with the arrows; back to all slides.
    await debrief.getByRole('button', { name: 'Slide by slide' }).click()
    const one = debrief.getByRole('region', { name: /^Slide \d+ of \d+$/ })
    await expect(one.getByText(/^Slide 1 of \d+$/)).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(one.getByText(/^Slide 2 of \d+$/)).toBeVisible()
    await one.getByRole('button', { name: 'Previous slide' }).click()
    await expect(one.getByText(/^Slide 1 of \d+$/)).toBeVisible()
    await expectAccessible(page)
    await debrief.getByRole('button', { name: 'All slides' }).click()
    await slides.getByRole('button', { name: 'Open slide 3' }).click()
    await expect(one.getByText(/^Slide 3 of \d+$/)).toBeVisible()
    await debrief.getByRole('button', { name: 'All slides' }).click()

    // FR-005: the presentation mode, with the keyboard.
    await debrief.getByRole('button', { name: 'Present', exact: true }).click()
    const show = page.getByRole('dialog', { name: 'Debrief presentation' })
    await expect(show.getByText(/^Slide 1 of \d+$/)).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(show.getByText(/^Slide 2 of \d+$/)).toBeVisible()
    await page.keyboard.press('Home')
    await expect(show.getByText(/^Slide 1 of \d+$/)).toBeVisible()
    await expectAccessible(page)
    await show.getByRole('button', { name: 'Leave the presentation' }).click()
    await expect(show).toBeHidden()

    // US2: published to Google Slides (the simulated Drive), then updated in place.
    const sources = (await (await page.request.get('/api/me/sources')).json()) as {
      canWrite: boolean
    }[]
    const publishDeck = async () => {
      await debrief.getByRole('button', { name: 'Publish to Google Slides' }).click()
      const dialog = page.getByRole('dialog', { name: 'Publish to Google Slides' })
      await expectAccessible(page)
      await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
    }
    await publishDeck()
    if (!sources[0]?.canWrite) {
      await expect(page).toHaveURL(/tab=debrief/)
      await publishDeck()
    }
    await expect(debrief.getByText('In sync')).toBeVisible()
    const deckLink = debrief.getByRole('link', { name: 'Open in Google Slides' })
    // A recommendation's owner changes: the deck is out of date.
    await main.getByRole('tab', { name: 'Recommendations' }).click()
    await pane.getByRole('button', { name: /Owner/ }).click()
    await pane.getByRole('textbox', { name: 'Owner' }).fill('Product team')
    await page.keyboard.press('Enter')
    await expect(tab.getByRole('article').first()).toContainText('Product team')
    await main.getByRole('tab', { name: 'Debrief' }).click()
    await expect(debrief.getByText('Out of date')).toBeVisible()
    await debrief.getByRole('button', { name: 'Update in Google Slides' }).click()
    await expect(debrief.getByText('In sync')).toBeVisible()

    // FR-009: edited in Google Slides meanwhile, replaced only once confirmed.
    const deckId = (await deckLink.getAttribute('href'))?.split('/').at(-1) ?? ''
    const edited = await page.request.post(`/api/dev/drive-documents/${deckId}/edit`, { data: {} })
    expect(edited.status()).toBe(204)
    await debrief.getByRole('button', { name: 'Update in Google Slides' }).click()
    const replace = page.getByRole('alertdialog', { name: 'Changed in Google Slides' })
    await expectAccessible(page)
    await replace.getByRole('button', { name: 'Replace the Google Slides version' }).click()
    await expect(page.getByText('Google Slides presentation updated')).toBeVisible()
  })
})
