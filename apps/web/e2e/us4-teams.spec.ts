import {
  ADMIN,
  ensureHome,
  expect,
  expectAccessible,
  runId,
  signedInPage,
  test,
} from './fixtures.ts'

test.describe('US4 — manage teams', () => {
  test('duplicate names are refused; a team with projects cannot be deleted', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Teams' })
      .click()
    await page.getByRole('textbox', { name: 'Team name' }).fill(`Growth ${runId}`)
    await page.getByRole('button', { name: 'Add team' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(`Growth ${runId}`) })).toBeVisible()
    await page.getByRole('textbox', { name: 'Team name' }).fill(`growth ${runId} `)
    await page.getByRole('button', { name: 'Add team' }).click()
    await expect(page.getByRole('alert')).toHaveText('A team with this name already exists.')
    await expectAccessible(page)

    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: new RegExp(`Growth ${runId}`) }) })
    await card.getByRole('button', { name: 'Delete team' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(`Growth ${runId}`) })).toHaveCount(0)
  })
})
