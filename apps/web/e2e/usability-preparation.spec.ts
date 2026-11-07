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

test.describe('spec 036 - usability test preparation', () => {
  test('creates a usability test study, writes its protocol by hand, checks it and marks its readiness', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Usability ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Usability study ${runId}`)
    await dialog.getByRole('radio', { name: 'Usability test' }).click()
    await dialog.getByRole('button', { name: 'Create study' }).click()

    // US1: the phases of a usability test (spec 037: no Lexicon, Enrichment or Quality); it opens on Preparation.
    await expect(page.getByRole('tablist', { name: 'Study phases' }).getByRole('tab')).toHaveText([
      '1 · Preparation',
      '2 · Fieldwork',
      '3 · Analysis',
    ])
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Test protocol', exact: true })).toBeVisible()
    await expectAccessible(page)

    // US3: by hand; a missing link and an empty task are refused next to their field.
    await main.getByRole('button', { name: 'Write it myself' }).click()
    const form = main.getByRole('form', { name: 'Edit the test protocol' })
    await form.getByRole('button', { name: 'Save the protocol' }).click()
    await expect(
      form.getByText('Enter a web address starting with http:// or https://.'),
    ).toBeVisible()
    await expect(form.getByText('Write the instruction, or remove the task.')).toBeVisible()
    await form.getByLabel('Link', { exact: true }).fill('https://prototype.example.org/start')
    await form.getByLabel('Task 1: instruction read aloud').fill('Click on Export to get the file')
    await form.getByLabel('Success criterion (for the facilitator)').fill('The file is saved')
    await form.getByRole('checkbox', { name: 'End with the System Usability Scale' }).click()
    await form.getByRole('checkbox', { name: 'Ask the ease question after each task' }).click()
    await expectAccessible(page)
    await form.getByRole('button', { name: 'Save the protocol' }).click()

    // US4: the rules flag the instruction; the planned length is the app's estimate.
    await expect(main.getByText(/Version 1 · edited by hand/)).toBeVisible()
    await expect(main.getByText('Click on Export to get the file')).toBeVisible()
    await expect(main.getByText(/gives the way/)).toBeVisible()
    await expect(main.getByText(/Planned length: about \d+ min/)).toBeVisible()
    await expect(
      main.getByText('I think that I would like to use this system frequently.'),
    ).toBeVisible()
    await expectAccessible(page)

    // US6: a check is marked, with who.
    await main.getByRole('checkbox', { name: 'Protocol reviewed by another person' }).click()
    await expect(main.getByText(/Marked by/)).toBeVisible()

    // US7: best practices.
    await main.getByRole('button', { name: 'Read the best practices' }).click()
    const practices = page.getByRole('dialog', { name: 'Usability test best practices' })
    await expect(practices.getByRole('heading', { name: '2. Write realistic tasks' })).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(practices).toBeHidden()

    // FR-022a: the anonymisation setting says it does not apply to the recordings.
    await page.getByRole('button', { name: 'Study settings' }).click()
    await expect(page.getByText(/It does not apply to the recordings/)).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')

    // Dark theme.
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
  })
})
