import {
  ADMIN,
  createProject,
  ensureHome,
  expect,
  expectAccessible,
  signedInPage,
  test,
} from './fixtures.ts'

test.describe('Spec 017 — project home', () => {
  test('a new project shows the journey at zero and the first step', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Home ${Date.now()}`)
    const journey = page.getByRole('navigation', { name: 'Progress of the research' })
    const steps = journey.getByRole('listitem')
    await expect(steps).toHaveCount(5)
    await expect(steps.first()).toContainText('Next step')
    await expect(steps.first()).toContainText('Create a first study')
    await expect(journey.getByText('Next step')).toHaveCount(1)
    await expect(page.getByText(/AI cost of the project/)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Key takeaways' })).toHaveCount(0)
    await expectAccessible(page)

    await steps.first().getByRole('link').click()
    await expect(page.getByRole('heading', { name: 'Studies' })).toBeFocused()

    await steps.nth(2).getByRole('link').click()
    await expect(page).toHaveURL(/tab=insights/)
  })
})
