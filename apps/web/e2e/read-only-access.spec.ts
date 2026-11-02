import {
  ADMIN,
  createProject,
  ensureHome,
  expect,
  expectAccessible,
  member,
  runId,
  signedInPage,
  test,
} from './fixtures.ts'

test.describe('Spec 026 — read for everyone, change for the team', () => {
  test('a member outside the team reads a project, read only', async ({ browser }) => {
    const admin = await signedInPage(browser, ADMIN)
    await ensureHome(admin)
    const name = `Read only ${runId}`
    await createProject(admin, name)

    const reader = await signedInPage(browser, member('outside'))
    await expect(reader.getByText(/You are not in a team yet/)).toBeVisible()
    await reader.getByRole('link', { name }).click()

    await expect(reader.getByRole('region', { name: 'Read only' })).toBeVisible()
    await expect(reader.getByRole('button', { name: 'New study' })).toHaveCount(0)
    await expect(reader.getByRole('button', { name: /Project name/ })).toHaveCount(0)
    await expectAccessible(reader)

    await reader.getByRole('tab', { name: 'Insights' }).click()
    await expect(reader.getByRole('button', { name: 'Find insights' })).toHaveCount(0)
    await expectAccessible(reader)
  })
})
