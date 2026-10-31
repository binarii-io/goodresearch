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

test.describe('spec 016 — Interview quality', () => {
  test('reviews one interview from its row, reads it, and gives an opinion', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Quality ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Quality study ${runId}`)
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

    // Before a review: the state and a dash, never "0 of 0" nor a cost of 0.
    await page.getByRole('tab', { name: '5 · Quality' }).click()
    await expect(main.getByText('No interview reviewed yet')).toBeVisible()
    await expect(main.getByText('0 of 0')).toHaveCount(0)
    const row = main.getByRole('row', { name: /Sam Example/ })
    await expect(row.getByText('Not reviewed')).toBeVisible()
    await expectAccessible(page)

    // The row's button reviews that interview alone, and does not open it.
    await row.getByRole('button', { name: /^Review:/ }).click()
    const dialog = page.getByRole('alertdialog', { name: /^Review “.*Sam Example/ })
    await expect(dialog).toContainText('1 interviews')
    await expect(dialog).toContainText('the text of each transcript is sent')
    await expectAccessible(page)
    await dialog.getByRole('button', { name: 'Agree and review' }).click()
    await expect(row.getByRole('button', { name: 'Reviewed' })).toBeVisible({ timeout: 60_000 })

    // Its reference value is reachable by keyboard.
    await main.getByRole('button', { name: "How the interviewer's talk share is counted" }).focus()
    await expect(page.getByRole('tooltip')).toContainText('30%')
    await page.keyboard.press('Escape')

    // The views.
    await main.getByRole('button', { name: 'By person' }).click()
    await expect(main.getByRole('row', { name: /Lee Example/ })).toBeVisible()
    await expectAccessible(page)
    await main.getByRole('button', { name: 'By interview' }).click()

    // The state button opens the interview: its transcript, with what was flagged marked in text.
    await main
      .getByRole('row', { name: /Sam Example/ })
      .getByRole('button', { name: 'Reviewed' })
      .click()
    await expect(main.getByRole('region', { name: 'Transcript' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Back to the interviews/ }).first()).toBeVisible()
    await expectAccessible(page)

    const cards = main.getByRole('article')
    if ((await cards.count()) > 0) {
      const disagree = cards.first().getByRole('button', { name: 'Disagree' })
      await disagree.click()
      await expect(disagree).toHaveAttribute('aria-pressed', 'true')
    }
  })
})
