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

test.describe('spec 012 — Verbatims and facts', () => {
  test('finds the facts of an interview, a person decides them, here and over the study', async ({
    browser,
  }) => {
    // Inventory, a Fieldwork analysis, then a reading in the worker: a long flow.
    test.setTimeout(180_000)
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Facts ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`Facts study ${runId}`)
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

    // The interview's people come from its Fieldwork analysis (spec 009).
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

    // US1: find the facts, after their own consent (FR-014).
    await page.getByRole('tab', { name: '6 · Analysis' }).click()
    await main.getByRole('button', { name: 'Find facts' }).first().click()
    const dialog = page.getByRole('alertdialog', { name: 'Find the facts?' })
    await expect(dialog).toContainText('the text of each transcript is sent')
    await expectAccessible(page)
    await dialog.getByRole('button', { name: /find the facts/i }).click()
    const toDecide = main.getByRole('button', { name: /Facts to decide \(/ })
    await expect(toDecide).toBeVisible({ timeout: 60_000 })
    // The fake provider adds verbatims and facts the app must drop.
    await expect(main.getByText(/The app's checks left out/)).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // US2: the interview, its verbatims highlighted, its facts beside it.
    await toDecide.click()
    const transcript = main.getByRole('region', { name: 'Transcript' })
    await expect(transcript.getByText(/^verbatim, /).first()).toBeAttached()
    await expect(transcript.getByRole('list', { name: 'Colours of the verbatims' })).toBeVisible()
    const facts = main.getByRole('region', { name: 'Facts' })
    await expect(facts.getByRole('article')).toHaveCount(1)
    await expectAccessible(page)
    // Words selected inside a verbatim narrow it: a real drag over its first words.
    const mark = transcript.locator('mark [role="button"]').first()
    const box = await mark.boundingBox()
    if (!box) throw new Error('no verbatim on screen')
    await page.mouse.move(box.x + 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()
    const kept = (await page.evaluate(() => window.getSelection()?.toString() ?? '')).trim()
    // The actions show in a small panel next to the selection.
    const overlay = page.getByRole('dialog', { name: /Narrow this verbatim/ })
    await expect(overlay).toBeVisible()
    await expectAccessible(page)
    await overlay.getByRole('button', { name: 'Narrow the verbatim to this selection' }).click()
    await expect(overlay).toBeHidden()
    await expect(transcript.locator('mark [role="button"]').first()).toHaveText(
      new RegExp(`${kept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    )
    // A verbatim from the keyboard, then a fact written in French, translated in the background.
    // Words selected in a turn without a verbatim, added to the fact already there.
    await transcript
      .getByRole('listitem')
      .filter({ hasText: 'I plan the week' })
      .locator('p')
      .evaluate((p) => {
        const node = [...p.childNodes].find((n) => n.textContent?.includes('usually on Sunday'))
        if (!node) throw new Error('no text')
        const text = node.firstChild ?? node
        const at = (text.textContent ?? '').indexOf('usually on Sunday evening')
        const range = document.createRange()
        range.setStart(text, at)
        range.setEnd(text, at + 'usually on Sunday evening'.length)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
        p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      })
    const adding = page.getByRole('dialog', { name: /New verbatim/ })
    await adding.getByRole('button', { name: 'Add to a fact' }).click()
    // The facts open in a second panel beside it: the first one does not move.
    const before = await adding.boundingBox()
    const choose = page.getByRole('dialog', { name: 'Facts of this interview' })
    await expect(choose).toBeVisible()
    expect(await adding.boundingBox()).toEqual(before)
    await expectAccessible(page)
    await choose.getByRole('button').first().click()
    await expect(adding).toBeHidden()
    await expect(
      transcript.getByRole('listitem').filter({ hasText: 'I plan the week' }).locator('mark'),
    ).toHaveCount(1)
    // A turn without a verbatim: a selection over one would narrow it instead.
    await transcript
      .getByRole('listitem')
      .filter({ hasText: 'I plan the week' })
      .getByRole('button', { name: 'Add a verbatim from this turn' })
      .click()
    const pick = page.getByRole('dialog', { name: 'Add a verbatim' })
    const text = pick.getByRole('textbox')
    await text.focus()
    await text.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, el.value.indexOf(',')))
    // Extends the selection from the keyboard, as a person would.
    await text.press('Shift+ArrowRight')
    await pick.getByRole('button', { name: 'Add the verbatim' }).click()
    await expect(facts.getByRole('heading', { name: /Verbatims without a fact/ })).toBeVisible()
    await facts.getByRole('button', { name: 'Write a fact' }).first().click()
    const write = page.getByRole('dialog', { name: 'New fact' })
    await write.getByLabel('In French').fill('Le planning de la semaine se fait le dimanche')
    await expectAccessible(page)
    await write.getByRole('button', { name: 'Add the fact' }).click()
    await main.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'All', exact: true }).click()
    await expect(facts.getByRole('article')).toHaveCount(2)
    await main.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'To decide' }).click()
    await main.getByRole('button', { name: /Accept all shown/ }).click()
    await expect(facts.getByText('No fact here.')).toBeVisible()

    // FR-018: every fact of the study.
    await page.getByRole('link', { name: 'Back to the analysis' }).click()
    await main.getByRole('tab', { name: /^Facts/ }).click()
    const list = main.getByRole('tabpanel', { name: /Facts/ })
    await list.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Accepted' }).click()
    await expect(list.getByRole('article')).toHaveCount(2)
    await expectAccessible(page)
  })
})
