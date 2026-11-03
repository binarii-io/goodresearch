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

const LINK = 'https://drive.google.com/drive/folders/dev-study-folder'

test.describe('spec 028 - survey fieldwork', () => {
  test('opens the form, reads responses, filters the target, closes it', async ({ browser }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Fieldwork ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Survey ${runId}`)
    await dialog.getByRole('radio', { name: 'Survey' }).click()
    await dialog.getByRole('button', { name: 'Create study' }).click()
    const main = page.getByRole('main')

    // Without a form, Fieldwork says so.
    await page.getByRole('tab', { name: '2 · Fieldwork' }).click()
    await expect(main.getByText('Publish the questionnaire first.')).toBeVisible()

    // A questionnaire by hand, in the study's folder.
    const studyId = page.url().split('/studies/')[1]?.split('?')[0] ?? ''
    const api = page.request
    const connect = await api.get(
      `/api/sources/google-drive/connect?access=write&returnTo=/studies/${studyId}`,
    )
    expect(connect.ok()).toBe(true)
    expect((await api.put(`/api/studies/${studyId}/source`, { data: { link: LINK } })).ok()).toBe(
      true,
    )
    const common = { required: true, subTheme: null, contact: false }
    const saved = await api.put(`/api/studies/${studyId}/questionnaire`, {
      data: {
        version: null,
        content: {
          framing: {
            objective: 'Measure',
            hypotheses: [],
            audience: 'Designers',
            recruitment: 'wide-then-filter',
            administration: 'Online',
            targetResponses: 2,
            targetReason: 'Enough',
            language: 'en',
            consent: 'You choose.',
            thanks: 'Thank you.',
            shuffle: true,
          },
          sections: [
            {
              kind: 'profiling',
              title: 'About you',
              items: [
                {
                  ...common,
                  text: 'Your job',
                  measure: 'factual',
                  kind: 'single-choice',
                  options: ['Designer', 'Developer'],
                  ordered: false,
                },
              ],
            },
            {
              kind: 'theme',
              title: 'Planning',
              items: [{ ...common, text: 'Tell us more', measure: 'subjective', kind: 'open' }],
            },
          ],
        },
      },
    })
    expect(saved.ok()).toBe(true)
    const published = await api.post(`/api/studies/${studyId}/publications`, {
      data: { kinds: ['questionnaire'], language: 'en', timeZone: 'UTC' },
    })
    expect(published.status()).toBe(201)
    const fileId = (await published.json())[0].webLink.split('/').at(-1)

    await page.goto(`/studies/${studyId}?phase=fieldwork`)
    await expect(main.getByText('Closed to responses')).toBeVisible()
    await expectAccessible(page)

    // US1: opening recalls the checks left, then gives the link.
    await main.getByRole('button', { name: 'Open the form' }).click()
    const ask = page.getByRole('alertdialog', { name: 'Open the form?' })
    await expect(ask.getByText('It has not been reviewed by another person.')).toBeVisible()
    await expectAccessible(page)
    await ask.getByRole('button', { name: 'Open the form' }).click()
    await expect(main.getByLabel('Link to share with participants')).toBeVisible()

    // US2: responses arrive, Refresh reads them.
    const respond = (id: string, job: string) =>
      api.post(`/api/dev/drive-documents/${fileId}/responses`, {
        data: {
          id,
          answers: {
            'Your consent': ['I agree to take part'],
            'Your job': [job],
            'Tell us more': [`Because ${id}`],
          },
        },
      })
    await respond('one', 'Designer')
    await respond('two', 'Developer')
    await main.getByRole('button', { name: 'Refresh the responses' }).click()
    await expect(main.getByRole('tab', { name: 'Counted (2)' })).toBeVisible()
    await expectAccessible(page)

    // US3: the target is optional; it sets one aside, and removing it brings it back.
    await main.getByRole('button', { name: 'Add a target audience' }).click()
    const target = page.getByRole('dialog', { name: 'Target audience' })
    await target.getByRole('checkbox', { name: 'Designer' }).click()
    await expectAccessible(page)
    await target.getByRole('button', { name: 'Save the target' }).click()
    await expect(main.getByRole('tab', { name: 'Counted (1)' })).toBeVisible()
    await expect(main.getByRole('tab', { name: 'Out of target (1)' })).toBeVisible()
    await main.getByRole('button', { name: 'Change the target audience' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove the target' }).click()
    await expect(main.getByRole('tab', { name: 'Counted (2)' })).toBeVisible()
    await expect(main.getByRole('button', { name: 'Add a target audience' })).toBeVisible()

    // US4: a response reads item by item.
    await main.getByRole('button', { name: 'Read', exact: true }).first().click()
    const response = page.getByRole('dialog', { name: 'Response' })
    await expect(response.getByText(/Because/)).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')

    // US1: closing.
    await main.getByRole('button', { name: 'Close the form' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Close the form' }).click()
    await expect(main.getByText('Closed to responses')).toBeVisible()
  })
})
