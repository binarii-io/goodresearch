import type { BestPractices } from './best-practices.types.ts'

export const bestPractices: BestPractices = {
  title: 'Bonnes pratiques d’entretien',
  intro:
    'Ce document accompagne le guide d’entretien de l’étude. Le guide dit **quoi** demander ; ce document dit **comment** mener l’entretien.',
  sections: [
    {
      heading: 'Avant l’entretien',
      blocks: [
        {
          list: [
            '**Objectif clair** : relire l’objectif de recherche, les thématiques et les hypothèses à confirmer ou infirmer.',
            '**Recrutement** : viser une diversité de profils (métiers, équipes, ancienneté, rapport au sujet) et prévoir quelques entretiens de plus que nécessaire (absences, reports).',
            '**Format** : 45 à 60 minutes, à distance en visioconférence ou dans le contexte du participant, pour le voir dans son environnement réel.',
            '**Rôles** : un seul intervieweur, qui mène l’échange. Au plus deux observateurs, qui prennent des notes et ne parlent pas, sauf invitation à la fin.',
            '**Pas de supérieur hiérarchique** du participant dans la salle ou dans l’appel.',
            '**Logistique** : invitation envoyée avec l’objet et la durée de la séance ; enregistrement et transcription prêts ; guide imprimé ou ouvert, mais pas lu mot à mot.',
          ],
        },
      ],
    },
    { heading: 'Les quatre phases', blocks: [] },
    {
      heading: '1. Introduction (≈ 5 min)',
      level: 3,
      blocks: [
        {
          list: [
            'Se présenter, présenter les observateurs et leur rôle.',
            'Rappeler le contexte et l’objectif : on cherche à comprendre des pratiques, pas à évaluer la personne. Il n’y a pas de bonne ou de mauvaise réponse.',
            'Remercier pour le temps accordé.',
            'Rappeler la confidentialité : ce qui est dit est anonymisé dans la restitution.',
            '**Demander l’accord (écrit ou oral) pour l’enregistrement**, avant de le lancer.',
          ],
        },
      ],
    },
    {
      heading: '2. Questions introductives (5 à 10 min)',
      level: 3,
      blocks: [
        {
          list: [
            'La personne se présente : poste, missions, équipe, ancienneté, rapport au sujet.',
            'Ces informations servent à segmenter les profils à l’analyse : les recueillir de la même façon avec chaque participant.',
          ],
        },
      ],
    },
    {
      heading: '3. Questions thématiques (30 à 40 min)',
      level: 3,
      blocks: [
        {
          list: [
            'Le cœur de l’entretien : une section par thématique de recherche.',
            'Aborder **chaque thématique avec chaque participant**, sinon une absence de réponse n’est pas interprétable.',
            'Suivre l’ordre du guide sans s’y enfermer : si la personne aborde d’elle-même une thématique plus loin, la suivre, puis revenir aux thématiques pas encore couvertes.',
          ],
        },
      ],
    },
    {
      heading: '4. Conclusion (≈ 5 min)',
      level: 3,
      blocks: [
        {
          list: [
            '« Souhaitez-vous ajouter quelque chose ? »',
            'Laisser les observateurs poser une question s’ils en ont une.',
            'Remercier et présenter les prochaines étapes (analyse, restitution).',
            'Demander si la personne accepterait de participer à d’autres recherches.',
          ],
        },
      ],
    },
    {
      heading: 'Poser les questions',
      blocks: [
        {
          list: [
            '**Ouvertes** et centrées sur le **vécu** : « Racontez-moi la dernière fois que… », « Comment faites-vous aujourd’hui pour… ? »',
            '**Une idée par question**, avec les mots du participant plutôt que le jargon de l’équipe projet.',
            '**À éviter** : les questions qui suggèrent la réponse (« Vous trouvez ça compliqué, non ? »), les questions fermées (oui ou non) en question principale, les questions hypothétiques (« Si vous aviez… ») ou sur le futur (« Utiliseriez-vous… ? »), et les demandes de solution (« Que faudrait-il développer ? ») : s’intéresser plutôt aux difficultés concrètes rencontrées.',
          ],
        },
      ],
    },
    {
      heading: 'Les relances',
      blocks: [
        {
          list: [
            'Faire préciser : « C’est-à-dire ? », « Pouvez-vous m’en dire plus ? »',
            'Demander un exemple concret : « Vous souvenez-vous d’une fois où… ? »',
            'Creuser les raisons : « Pourquoi ? », « Qu’est-ce qui vous fait dire ça ? »',
            'Dérouler la séquence : « Et ensuite ? », « Que s’est-il passé après ? »',
            'Reformuler pour vérifier sa compréhension : « Si je comprends bien… »',
            '**Ne jamais contredire** : si une affirmation semble fausse, demander de préciser.',
            '**Accepter les silences** : attendre quelques secondes après une réponse, la personne complète souvent d’elle-même.',
          ],
        },
      ],
    },
    {
      heading: 'Posture',
      blocks: [
        {
          list: [
            '**Neutralité bienveillante** : mettre de côté ses a priori et ne pas défendre le produit ou le projet.',
            '**Écoute active** : regarder la personne, acquiescer, ne pas rester dans ses notes.',
            '**Ne pas analyser pendant l’entretien** : on recueille maintenant, on analyse ensuite.',
            'Parler peu : le participant doit avoir la très grande majorité du temps de parole (voir les seuils ci-dessous).',
          ],
        },
      ],
    },
    {
      heading: 'Biais à éviter',
      blocks: [
        {
          list: [
            '**Biais de conformité** : le participant veut faire plaisir. Ne montrer ni son opinion ni ses attentes, et ne pas réagir plus chaleureusement à une réponse qu’à une autre.',
            '**Biais d’autorité** : la présence d’un supérieur hiérarchique change les réponses. Ne pas l’inviter.',
            '**Biais du coût irrécupérable** : ne pas évoquer le temps passé, la taille de l’équipe ou le budget du projet, qui poussent à ménager l’existant.',
          ],
        },
      ],
    },
    {
      heading: 'Ce qui est mesuré après l’entretien',
      blocks: [
        {
          p: 'Chaque entretien enregistré peut être relu pour évaluer la façon dont l’intervieweur l’a mené. Connaître les indicateurs avant l’entretien aide à rester neutre.',
        },
      ],
    },
    {
      heading: 'Part de parole de l’intervieweur',
      level: 3,
      blocks: [
        { p: 'Part des mots prononcés par l’intervieweur sur l’ensemble de l’entretien.' },
        {
          list: [
            '**30 % ou moins** : bien, le participant s’exprime.',
            '**Jusqu’à 40 %** : à surveiller.',
            '**Plus de 40 %** : l’intervieweur parle trop, le participant n’a pas la place de développer.',
          ],
        },
        {
          p: 'Pour rester sous 30 % : des questions courtes, une à la fois, sans expliquer son propre point de vue, et laisser les silences plutôt que de les combler.',
        },
      ],
    },
    {
      heading: 'Les interventions de l’intervieweur',
      level: 3,
      blocks: [
        {
          p: 'Chaque intervention de l’intervieweur est classée en question du guide, relance, reformulation, contexte ou logistique, ou opinion et question orientée. Deux parts sont calculées, en mots :',
        },
        {
          list: [
            '**Opinions et questions orientées** : 5 % ou moins, c’est bien ; jusqu’à 10 %, à surveiller ; au-delà, un problème. C’est le biais principal : il oriente les réponses.',
            '**Relances et questions du guide** : 60 % ou plus, c’est bien ; à partir de 40 %, à surveiller ; en dessous, un problème. Un bon entretien, ce sont surtout des questions et des relances, pas des commentaires.',
          ],
        },
      ],
    },
    {
      heading: 'Couverture du guide',
      level: 3,
      blocks: [
        {
          p: 'Le nombre de questions principales du guide réellement posées. C’est un indicateur, pas une note : l’ordre peut changer et une question peut être sautée si la personne y a déjà répondu. Chaque **thématique**, en revanche, doit être abordée avec chaque participant.',
        },
      ],
    },
    {
      heading: 'Après l’entretien',
      blocks: [
        {
          list: [
            'Envoyer un message de remerciement.',
            'Prendre 10 minutes tout de suite avec les observateurs : impressions marquantes, verbatims forts, thématiques peu abordées à mieux traiter la prochaine fois.',
            'Ranger l’enregistrement et la transcription dans le dossier de l’étude, et mettre à jour le statut dans le planning des entretiens.',
            'Ajuster le guide si une question ne fonctionne pas, sans changer les thématiques, pour que les entretiens restent comparables.',
          ],
        },
      ],
    },
    {
      heading: 'Penser à l’analyse',
      blocks: [
        {
          list: [
            'Chaque thématique du guide correspond à une catégorie d’analyse : les verbatims seront classés par thématique, puis comptés (combien de participants évoquent quoi).',
            'Les hypothèses posées en amont seront confirmées ou infirmées à l’analyse.',
            'Les questions introductives alimentent les profils des participants dans la restitution.',
          ],
        },
      ],
    },
    {
      heading: 'Check-list',
      blocks: [
        {
          checklist: [
            'Objectif, thématiques et hypothèses relus',
            'Invitation envoyée, planning à jour',
            'Rôles attribués : un intervieweur, au plus deux observateurs',
            'Accord d’enregistrement demandé avant de commencer',
            'Chaque thématique abordée',
            'Questions ouvertes, sans suggérer la réponse',
            'Part de parole de l’intervieweur courte (30 % ou moins), surtout des questions et des relances',
            'Conclusion : parole libre, prochaines étapes, remerciements',
            'Débrief immédiat et fichiers rangés dans le dossier',
          ],
        },
      ],
    },
  ],
}
