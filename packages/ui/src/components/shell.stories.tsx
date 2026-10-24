import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppShell, SidebarFooter, SidebarHeader, SidebarNav, SidebarNavItem } from './app-shell.tsx'
import { BrandIcon, Wordmark } from './brand.tsx'
import { Button } from './button.tsx'
import { SectionTitle } from './count.tsx'
import { DangerZone } from './danger-zone.tsx'
import { FolderIcon, FolderOpenIcon, PlusIcon, UsersIcon } from './icons.tsx'
import { PageBar, PageTitle, Pill } from './page-header.tsx'
import { NewCard, ProjectCard } from './project-card.tsx'
import { Segmented, SegmentedItem } from './segmented.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.tsx'
import { Folder, TeamFolder } from './team-folder.tsx'

const meta = { title: 'Shell and pages', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const sidebar = (
  <>
    <SidebarHeader
      brand={
        <a href="#home" className="rounded-md">
          <Wordmark className="h-[22px]" />
        </a>
      }
      icon={
        <a href="#home" className="rounded-[8px]">
          <BrandIcon />
        </a>
      }
      labels={{ collapse: 'Collapse the sidebar', expand: 'Expand the sidebar' }}
    />
    <SidebarNav aria-label="Main">
      <SidebarNavItem
        icon={<FolderOpenIcon aria-hidden />}
        label="Research projects"
        render={<a href="#home" aria-current="page" />}
        action={
          <Button variant="ghost" size="icon-sm" aria-label="New research project">
            <PlusIcon aria-hidden />
          </Button>
        }
      />
      <SidebarNavItem icon={<UsersIcon aria-hidden />} label="Teams" render={<a href="#teams" />} />
    </SidebarNav>
    <SidebarFooter>
      <span className="px-2 text-muted-foreground">Alex Example</span>
    </SidebarFooter>
  </>
)

export const Home: StoryObj = {
  render: () => (
    <AppShell
      sidebar={sidebar}
      labels={{ openMenu: 'Open the menu', menu: 'Navigation', closeMenu: 'Close the menu' }}
      location="/"
    >
      <div className="grid gap-10">
        <PageTitle
          title="Research projects"
          actions={
            <Segmented aria-label="Language">
              <SegmentedItem pressed>
                EN<span className="sr-only"> English</span>
              </SegmentedItem>
              <SegmentedItem pressed={false} lang="fr">
                FR<span className="sr-only"> Français</span>
              </SegmentedItem>
            </Segmented>
          }
        />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
          <li className="grid">
            <Folder tint={2}>
              <h2 className="text-base font-bold">Payments</h2>
              <p className="text-sm text-muted-foreground">Alex Example, Sam Example</p>
            </Folder>
          </li>
        </ul>
        <section className="grid gap-4">
          <SectionTitle count={3}>Teams</SectionTitle>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[18px]">
            {['Growth', 'Onboarding', 'Payments'].map((name, index) => (
              <li key={name} className="grid">
                <TeamFolder
                  name={name}
                  tint={index}
                  aria-pressed={index === 1}
                  footer={<span>{index + 1} projects</span>}
                />
              </li>
            ))}
          </ul>
        </section>
        <section className="grid gap-4">
          <SectionTitle count={2}>Projects</SectionTitle>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[22px]">
            {['Checkout friction', 'First week experience'].map((name) => (
              <li key={name} className="grid">
                <ProjectCard
                  id={name}
                  title={name}
                  link={<a href={`#${name}`} />}
                  meta={
                    <>
                      <span>2 days ago</span>
                      <span aria-hidden>•</span>
                      <span>Growth</span>
                    </>
                  }
                />
              </li>
            ))}
            <li className="grid">
              <NewCard>New project</NewCard>
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  ),
}

export const StudyPage: StoryObj = {
  parameters: { layout: 'padded' },
  render: () => (
    <article className="grid max-w-5xl gap-8">
      <Tabs defaultValue="analysis">
        <PageBar
          back={<a href="#project" />}
          backLabel="Back to the project"
          crumbs={[
            <a key="projects" href="#projects">
              Projects
            </a>,
            <a key="project" href="#project">
              Checkout friction
            </a>,
          ]}
          title="Ten checkout interviews"
          right={
            <>
              <Pill>
                <FolderIcon aria-hidden />
                Checkout 2026
              </Pill>
              <TabsList aria-label="Study phases">
                <TabsTrigger value="preparation">1 · Preparation</TabsTrigger>
                <TabsTrigger value="fieldwork">2 · Fieldwork</TabsTrigger>
                <TabsTrigger value="analysis">3 · Analysis</TabsTrigger>
              </TabsList>
            </>
          }
        />
        <TabsContent value="preparation">Design the interview guide.</TabsContent>
        <TabsContent value="fieldwork">Run the interviews.</TabsContent>
        <TabsContent value="analysis">The study's Drive folder and its inventory.</TabsContent>
      </Tabs>
      <Tabs defaultValue="overview">
        <TabsList variant="line" aria-label="Project sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content.</TabsContent>
        <TabsContent value="insights">Insights content.</TabsContent>
      </Tabs>
      <DangerZone
        title="Delete this study"
        description="The study and its inventory are removed. Nothing changes in Drive."
      >
        <Button variant="destructive">Delete study</Button>
      </DangerZone>
    </article>
  ),
}
