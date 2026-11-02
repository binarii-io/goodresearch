import type { BestPractices } from './best-practices.types.ts'

export const questionnairePractices: BestPractices = {
  title: 'Bonnes pratiques du questionnaire',
  intro:
    'Un questionnaire recueille des **données quantifiables** grâce à des items construits avec méthode, pour un objectif de recherche précis. La plupart des biais se jouent avant la première réponse : dans l’ordre de construction, la formulation et la façon de l’envoyer.',
  sections: [
    {
      heading: '1. Structurer avant de rédiger',
      blocks: [
        {
          p: 'Construisez dans cet ordre : objectif, thématiques, sous-thématiques éventuelles, et seulement ensuite les items. Partir des items disperse le questionnaire et en fait entrer d’inutiles.',
        },
        {
          list: [
            '**Un objectif concret** : que va-t-on précisément mesurer, décrire ou comparer ?',
            '**Des thématiques** : demandez-vous « de quelles informations ai-je besoin ? ». Réfléchissez à une ou deux personnes, puis vérifiez auprès d’experts ou de travaux publiés.',
            '**Construisez à plusieurs** : un autre regard à chaque étape écarte tôt les biais.',
          ],
        },
      ],
    },
    {
      heading: '2. Rédiger les items',
      blocks: [
        {
          p: 'Gardez seulement les items nécessaires. Un item n’est pas toujours une question : ce peut être une affirmation sur laquelle on se positionne.',
        },
        {
          list: [
            '**Un fait** : un item catégoriel, oui ou non, choix forcé ou choix multiple.',
            '**Une perception, une opinion, un ressenti** : une échelle de Likert. Sept points laissent assez de choix et limitent les écarts entre individus.',
            '**Une question ouverte** : un complément, plus difficile à interpréter. Elle laisse les personnes s’exprimer et casse une longue série.',
          ],
        },
        {
          p: 'Une idée par item, dans les mots du participant. Évitez les questions doubles, les négations, les formulations orientées et les mots absolus comme « toujours ».',
        },
      ],
    },
    {
      heading: '3. Présenter et ordonner',
      blocks: [
        {
          list: [
            '**Variez pour garder l’attention** : par exemple une question ouverte tous les 10 items fermés environ, contre la fatigue et les réponses automatiques.',
            '**Restez cohérent** : la même légende sur toutes les échelles, et la même structure de phrase dans les items d’une échelle.',
            '**Randomisez quand c’est possible** : cela répartit les effets de fatigue, d’ennui et d’apprentissage. Dites clairement ce qui ne peut pas l’être : ici, l’ordre des thématiques reste fixe.',
          ],
        },
      ],
    },
    {
      heading: '4. Avant l’envoi',
      blocks: [
        {
          p: '**Faites relire** par au moins une autre personne, puis prétestez auprès de quelques participants naïfs, qui ne l’ont pas construit : est-ce compris, quelque chose bloque-t-il ?',
        },
        {
          p: '**Informez les personnes.** Un court texte de consentement donne l’objectif, le format et la durée, l’anonymat et l’usage des données, précise qu’il n’y a ni bonne ni mauvaise réponse et que la participation est libre. Annoncez à l’avance les thèmes sensibles (santé, vécu, habitudes personnelles). Refuser met fin au questionnaire. Terminez par un remerciement.',
        },
        {
          p: '**Ne demandez que le nécessaire.** Évitez ce qui est directement lié à une personne, comme un prénom ou une adresse e-mail. Si des personnes veulent les résultats, proposez une seule adresse facultative à la fin, servant uniquement à les envoyer, et supprimez-la ensuite : elle reste dans le formulaire et sa feuille tant que personne ne le fait.',
        },
        {
          p: '**Limitez les interactions sociales.** Répondre seul réduit le biais de désirabilité sociale.',
        },
        {
          list: [
            '**Recrutez** : envoyez aux personnes correspondant à la cible, ou largement puis filtrez. Dans les deux cas, placez au début quelques items de profilage pour vérifier qui a répondu.',
            '**Taille de l’échantillon** : pas de seuil universel. Elle dépend des objectifs, du nombre de paramètres et de l’analyse prévue.',
          ],
        },
      ],
    },
    {
      heading: '5. Penser à l’analyse dès le début',
      blocks: [
        {
          p: 'Choisissez chaque item en sachant ce que vous en ferez. Cette partie vient de la pratique courante des enquêtes.',
        },
        {
          list: [
            '**Les échelles de Likert** sont ordonnées, ce ne sont pas des mesures : lisez la distribution et la médiane plutôt qu’une moyenne seule.',
            '**Les choix** donnent des effectifs et des parts. Croisez-les avec le profilage seulement si les groupes sont assez grands, et montrez toujours le nombre de réponses.',
            '**Les réponses ouvertes** se lisent par thème, une personne validant ce qui en ressort.',
            '**Avant de lire un résultat**, écartez les personnes hors cible et celles qui ont refusé, et dites combien ont été écartées.',
          ],
        },
      ],
    },
    {
      heading: 'Liste de vérification',
      blocks: [
        {
          checklist: [
            'Un objectif concret, puis les thématiques, puis les items',
            'Chaque item sert l’objectif et dit quelle analyse il permet',
            'Les faits en choix, les perceptions en échelles',
            'Une seule légende sur toutes les échelles',
            'Consentement, thèmes sensibles annoncés, remerciement',
            'Aucune donnée directement identifiante',
            'Relu par une autre personne et prétesté',
            'Recrutement et nombre visé écrits',
          ],
        },
      ],
    },
    {
      heading: 'Sources',
      blocks: [
        {
          p: 'Les quatre étapes suivent J. Desdevises, « Comment construire un questionnaire en 4 étapes », OCTO Talks, 2022, qui cite notamment Alwin & Krosnick 1991 et Tourangeau et al. 2000.',
        },
      ],
    },
  ],
}
