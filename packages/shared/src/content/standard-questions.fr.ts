import type { StandardQuestions } from './standard-questions.types.ts'

/**
 * French text of the System Usability Scale from its validated translation, the F-SUS (Gronier & Baudet, 2021),
 * and our translation of the Single Ease Question (Sauro & Dumas, 2009), named as such in the best practices.
 */
export const standardQuestions: StandardQuestions = {
  'sus-v1': {
    title: "Échelle d'utilisabilité (SUS)",
    scale: { points: 5, low: "Pas du tout d'accord", high: "Tout à fait d'accord" },
    instructions:
      "Pour chacune des affirmations suivantes, cochez la case qui décrit le mieux votre réaction au système aujourd'hui. Donnez votre réaction immédiate, sans réfléchir longuement. Répondez à toutes les affirmations ; si vous ne pouvez pas répondre à l'une d'elles, cochez la case du milieu (3).",
    facilitatorNote:
      "Juste après la dernière tâche et avant le débrief : le participant répond seul, aux dix affirmations, dans cet ordre, mot pour mot, sans commentaire de votre part. Les affirmations alternent volontairement positif et négatif : ne les reformulez ni ne les réordonnez jamais. L'app calcule le score ; il se lit en entier, jamais affirmation par affirmation.",
    items: [
      "Je pense que j'aimerais utiliser ce système fréquemment.",
      "J'ai trouvé ce système inutilement complexe.",
      "J'ai trouvé ce système facile à utiliser.",
      "Je pense que j'aurais besoin de l'aide d'un technicien pour être capable d'utiliser ce système.",
      "J'ai trouvé que les différentes fonctions de ce système ont été bien intégrées.",
      "J'ai trouvé qu'il y avait trop d'incohérences dans ce système.",
      'Je suppose que la plupart des gens apprendraient à utiliser ce système très rapidement.',
      "J'ai trouvé ce système très lourd à utiliser.",
      'Je me suis senti(e) très en confiance en utilisant ce système.',
      "J'ai eu besoin d'apprendre beaucoup de choses avant de pouvoir utiliser ce système.",
    ],
  },
  'seq-v1': {
    title: 'Facilité de la tâche',
    question: "Dans l'ensemble, cette tâche a-t-elle été difficile ou facile à réaliser ?",
    scale: { points: 7, low: 'Très difficile', high: 'Très facile' },
  },
  defaults: {
    consent:
      "Merci de participer. Aujourd'hui, nous testons une interface, pas vous : il n'y a pas de bonne ou de mauvaise réponse, et tout ce qui vous semble difficile nous aide à l'améliorer.\n\n" +
      "La séance est enregistrée : votre écran, votre voix et votre image. Les enregistrements seront lus par un service d'intelligence artificielle (IA) pour nous aider à analyser la séance, et les noms et visages qu'ils contiennent ne peuvent pas lui être cachés. Seule l'équipe de recherche voit les enregistrements.\n\n" +
      "Participer est votre choix. Vous pouvez arrêter à tout moment, sans avoir à vous justifier. Acceptez-vous de participer et d'être enregistré(e) ?",
    thinkAloud:
      "Pendant que vous utilisez l'interface, pensez à voix haute : dites ce que vous cherchez, ce que vous attendez et ce qui vous surprend. Il se peut que je ne dise rien : c'est voulu, pour voir comment vous feriez seul(e).",
  },
}
