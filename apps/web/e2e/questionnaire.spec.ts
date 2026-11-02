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

test.describe('spec 027 - survey preparation', () => {
  test('creates a survey study, writes a questionnaire by hand, designs one with the assistant', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Survey ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Survey study ${runId}`)
    await dialog.getByRole('radio', { name: 'Survey' }).click()
    await dialog.getByRole('button', { name: 'Create study' }).click()
    await page.getByRole('tab', { name: '1 · Preparation' }).click()
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Questionnaire', exact: true })).toBeVisible()
    await expectAccessible(page)

    // US3: by hand; an empty item is refused next to its field.
    await main.getByRole('button', { name: 'Write it myself' }).click()
    const form = main.getByRole('form', { name: 'Edit the questionnaire' })
    await form.getByRole('button', { name: 'Add an item' }).nth(1).click()
    await form.getByRole('button', { name: 'Save the questionnaire' }).click()
    await expect(form.getByText('Fill in this item, or remove it.')).toBeVisible()
    await form.getByLabel('Item 1', { exact: true }).fill('Planning my week is easy.')
    await expectAccessible(page)
    await form.getByRole('button', { name: 'Save the questionnaire' }).click()
    await expect(main.getByText(/Version 1 · edited by hand/)).toBeVisible()
    await expect(main.getByText('Planning my week is easy.')).toBeVisible()
    await expect(main.getByText(/Estimated time to answer/)).toBeVisible()
    await expect(main.getByText(/order of the themes stays fixed/)).toBeVisible()
    await expect(main.getByText('No profiling item', { exact: false })).toBeVisible()
    await expectAccessible(page)

    // US6: a check is marked, with who.
    await main.getByRole('checkbox', { name: 'Reviewed by another person' }).click()
    await expect(main.getByText(/Marked by/)).toBeVisible()

    // US7: best practices.
    await main.getByRole('button', { name: 'Read the best practices' }).click()
    const practices = page.getByRole('dialog', { name: 'Questionnaire best practices' })
    await expect(practices.getByRole('heading', { name: '4. Before sending' })).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(practices).toBeHidden()

    // The conversation never scrolls sideways, even with a very long word.
    await main.getByRole('button', { name: 'Continue with the assistant' }).click()
    const log = page.getByRole('complementary', { name: 'Assistant' }).getByRole('log')
    await expect(log.getByText(/You said: Help me improve/)).toBeVisible()
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('x'.repeat(400))
    await page
      .getByRole('complementary', { name: 'Assistant' })
      .getByRole('button', { name: 'Send' })
      .click()
    await expect(log.getByText(/You said: x+/)).toBeVisible()
    expect(await log.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

    // US2: the assistant: skill, progress, then a card applied.
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    await page
      .getByRole('textbox', { name: 'Message to the assistant' })
      .fill('Help me design the questionnaire')
    await panel.getByRole('button', { name: 'Send' }).click()
    await expect(panel.getByText('Using the skill: Questionnaire design')).toBeVisible()
    await expect(
      panel.getByRole('progressbar', { name: 'Questionnaire design progress' }),
    ).toHaveAttribute('aria-valuenow', '10')
    await page
      .getByRole('textbox', { name: 'Message to the assistant' })
      .fill('Write the questionnaire')
    await panel.getByRole('button', { name: 'Send' }).click()
    const card = panel.getByRole('region', { name: 'Questionnaire', exact: true })
    await expect(card).toBeVisible()
    await expectAccessible(page)
    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(main.getByText(/written with the assistant/)).toBeVisible()
  })
})
