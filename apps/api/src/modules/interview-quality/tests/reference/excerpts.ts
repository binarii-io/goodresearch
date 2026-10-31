/**
 * The reference set (research R9): invented excerpts, about no real person, to measure on a real
 * provider whether the AI tells a simple reformulation from a reformulation with opinion.
 */
export type Excerpt = {
  /** What interviewees said before the sentence. */
  readonly said: string
  /** The interviewer's sentence. */
  readonly sentence: string
  /** For a reformulation with opinion: what it adds, as a person reads it. */
  readonly added?: string
}

export const SIMPLE: readonly Excerpt[] = [
  {
    said: 'I export the sheet every Monday before the meeting.',
    sentence: 'So you export the sheet every Monday, before the meeting?',
  },
  {
    said: 'I export the sheet every Monday before the meeting.',
    sentence: 'If I follow you, the export happens at the start of each week?',
  },
  {
    said: 'My manager checks the numbers, then I send them on.',
    sentence: 'So your manager checks first, and you send them afterwards, is that it?',
  },
  {
    said: 'It takes me about two hours to prepare the file.',
    sentence: 'You mean the preparation takes around two hours?',
  },
  {
    said: 'We stopped using the shared calendar last spring.',
    sentence: 'So the shared calendar has not been used since last spring?',
  },
  {
    said: 'I ask a colleague when I cannot find the right form.',
    sentence: 'When the form is missing, you turn to a colleague, right?',
  },
  {
    said: 'The app logs me out and I lose what I typed. That annoys me.',
    sentence: 'So being logged out and losing your text is what annoys you?',
  },
  {
    said: 'I prefer the phone, I never read the mail on time.',
    sentence:
      'You would rather have a call because mail reaches you too late, did I get that right?',
  },
  {
    said: 'We keep two versions because the auditors want the old one.',
    sentence: 'So there are two versions, since the auditors ask for the old one?',
  },
  {
    said: 'It works well on my desk but not on site, the network drops.',
    sentence: 'It is fine at your desk, and on site the network is the issue?',
  },
  {
    said: 'Early on I hated the new screen. Now I do not mind it.',
    sentence: 'So your view of the new screen has softened over time?',
  },
  {
    said: 'I do the first pass alone, then we review together on Friday.',
    sentence: 'Let me check that I understood: alone first, together on Fridays?',
  },
  {
    said: 'I never open that report, it is too long for me.',
    sentence: 'That report is too long, so you do not open it, correct?',
  },
  {
    said: 'The training was short, and I learned by trying things out.',
    sentence: 'In other words, you mostly learned by trying things yourself?',
  },
  {
    said: 'Three people need to sign before it goes out, which is slow.',
    sentence: 'So three signatures make it slow to go out, is that what you are saying?',
  },
  {
    said: 'Je remplis le tableau chaque soir avant de partir.',
    sentence: 'Donc vous remplissez le tableau tous les soirs avant de partir ?',
  },
  {
    said: 'Je remplis le tableau chaque soir avant de partir.',
    sentence: 'Si je comprends bien, le tableau se remplit en fin de journée ?',
  },
  {
    said: 'Ma collègue vérifie, ensuite je valide le dossier.',
    sentence: 'Votre collègue vérifie d’abord et vous validez ensuite, c’est bien ça ?',
  },
  {
    said: 'Ça me prend une heure à chaque fois.',
    sentence: 'Vous voulez dire que cela vous demande une heure à chaque fois ?',
  },
  {
    said: 'On a arrêté le logiciel parce que personne ne le comprenait.',
    sentence: 'Donc le logiciel a été abandonné faute d’être compris, c’est ça ?',
  },
  {
    said: 'Je demande à mon voisin quand je suis bloqué.',
    sentence: 'Quand vous êtes bloqué, vous vous tournez vers votre voisin, non ?',
  },
  {
    said: 'L’écran est trop petit, je dois zoomer tout le temps et ça m’agace.',
    sentence: 'Ce qui vous agace, c’est de devoir zoomer sur ce petit écran ?',
  },
  {
    said: 'Je préfère le papier, je me perds moins dans mes notes.',
    sentence: 'Vous gardez le papier pour moins vous perdre dans vos notes, j’ai bien compris ?',
  },
  {
    said: 'Au début j’avais peur de me tromper, maintenant ça va.',
    sentence: 'Donc cette crainte de vous tromper s’est estompée ?',
  },
  {
    said: 'On se réunit le mardi pour répartir les demandes.',
    sentence: 'Pour résumer, la répartition des demandes se fait en réunion le mardi ?',
  },
  {
    said: 'Je n’utilise jamais ce menu, je ne sais pas à quoi il sert.',
    sentence: 'Vous ne vous servez pas de ce menu car son rôle ne vous paraît pas clair ?',
  },
  {
    said: 'Le client rappelle souvent, il ne reçoit pas le courrier à temps.',
    sentence: 'Le client rappelle parce que le courrier lui arrive en retard, c’est cela ?',
  },
  {
    said: 'Sur le terrain, je note tout sur mon téléphone puis je recopie.',
    sentence: 'Donc vous notez sur le téléphone et vous recopiez après, si je vous suis bien ?',
  },
  {
    said: 'Il y a deux semaines d’attente, mais on s’y est habitués.',
    sentence: 'Deux semaines d’attente, auxquelles vous vous êtes faits, c’est ça ?',
  },
  {
    said: 'Je fais la première lecture, puis ma responsable relit tout.',
    sentence: 'Autrement dit, votre responsable relit tout derrière votre première lecture ?',
  },
]

