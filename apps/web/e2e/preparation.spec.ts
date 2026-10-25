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

test.describe('spec 006 — study preparation', () => {
  test('designs the guide with the assistant, edits it, reads the best practices, plans interviews', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Preparation ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Guide study ${runId}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Create study' }).click()
    await page.getByRole('tab', { name: '1 · Preparation' }).click()
    await expect(page.getByRole('heading', { name: 'Interview guide' })).toBeVisible()
    await expectAccessible(page)

    // US1: the panel opens on a new conversation; the skill is loaded and the progress shown.
    await page.getByRole('button', { name: 'Design with the assistant' }).click()
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    await expect(
      panel
        .getByRole('log')
        .getByText('Help me design the interview guide for this study.', { exact: true }),
    ).toBeVisible()
    await expect(panel.getByText('Using the skill: Interview guide design')).toBeVisible()
    const progress = panel.getByRole('progressbar', { name: 'Interview guide design progress' })
    await expect(progress).toHaveAttribute('aria-valuenow', '8')
    await expectAccessible(page)

    await page
      .getByRole('textbox', { name: 'Message to the assistant' })
      .fill('Yes, write the guide')
    await page.keyboard.press('Enter')
    const card = panel.getByRole('region', { name: 'Interview guide' })
    await expect(card).toContainText('4 sections · 5 main questions · 45 min')
    await expect(panel.getByText(/Checked 5 questions/)).toBeVisible()
    await card.getByText('Read the whole guide').click()
    await expect(card).toContainText('Tell me about the last time you planned your week.')
    await card.getByRole('button', { name: 'Apply' }).click()
    await expect(card.getByRole('status')).toContainText('Applied')

    // US2: the guide on the tab, with its origin.
    const main = page.getByRole('main')
    await expect(main.getByText(/Version 1 · written with the assistant/)).toBeVisible()
    await expect(main.getByText('Tell me about the last time you planned your week.')).toBeVisible()
    await page.getByRole('button', { name: 'Close the assistant' }).click()

    // US3: edit by hand.
    await main.getByRole('button', { name: 'Edit', exact: true }).click()
    const form = main.getByRole('form', { name: 'Edit the interview guide' })
    await form
      .getByLabel('Question 1', { exact: true })
      .nth(2)
      .fill('Walk me through how you planned last week.')
    await expectAccessible(page)
    await form.getByRole('button', { name: 'Save the guide' }).click()
    await expect(main.getByText(/Version 2 · edited by hand/)).toBeVisible()
    await expect(main.getByText('Walk me through how you planned last week.')).toBeVisible()
    const download = page.waitForEvent('download')
    await main.getByRole('button', { name: 'Download (Markdown)' }).first().click()
    expect((await download).suggestedFilename()).toMatch(/interview-guide\.md$/)

    // US4: best practices.
    await main.getByRole('button', { name: 'Read the best practices' }).click()
    const dialog = page.getByRole('dialog', { name: 'Interview best practices' })
    await expect(dialog.getByRole('heading', { name: 'Biases to avoid' })).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // US5: schedule.
    await main.getByRole('button', { name: 'Plan an interview' }).click()
    const plan = page.getByRole('dialog', { name: 'Plan an interview' })
    await plan.getByLabel('Person to interview').fill('Sam Example')
    await plan.getByLabel('Role').fill('Planner')
    await plan.getByLabel('Date and time').fill('2026-11-02T14:00')
    await plan.getByRole('button', { name: 'Add to the schedule' }).click()
    await expect(main.getByRole('cell', { name: 'Sam Example', exact: true })).toBeVisible()
    await expect(main.getByRole('list', { name: 'Interviews per status' })).toContainText(
      'To contact · 1',
    )
    await main.getByRole('button', { name: 'Edit Sam Example' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit the interview' })
    await edit.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Scheduled' }).click()
    await edit.getByRole('button', { name: 'Save' }).click()
    await expect(main.getByRole('list', { name: 'Interviews per status' })).toContainText(
      'Scheduled · 1',
    )
    await expectAccessible(page)
    await main.getByRole('button', { name: 'Delete Sam Example' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
    await expect(main.getByText('No interview planned yet.')).toBeVisible()
  })
})
