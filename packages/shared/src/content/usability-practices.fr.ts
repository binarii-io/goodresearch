import type { BestPractices } from './best-practices.types.ts'

export const usabilityPractices: BestPractices = {
  title: 'Bonnes pratiques de test utilisateur',
  intro:
    "Un test utilisateur observe des personnes qui essaient d'atteindre leurs propres objectifs avec une interface. Il montre **où elles bloquent**, pas ce qu'elles disent aimer. Cinq à huit participants par profil révèlent déjà la plupart des problèmes ; ce qui compte le plus, c'est l'écriture des tâches et la neutralité de l'animateur.",
  sections: [
    {
      heading: '1. Cadrer le test',
      blocks: [
        {
          list: [
            "**Un objectif**, tiré de l'objectif de recherche : quelle décision le test doit-il aider à prendre ?",
            '**Des hypothèses** à confirmer ou réfuter : elles décident des tâches à écrire.',
            "**L'interface testée** : un prototype ou l'application en ligne, avec le lien et le compte que les participants utiliseront. Vérifiez les deux sur leur poste avant la première séance.",
            "**Des participants** qui ressemblent aux personnes qui l'utiliseront vraiment. Les collègues qui ont construit l'interface ne sont pas des participants.",
          ],
        },
      ],
    },
    {
      heading: '2. Écrire des tâches réalistes',
      blocks: [
        {
          p: 'Une tâche est un objectif que le participant pourrait avoir dans la vraie vie, donné dans un court scénario. Elle ne dit jamais comment faire.',
        },
        {
          list: [
            '**Un objectif par tâche.** « Trouvez un produit et payez-le », ce sont deux tâches.',
            "**Ne nommez jamais l'interface** : ni bouton, ni menu, ni onglet, ni étapes. « Cliquez sur Exporter » teste la lecture, pas l'interface ; « Envoyez ce rapport à votre responsable » teste l'interface.",
            "**Un critère de réussite** visible à l'écran : ce qui doit être affiché ou fait pour que la tâche compte comme atteinte.",
            "**Des données réalistes** : donnez au participant ce dont il a besoin (un nom de produit, une date) au lieu de le laisser l'inventer.",
            "**Peu de tâches** : prévoyez environ cinq minutes par tâche, et gardez du temps pour l'introduction et le débrief. Une heure contient cinq à huit tâches.",
          ],
        },
      ],
    },
    {
      heading: '3. Mener la séance',
      blocks: [
        {
          list: [
            "**Le consentement d'abord** : dites ce qui est enregistré, que les enregistrements sont lus par un service d'IA, et que les noms et visages ne peuvent pas lui être cachés.",
            "**Pensée à voix haute** : demandez au participant de dire ce qu'il cherche, ce qu'il attend et ce qui le surprend. Rappelez-le doucement s'il se tait.",
            '**Lisez la consigne telle quelle**, de la même façon pour tous, pour que les séances se comparent tâche par tâche.',
            "**Restez neutre** : pas de « super », pas d'indice, pas d'explication de l'interface. Répondez à une question par une question : « Que feriez-vous ? »",
            "**N'aidez qu'en cas de blocage**, après un délai fixé, et dites-le à voix haute (« je vous aide ici ») pour que l'aide soit visible dans l'enregistrement et que la tâche compte comme atteinte avec aide.",
          ],
        },
      ],
    },
    {
      heading: '4. Questions standard',
      blocks: [
        {
          p: 'Deux questionnaires courts donnent des chiffres comparables entre séances et entre versions. Lisez-les tels quels, dans le même ordre.',
        },
        {
          list: [
            '**Question de facilité**, après chaque tâche : une question de 1 (très difficile) à 7 (très facile). Elle désigne les tâches les plus difficiles. Traduction française de la Single Ease Question.',
            "**Échelle d'utilisabilité (SUS)**, à la fin : dix affirmations fixes notées de 1 à 5, dans leur traduction validée (F-SUS). L'app calcule le score ; il se lit en entier, jamais item par item.",
          ],
        },
      ],
    },
    {
      heading: "L'échelle d'utilisabilité (SUS), un standard",
      level: 3,
      blocks: [
        {
          p: "C'est un questionnaire standardisé : sa valeur vient de ce qu'il est passé partout de la même façon. Ne le reformulez, ne l'abrégez, ne le réordonnez et ne le traduisez jamais vous-même.",
        },
        {
          list: [
            '**Quand** : juste après la dernière tâche, avant le débrief, pour que le débrief ne colore pas les réponses.',
            "**Comment** : le participant répond seul, sur la fiche participant, aux dix affirmations dans leur ordre. Demandez une réaction immédiate ; s'il ne peut pas répondre à l'une, la case du milieu (3). Ne dites rien pendant qu'il répond.",
            "**Pourquoi il alterne** : les affirmations impaires sont positives, les paires négatives, pour qu'une réponse donnée sans lire se voie.",
            "**Le score** : pour les affirmations impaires, la réponse moins 1 ; pour les paires, 5 moins la réponse ; la somme multipliée par 2,5 donne un score de 0 à 100. Ce n'est pas un pourcentage. L'app le calcule.",
            "**Le lire** : environ 68 est la moyenne de nombreuses études ; au-dessus de 80, il est généralement jugé excellent ; en dessous de 68, l'utilisabilité est à travailler. Comparez un produit avec lui-même d'une version à l'autre plutôt qu'avec un autre produit : deux produits au même score peuvent avoir des forces différentes.",
            '**Combien de personnes** : cinq à dix donnent une première lecture en complément de l’observation ; vingt à trente pour un score robuste.',
          ],
        },
      ],
    },
    {
      heading: '5. Débrief et séance pilote',
      blocks: [
        {
          list: [
            "**Les questions de débrief** portent sur l'expérience entière : ce qui a été le plus difficile, ce qui a manqué, ce qu'ils changeraient.",
            '**Une séance pilote** avec une personne extérieure au projet révèle les consignes floues, les liens cassés et une séance trop longue avant les vrais participants.',
            '**Une relecture par une autre personne** repère les formulations orientées que vous ne voyez plus.',
          ],
        },
      ],
    },
    {
      heading: '6. Comment les séances seront lues',
      blocks: [
        {
          p: "Chaque séance enregistrée est lue tâche par tâche au regard du protocole : la tâche a-t-elle été atteinte, avec ou sans aide, où les personnes ont-elles hésité ou se sont-elles trompées, et qu'ont-elles dit. Cette lecture ne marche que si chaque séance suit les mêmes tâches avec les mêmes consignes. Chaque observation garde son moment dans l'enregistrement, pour que chacun puisse le revoir.",
        },
      ],
    },
    {
      heading: 'Sources',
      blocks: [
        {
          list: [
            'Nielsen, J. (1993). *Usability Engineering*. Academic Press.',
            'Rubin, J. & Chisnell, D. (2008). *Handbook of Usability Testing* (2e éd.). Wiley.',
            "ISO 9241-11:2018. *Ergonomie de l'interaction homme-système — Utilisabilité : définitions et concepts*.",
            'Brooke, J. (1996). SUS: a "quick and dirty" usability scale. In *Usability Evaluation in Industry*. Taylor & Francis. (Créée en 1986, libre d’usage.)',
            'Bangor, A., Kortum, P. T. & Miller, J. T. (2008). An empirical evaluation of the System Usability Scale. *International Journal of Human–Computer Interaction*, 24(6).',
            'Giffaut, C. & Favreau, A. (2023). SUS : un atout pour évaluer votre produit/service.',
            'Gronier, G. & Baudet, A. (2021). Psychometric evaluation of the F-SUS: creation and validation of the French version of the System Usability Scale. *International Journal of Human–Computer Interaction*.',
            'Sauro, J. & Dumas, J. S. (2009). Comparison of three one-question, post-task usability questionnaires. *Proceedings of CHI 2009*.',
          ],
        },
      ],
    },
  ],
}