export const WITH_OPINION: readonly Excerpt[] = [
  {
    said: 'I export the sheet every Monday before the meeting.',
    sentence: 'So you export it every Monday because the tool is too slow during the week?',
    added: 'the tool is too slow',
  },
  {
    said: 'My manager checks the numbers, then I send them on.',
    sentence: 'So your manager checks them because they do not trust your work?',
    added: 'they do not trust your work',
  },
  {
    said: 'It takes me about two hours to prepare the file.',
    sentence: 'So two hours, which is clearly a waste of your time?',
    added: 'a waste of time',
  },
  {
    said: 'We stopped using the shared calendar last spring.',
    sentence: 'So you stopped since nobody found it reliable?',
    added: 'nobody found it reliable',
  },
  {
    said: 'I ask a colleague when I cannot find the right form.',
    sentence: 'You ask a colleague because the search is badly designed, right?',
    added: 'the search is badly designed',
  },
  {
    said: 'We keep two versions because the auditors want the old one.',
    sentence: 'So you keep two versions, and that must be a real burden for your team?',
    added: 'a burden for the team',
  },
  {
    said: 'The training was short, and I learned by trying things out.',
    sentence: 'So the training was useless and you had to manage on your own?',
    added: 'the training was useless',
  },
  {
    said: 'I never open that report, it is too long for me.',
    sentence: 'So you ignore it because management does not care about your needs?',
    added: 'management does not care',
  },
  {
    said: 'I do the first pass alone, then we review together on Friday.',
    sentence: 'So Friday is when the real mistakes get caught?',
    added: 'mistakes get caught',
  },
  {
    said: 'Three people need to sign before it goes out.',
    sentence: 'So three signatures, which frustrates you and delays your clients?',
    added: 'frustration and delayed clients',
  },
  {
    said: 'Je remplis le tableau chaque soir avant de partir.',
    sentence: 'Donc vous le remplissez le soir parce que vous manquez de temps en journée ?',
    added: 'manque de temps en journée',
  },
  {
    said: 'Ma collègue vérifie, ensuite je valide le dossier.',
    sentence: 'Votre collègue vérifie car elle a plus d’expérience que vous ?',
    added: 'elle a plus d’expérience',
  },
  {
    said: 'Ça me prend une heure à chaque fois.',
    sentence: 'Une heure, ce qui est bien trop long pour cette tâche ?',
    added: 'bien trop long',
  },
  {
    said: 'On a arrêté le logiciel l’an dernier.',
    sentence: 'Donc vous l’avez arrêté parce qu’il coûtait trop cher ?',
    added: 'il coûtait trop cher',
  },
  {
    said: 'Je demande à mon voisin quand je suis bloqué.',
    sentence: 'Vous lui demandez parce que la documentation est mauvaise, non ?',
    added: 'la documentation est mauvaise',
  },
  {
    said: 'Je préfère le papier pour mes notes.',
    sentence: 'Vous gardez le papier car vous vous méfiez des outils numériques ?',
    added: 'méfiance envers le numérique',
  },
  {
    said: 'On se réunit le mardi pour répartir les demandes.',
    sentence: 'Donc le mardi sert à rattraper le désordre de la semaine ?',
    added: 'le désordre de la semaine',
  },
  {
    said: 'Je n’utilise jamais ce menu.',
    sentence: 'Vous l’évitez parce qu’il est mal conçu, c’est bien ça ?',
    added: 'il est mal conçu',
  },
  {
    said: 'Le client rappelle souvent.',
    sentence: 'Le client rappelle parce qu’il est mécontent de votre service ?',
    added: 'mécontent du service',
  },
  {
    said: 'Sur le terrain, je note tout sur mon téléphone.',
    sentence: 'Donc vous notez sur le téléphone, faute d’un outil digne de ce nom ?',
    added: 'faute d’un outil',
  },
]
