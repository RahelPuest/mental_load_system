import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell.js'
import { useSession } from './lib/session.js'
import { LoginPage } from './pages/LoginPage.js'
import { NowPage } from './pages/NowPage.js'
import { SkeletonList } from './design/index.js'

/**
 * Nachladen statt Vorladen: Der Einstieg – Jetzt-Ansicht und Erfassen – kommt sofort.
 * Auf schwachem Netz ist das der Unterschied zwischen „geht" und „später", und genau dann
 * wird dieses Produkt am ehesten gebraucht.
 */
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.js').then((m) => ({ default: m.OnboardingPage })))
const InboxPage = lazy(() => import('./pages/InboxPage.js').then((m) => ({ default: m.InboxPage })))
const DomainsPage = lazy(() => import('./pages/DomainsPage.js').then((m) => ({ default: m.DomainsPage })))
const DomainDetailPage = lazy(() => import('./pages/DomainDetailPage.js').then((m) => ({ default: m.DomainDetailPage })))
const ProcessPage = lazy(() => import('./pages/ProcessPage.js').then((m) => ({ default: m.ProcessPage })))
const PlaybooksPage = lazy(() => import('./pages/PlaybooksPage.js').then((m) => ({ default: m.PlaybooksPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage.js').then((m) => ({ default: m.CalendarPage })))
const FamilyPage = lazy(() => import('./pages/FamilyPage.js').then((m) => ({ default: m.FamilyPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then((m) => ({ default: m.SettingsPage })))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage.js').then((m) => ({ default: m.KnowledgePage })))
const WatchPage = lazy(() => import('./pages/WatchPage.js').then((m) => ({ default: m.WatchPage })))
const ProcessesPage = lazy(() => import('./pages/ProcessesPage.js').then((m) => ({ default: m.ProcessesPage })))
const OverviewPage = lazy(() => import('./pages/OverviewPage.js').then((m) => ({ default: m.OverviewPage })))
const HelpPage = lazy(() => import('./pages/HelpPage.js').then((m) => ({ default: m.HelpPage })))
const PlanPage = lazy(() => import('./pages/PlanPage.js').then((m) => ({ default: m.PlanPage })))
const MealsPage = lazy(() => import('./pages/MealsPage.js').then((m) => ({ default: m.MealsPage })))
const JoinPage = lazy(() => import('./pages/JoinPage.js').then((m) => ({ default: m.JoinPage })))

const Pending = () => <SkeletonList count={2} />

export function App() {
  const { status, households } = useSession()

  if (status === 'loading') {
    return (
      <div className="content">
        <SkeletonList count={2} />
      </div>
    )
  }

  // Der Beitritt braucht die Vorschau auch ohne Anmeldung – sonst müsste man sich
  // registrieren, um zu erfahren, wozu man überhaupt eingeladen wurde.
  const joinToken = window.location.pathname.startsWith('/beitreten/')
  if (status === 'anonymous' && joinToken) {
    return (
      <Suspense fallback={<Pending />}>
        <Routes>
          <Route path="/beitreten/:token" element={<JoinPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    )
  }

  if (status === 'anonymous') return <LoginPage />

  if (households.length === 0) {
    return (
      <Suspense fallback={<Pending />}>
        <OnboardingPage />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<Pending />}>
      <Routes>
        <Route path="/beitreten/:token" element={<JoinPage />} />
        <Route element={<AppShell />}>
          <Route path="/jetzt" element={<NowPage />} />
          <Route path="/eingang" element={<InboxPage />} />
          <Route path="/bereiche" element={<DomainsPage />} />
          <Route path="/bereiche/:domainId" element={<DomainDetailPage />} />
          {/*
            Dieselbe Seite, ein Abschnitt davon in voller Länge (docs/54).
            Der Deckel auf der Übersicht braucht ein Ziel – und der Verlauf einen Ort.
          */}
          <Route path="/bereiche/:domainId/:section" element={<DomainDetailPage />} />
          <Route path="/vorgang/:processId" element={<ProcessPage />} />
          <Route path="/familie" element={<FamilyPage />} />
          <Route path="/vorgaenge" element={<ProcessesPage />} />
          <Route path="/wissen" element={<KnowledgePage />} />
          <Route path="/regeln" element={<WatchPage />} />
          {/* Die Seite hieß einmal „Beobachtung". Gespeicherte Links dürfen davon nichts merken. */}
          <Route path="/beobachtung" element={<Navigate to="/regeln" replace />} />
          <Route path="/kalender" element={<CalendarPage />} />
          <Route path="/ablaeufe" element={<PlaybooksPage />} />
          <Route path="/uebersicht" element={<OverviewPage />} />
          <Route path="/hilfe" element={<HelpPage />} />
          <Route path="/plan" element={<PlanPage />} />
          {/* Essensplanung (docs/63). Der nackte Pfad ist der Wochenplan. */}
          <Route path="/essen" element={<MealsPage />} />
          <Route path="/essen/:section" element={<MealsPage />} />
          {/* Die alten Unterpfade bleiben gültig – gespeicherte Links dürfen nicht brechen. */}
          <Route path="/familie/ablaeufe" element={<Navigate to="/ablaeufe" replace />} />
          <Route path="/familie/kalender" element={<Navigate to="/kalender" replace />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
          <Route path="/einstellungen/:section" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/jetzt" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
