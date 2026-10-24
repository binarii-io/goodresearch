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

test.describe('US2 — research projects', () => {
  test('create, list, open, edit in place, cancel with Escape', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await page.getByRole('button', { name: 'New project' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Onboarding ${runId}`)
    await dialog.getByLabel('Research goal').fill('Why do people drop?\n- find blockers')
    const teamSelect = dialog.getByRole('combobox', { name: 'Team' })
    if ((await teamSelect.textContent())?.includes('Choose a team')) {
      await teamSelect.click()
      await page.getByRole('option').first().click()
    }
    await expectAccessible(page)
    await dialog.getByRole('button', { name: 'Create project' }).click()

    await expect(
      page.getByRole('button', { name: new RegExp(`Project name: Onboarding ${runId}`) }),
    ).toBeVisible()
    await expectAccessible(page)

    await page.getByRole('button', { name: /Project name:/ }).click()
    const name = page.getByRole('textbox', { name: 'Project name' })
    await name.fill(`Onboarding v2 ${runId}`)
    await name.press('Enter')
    await expect(
      page.getByRole('button', { name: new RegExp(`Onboarding v2 ${runId}`) }),
    ).toBeVisible()

    await page.getByRole('button', { name: /Project name:/ }).click()
    await page.getByRole('textbox', { name: 'Project name' }).fill('discarded')
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: new RegExp(`Onboarding v2 ${runId}`) }),
    ).toBeFocused()

    await page.reload()
    await expect(
      page.getByRole('button', { name: new RegExp(`Onboarding v2 ${runId}`) }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Projects' }).click()
    await expect(page.getByRole('link', { name: `Onboarding v2 ${runId}` })).toBeVisible()
  })

  test('a stale edit is refused with a reload message', async ({ browser }) => {
    const first = await signedInPage(browser, ADMIN)
    await ensureHome(first)
    await createProject(first, `Conflict ${runId}`)
    const second = await first.context().newPage()
    await second.goto(first.url())

    await first.getByRole('button', { name: /Project name:/ }).click()
    await first.getByRole('textbox', { name: 'Project name' }).fill(`Conflict A ${runId}`)
    await first.keyboard.press('Enter')
    await expect(
      first.getByRole('button', { name: new RegExp(`Conflict A ${runId}`) }),
    ).toBeVisible()

    await second.getByRole('button', { name: /Research goal/ }).click()
    await second.getByRole('textbox', { name: 'Research goal' }).fill('late')
    await second.keyboard.press('Control+Enter')
    await expect(second.getByRole('alert')).toContainText('Someone changed this in the meantime')
    await expect(second.getByRole('button', { name: 'Reload' })).toBeVisible()
  })

  test('the team filter is kept in the address', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await page.getByRole('combobox', { name: 'Team' }).click()
    await page.getByRole('option').nth(1).click()
    await expect(page).toHaveURL(/\?team=/)
  })
})
