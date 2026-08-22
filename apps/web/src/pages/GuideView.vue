<script setup lang="ts">
import AppLink from '../components/AppLink.vue'

const releaseUrl = 'https://github.com/Maubry94/MemeDrop/releases/latest'

const setupSteps = [
  {
    title: 'Télécharge et installe MemeDrop',
    description: 'Récupère la dernière version Windows sur GitHub, puis lance l’installateur.',
  },
  {
    title: 'Configure le serveur',
    description: 'Renseigne l’adresse et la clé fournies par la personne qui héberge MemeDrop. Elles seront conservées sur cet appareil.',
  },
  {
    title: 'Associe ton compte Discord',
    description: 'Choisis « Continuer avec Discord », autorise la connexion, puis reviens dans MemeDrop.',
  },
]

const commandGroups = [
  {
    title: 'Envoyer un drop',
    commands: [
      { name: '/drop', description: 'Envoie une image, une vidéo ou un son à tout le monde, ou à une cible.' },
      { name: '/dropme', description: 'Envoie un fichier uniquement sur ton propre overlay, idéal pour tester.' },
      { name: '/dropyt', description: 'Diffuse une vidéo YouTube à partir de son lien public.' },
      { name: '/droptt', description: 'Diffuse une vidéo TikTok à partir du lien complet de la vidéo.' },
      { name: '/redrop', description: 'Renvoie l’un de tes drops récents, avec une nouvelle cible ou légende si besoin.' },
    ],
  },
  {
    title: 'Suivre et gérer',
    commands: [
      { name: '/dropstatus', description: 'Affiche les personnes connectées, leur disponibilité et leur version.' },
      { name: '/download', description: 'Affiche le lien vers la dernière version de l’application desktop.' },
      { name: '/help', description: 'Retrouve le résumé des commandes directement dans Discord.' },
    ],
  },
]

const options = [
  { name: 'legende', description: 'Ajoute un texte sous le média dans l’overlay.' },
  { name: 'cible', description: 'Envoie le drop uniquement à une personne connectée et disponible.' },
  { name: 'anonyme', description: 'Masque ton pseudo et ton avatar, sans t’empêcher d’arrêter ton drop.' },
]

const troubleshooting = [
  {
    title: 'Aucun destinataire disponible',
    answer: 'Vérifie que l’application est ouverte, connectée au bon compte Discord et que les drops sont activés.',
  },
  {
    title: 'La connexion Discord ne se termine pas',
    answer: 'Relance la connexion depuis l’application. Une session OAuth ancienne ou déjà utilisée ne peut pas être reprise.',
  },
  {
    title: 'Le média ne s’affiche pas',
    answer: 'Essaie un fichier image, vidéo ou audio courant. Pour YouTube et TikTok, utilise le lien public complet de la vidéo.',
  },
  {
    title: 'Le serveur semble indisponible',
    answer: 'Consulte la page État. Le site peut rester accessible même lorsque le bot ou le serveur MemeDrop redémarre.',
  },
]
</script>

