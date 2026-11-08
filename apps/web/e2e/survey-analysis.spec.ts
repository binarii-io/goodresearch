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

test.describe('spec 029 - survey analysis', () => {
  test('reads figures, crosses them, makes and decides facts, finds themes', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, ADMIN)
    await ensureHome(page)
    await createProject(page, `Analysis ${runId}`)
    await page.getByRole('button', { name: 'New study' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`Survey analysis ${runId}`)
    await dialog.getByRole('radio', { name: 'Survey' }).click()
    await dialog.getByRole('button', { name: 'Create study' }).click()
    const main = page.getByRole('main')
    await expect(page.getByRole('tab', { name: '3 · Analysis' })).toBeVisible()
    const studyId = page.url().split('/studies/')[1]?.split('?')[0] ?? ''
    const api = page.request

    // A published form with six responses, read once.
    await api.get(`/api/sources/google-drive/connect?access=write&returnTo=/studies/${studyId}`)
    await api.put(`/api/studies/${studyId}/source`, { data: { link: LINK } })
    const common = { required: false, subTheme: null, contact: false }
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
            targetResponses: 6,
            targetReason: 'Enough',
            language: 'en',
            consent: 'You choose.',
            thanks: 'Thank you.',
            shuffle: false,
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
              items: [
                {
                  ...common,
                  text: 'Planning is easy',
                  measure: 'subjective',
                  kind: 'likert',
                  points: 5,
                  lowLabel: 'Disagree',
                  highLabel: 'Agree',
                },
                { ...common, text: 'Tell us more', measure: 'subjective', kind: 'open' },
              ],
            },
          ],
        },
      },
    })
    expect(saved.ok(), await saved.text()).toBe(true)
    const published = await api.post(`/api/studies/${studyId}/publications`, {
      data: { kinds: ['questionnaire'], language: 'en', timeZone: 'UTC' },
    })
    expect(published.status()).toBe(201)
    const [publication] = await published.json()
    const fileId = publication.webLink.split('/').at(-1)
    await api.post(`/api/publications/${publication.id}/open`)
    const answers: [string, string, string, string][] = [
      ['one', 'Designer', '5', 'Too many tools to plan'],
      ['two', 'Designer', '5', 'Our tool list keeps growing'],
      ['three', 'Designer', '4', 'Mondays are calm'],
      ['four', 'Developer', '2', 'Meetings eat the week'],
      ['five', 'Developer', '4', 'We plan on Fridays'],
      ['six', 'Developer', '5', 'The board is enough'],
    ]
    for (const [id, job, scale, more] of answers)
      await api.post(`/api/dev/drive-documents/${fileId}/responses`, {
        data: {
          id,
          answers: {
            'Your consent': ['I agree to take part'],
            'Your job': [job],
            'Planning is easy': [scale],
            'Tell us more': [more],
          },
        },
      })
    await api.post(`/api/studies/${studyId}/responses/read`, { data: { force: true } })

    // US1: the flat sort, each share over the respondents who answered.
    await page.goto(`/studies/${studyId}?phase=analysis`)
    await expect(main.getByRole('tab', { name: 'Figures' })).toBeVisible()
    const job = main.getByRole('article').filter({ hasText: 'Your job' })
    await expect(job.getByText('50 % (3)').first()).toBeVisible()
    const scale = main.getByRole('article').filter({ hasText: 'Planning is easy' })
    await expect(scale.getByText('Agreement: 83.3 %')).toBeVisible()
    await expectAccessible(page)

    // US2: crossed by the profiling item, each column with its base.
    await main.getByRole('combobox', { name: 'Cross by' }).click()
    await page.getByRole('option', { name: 'Your job' }).click()
    await expect(scale.getByText('Base 3, small').first()).toBeVisible()
    await main.getByRole('combobox', { name: 'Cross by' }).click()
    await page.getByRole('option', { name: 'No cross' }).click()

    // US4: a fact from a figure, written by the app, then accepted.
    await scale.getByRole('button', { name: 'Make a fact' }).click()
    const factDialog = page.getByRole('dialog', { name: 'Make a fact of this figure' })
    await factDialog.getByRole('radio', { name: /Agreement/ }).click()
    await expectAccessible(page)
    await factDialog.getByRole('button', { name: 'Propose the fact' }).click()
    await main.getByRole('tab', { name: 'Facts (1 to decide)' }).click()
    const facts = main.getByRole('region', { name: /^Facts/ })
    await expect(
      facts.getByText('83.3 % of the 6 respondents agree with “Planning is easy” (small base).'),
    ).toBeVisible()
    await facts.getByRole('button', { name: 'Accept', exact: true }).click()
    await facts.getByRole('tab', { name: 'Accepted' }).click()
    await expect(facts.getByText(/agree with “Planning is easy”/)).toBeVisible()

    // FR-010a: "Find facts", the action of every tab as for interviews; the agreement already has
    // its fact and the invented figure is dropped, so the job's first answer alone is proposed.
    await main.getByRole('tab', { name: 'Figures' }).click()
    await main.getByRole('button', { name: 'Find facts' }).click()
    const find = page.getByRole('alertdialog', { name: 'Find the facts?' })
    await expect(find.getByText(/2 figures and 0 accepted themes/)).toBeVisible()
    await expectAccessible(page)
    await find.getByRole('button', { name: 'Find the facts' }).click()
    await expect(main.getByRole('tab', { name: 'Facts (1 to decide)' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await facts.getByRole('tab', { name: 'To decide' }).click()
    await expect(facts.getByText(/“Your job”/)).toBeVisible()

    // US3: themes of the masked open answers, with the fake AI.
    await main.getByRole('tab', { name: 'Open questions (1)' }).click()
    const open = main.getByRole('listitem').filter({ hasText: 'Tell us more' })
    await open.getByRole('button', { name: 'Find themes' }).click()
    const ask = page.getByRole('alertdialog', { name: /Find themes in/ })
    await expect(ask.getByText(/6 answers in 1 parts/)).toBeVisible()
    await ask.getByRole('button', { name: 'Find the themes' }).click()
    await open.getByRole('button', { name: 'See the answers and themes' }).click()
    await expect(open.getByText('Tools', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    await expectAccessible(page)
  })
})
