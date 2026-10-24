import {
  ADMIN,
  ensureHome,
  expect,
  expectAccessible,
  member,
  runId,
  signedInPage,
  test,
} from './fixtures.ts'

test.describe('US3 — access through teams', () => {
  test('a colleague waits for access, gets a team, then loses it', async ({ browser }) => {
    const email = member('sam')
    const sam = await signedInPage(browser, email)
    await expect(sam.getByRole('heading', { name: 'No access yet' })).toBeVisible()
    await expectAccessible(sam)

    const admin = await signedInPage(browser, ADMIN)
    await ensureHome(admin)
    await admin.getByRole('link', { name: 'Teams' }).click()
    await admin.getByRole('textbox', { name: 'Team name' }).fill(`Access ${runId}`)
    await admin.getByRole('button', { name: 'Add team' }).click()
    await expect(admin.getByRole('heading', { name: new RegExp(`Access ${runId}`) })).toBeVisible()

    await admin.getByRole('link', { name: 'Members' }).click()
    await expectAccessible(admin)
    const row = admin.getByRole('row').filter({ hasText: email })
    await expect(row.getByText('No team yet')).toBeVisible()
    await row.getByRole('link').click()
    await admin.getByRole('checkbox', { name: `Access ${runId}` }).click()
    await expect(admin.getByText(`Access to Access ${runId} granted`).first()).toBeVisible()
    await expectAccessible(admin)

    await sam.reload()
    await expect(sam.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()

    await admin.getByRole('checkbox', { name: `Access ${runId}` }).click()
    await expect(admin.getByText(`Access to Access ${runId} removed`).first()).toBeVisible()
    await sam.reload()
    await expect(sam.getByRole('heading', { name: 'No access yet' })).toBeVisible()
  })

  test('deactivation signs the person out; deletion erases name and email', async ({ browser }) => {
    const email = member('dee')
    const dee = await signedInPage(browser, email)
    const admin = await signedInPage(browser, ADMIN)
    await ensureHome(admin)
    await admin.getByRole('link', { name: 'Members' }).click()
    await admin.getByRole('row').filter({ hasText: email }).getByRole('link').click()

    await admin.getByRole('button', { name: 'Deactivate' }).click()
    await expect(admin.getByRole('button', { name: 'Reactivate' })).toBeVisible()
    await dee.reload()
    await expect(dee).toHaveURL(/\/sign-in/)

    await admin.getByRole('button', { name: 'Delete account' }).click()
    const dialog = admin.getByRole('alertdialog')
    await dialog.getByLabel(/to confirm/).fill(email)
    await dialog.getByRole('button', { name: 'Delete account' }).click()
    await expect(admin.getByRole('heading', { level: 1, name: 'Deleted account' })).toBeVisible()
    await expect(admin.getByText('Account deleted').first()).toBeVisible()
    await admin.getByRole('link', { name: 'Members' }).click()
    await expect(admin.getByText(email)).toHaveCount(0)
  })

  test('members cannot open the members area', async ({ browser }) => {
    const page = await signedInPage(browser, member('reader'))
    await expect(page.getByRole('link', { name: 'Members' })).toHaveCount(0)
    await page.goto('/members')
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  })
})
