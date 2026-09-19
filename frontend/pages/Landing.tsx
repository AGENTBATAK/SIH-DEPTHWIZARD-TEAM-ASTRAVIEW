import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from '../components/hero/Hero'
import { SpacePrologue } from '../components/prologue/SpacePrologue'
import { StageLayer } from '../components/terrain/StageLayer'
import { WhySection } from '../components/sections/WhySection'
import { PixelsToElevation } from '../components/storytelling/PixelsToElevation'
import { DepthComparator } from '../components/compare/DepthComparator'
import { UploadSection } from '../components/upload/UploadSection'
import { ExplorerSection } from '../components/sections/ExplorerSection'
import { MeasurementSection } from '../components/sections/MeasurementSection'
import { AnalyticsSection } from '../components/analytics/AnalyticsSection'
import { CalibrationSection } from '../components/calibration/CalibrationSection'
import { ArchitectureSection } from '../components/architecture/ArchitectureSection'
import { ApplicationsSection } from '../components/applications/ApplicationsSection'
import { ResearchSection } from '../components/research/ResearchSection'
import { FinalCTA } from '../components/cta/FinalCTA'
import { ScrollTrigger, scrollToSection, useSmoothScroll } from '../hooks/useSmoothScroll'

/**
 * The landing page.
 *
 * Section order follows the pipeline itself: establish the problem, show the
 * transformation, let the visitor put their own image through it, then hand
 * them the tool, then justify it. Smooth scroll is enabled here and only here —
 * the explorer route needs raw wheel and pointer events.
 *
 * The first two sections share one WebGL stage. `StageLayer` sits behind both,
 * `SpacePrologue` scrubs a camera from orbit down onto the terrain, and `Hero`
 * is the DOM that lands on top of it. They are separate sections in the flow
 * but a single continuous shot on screen.
 */
export function Landing({ booted }: { booted: boolean }) {
  useSmoothScroll(booted)
  const location = useLocation()

  // Arriving from the explorer with a target section.
  useEffect(() => {
    const target = (location.state as { scrollTo?: string } | null)?.scrollTo
    if (!target) return
    const id = window.setTimeout(() => scrollToSection(target), 120)
    return () => window.clearTimeout(id)
  }, [location.state])

  // Sections mount progressively and change height as data loads; without a
  // refresh, every pinned trigger below the fold is measured against a stale
  // layout and fires at the wrong scroll position.
  useEffect(() => {
    if (!booted) return
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 300)
    return () => window.clearTimeout(id)
  }, [booted])

  return (
    <main>
      {/* Prologue, hero, and the stage they share. `StageLayer` owns both how
          the canvas is positioned and when it stops being the page's
          background — see the note in that file; neither is as obvious as it
          looks. */}
      <div className="relative">
        <StageLayer />

        <div className="relative z-10">
          <SpacePrologue />
          <Hero booted={booted} />
        </div>
      </div>

      {/* Past the hero the stage is gone, but these stay opaque so nothing can
          show through if a section forgets to bring its own background. */}
      <div className="relative z-10 bg-void">
        <WhySection />
        <PixelsToElevation />
        <DepthComparator />
        <UploadSection />
        <ExplorerSection />
        <MeasurementSection />
        <AnalyticsSection />
        <CalibrationSection />
        <ArchitectureSection />
        <ApplicationsSection />
        <ResearchSection />
        <FinalCTA />
      </div>
    </main>
  )
}
