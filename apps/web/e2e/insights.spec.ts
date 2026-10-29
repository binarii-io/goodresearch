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

test.describe('spec 013 — Project insights', () => {
  test('finds insights in the accepted facts of a project, a person decides them', async ({
    browser,
  }) => {
    // Inventory, a Fieldwork analysis, a facts reading, then an insights run: a long flow.
    test.setTimeout(240_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const projectName = `Insights ${runId}`
    await createProject(page, projectName)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Insights study ${runId}`)
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
    await page
      .getByRole('dialog')
      .getByRole('region', { name: 'Analysis' })
      .getByRole('button', { name: 'Accept all' })
      .click()
    const renaming = page.getByRole('dialog', { name: 'Rename the files in Drive' })
    if (await renaming.isVisible()) await renaming.getByRole('button', { name: 'Cancel' }).click()
    await page.keyboard.press('Escape')
    const validated = interviews.getByRole('switch', {
      name: 'Validated: 2026-10-20 – Sam Example – Lee Example',
    })
    await validated.click()
    await expect(validated).toBeChecked()

    // Facts found and accepted in the study (spec 012): what insights read.
    await page.getByRole('tab', { name: '5 · Analysis' }).click()
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

    // US1: the project's Insights tab, then a run after its own consent (FR-017).
    await page.getByRole('link', { name: projectName }).first().click()
    await main.getByRole('tab', { name: 'Insights' }).click()
    await expect(page).toHaveURL(/tab=insights/)
    const tab = main.getByRole('tabpanel', { name: 'Insights' })
    await main.getByRole('button', { name: 'Find insights' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Find insights?' })
    await expect(dialog).toContainText('No name, no verbatim and no interview title is sent.')
    await expect(
      dialog.getByRole('checkbox', { name: /Also read the facts still to decide/ }),
    ).not.toBeChecked()
    await expect(dialog.getByText(/1 facts, 1 calls to the AI/)).toBeVisible()
    await expectAccessible(page)
    await dialog.getByRole('button', { name: 'Agree and find insights' }).click()
    const card = tab.getByRole('article').first()
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expect(card.getByText('To decide')).toBeVisible()
    await expect(card.getByRole('button', { name: /confidence/ })).toBeVisible()
    await expect(main.getByText(/Last run \$/)).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // US2: the first insight is open in the right pane, its facts by participant; validated.
    const view = tab.getByRole('region', { name: 'Insight selected' })
    await expect(card.getByRole('button', { pressed: true })).toBeVisible()
    await expect(view.getByRole('region', { name: /P01|Sam Example/ })).toBeVisible()
    await expect(view.getByText('Supports').first()).toBeVisible()
    await expectAccessible(page)
    await view.getByRole('button', { name: 'Validate' }).click()
    await expect(view.getByText('Validated').first()).toBeVisible()
    await expect(tab.getByRole('article').first().getByText('Validated')).toBeVisible()

    // US3: the facts panel, then an insight written by hand.
    await main.getByRole('button', { name: /^Facts \(/ }).click()
    const panel = page.getByRole('dialog', { name: 'Accepted facts' })
    await expect(panel.getByText('1 facts')).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await main.getByRole('button', { name: 'New insight' }).click()
    const create = page.getByRole('dialog', { name: 'New insight' })
    await create.getByLabel('Statement').fill('Planning happens at the end of the week')
    await create.getByRole('button', { name: 'Supports' }).first().click()
    await expectAccessible(page)
    await create.getByRole('button', { name: 'Create the insight' }).click()
    await expect(create).toBeHidden()
    await expect(tab.getByRole('article')).toHaveCount(2)
  })
})