<template>
  <div class="page-container py-12 sm:py-16 lg:py-20">
    <header class="max-w-3xl">
      <p class="eyebrow">Guide d’utilisation</p>
      <h1 class="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">De l’installation au premier drop.</h1>
      <p class="mt-5 text-base leading-7 text-slate-300 sm:text-lg">
        Installe l’application, configure ton serveur, associe Discord et choisis la commande adaptée.
      </p>
      <div class="mt-7">
        <AppLink :href="releaseUrl" external>Télécharger la dernière version</AppLink>
      </div>
    </header>

    <nav class="mt-10 border-y border-white/10 py-4" aria-label="Sommaire du guide">
      <ul class="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-slate-300">
        <li><a href="#installation" class="rounded hover:text-sky-200">Installation</a></li>
        <li><a href="#commandes" class="rounded hover:text-sky-200">Commandes</a></li>
        <li><a href="#options" class="rounded hover:text-sky-200">Options</a></li>
        <li><a href="#controle" class="rounded hover:text-sky-200">Contrôle</a></li>
        <li><a href="#depannage" class="rounded hover:text-sky-200">Dépannage</a></li>
      </ul>
    </nav>

    <div class="mt-12 grid gap-14 sm:mt-16 sm:gap-20">
      <section id="installation" class="scroll-mt-24" aria-labelledby="installation-title">
        <p class="eyebrow">01 · Bien démarrer</p>
        <h2 id="installation-title" class="mt-3 text-2xl font-black text-white sm:text-3xl">Installer et connecter l’application</h2>
        <ol class="mt-7 grid gap-4 lg:grid-cols-3">
          <li v-for="(step, index) in setupSteps" :key="step.title" class="surface-card p-5">
            <span class="text-xs font-black text-sky-300">ÉTAPE {{ index + 1 }}</span>
            <h3 class="mt-3 text-base font-bold text-white">{{ step.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-slate-300">{{ step.description }}</p>
          </li>
        </ol>
        <aside class="mt-4 rounded-xl border border-sky-300/20 bg-sky-400/10 p-4 text-sm leading-6 text-sky-100">
          <strong>Bon à savoir :</strong> les destinataires doivent laisser MemeDrop ouvert, être connectés et avoir la réception des drops activée.
        </aside>
      </section>

      <section id="commandes" class="scroll-mt-24" aria-labelledby="commands-title">
        <p class="eyebrow">02 · Dans Discord</p>
        <h2 id="commands-title" class="mt-3 text-2xl font-black text-white sm:text-3xl">Choisir la bonne commande</h2>
        <div class="mt-7 grid gap-5 lg:grid-cols-2">
          <section v-for="(group, groupIndex) in commandGroups" :key="group.title" class="surface-card overflow-hidden" :aria-labelledby="`command-group-${groupIndex}`">
            <h3 :id="`command-group-${groupIndex}`" class="border-b border-white/10 px-5 py-4 text-base font-bold text-white">{{ group.title }}</h3>
            <dl class="divide-y divide-white/10">
              <div v-for="command in group.commands" :key="command.name" class="grid gap-2 px-5 py-4 min-[480px]:grid-cols-[6.5rem_1fr]">
                <dt>
                  <code class="rounded-md border border-sky-300/20 bg-sky-400/10 px-2 py-1 text-sm font-bold text-sky-200">{{ command.name }}</code>
                </dt>
                <dd class="text-sm leading-6 text-slate-300">{{ command.description }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </section>

      <section id="options" class="scroll-mt-24" aria-labelledby="options-title">
        <p class="eyebrow">03 · Personnaliser</p>
        <h2 id="options-title" class="mt-3 text-2xl font-black text-white sm:text-3xl">Options utiles des drops</h2>
        <div class="mt-7 grid gap-4 md:grid-cols-3">
          <article v-for="option in options" :key="option.name" class="rounded-xl border border-white/10 bg-slate-900/50 p-5">
            <code class="text-sm font-bold text-indigo-200">{{ option.name }}</code>
            <p class="mt-3 text-sm leading-6 text-slate-300">{{ option.description }}</p>
          </article>
        </div>
      </section>

      <section id="controle" class="scroll-mt-24" aria-labelledby="control-title">
        <div class="surface-card grid gap-7 p-5 sm:p-7 lg:grid-cols-2">
          <div>
            <p class="eyebrow">04 · Garder la main</p>
            <h2 id="control-title" class="mt-3 text-2xl font-black text-white sm:text-3xl">Files d’attente et contrôle</h2>
            <p class="mt-4 text-sm leading-6 text-slate-300">
              Les drops envoyés à tout le monde rejoignent la file globale. Les drops ciblés et
              <code class="text-sky-200">/dropme</code> rejoignent la file de la personne concernée.
            </p>
          </div>
          <ul class="grid gap-3 text-sm leading-6 text-slate-300">
            <li class="flex gap-3"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-sky-300" aria-hidden="true" />Les drops suivants patientent lorsqu’un média est déjà actif.</li>
            <li class="flex gap-3"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-sky-300" aria-hidden="true" />« Passer le drop » le ferme uniquement sur ton propre écran.</li>
            <li class="flex gap-3"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-sky-300" aria-hidden="true" />« Arrêter mon drop » l’interrompt chez tous les destinataires tant que tu en es propriétaire.</li>
          </ul>
        </div>
      </section>

      <section id="depannage" class="scroll-mt-24" aria-labelledby="troubleshooting-title">
        <p class="eyebrow">05 · En cas de souci</p>
        <h2 id="troubleshooting-title" class="mt-3 text-2xl font-black text-white sm:text-3xl">Dépannage rapide</h2>
        <div class="mt-7 grid gap-3">
          <details v-for="item in troubleshooting" :key="item.title" class="group rounded-xl border border-white/10 bg-slate-900/50">
            <summary class="rounded-xl px-5 py-4 text-sm font-bold text-white outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300 motion-reduce:transition-none">
              {{ item.title }}
            </summary>
            <p class="border-t border-white/10 px-5 py-4 text-sm leading-6 text-slate-300">{{ item.answer }}</p>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>
