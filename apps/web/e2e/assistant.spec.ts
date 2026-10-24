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

test.describe('spec 005 — assistant panel', () => {
  test('opens next to the language switch, chats, stops, and closes with Escape', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    const button = page.getByRole('button', { name: 'Assistant', exact: true })
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(panel).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeFocused()
    await expectAccessible(page)

    await page.getByRole('button', { name: 'New conversation' }).click()
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(`hello ${runId}`)
    await page.keyboard.press('Enter')
    await expect(panel.getByText(`You said: hello ${runId}`)).toBeVisible()
    // The cost of the conversation, on hover or focus of the small circle (US6).
    const cost = panel.getByRole('button', { name: /Cost of this conversation: \$/ })
    await cost.hover()
    await expect(page.getByText(/This conversation: \$/)).toBeVisible()
    await expect(page.getByText(/Last message: \$/)).toBeVisible()
    // The first message of a new conversation is shown once, during and after the answer.
    await expect(panel.getByRole('log').getByText(`hello ${runId}`, { exact: true })).toHaveCount(1)

    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('long answer')
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('log').getByText('long answer', { exact: true })).toHaveCount(1)
    await panel.getByRole('button', { name: 'Stop' }).click()
    await expect(panel.getByText('Stopped')).toBeVisible()
    await expect(panel.getByRole('log').getByText('long answer', { exact: true })).toHaveCount(1)

    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('long answer again')
    await page.keyboard.press('Enter')
    await panel.getByRole('button', { name: 'Stop' }).click()
    await expect(panel.getByText('Stopped')).toHaveCount(2)

    await page.getByRole('textbox', { name: 'Message to the assistant' }).focus()
    await page.keyboard.press('Escape')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(button).toBeFocused()

    // Remembered after a reload, with the same conversation.
    await button.click()
    await page.reload()
    await expect(panel.getByText(`You said: hello ${runId}`)).toBeVisible()
  })

  test('proposes changes that apply only when the person confirms', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Assistant ${runId}`)
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    const toggle = page.getByRole('button', { name: 'Assistant', exact: true })
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
    await panel.getByRole('button', { name: 'New conversation' }).click()
    await expect(panel.getByText(`Looking at: project Assistant ${runId}`)).toBeVisible()

    const field = page.getByRole('textbox', { name: 'Message to the assistant' })
    await field.fill('propose goal')
    await page.keyboard.press('Enter')
    const goal = panel.getByRole('region', { name: 'Change the research goal' })
    await expect(goal).toContainText('Understand why new users drop off during their first week.')
    await expectAccessible(page)
    await goal.getByRole('button', { name: 'Apply' }).click()
    await expect(goal.getByRole('status')).toContainText('Applied')
    await expect(
      page
        .getByRole('main')
        .getByText('Understand why new users drop off during their first week.'),
    ).toBeVisible()

    await field.fill('propose study')
    await page.keyboard.press('Enter')
    const study = panel.getByRole('region', { name: 'Create an interview study' })
    await study.getByRole('button', { name: 'Dismiss' }).click()
    await expect(study.getByRole('status')).toContainText('Dismissed')
    await expect(page.getByRole('main').getByText('Interviews with new users')).toHaveCount(0)

    // The assistant opens pages as if the person navigated; the panel stays open.
    await field.fill('propose study')
    await page.keyboard.press('Enter')
    const accepted = panel.getByRole('region', { name: 'Create an interview study' }).last()
    await accepted.getByRole('button', { name: 'Apply' }).click()
    await expect(accepted.getByRole('status')).toContainText('Applied')
    await field.fill('open study')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: '3 · Analysis' })).toBeVisible()
    await expect(panel.getByText('Opened the study')).toBeVisible()
    await field.fill('open preparation')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: '1 · Preparation' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page).toHaveURL(/phase=preparation/)
    await field.fill('open project')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /Project name:/ })).toBeVisible()
    await expect(panel).toBeVisible()

    await panel.getByRole('button', { name: 'Conversations' }).click()
    await expect(panel.getByRole('list', { name: 'Conversations' })).toContainText('propose goal')
    // Escape while renaming cancels the rename, and does not close the panel.
    await panel
      .getByRole('button', { name: /Conversation title: propose goal/ })
      .first()
      .click()
    await page.keyboard.type(' renamed')
    await page.keyboard.press('Escape')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('list', { name: 'Conversations' })).not.toContainText('renamed')
  })

  test('covers the screen on a phone', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await page.setViewportSize({ width: 360, height: 740 })
    await ensureHome(page)
    const panel = page.getByRole('complementary', { name: 'Assistant' })
    const toggle = page.getByRole('button', { name: 'Assistant', exact: true })
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
    await expect(panel).toBeVisible()
    const box = await panel.boundingBox()
    expect(box?.width).toBeCloseTo(360, 0)
    await panel.getByRole('button', { name: 'Close the assistant' }).click()
    await expect(panel).toBeHidden()
  })
})
